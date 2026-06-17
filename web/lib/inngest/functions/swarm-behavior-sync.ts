// Phase 112.5 Plan 04 (SC-1 + SC-2) — registry-driven Outlook behaviour
// delta-sync. This is the live wiring of the Plan 02 datalaag
// (outlook_delta_tokens / outlook_folder_map / swarm_email_transitions /
// swarm_review_signals + swarms.behavior_tracking_config) and the Plan 03 pure
// helpers (extractTransitions / deriveSignals / deltaPage / resolveFolders).
//
// Phase 119 TOPOLOGY (fan-out, replaces the Phase 112.5/118 single-run loop):
//   - swarmBehaviorSync (ORCHESTRATOR) — cron/event-triggered. Reads the
//     registry (load-enabled-swarms), then fans out ONE
//     `swarm/behavior-sync.mailbox` event per enabled (swarm × mailbox). It
//     NEVER touches the Graph API and mints no runId/tickIso — it exists only
//     to fan out.
//   - swarmBehaviorSyncMailbox (WORKER) — processes EXACTLY ONE mailbox per
//     invocation. Each mailbox is its own Inngest run, so a throw on one mailbox
//     is its own failed run (fault isolation) and a heavy mailbox spends only
//     its own step/wall-clock budget (no starvation).
//
//   WHY this changed (regression confirmed live 2026-06-16): the old single
//   run iterated every (swarm × mailbox) sequentially under
//   concurrency:{limit:1}. Enabling debtor's 4 mailboxes (one with 55 folders)
//   froze the shared loop — only the first mailbox per tick got delta tokens
//   and the previously-healthy sales verkoop@smeba.nl observe never ran.
//   Disabling debtor restored sales, confirming the starvation/abort causation.
//   The fan-out gives true per-mailbox fault isolation AND fair budgeting, and
//   surfaces per-mailbox terminal failures visibly (behavior_sync_mailbox_failed
//   telemetry) instead of vanishing into the Inngest failed-run log.
//
// REGISTRY-DRIVEN, 0 per-swarm branches (docs/agentic-pipeline/README.md): the
// orchestrator fans out for EVERY public.swarms row where
// behavior_tracking_config.enabled = 'true'. swarm_type, mailbox and per-swarm
// weights all come from the iterated row — there is NO 'sales-email' literal in
// the poll/ledger logic. Activating a second swarm is one registry UPDATE.
//
// Orchestrator triggers:
//   - cron business-hours: every 5 min, hours 6-19, Mon-Fri, Europe/Amsterdam.
//     (The cron string lives on the createFunction trigger arg below, NEVER in a
//     block JSDoc — a literal "*/N" would close the comment. CLAUDE.md rule.)
//   - event "swarm/behavior-sync.requested" with optional data.swarm_type to fan
//     out a single enabled swarm by hand.
//
// Per mailbox (worker body):
//   (3) bootstrap folder-map — if outlook_folder_map for this mailbox is empty,
//       resolveFolders(mailbox) RECURSIVELY (childFolders), bucket each folder
//       ANCESTRY-AWARE via bucketForFolderPath (year sub-folders under
//       'afgehandeld' inherit the afgehandeld bucket — 112.5-01 finding: ~58k
//       mails live in Inbox/afgehandeld/{year}), upsert into outlook_folder_map.
//       Then read getTrackedFolders(admin, mailbox) for the folders to poll.
//   (4) per tracked folder, in its own step: load the delta token, call
//       deltaPage(), persist the new deltaLink + bootstrapped=true INSIDE the
//       step (Phase 65). On bootstrap (no token / 410-resync): persist token,
//       emit 0 signals for that folder (Pattern 1). Lean events over the step
//       boundary (immutable id + folder/category/read/@removed only).
//   (5) derive-and-write: combine non-bootstrap events across folders, build
//       bucketOf via loadFolderMap, resolve last-known bucket / prev categories
//       / prev read-state per immutable id from prior transitions, mint ONE tick
//       iso, extractTransitions, map immutable id -> email_id via
//       email_pipeline.emails (source_id -> id, source IN tracked-sources AND this
//       mailbox; Sugar ids never match -> skip), do the swarm_type-scoped
//       ledger join on pipeline_events stage=4, deriveSignals.
//   (6) idempotent inserts into swarm_email_transitions + swarm_review_signals
//       with the 23505 no-op (verbatim shape from the backfill worker). NEVER
//       write to pipeline_events (anti-pattern; SELECT-only ledger join).
//   (7) return a per-swarm counts payload.
//
// Replay-safety (Phase 65): runId/tickIso minted inside step.run IN THE WORKER;
// token-persist inside the per-folder step; ids-only over step/event
// boundaries; chunked .in(150) on re-hydration (UND_ERR_HEADERS_OVERFLOW >16KB).

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordWorkerFailure } from "@/lib/inngest/on-worker-failure";
import {
  deltaPage,
  resolveFolders,
  bucketForFolderPath,
  type DeltaEvent,
} from "@/lib/email-behavior/delta-client";
import {
  loadFolderMap,
  getTrackedFolders,
  bucketForFolder,
} from "@/lib/email-behavior/folder-map";
import {
  extractTransitions,
  moveKind,
  type RawDeltaEvent,
  type Transition,
} from "@/lib/email-behavior/transition-extract";
import {
  deriveSignals,
  type SignalWeights,
} from "@/lib/email-behavior/signal-derive";

// Immutable-id prefer + page size for every delta GET.
const DELTA_PREFER = 'IdType="ImmutableId", odata.maxpagesize=100';
// PostgREST .in() chunk — keep the URL under the ~16KB header limit.
const ID_CHUNK = 150;

// email_pipeline.emails.source tags whose rows the immutable_id->email_id match
// accepts. Both the sales-email ingest ('outlook') and the debtor-email ingest
// ('zapier-debtor-ingest') are Zapier->Graph routes that store the Outlook
// messageId as source_id, so the immutable-id match works identically for both;
// only the arbitrary source string differed, which previously excluded debtor
// (its native-Outlook 'outlook' rows stopped 2026-04-22; live debtor mail is
// 'zapier-debtor-ingest'). Mailbox + source_id already scope the match, so
// widening the source set cannot cross-attribute between swarms.
const TRACKED_INGEST_SOURCES = ["outlook", "zapier-debtor-ingest"] as const;

// Cron schedule for the trigger arg (defined here, not inside any block comment).
const CRON_BUSINESS_HOURS = "TZ=Europe/Amsterdam */5 6-19 * * 1-5";

// Fan-out event name shared by the orchestrator (producer) and the per-mailbox
// worker (consumer). One per enabled (swarm × mailbox).
const MAILBOX_EVENT = "swarm/behavior-sync.mailbox";

// CLAUDE.md / Phase 65 dae6276 — MANDATORY: never alias/destructure
// `inngest.send` (loses this-binding). Inline-call via this cast each time.
// Accepts a single payload OR a batch array (the orchestrator sends the whole
// fan-out in one call so a mid-loop throw can't half-send + re-send on retry).
type EventPayload = { name: string; data: Record<string, unknown> };
type SendFn = (p: EventPayload | EventPayload[]) => Promise<unknown>;

type BehaviorSyncEventData = {
  swarm_type?: string;
};

/** The per-mailbox worker payload (one fanned-out event = one mailbox). */
type MailboxWorkerEventData = {
  swarm_type: string;
  mailbox: string;
  weights?: SignalWeights;
};

/** One enabled swarm resolved from the registry — swarm_type + mailbox + weights. */
type EnabledSwarm = {
  swarm_type: string;
  mailbox: string;
  weights: SignalWeights | undefined;
};

/** The shape of behavior_tracking_config we read off the swarms row. */
type BehaviorTrackingConfig = {
  enabled?: boolean | string;
  // Phase 118: a swarm can observe MULTIPLE mailboxes. `mailboxes` is preferred;
  // the singular `mailbox` is kept as a backward-compatible fallback for any
  // un-migrated row (read order: cfg.mailboxes ?? (cfg.mailbox ? [cfg.mailbox] : [])).
  mailboxes?: string[];
  mailbox?: string;
  weights?: SignalWeights;
};

/** A lean delta event handed back across the step boundary (ids-only spirit). */
type LeanEvent = {
  id: string;
  _folderId: string;
  parentFolderId?: string;
  categories?: string[];
  isRead?: boolean;
  conversationId?: string;
  removed?: boolean;
};

type PerSwarmCounts = {
  swarm_type: string;
  mailbox: string;
  transitions_written: number;
  signals_written: number;
  by_verdict: Record<string, number>;
  bootstrapped_folders: number;
  skipped_sugar: number;
  /**
   * Debug-telemetrie (debug graph-delta-missing-moves, 2026-06-11): MOVE-soort
   * transities die WEL gedetecteerd zijn maar geskipt omdat hun immutable_id
   * geen email_id-match had (mail nooit door ingest gegaan). Zonder dit veld
   * verdwijnt een legitieme move op een niet-ingeste mail spoorloos in de
   * skipped_sugar-teller — wat een live-proef onmogelijk te debuggen maakte.
   * Alleen move-soorten (geen read_aged/category noise) om ruis te beperken.
   */
  skipped_moves: { immutable_id: string; kind: string; from_bucket: string | null; to_bucket: string | null }[];
};

/** Move-soort transities (geen in-place noise) — voor skipped-move-telemetrie. */
const MOVE_KINDS = new Set([
  "moved_to_afgehandeld",
  "self_archived",
  "restored_from_archive",
  "left_to_untracked",
]);

const isUniqueViolation = (err: unknown): boolean => {
  const code = (err as { code?: string } | null)?.code;
  const msg = (err as Error)?.message ?? "";
  return (
    code === "23505" ||
    msg.includes("duplicate key value") ||
    msg.includes("23505")
  );
};

const toLean = (ev: DeltaEvent): LeanEvent => ({
  id: ev.id,
  _folderId: ev._folderId,
  parentFolderId: ev.parentFolderId,
  categories: ev.categories,
  isRead: ev.isRead,
  conversationId: ev.conversationId,
  removed: ev["@removed"]?.reason === "deleted",
});

const fromLean = (ev: LeanEvent): RawDeltaEvent => ({
  id: ev.id,
  _folderId: ev._folderId,
  parentFolderId: ev.parentFolderId,
  categories: ev.categories,
  isRead: ev.isRead,
  conversationId: ev.conversationId,
  ...(ev.removed ? { "@removed": { reason: "deleted" } } : {}),
});

// ─────────────────────────────────────────────────────────────────────────────
// ORCHESTRATOR — cron/event entrypoint. Reads the registry and fans out one
// MAILBOX_EVENT per enabled (swarm × mailbox). NEVER touches Graph; mints no
// runId/tickIso (each worker mints its own). It exists only to fan out so that
// one mailbox can never starve or abort another (2026-06-16 regression fix).
// ─────────────────────────────────────────────────────────────────────────────
export const swarmBehaviorSync = inngest.createFunction(
  // No concurrency:{limit:1} here anymore — the orchestrator does no Graph work,
  // so it does not need the serial gate that caused the starvation regression.
  { id: "swarm/behavior-sync", retries: 1 },
  [{ cron: CRON_BUSINESS_HOURS }, { event: "swarm/behavior-sync.requested" }],
  async ({ event, step }) => {
    const data = (event?.data as BehaviorSyncEventData | undefined) ?? {};
    const swarmFilter = data.swarm_type;

    // (2) Registry-driven swarm iteration — NO hardcoded swarm list. Read
    // behavior_tracking_config off public.swarms; enabled is the gate, mailbox
    // and weights come from the same jsonb (there is no swarms.mailbox column).
    const enabledSwarms = await step.run("load-enabled-swarms", async () => {
      const admin = createAdminClient();
      let q = admin
        .from("swarms")
        .select("swarm_type, behavior_tracking_config")
        .eq("behavior_tracking_config->>enabled", "true");
      if (swarmFilter) q = q.eq("swarm_type", swarmFilter);
      const { data: rows, error } = await q;
      if (error) throw new Error(`load-enabled-swarms failed: ${error.message}`);

      // Phase 118: flatten to one EnabledSwarm per (swarm × mailbox) pair. Read
      // order is LOCKED — prefer cfg.mailboxes, fall back to the singular
      // cfg.mailbox (backward-compat for un-migrated rows). A row whose resolved
      // mailbox list is empty is skipped (same semantics as today's "enabled
      // swarm with no mailbox can't be polled"). Weights are shared across a
      // swarm's mailboxes (LOCKED — no per-mailbox weighting).
      const out: EnabledSwarm[] = [];
      for (const row of (rows ?? []) as {
        swarm_type: string;
        behavior_tracking_config: BehaviorTrackingConfig | null;
      }[]) {
        const cfg = row.behavior_tracking_config ?? {};
        const mailboxes = cfg.mailboxes ?? (cfg.mailbox ? [cfg.mailbox] : []);
        if (mailboxes.length === 0) continue;
        for (const mailbox of mailboxes) {
          out.push({
            swarm_type: row.swarm_type,
            mailbox,
            weights: cfg.weights,
          });
        }
      }
      return out;
    });

    // Fan out one MAILBOX_EVENT per enabled (swarm × mailbox). Lean ids-only
    // payload {swarm_type, mailbox, weights}; weights may be undefined (fine).
    // Single batched send (CR-01): one round-trip, and a retry of this step
    // re-sends the SAME batch rather than half-sending then re-sending. Inline
    // SendFn cast (never alias inngest.send — Phase 65 this-binding).
    await step.run("fan-out-mailboxes", async () => {
      const events: EventPayload[] = enabledSwarms.map((sw) => ({
        name: MAILBOX_EVENT,
        data: {
          swarm_type: sw.swarm_type,
          mailbox: sw.mailbox,
          ...(sw.weights !== undefined ? { weights: sw.weights } : {}),
        },
      }));
      if (events.length > 0) {
        await (inngest.send as unknown as SendFn)(events);
      }
      return { sent: events.length };
    });

    return {
      fanned_out: enabledSwarms.length,
      pairs: enabledSwarms.map((s) => ({
        swarm_type: s.swarm_type,
        mailbox: s.mailbox,
      })),
    };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// WORKER — processes EXACTLY ONE mailbox per invocation. swarm_type/mailbox/
// weights arrive in the fanned-out event payload (NOT the registry). Each
// mailbox is its own Inngest run: a throw here fails only this mailbox's run
// (fault isolation) and a heavy mailbox spends only its own budget (fair
// budgeting). Replaces the old shared concurrency:{limit:1} serial loop.
// ─────────────────────────────────────────────────────────────────────────────
export const swarmBehaviorSyncMailbox = inngest.createFunction(
  {
    id: "swarm/behavior-sync.mailbox",
    retries: 1,
    // Per-mailbox concurrency key (limit 1) gives replay / overlapping-tick
    // safety — at most one in-flight invocation per mailbox. The global
    // {limit:4} ceiling bounds total Graph load WITHOUT serializing everything
    // (the old {limit:1} let one heavy mailbox starve the rest). 4 is Claude's-
    // discretion: enough parallelism that mailboxes don't queue behind a heavy
    // box, low enough to stay polite to the Graph API.
    concurrency: [
      { key: "event.data.mailbox", limit: 1 },
      { limit: 4 },
    ],
    // Phase 119 telemetry (LOCKED 119-CONTEXT.md): a per-mailbox terminal
    // failure must be VISIBLE — the 2026-06-16 regression was invisible until a
    // manual token-freshness check. Reuse the shared handoff-drops sink (PR #105
    // on-worker-failure.ts) for the generic worker_failed row, then ALSO write a
    // mailbox-attributable behavior_sync_mailbox_failed row so monitoring can
    // query the failure by (swarm_type, mailbox). onFailure must NEVER throw
    // (mirror on-worker-failure.ts's never-throw contract).
    onFailure: async ({ error, event }) => {
      await recordWorkerFailure({
        stage: 1,
        stageLabel: "behavior-sync-mailbox",
        event,
        error,
      });
      try {
        const orig =
          (event as { data?: { event?: { data?: Record<string, unknown> } } })
            ?.data?.event?.data ?? {};
        const swarmType =
          typeof orig.swarm_type === "string" ? orig.swarm_type : "unknown";
        const mailbox =
          typeof orig.mailbox === "string" ? orig.mailbox : null;
        const errorMessage = (error?.message ?? "unknown error").slice(0, 2000);
        const admin = createAdminClient();
        // email_id LEFT NULL to dodge the partial unique index
        // pipeline_events_one_per_stage_email (email_id, swarm_type, stage);
        // the mailbox attribution lives in decision_details.
        const { error: insErr } = await admin.from("pipeline_events").insert({
          swarm_type: swarmType,
          stage: 1,
          email_id: null,
          decision: "behavior_sync_mailbox_failed",
          decision_details: {
            swarm_type: swarmType,
            mailbox,
            error_message: errorMessage,
            error_name: error?.name ?? null,
          },
          triggered_by: "onFailure",
        });
        if (insErr) {
          console.error(
            `[onFailure] behavior_sync_mailbox_failed insert: ${insErr.message}`,
          );
        }
      } catch (e) {
        // Last-resort guard — onFailure must never throw.
        console.error("[onFailure] behavior_sync_mailbox_failed threw:", e);
      }
    },
  },
  { event: MAILBOX_EVENT },
  async ({ event, step }) => {
    const data = (event?.data as MailboxWorkerEventData | undefined) ?? {
      swarm_type: "",
      mailbox: "",
    };
    const swarmType = data.swarm_type;
    const mailbox = data.mailbox;
    const weights = data.weights;

    // CR-02: fail loudly on a malformed event rather than silently driving
    // resolveFolders("") into an opaque Graph 400. onFailure records the throw
    // as a visible behavior_sync_mailbox_failed row.
    if (!swarmType || !mailbox) {
      throw new Error(
        `behavior-sync.mailbox: missing ${!swarmType ? "swarm_type" : "mailbox"} in event payload`,
      );
    }

    // Phase 65 replay-id rule — runId minted inside step.run, and ONE tick iso
    // minted once (every transition/signal inherits it for a stable dedupe_key).
    const runId = await step.run("resolve-run-id", async () =>
      crypto.randomUUID(),
    );
    const tickIso = await step.run("resolve-tick-iso", async () =>
      new Date().toISOString(),
    );

    // (3) Refresh the folder-map for this mailbox EVERY tick (gap-fix
    // 2026-06-04): resolve the full tree recursively, bucket ancestry-aware,
    // and INSERT any folders not yet in the map (ignoreDuplicates — existing
    // rows keep operator-curated tracked/bucket values). Originally this only
    // ran when the map was empty, which left a freshly created
    // "afgehandeld/2026" year-folder invisible: a drag into it produced zero
    // transitions. New year-folders are an annual ritual; discovery must be
    // continuous, not bootstrap-only.
    await step.run(`refresh-folder-map-${swarmType}-${mailbox}`, async () => {
      const admin = createAdminClient();
      const existing = await loadFolderMap(admin, mailbox);

      const folders = await resolveFolders(mailbox);
      const newRows = folders
        .filter((f) => !existing.has(f.folder_id))
        .map((f) => ({
          folder_id: f.folder_id,
          mailbox,
          display_name: f.display_name,
          bucket: bucketForFolderPath(f.path),
          tracked: true,
        }));
      if (newRows.length > 0) {
        const { error } = await admin
          .from("outlook_folder_map")
          .upsert(newRows, { onConflict: "folder_id", ignoreDuplicates: true });
        if (error)
          throw new Error(`folder-map upsert failed: ${error.message}`);
      }
      return { known: existing.size, added: newRows.length };
    });

    // The folders to poll for this swarm (tracked=true).
    const tracked = await step.run(
      `tracked-folders-${swarmType}-${mailbox}`,
      async () => {
        const admin = createAdminClient();
        return getTrackedFolders(admin, mailbox);
      },
    );

    // (4) Per tracked folder: load token, deltaPage, persist token INSIDE the
    // step. Bootstrap folders contribute their token but 0 events to derive —
    // EXCEPT (gap-fix 2026-06-04) when a bootstrap item matches a pending
    // `left_to_untracked` transition: that means the mail earlier vanished
    // from a tracked folder into THIS (then-unknown) folder. Such matches are
    // promoted to a real move-transition in derive-and-write.
    const nonBootstrapEvents: LeanEvent[] = [];
    const bootstrapCorrections: {
      immutable_id: string;
      from_bucket: string;
      to_bucket: string;
      correction_row_id: string;
    }[] = [];
    let bootstrappedFolders = 0;

    for (const folder of tracked) {
      const folderId = folder.folder_id;
      const folderResult = await step.run(
        `delta-${swarmType}-${mailbox}-${folderId}`,
        async () => {
          const admin = createAdminClient();

          const { data: tokenRow } = await admin
            .from("outlook_delta_tokens")
            .select("delta_link")
            .eq("folder_id", folderId)
            .maybeSingle();

          const page = await deltaPage({
            mailbox,
            folderId,
            deltaLinkOrNull:
              (tokenRow as { delta_link?: string | null } | null)
                ?.delta_link ?? null,
            prefer: DELTA_PREFER,
          });

          // Persist the new deltaLink + bootstrapped flag INSIDE the step
          // (Phase 65). onConflict folder_id keeps it single-row per folder.
          const { error: upErr } = await admin
            .from("outlook_delta_tokens")
            .upsert(
              {
                folder_id: folderId,
                mailbox,
                bucket: folder.bucket,
                delta_link: page.deltaLink,
                bootstrapped: true,
                updated_at: tickIso,
              },
              { onConflict: "folder_id" },
            );
          if (upErr)
            throw new Error(`token upsert failed: ${upErr.message}`);

          // Bootstrap-correlatie (gap-fix): pending left_to_untracked rows
          // (to_bucket IS NULL, laatste 14 dagen — afgeleid van tickIso,
          // replay-deterministisch) waarvan het immutable id in de bootstrap-
          // inhoud van deze folder zit, zijn alsnog opgeloste moves. Kleine
          // set (per-tick drags), dus in-memory intersectie.
          let corrections: {
            immutable_id: string;
            from_bucket: string;
            correction_row_id: string;
          }[] = [];
          if (page.wasBootstrap) {
            const sinceIso = new Date(
              Date.parse(tickIso) - 14 * 86_400_000,
            ).toISOString();
            const { data: pending } = await admin
              .from("swarm_email_transitions")
              .select("id, immutable_id, from_bucket")
              .eq("swarm_type", swarmType)
              .eq("mailbox", mailbox)
              .eq("kind", "left_to_untracked")
              .is("to_bucket", null)
              .gte("observed_at", sinceIso)
              .limit(500);
            const pendingRows = (pending ?? []) as {
              id: string;
              immutable_id: string;
              from_bucket: string | null;
            }[];
            if (pendingRows.length > 0) {
              const inFolder = new Set(page.events.map((e) => e.id));
              corrections = pendingRows
                .filter((p) => inFolder.has(p.immutable_id) && p.from_bucket)
                .map((p) => ({
                  immutable_id: p.immutable_id,
                  from_bucket: p.from_bucket as string,
                  correction_row_id: p.id,
                }));
            }
          }

          // Bootstrap (first run / 410-resync): pre-existing state is not a
          // transition — emit 0 signals for this folder (Pattern 1). Carry
          // only lean events for non-bootstrap pages over the boundary.
          return {
            wasBootstrap: page.wasBootstrap,
            events: page.wasBootstrap ? [] : page.events.map(toLean),
            corrections,
          };
        },
      );

      if (folderResult.wasBootstrap) {
        bootstrappedFolders += 1;
        for (const c of folderResult.corrections) {
          bootstrapCorrections.push({ ...c, to_bucket: folder.bucket });
        }
        continue;
      }
      nonBootstrapEvents.push(...folderResult.events);
    }

    // (5-6) Derive transitions + signals and write them idempotently.
    const counts = await step.run(
      `derive-and-write-${swarmType}-${mailbox}`,
      async () => {
        const admin = createAdminClient();
        const byVerdict: Record<string, number> = {};
        let transitionsWritten = 0;
        let signalsWritten = 0;
        let skippedSugar = 0;
        // Debug-telemetrie: move-soort transities die geskipt zijn wegens
        // ontbrekende email_id (mail nooit ge-ingest). Zie PerSwarmCounts.
        const skippedMoves: PerSwarmCounts["skipped_moves"] = [];

        if (nonBootstrapEvents.length === 0 && bootstrapCorrections.length === 0) {
          return {
            transitionsWritten,
            signalsWritten,
            byVerdict,
            skippedSugar,
            skippedMoves,
          };
        }

        const rawEvents = nonBootstrapEvents.map(fromLean);

        // bucketOf via the registry folder-map (other for unmapped folders).
        const folderMap = await loadFolderMap(admin, mailbox);
        const bucketOf = (folderId: string) =>
          bucketForFolder(folderMap, folderId);

        // Last-known bucket / prev categories / prev read-state per immutable
        // id (Pitfall 3 — split-over-ticks). Source of truth: the most recent
        // prior transition row per immutable_id for this swarm+mailbox.
        // Correction-ids tellen mee zodat hun email_id-mapping hieronder ook
        // voor de gepromote bootstrap-correlaties geldt (gap-fix 2026-06-04).
        const immutableIds = Array.from(
          new Set([
            ...rawEvents.map((e) => e.id),
            ...bootstrapCorrections.map((c) => c.immutable_id),
          ]),
        );
        const lastKnownBucket = new Map<string, string>();
        // prevCategories is SEEDED below (step 5a) from the Phase 117
        // swarm_written_categories baseline — keyed by immutable_id. prevIsRead
        // stays empty: read_aged remains dormant (explicitly OUT of Phase
        // 112.5-05 scope; no per-id read snapshot persisted yet).
        const prevCategories = new Map<string, string[]>();
        const prevIsRead = new Map<string, boolean>();

        for (let i = 0; i < immutableIds.length; i += ID_CHUNK) {
          const chunk = immutableIds.slice(i, i + ID_CHUNK);
          const { data: prior } = await admin
            .from("swarm_email_transitions")
            .select("immutable_id, to_bucket, observed_at")
            .eq("swarm_type", swarmType)
            .eq("mailbox", mailbox)
            .in("immutable_id", chunk)
            .order("observed_at", { ascending: true });
          for (const row of (prior ?? []) as {
            immutable_id: string;
            to_bucket: string | null;
          }[]) {
            if (row.to_bucket) lastKnownBucket.set(row.immutable_id, row.to_bucket);
          }
        }

        // immutable_id (Graph source_id) -> email_id, scoped to the tracked
        // ingest sources (outlook + zapier-debtor-ingest) AND this mailbox.
        // Sugar rows carry a Sugar-UUID source_id and never match -> skipped
        // (T-112.5-13). Chunked .in to stay under header cap.
        const immutableToEmailId = new Map<string, string>();
        for (let i = 0; i < immutableIds.length; i += ID_CHUNK) {
          const chunk = immutableIds.slice(i, i + ID_CHUNK);
          const { data: emailRows } = await admin
            .schema("email_pipeline")
            .from("emails")
            .select("id, source_id, conversation_id")
            .in("source", [...TRACKED_INGEST_SOURCES])
            .eq("mailbox", mailbox)
            .in("source_id", chunk);
          for (const row of (emailRows ?? []) as {
            id: string;
            source_id: string | null;
            conversation_id: string | null;
          }[]) {
            if (row.source_id) immutableToEmailId.set(row.source_id, row.id);
          }
        }

        // (5a) Phase 112.5-05 (SC-2 / OUTLOOK-BEHAV-05) — seed prevCategories
        // from the Phase 117 baseline (public.swarm_written_categories: the last
        // `AI: <intent_key>` our system wrote per email_id). extractTransitions
        // expects prevCategories keyed by IMMUTABLE_ID, so we invert
        // immutableToEmailId (email_id -> immutable_id) for the resolved set and
        // look the baseline up by email_id, scoped to THIS swarm_type (never a
        // literal — two swarms observing the same message read their own baseline
        // only). A message with NO baseline row is absent from prevCategories ->
        // extractTransitions emits NO category_edited for it (fail-safe: the
        // dormant default is preserved for un-labelled mail). Read-only SELECT on
        // the Phase-117-owned table (admin/service_role); chunked .in to stay
        // under the header cap. Replay-safe: this load is inside the same
        // derive-and-write step.run as the rest of the IO.
        const emailIdToImmutable = new Map<string, string>();
        for (const [imm, eid] of immutableToEmailId) {
          emailIdToImmutable.set(eid, imm);
        }
        const resolvedEmailIds = Array.from(immutableToEmailId.values());
        for (let i = 0; i < resolvedEmailIds.length; i += ID_CHUNK) {
          const chunk = resolvedEmailIds.slice(i, i + ID_CHUNK);
          if (chunk.length === 0) continue;
          const { data: baselineRows } = await admin
            .from("swarm_written_categories")
            .select("email_id, ai_category")
            .eq("swarm_type", swarmType)
            .in("email_id", chunk);
          for (const row of (baselineRows ?? []) as {
            email_id: string;
            ai_category: string | null;
          }[]) {
            if (!row.ai_category) continue;
            const imm = emailIdToImmutable.get(row.email_id);
            if (imm) prevCategories.set(imm, [row.ai_category]);
          }
        }

        // conversationId -> inbound email_id for reply-matching. Built from the
        // resolved rows (best-effort; reply only fires on a match). Same source
        // set as the immutable-id match so debtor (zapier-debtor-ingest) rows
        // are not silently excluded here.
        const conversationToEmailId = new Map<string, string>();
        {
          const { data: convRows } = await admin
            .schema("email_pipeline")
            .from("emails")
            .select("id, conversation_id")
            .in("source", [...TRACKED_INGEST_SOURCES])
            .eq("mailbox", mailbox)
            .in(
              "id",
              Array.from(immutableToEmailId.values()).slice(0, ID_CHUNK),
            );
          for (const row of (convRows ?? []) as {
            id: string;
            conversation_id: string | null;
          }[]) {
            if (row.conversation_id)
              conversationToEmailId.set(row.conversation_id, row.id);
          }
        }

        const transitions = extractTransitions({
          events: rawEvents,
          bucketOf,
          lastKnownBucket,
          observed_at: tickIso,
          prevCategories,
          prevIsRead,
          conversationToEmailId,
        });

        // Bootstrap-correlaties promoten naar echte move-transities (gap-fix
        // 2026-06-04): een eerder vastgelegde left_to_untracked waarvan het
        // doel nu bekend is (nieuw-ontdekte folder bevatte het id bij
        // bootstrap). Zelfde moveKind-semantiek als binnen-tick correlatie.
        // De originele left_to_untracked rij krijgt to_bucket gezet zodat een
        // latere 410-resync hem niet nogmaals correleert.
        const correctedRowIds: string[] = [];
        for (const c of bootstrapCorrections) {
          const kind = moveKind(c.from_bucket, c.to_bucket);
          if (kind === null) continue;
          const synthetic: Transition = {
            immutable_id: c.immutable_id,
            kind,
            from_bucket: c.from_bucket,
            to_bucket: c.to_bucket,
            observed_at: tickIso,
          };
          transitions.push(synthetic);
          correctedRowIds.push(c.correction_row_id);
        }
        if (correctedRowIds.length > 0) {
          const { error: corrErr } = await admin
            .from("swarm_email_transitions")
            .update({ to_bucket: "resolved_by_bootstrap" })
            .in("id", correctedRowIds);
          if (corrErr)
            throw new Error(
              `left_to_untracked correction update failed: ${corrErr.message}`,
            );
        }

        if (transitions.length === 0) {
          return {
            transitionsWritten,
            signalsWritten,
            byVerdict,
            skippedSugar,
            skippedMoves,
          };
        }

        // resolver: immutable_id -> email_id. A Sugar / unmatched id resolves
        // to "" and the signal is skipped below (no spoofed email_id).
        const emailIdOf = (immutableId: string) =>
          immutableToEmailId.get(immutableId) ?? "";

        // Idempotent transition inserts. Skip transitions whose immutable id
        // has no tracked-source match (Sugar-skip) — they carry no email_id.
        for (const tr of transitions) {
          const emailId =
            tr.kind === "replied" && tr.matched_email_id
              ? tr.matched_email_id
              : emailIdOf(tr.immutable_id);
          if (!emailId) {
            skippedSugar += 1;
            // Debug-telemetrie: een MOVE-soort transitie die we wél zagen maar
            // niet konden toeschrijven (geen email_id) mag niet spoorloos in
            // skipped_sugar verdwijnen — dat maakte de live-proef ondebugbaar.
            if (MOVE_KINDS.has(tr.kind)) {
              skippedMoves.push({
                immutable_id: tr.immutable_id,
                kind: tr.kind,
                from_bucket: tr.from_bucket,
                to_bucket: tr.to_bucket,
              });
            }
            continue;
          }
          try {
            const { error } = await admin
              .from("swarm_email_transitions")
              .insert({
                swarm_type: swarmType,
                mailbox,
                email_id: emailId,
                immutable_id: tr.immutable_id,
                kind: tr.kind,
                from_bucket: tr.from_bucket,
                to_bucket: tr.to_bucket,
                dedupe_key: `${swarmType}|${tr.immutable_id}|${tr.kind}|${tickIso}`,
                observed_at: tr.observed_at,
              });
            if (error) throw error;
            transitionsWritten += 1;
          } catch (err) {
            if (!isUniqueViolation(err)) throw err;
            // duplicate transition (replay / re-tick) -> idempotent no-op
          }
        }

        // (5b) Ledger join: which restored email_ids were stage-4 archived by
        // THIS swarm (swarm_type from the iterated row, NEVER a literal). A
        // hit turns restore into correctie_false_positive (Pitfall 5).
        const restoredEmailIds = transitions
          .filter((t) => t.kind === "restored_from_archive")
          .map((t) => emailIdOf(t.immutable_id))
          .filter((id) => id !== "");
        const ledgerHits = new Set<string>();
        for (let i = 0; i < restoredEmailIds.length; i += ID_CHUNK) {
          const chunk = restoredEmailIds.slice(i, i + ID_CHUNK);
          if (chunk.length === 0) continue;
          const { data: hits } = await admin
            .from("pipeline_events")
            .select("email_id")
            .eq("swarm_type", swarmType)
            .eq("stage", 4)
            .in("email_id", chunk);
          for (const row of (hits ?? []) as { email_id: string }[]) {
            ledgerHits.add(row.email_id);
          }
        }

        const signals = deriveSignals({
          transitions,
          ledgerHits,
          swarmType,
          emailIdOf,
          observedTickIso: tickIso,
          weights,
        });

        // Idempotent signal inserts.
        for (const sig of signals) {
          if (!sig.email_id) {
            skippedSugar += 1;
            continue;
          }
          try {
            const { error } = await admin
              .from("swarm_review_signals")
              .insert({
                swarm_type: sig.swarm_type,
                mailbox,
                email_id: sig.email_id,
                category_key: sig.category_key,
                verdict: sig.verdict,
                transition_kind: sig.transition_kind,
                dedupe_key: sig.dedupe_key,
                observed_at: sig.observed_at,
              });
            if (error) throw error;
            signalsWritten += 1;
            byVerdict[sig.verdict] = (byVerdict[sig.verdict] ?? 0) + 1;
          } catch (err) {
            if (!isUniqueViolation(err)) throw err;
            // duplicate signal (replay / re-tick) -> idempotent no-op
          }
        }

        return { transitionsWritten, signalsWritten, byVerdict, skippedSugar, skippedMoves };
      },
    );

    const result: PerSwarmCounts = {
      swarm_type: swarmType,
      mailbox,
      transitions_written: counts.transitionsWritten,
      signals_written: counts.signalsWritten,
      by_verdict: counts.byVerdict,
      bootstrapped_folders: bootstrappedFolders,
      skipped_sugar: counts.skippedSugar,
      skipped_moves: counts.skippedMoves,
    };

    return { run_id: runId, tick_iso: tickIso, ...result };
  },
);
