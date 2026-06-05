// Phase 116-06 Task 1 — gated corpus attachment-metadata backfill worker
// (SC-4 / ATTACH-04). Closes the `has_attachments=false`-on-all-rows blind
// spot: it iterates the ALREADY-ingested corpus by source_id (the Graph
// message-id), writes attachment metadata rows for ALL mails, and runs content
// extraction ONLY for the Stage-1-survivor slice (D-12 — same funnel rule as
// live).
//
// Key contracts:
//   - The download→store→extract loop is NOT reimplemented here. It imports
//     `extractEmailAttachments` from the Plan 04 extract-worker.ts so the live
//     funnel step and this backfill share ONE implementation (no drift,
//     checker cross-plan-contract fix).
//   - The Stage-1-survivor definition is REUSED from the Phase 112 backfill
//     disposition (buildAutoKeySet + classifyDisposition over the persisted
//     retro verdict): a mail is a survivor iff its disposition is NOT 'auto'
//     (i.e. it is NOT high-confidence registry-derived noise → it would reach
//     Stage 2 live). Survivors get extraction; non-survivors get metadata only.
//   - Fail-loud 40k HARD CAP (select-candidates.ts pattern) — a corpus read
//     hitting the read cap THROWS naming the corpus + cap (no silent truncation,
//     T-116-18 DoS guard).
//   - Bounded BATCHES with an inter-batch step.sleep delay (Phase 112 Graph
//     rate-limit discipline, T-116-18).
//   - Graph 404 (deleted/moved mail) → status='source_gone', run continues
//     (T-116-19 fail-soft; mirrors the ingest route 404 soft-path).
//   - Idempotent metadata upsert on (email_id, attachment_id) (T-116-20).
//
// SWARM-02: NO === 'sales' / === 'debtor' branch. This worker is sales-scoped
// by its TRIGGER EVENT (a per-trigger constant, exactly like the live
// extractor), not by a shared-worker branch. Adopting backfill for another
// swarm = a new trigger event + registry row, NOT a code branch.
//
// Manual trigger only (CLAUDE.md cron-disable pattern — no cron schedule):
//   inngest.send({ name: "sales-email/attachments.backfill.run",
//                  data: { dry_run?: boolean; limit?: number; batch_size?: number;
//                          cap?: number; since?: string; until?: string } })
//
// Replay-safety (CLAUDE.md Phase 65): all I/O in step.run; the shared helper
// generates its timestamps inside the per-batch step.run; storage keys are
// deterministic; inngest.send is never destructured (no send here, but the rule
// holds); extracted text is written to the table, NEVER serialized into output.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm, loadSwarmNoiseCategories } from "@/lib/swarms/registry";
import { listAttachments } from "@/lib/outlook/client";
import { extractEmailAttachments } from "@/lib/automations/attachments/extract-worker";
import { resolveVerdicts } from "@/lib/automations/sales-email/backfill/resolve-verdicts";
import {
  buildAutoKeySet,
  classifyDisposition,
} from "@/lib/automations/sales-email/backfill/disposition";

// This worker is sales-scoped by its trigger event (per-trigger constant, NOT a
// shared-worker branch — SWARM-02). A second swarm = a second trigger event.
const SWARM_TYPE = "sales-email";
const SALES_OUTLOOK_MAILBOX = "verkoop@smeba.nl";

// Fail-loud hard cap (select-candidates.ts STAGE_1_RETRO_HARD_CAP precedent).
const BACKFILL_HARD_CAP = 40000;
// Bounded batch size — each row issues a live Graph listAttachments call; keep
// the batch step well under the 60s Inngest gateway (Phase 112 Pitfall 2).
const DEFAULT_BATCH_SIZE = 40;
// Inter-batch delay (Graph rate-limit discipline, read-only at corpus scale).
const INTER_BATCH_DELAY = "1s";
const DEFAULT_LOOKBACK_DAYS = 400;

// Microsoft Graph @odata.type for a real file attachment (carries bytes).
// reference / item attachments carry no bytes → skipped (mirror capture.ts).
const FILE_ATTACHMENT_ODATA_TYPE = "#microsoft.graph.fileAttachment";

// Global cap defaults the shared helper consumes when the registry omits them.
const DEFAULT_CAPS = {
  maxSizeBytes: 26214400,
  maxVisionPages: 15,
  maxExtractedChars: 200000,
  maxAttachmentsPerMail: 20,
};

type BackfillEventData = {
  dry_run?: boolean;
  limit?: number;
  batch_size?: number;
  cap?: number;
  since?: string;
  until?: string;
  mailbox?: string;
};

type CorpusRow = {
  id: string;
  source_id: string | null;
  mailbox: string | null;
};

type Summary = {
  mails_scanned: number;
  attachments_found: number;
  metadata_rows_written: number;
  extracted: number;
  failed: number;
  source_gone: number;
  dry_run: boolean;
};

function isSourceGone(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("404");
}

export const attachmentsBackfill = inngest.createFunction(
  { id: "attachments-backfill", retries: 1, concurrency: { limit: 1 } },
  { event: "sales-email/attachments.backfill.run" },
  async ({ event, step }) => {
    const data = (event?.data as BackfillEventData | undefined) ?? {};
    const dryRun = data.dry_run === true;
    const limit =
      typeof data.limit === "number" ? data.limit : Number.POSITIVE_INFINITY;
    const batchSize =
      typeof data.batch_size === "number" && data.batch_size > 0
        ? data.batch_size
        : DEFAULT_BATCH_SIZE;
    const cap = typeof data.cap === "number" ? data.cap : BACKFILL_HARD_CAP;
    const mailbox = data.mailbox ?? SALES_OUTLOOK_MAILBOX;

    const until = data.until ?? new Date().toISOString();
    const since =
      data.since ??
      new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 86_400_000).toISOString();

    // ---- 1. Select the corpus (fail-loud hard cap) -------------------------
    const corpus = await step.run("select-corpus", async () => {
      const admin = createAdminClient();
      // Read up to cap+1; corpus length === readCap is indistinguishable from a
      // truncated read → fail loud naming the corpus + cap (no silent
      // truncation, select-candidates.ts WR-05 pattern / T-116-18).
      const readCap = cap + 1;
      const { data: rows, error } = (await admin
        .schema("email_pipeline")
        .from("emails")
        .select("id, source_id, mailbox")
        .eq("source", "outlook")
        .eq("mailbox", mailbox)
        .gte("received_at", since)
        .lt("received_at", until)
        .order("received_at", { ascending: false })
        .limit(readCap)) as { data: CorpusRow[] | null; error: unknown };
      if (error) throw error as Error;

      const corpusRows = rows ?? [];
      if (corpusRows.length >= readCap) {
        throw new Error(
          `Phase 116 attachment backfill: OUTLOOK corpus truncated at readCap=${readCap} ` +
            `(cap=${cap}) for ${SWARM_TYPE} mailbox=${mailbox} in [${since}, ${until}). ` +
            `Narrow the window or raise cap explicitly — never silently truncate.`,
        );
      }
      // Bounded dry-run / preview honours event.data.limit.
      return Number.isFinite(limit) ? corpusRows.slice(0, limit) : corpusRows;
    });

    // ---- 2. Load registry caps + extract switch + the survivor auto-set ----
    const setup = await step.run("load-setup", async () => {
      const admin = createAdminClient();
      const swarmRow = await loadSwarm(admin, SWARM_TYPE);
      const noiseCategories = await loadSwarmNoiseCategories(admin, SWARM_TYPE);
      const cfg = swarmRow?.attachment_config ?? {};
      const rawCaps = (cfg.caps ?? {}) as Record<string, number | undefined>;
      return {
        extractOn: cfg.extract === true,
        caps: {
          maxSizeBytes: rawCaps.max_size_bytes ?? DEFAULT_CAPS.maxSizeBytes,
          maxVisionPages: rawCaps.max_vision_pages ?? DEFAULT_CAPS.maxVisionPages,
          maxExtractedChars:
            rawCaps.max_extracted_chars ?? DEFAULT_CAPS.maxExtractedChars,
          maxAttachmentsPerMail:
            rawCaps.max_attachments_per_mail ?? DEFAULT_CAPS.maxAttachmentsPerMail,
        },
        // Stage-1-survivor auto-set: registry-derived noise that auto-archives.
        // A mail is a SURVIVOR iff classifyDisposition(verdict) !== 'auto'.
        autoKeys: Array.from(buildAutoKeySet(noiseCategories)),
      };
    });

    const autoKeySet = new Set(setup.autoKeys);

    const summary: Summary = {
      mails_scanned: 0,
      attachments_found: 0,
      metadata_rows_written: 0,
      extracted: 0,
      failed: 0,
      source_gone: 0,
      dry_run: dryRun,
    };

    // ---- 3. Iterate in bounded batches (rate-limited against Graph) --------
    for (let i = 0; i < corpus.length; i += batchSize) {
      const batchIdx = Math.floor(i / batchSize);
      const batch = corpus.slice(i, i + batchSize);

      const batchResult = await step.run(
        `backfill-batch-${batchIdx}`,
        async () => {
          const admin = createAdminClient();

          // Survivor verdicts for THIS batch (reuse the persisted retro verdict
          // — D-12; missing verdict → unknown/low → 'queue' → survivor).
          const verdicts = await resolveVerdicts(
            admin,
            batch.map((c) => c.id),
          );

          const local = {
            mails_scanned: 0,
            attachments_found: 0,
            metadata_rows_written: 0,
            extracted: 0,
            failed: 0,
            source_gone: 0,
          };

          for (const mail of batch) {
            local.mails_scanned += 1;
            const messageId = mail.source_id;
            if (!messageId) continue; // no Graph id → nothing to list

            // List attachment metadata; Graph 404 → source_gone, continue.
            let atts: Awaited<ReturnType<typeof listAttachments>>;
            try {
              atts = await listAttachments(mailbox, messageId);
            } catch (err) {
              if (isSourceGone(err)) {
                local.source_gone += 1;
                continue;
              }
              throw err;
            }

            // Keep only real document attachments (mirror capture.ts filter).
            const kept = atts.filter(
              (a) =>
                a.isInline !== true &&
                a["@odata.type"] === FILE_ATTACHMENT_ODATA_TYPE,
            );
            local.attachments_found += kept.length;
            if (kept.length === 0) continue;

            // Stage-1-survivor check (reuse Phase 112 disposition).
            const v = verdicts.get(mail.id) ?? {
              predicted_category_key: "unknown",
              confidence: "low" as const,
            };
            const disposition = classifyDisposition(
              v.predicted_category_key,
              v.confidence,
              autoKeySet,
            );
            const isSurvivor = disposition !== "auto";

            // Dry-run: count only, write nothing.
            if (dryRun) continue;

            // Idempotent metadata upsert on (email_id, attachment_id).
            const rows = kept.map((a) => ({
              swarm_type: SWARM_TYPE,
              email_id: mail.id,
              attachment_id: a.id,
              filename: a.name ?? null,
              content_type: a.contentType ?? null,
              size_bytes: a.size ?? null,
              is_inline: false,
              // Survivors + extract ON → 'pending' so the shared helper picks
              // them up below; everyone else → metadata-only.
              extraction_status:
                isSurvivor && setup.extractOn ? "pending" : "not_requested",
            }));
            const { error: upErr } = await admin
              .schema("email_pipeline")
              .from("email_attachments")
              .upsert(rows, { onConflict: "email_id,attachment_id" });
            if (upErr) {
              // Fail-soft per mail — metadata write failure doesn't crash the run.
              local.failed += 1;
              continue;
            }
            local.metadata_rows_written += rows.length;

            // Extraction ONLY for survivors + extract switch ON, via the SHARED
            // Plan 04 helper (no reimplementation). Non-survivors: metadata only.
            // The helper updates rows by their real DB id — re-select the just-
            // upserted 'pending' rows for this email (same shape the LIVE
            // extractor loads), so backfill and live feed the helper identically.
            if (isSurvivor && setup.extractOn) {
              const { data: pendingRows } = (await admin
                .schema("email_pipeline")
                .from("email_attachments")
                .select("id, attachment_id, filename, content_type")
                .eq("email_id", mail.id)
                .eq("extraction_status", "pending")) as {
                data: Array<{
                  id: string;
                  attachment_id: string;
                  filename: string | null;
                  content_type: string | null;
                }> | null;
              };

              if (pendingRows && pendingRows.length > 0) {
                const r = await extractEmailAttachments({
                  admin,
                  emailId: mail.id,
                  mailbox,
                  messageId,
                  caps: setup.caps,
                  rows: pendingRows,
                });
                local.extracted += r.extracted;
                local.failed += r.failed;
                local.source_gone += r.source_gone;
              }
            }
          }

          return local;
        },
      );

      summary.mails_scanned += batchResult.mails_scanned;
      summary.attachments_found += batchResult.attachments_found;
      summary.metadata_rows_written += batchResult.metadata_rows_written;
      summary.extracted += batchResult.extracted;
      summary.failed += batchResult.failed;
      summary.source_gone += batchResult.source_gone;

      // Inter-batch delay — Graph rate-limit discipline (skip after last batch).
      if (i + batchSize < corpus.length) {
        await step.sleep(`backfill-delay-${batchIdx}`, INTER_BATCH_DELAY);
      }
    }

    return summary;
  },
);
