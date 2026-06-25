// Phase 132.1 (D-02) → Phase 132.2 (V9.7.x) — the per-bucket forward AUTO-FLIP cron.
//
// This cron ARMS irreversible live Outlook forwards. It releases a forward bucket
// (`swarms.dry_run_config.stage_4_forward_buckets[bucket]=true`) for the
// info-routing swarm ONLY when that bucket clears the FORWARD-MATCH ground-truth
// gate: over the accumulated ledger of observed staff forwards, the bucket's
// per-bucket Wilson lower bound ≥ FORWARD_WILSON_GATE (0.70) at n ≥ MIN_OBSERVED_N
// AND its coverage ≥ FORWARD_COVERAGE_GATE (0.70). Release-only + idempotent:
// only ever sets `true`, never `false`; a bucket already true is left untouched.
//
// Phase 132.2 changed the INPUT (Option A — feed the autoflip, do not rebuild a
// release path): the release used to grade a PROXY (per-mailbox precision over
// `swarm_review_signals.transition_kind="category_edited"`). It now grades the
// REAL forward destination (memory `forward-match-as-wilson-ground-truth`):
//   (a) CAPTURE — once per business day, read each info@ mailbox's Sent-Items
//       forwards (Graph), match each to its inbound original, read the LIVE
//       persisted Stage-3 verdict (NO re-classify), and persist each as a
//       first-class `forward_observed` signal in swarm_review_signals (the
//       ongoing ledger; replaces the one-shot forward-wilson-backfill).
//   (b) GRADE — read the WHOLE accumulated ledger back (paginated), reconstruct
//       per-bucket observations, grade with Wilson + coverage.
//   (c) RELEASE — release-only jsonb merge of the buckets that clear.
// Brand/mailbox reachability is now implicit: a bucket only accumulates
// observations from the mailboxes that actually forward to it.
//
// PANIC LEVER: the one-flag revert is migration `20260624b_phase1321_forward_
// buckets_revert.sql` — it resets stage_4_forward_buckets to {} (all held).
// Apply it to instantly hold every forward if a regression is detected.
//
// MONITORING: emits a pipeline_events alert row when an ALREADY-RELEASED bucket's
// per-bucket Wilson grade drops to pass===false at n ≥ MIN_OBSERVED_N (a
// post-release regression). The release-only cron never auto-reverts; the
// operator applies migration 20260624b.
//
// CLAUDE.md Inngest rules honored: the cron string lives on the trigger arg
// (never in a /** */ JSDoc — a literal "*/N" would close the comment); described
// in // comments only; any DB-key id is generated INSIDE step.run; inngest.send
// is never aliased; all side effects live in step.run.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadRoutingDestinations } from "@/lib/swarms/registry";
import { fetchForwardsByConversation } from "@/lib/automations/info-routing/forward-observer";
import { buildForwardSignalRow } from "@/lib/automations/info-routing/forward-signal";
import {
  resolveObservedBucket,
  gradeBucketsByWilson,
  computeBucketCoverage,
  FORWARD_COVERAGE_GATE,
  FORWARD_WILSON_GATE,
  MIN_OBSERVED_N,
  type ForwardObservation,
} from "@/lib/automations/info-routing/forward-wilson";

// Phase 132.2 deploy retrigger: the #167 merge created no Vercel production
// build (merge-commit quirk), so prod froze on the old source_mailbox autoflip.
// This web-touching commit forces a clean production deploy of current main.
const SWARM = "info-routing";

// Business-hours cron: every 30 minutes, hours 6-19, Mon-Fri, Europe/Amsterdam.
// (Lives on the trigger arg below — never in a block JSDoc. CLAUDE.md rule.)
// Capture is daily-gated; release evaluation is idempotent, so running every 30
// min off an unchanged ledger is a harmless no-op until the next daily capture.
const CRON_BUSINESS_HOURS = "TZ=Europe/Amsterdam */30 6-19 * * 1-5";

// The info@ shared mailboxes, used only when the swarm row carries no explicit
// behavior_tracking_config.mailboxes (the canonical source).
const DEFAULT_MAILBOXES = ["info@smeba.nl", "info@fire-control.nl"];

// Rolling read window (days) for the Sent-Items scan. Bumped past weekend gaps
// (CLAUDE.md cron rule: the first tick after a gap must still pick up
// Friday/weekend forwards). The persisted dedupe ledger + the 23505 no-op make
// re-scanning this window safe.
const LOOKBACK_DAYS = 10;

// PostgREST .in() chunk — Graph conversation_id values are ~100+ chars; 25 is the
// proven-safe size that keeps the URL under the ~16KB header cap (200 failed, 25
// succeeded live for the backfill twin).
const ID_CHUNK = 25;

// Capture daily-gate: skip the Graph scan if any forward_observed* row was
// captured in the last CAPTURE_GATE_HOURS. 18h ≈ once per business day without
// calendar-midnight TZ subtlety. ponytail: rolling gate; make it calendar-exact
// only if a boundary double-capture ever shows up.
const CAPTURE_GATE_HOURS = 18;

// PostgREST caps an unbounded select at 1000 rows; the ledger grows past that, so
// the grade read paginates to avoid silently truncating Wilson's denominator.
const LEDGER_PAGE = 1000;

// CLAUDE.md / Phase 65 dae6276 — never alias/destructure inngest.send. (Not used
// here; the cron emits no events. Documented for the next editor.)

interface BehaviorTrackingConfig {
  mailboxes?: string[];
  mailbox?: string;
}

const isUniqueViolation = (err: unknown): boolean => {
  const code = (err as { code?: string } | null)?.code;
  const msg = (err as Error)?.message ?? "";
  return (
    code === "23505" ||
    msg.includes("duplicate key value") ||
    msg.includes("23505")
  );
};

export const infoRoutingForwardAutoflip = inngest.createFunction(
  // Serial (limit 1) so two ticks never race the read-modify-write of
  // dry_run_config. retries:1 — a transient DB/Graph error retries once.
  { id: "info-routing/forward-autoflip", retries: 1, concurrency: [{ limit: 1 }] },
  [{ cron: CRON_BUSINESS_HOURS }, { event: "info-routing/forward-autoflip.requested" }],
  async ({ step }) => {
    // (1) Load destinations (for resolveObservedBucket), the current release map,
    // and the mailbox list. Read FRESH (not cached loadSwarm) so idempotency is
    // computed against live state.
    const ctx = await step.run("load-registry-and-config", async () => {
      const admin = createAdminClient();
      const destinations = await loadRoutingDestinations(admin, SWARM);
      const { data: swarmRow, error } = await admin
        .from("swarms")
        .select("dry_run_config, behavior_tracking_config")
        .eq("swarm_type", SWARM)
        .maybeSingle();
      if (error) throw new Error(`load swarm failed: ${error.message}`);
      const dryRun = (swarmRow?.dry_run_config ?? {}) as {
        stage_4_forward_buckets?: Record<string, boolean>;
      };
      const bt = (swarmRow?.behavior_tracking_config ??
        {}) as BehaviorTrackingConfig;
      const mailboxes =
        bt.mailboxes ?? (bt.mailbox ? [bt.mailbox] : DEFAULT_MAILBOXES);
      return {
        destinations,
        currentForwardBuckets: dryRun.stage_4_forward_buckets ?? {},
        mailboxes,
      };
    });

    // (2) CAPTURE — daily-gated. Read each mailbox's Sent-Items forwards, match
    // to the inbound original, read the live persisted verdict (NO re-classify),
    // persist each as a forward_observed signal. Idempotent via dedupe_key.
    const capture = await step.run("capture-forwards", async () => {
      const admin = createAdminClient();

      // Daily-gate: already captured within the window? → skip the Graph scan.
      const gateSinceIso = new Date(
        Date.now() - CAPTURE_GATE_HOURS * 60 * 60 * 1000,
      ).toISOString();
      const { data: recent, error: gateErr } = await admin
        .from("swarm_review_signals")
        .select("id")
        .eq("swarm_type", SWARM)
        .in("verdict", ["forward_observed", "forward_observed_no_verdict"])
        .gte("created_at", gateSinceIso)
        .limit(1);
      if (gateErr) throw new Error(`capture daily-gate read failed: ${gateErr.message}`);
      if ((recent ?? []).length > 0) {
        return { captured: 0, skipped: "already-captured-today" as const };
      }

      const sinceIso = new Date(
        Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      const destinations = ctx.destinations;
      let persisted = 0;
      let noVerdict = 0;
      let dedupSkipped = 0;

      for (const mailbox of ctx.mailboxes) {
        // (2a) read this mailbox's forwards from Sent-Items.
        const forwardsMap = await fetchForwardsByConversation(mailbox, sinceIso);
        const forwards = [...forwardsMap.entries()].map(([conversation_id, rec]) => ({
          conversation_id,
          to_address: rec.toAddress,
          sent_at: rec.sentAt,
        }));
        if (forwards.length === 0) continue;

        // (2b) dedup-vs-ledger: existing dedupe_keys for this swarm+mailbox+window.
        const existingKeys = new Set<string>();
        {
          const { data: ledger, error } = await admin
            .from("swarm_review_signals")
            .select("dedupe_key")
            .eq("swarm_type", SWARM)
            .eq("mailbox", mailbox)
            .in("verdict", ["forward_observed", "forward_observed_no_verdict"])
            .gte("observed_at", sinceIso);
          if (error) throw new Error(`dedup-vs-ledger read failed: ${error.message}`);
          for (const r of (ledger ?? []) as { dedupe_key: string }[]) {
            existingKeys.add(r.dedupe_key);
          }
        }

        // (2c) match inbound originals by conversation_id (email_pipeline —
        // NEVER bare public.emails; memory admin-client-defaults-public).
        const conversationIds = forwards.map((f) => f.conversation_id);
        const emailByConversation = new Map<string, { id: string }>();
        for (let i = 0; i < conversationIds.length; i += ID_CHUNK) {
          const chunk = conversationIds.slice(i, i + ID_CHUNK);
          const { data, error } = await admin
            .schema("email_pipeline")
            .from("emails")
            .select("id, conversation_id, received_at")
            .in("conversation_id", chunk)
            .order("received_at", { ascending: true });
          if (error) throw new Error(`match-inbound read failed: ${error.message}`);
          for (const e of (data ?? []) as {
            id: string;
            conversation_id: string | null;
          }[]) {
            if (e.conversation_id && !emailByConversation.has(e.conversation_id)) {
              emailByConversation.set(e.conversation_id, { id: e.id });
            }
          }
        }

        // (2d) read the LIVE persisted verdict ONLY (no re-classify). Keyed by
        // email_id; carries only email_id + decision_details.
        const emailIds = [...emailByConversation.values()].map((e) => e.id);
        const verdictByEmail = new Map<string, { bucket: string; unrouted: boolean }>();
        for (let i = 0; i < emailIds.length; i += ID_CHUNK) {
          const chunk = emailIds.slice(i, i + ID_CHUNK);
          if (chunk.length === 0) continue;
          const { data, error } = await admin
            .from("coordinator_runs")
            .select("email_id, decision_details")
            .eq("swarm_type", SWARM)
            .in("email_id", chunk)
            .not("decision_details->routing", "is", null);
          if (error) throw new Error(`read-verdicts read failed: ${error.message}`);
          for (const r of (data ?? []) as {
            email_id: string | null;
            decision_details: {
              routing?: { bucket?: string; unrouted?: boolean };
            } | null;
          }[]) {
            const rt = r.decision_details?.routing;
            if (r.email_id && rt?.bucket && !verdictByEmail.has(r.email_id)) {
              verdictByEmail.set(r.email_id, {
                bucket: rt.bucket,
                unrouted: rt.unrouted === true,
              });
            }
          }
        }

        // (2e) build + persist one signal per forward.
        for (const fwd of forwards) {
          const email = emailByConversation.get(fwd.conversation_id);
          const emailId = email?.id ?? null;
          const v = emailId ? verdictByEmail.get(emailId) : undefined;
          const predictedBucket = v && v.bucket && !v.unrouted ? v.bucket : null;
          const observedBucket = resolveObservedBucket(fwd.to_address, destinations);

          const row = buildForwardSignalRow({
            swarm_type: SWARM,
            mailbox,
            email_id: emailId,
            conversation_id: fwd.conversation_id,
            predicted_bucket: predictedBucket,
            observed_bucket: observedBucket,
            observed_to_address: fwd.to_address,
            forward_sent_at: fwd.sent_at ?? sinceIso,
          });

          if (existingKeys.has(row.dedupe_key)) {
            dedupSkipped += 1;
            continue;
          }
          try {
            const { error } = await admin.from("swarm_review_signals").insert({
              swarm_type: row.swarm_type,
              mailbox: row.mailbox,
              email_id: row.email_id,
              category_key: row.category_key, // predicted bucket (null = no-verdict)
              verdict: row.verdict,
              transition_kind: row.transition_kind,
              dedupe_key: row.dedupe_key,
              observed_at: row.observed_at,
              observed_meta: row.observed_meta,
            });
            if (error) throw error;
            if (row.verdict === "forward_observed_no_verdict") noVerdict += 1;
            else persisted += 1;
            existingKeys.add(row.dedupe_key);
          } catch (err) {
            if (isUniqueViolation(err)) {
              dedupSkipped += 1; // raced/duplicate — the ledger already has it.
              continue;
            }
            throw err;
          }
        }
      }
      return { captured: persisted, no_verdict: noVerdict, dedup_skipped: dedupSkipped };
    });

    // (3) GRADE — read the WHOLE accumulated ledger back (paginated) and
    // reconstruct per-bucket observations. Only the graded variant
    // (`forward_observed`, predicted non-null) is fed to Wilson/coverage; the
    // no-verdict rows are observability-only and excluded by the verdict filter.
    const observations = await step.run("read-ledger", async () => {
      const admin = createAdminClient();
      const obs: ForwardObservation[] = [];
      for (let from = 0; ; from += LEDGER_PAGE) {
        const { data, error } = await admin
          .from("swarm_review_signals")
          .select("category_key, mailbox, observed_meta")
          .eq("swarm_type", SWARM)
          .eq("verdict", "forward_observed")
          .order("observed_at", { ascending: true })
          .range(from, from + LEDGER_PAGE - 1);
        if (error) throw new Error(`ledger read failed: ${error.message}`);
        const rows = (data ?? []) as {
          category_key: string | null;
          mailbox: string | null;
          observed_meta: { observed_bucket?: string | null } | null;
        }[];
        for (const r of rows) {
          if (!r.category_key) continue; // predicted bucket is the grade axis.
          obs.push({
            predicted_bucket: r.category_key,
            observed_bucket: r.observed_meta?.observed_bucket ?? null,
            source_mailbox: r.mailbox ?? "unknown",
          });
        }
        if (rows.length < LEDGER_PAGE) break;
      }
      return obs;
    });

    const grades = gradeBucketsByWilson(observations);
    const coverage = computeBucketCoverage(observations);

    // Combined gate: a bucket clears ONLY when Wilson passes (n ≥ MIN_OBSERVED_N
    // AND wilson_lower ≥ FORWARD_WILSON_GATE) AND coverage ≥ FORWARD_COVERAGE_GATE.
    const clearing: string[] = [];
    for (const [bucket, grade] of grades) {
      const cov = coverage.get(bucket);
      if (grade.pass && cov && cov.coverage >= FORWARD_COVERAGE_GATE) {
        clearing.push(bucket);
      }
    }

    // (4) MONITORING — a post-release regression: an already-released bucket whose
    // per-bucket Wilson grade now fails at sufficient sample (n ≥ MIN_OBSERVED_N).
    const regressions: { bucket: string; wilson_lower: number; n: number }[] = [];
    for (const [bucket, grade] of grades) {
      if (ctx.currentForwardBuckets[bucket] !== true) continue; // not released.
      if (grade.n >= MIN_OBSERVED_N && grade.pass === false) {
        regressions.push({ bucket, wilson_lower: grade.wilson_lower, n: grade.n });
      }
    }
    if (regressions.length > 0) {
      await step.run("emit-regression-alert", async () => {
        const admin = createAdminClient();
        // email_id LEFT NULL to dodge the partial unique index
        // pipeline_events_one_per_stage_email (email_id, swarm_type, stage).
        const { error } = await admin.from("pipeline_events").insert({
          swarm_type: SWARM,
          stage: 4,
          email_id: null,
          decision: "forward_autoflip_precision_regression",
          decision_details: {
            wilson_gate: FORWARD_WILSON_GATE,
            coverage_gate: FORWARD_COVERAGE_GATE,
            regressions,
            panic_lever:
              "apply migration 20260624b_phase1321_forward_buckets_revert.sql to hold all forwards",
          },
          triggered_by: "info-routing/forward-autoflip",
        });
        if (error)
          console.error(
            `[forward-autoflip] regression alert insert failed: ${error.message}`,
          );
        return { regressed: regressions.length };
      });
    }

    // (5) RELEASE — release-only jsonb merge: set ONLY the clearing bucket keys to
    // true, preserving every dry_run_config sibling. No clears → no write.
    const toRelease = clearing.filter((b) => ctx.currentForwardBuckets[b] !== true);
    if (toRelease.length === 0) {
      return {
        flipped: 0,
        captured: capture.captured ?? 0,
        regressions: regressions.length,
        graded_buckets: [...grades.keys()].sort(),
      };
    }

    const applied = await step.run("release-forward-buckets", async () => {
      const admin = createAdminClient();
      // Re-read dry_run_config inside the write step (replay-safe) so the merge is
      // computed against the freshest state; merge only the bucket keys.
      const { data: row, error: readErr } = await admin
        .from("swarms")
        .select("dry_run_config")
        .eq("swarm_type", SWARM)
        .maybeSingle();
      if (readErr) throw new Error(`re-read dry_run_config failed: ${readErr.message}`);

      const dryRun = (row?.dry_run_config ?? {}) as Record<string, unknown> & {
        stage_4_forward_buckets?: Record<string, boolean>;
      };
      const nextBuckets: Record<string, boolean> = {
        ...(dryRun.stage_4_forward_buckets ?? {}),
      };
      for (const b of toRelease) {
        if (nextBuckets[b] !== true) nextBuckets[b] = true; // release-only.
      }
      const nextDryRun = { ...dryRun, stage_4_forward_buckets: nextBuckets };

      const { error: updErr } = await admin
        .from("swarms")
        .update({ dry_run_config: nextDryRun })
        .eq("swarm_type", SWARM);
      if (updErr) throw new Error(`forward-bucket release failed: ${updErr.message}`);

      return { buckets: [...new Set(toRelease)].sort() };
    });

    return {
      flipped: applied.buckets.length,
      buckets: applied.buckets,
      captured: capture.captured ?? 0,
      regressions: regressions.length,
    };
  },
);
