// Debtor corpus attachment-metadata + extraction backfill (V9.5 baseline lever).
//
// Sibling of the Phase 116-06 sales backfill (attachments-backfill.ts). Same
// shape — iterate an already-ingested corpus by source_id (the Graph message
// id), capture attachment metadata, and run extraction for survivors via the
// SHARED Plan 04 helper — but DEBTOR-scoped:
//
//   - swarm_type = 'debtor-email' (per-trigger constant, NOT a shared-worker
//     branch — SWARM-02; a second swarm = a second trigger event, exactly the
//     pattern the sales worker's header prescribes).
//   - Multi-mailbox: debtor spans several iController mailboxes, so the corpus
//     is selected across all of them and listAttachments uses each mail's OWN
//     mailbox (mail.mailbox), not a single constant.
//   - Survivor signal: the recent debtor corpus was ALREADY live-classified, so
//     "survivor" = "has a debtor.email_labels row" (reached Stage 2). This is
//     the V9.5 baseline population — resolveSurvivors() owns that lookup. The
//     sales worker's stage_1_retro_runs disposition does NOT apply here (debtor
//     never populates that table).
//
// Why this exists: capture was globally broken (listAttachments put @odata.type
// in $select → Graph 400 → fail-soft captured:0), so email_attachments stayed
// empty and the live Stage-1.5 extractor had nothing to extract for debtor mail
// already processed before the fix. This one-shot backfill seeds metadata +
// extracts attachment text for the in-window survivors so the V9.5 resolution
// baseline can use it without waiting for organic re-ingest.
//
// Reuses the sales backfill's hard contracts verbatim: fail-loud read cap (no
// silent truncation), bounded batches with an inter-batch sleep (Graph rate
// discipline), 404 → source_gone fail-soft, idempotent upsert on
// (email_id, attachment_id). Manual trigger only (CLAUDE.md cron-disable):
//   inngest.send({ name: "debtor-email/attachments.backfill.run",
//                  data: { dry_run?, limit?, batch_size?, cap?, since?, until?,
//                          mailboxes? } })
//
// Replay-safety (CLAUDE.md Phase 65): all I/O in step.run; the shared helper
// stamps its timestamps inside the per-batch step.run; storage keys are
// deterministic; extracted text is written to the table, never serialized into
// the function output.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm } from "@/lib/swarms/registry";
import { listAttachments } from "@/lib/outlook/client";
import { extractEmailAttachments } from "@/lib/automations/attachments/extract-worker";
import { resolveSurvivors } from "@/lib/automations/debtor-email/backfill/resolve-survivors";
import { ICONTROLLER_MAILBOXES } from "@/lib/automations/debtor-email/mailboxes";

// Debtor-scoped by trigger event (per-trigger constant, NOT a branch — SWARM-02).
const SWARM_TYPE = "debtor-email";
// Default corpus = every known debtor mailbox (dedup; smeba-fire .be/.nl share
// an iController id but are distinct Graph mailboxes).
const DEBTOR_MAILBOXES = Array.from(new Set(Object.keys(ICONTROLLER_MAILBOXES)));

// Fail-loud hard cap (select-candidates.ts precedent / mirrors sales backfill).
const BACKFILL_HARD_CAP = 40000;
// Bounded batch — each row issues a live Graph listAttachments call; keep the
// batch step well under the 60s Inngest gateway (Phase 112 Pitfall 2).
const DEFAULT_BATCH_SIZE = 40;
const INTER_BATCH_DELAY = "1s";
// V9.5 baseline only needs the recent window; default short (operator override
// via since/until). 30d covers the post-cutover zapier-debtor-ingest corpus.
const DEFAULT_LOOKBACK_DAYS = 30;

// Microsoft Graph @odata.type for a real file attachment (mirror capture.ts).
const FILE_ATTACHMENT_ODATA_TYPE = "#microsoft.graph.fileAttachment";

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
  mailboxes?: string[];
};

type CorpusRow = {
  id: string;
  source_id: string | null;
  mailbox: string | null;
};

type Summary = {
  mails_scanned: number;
  survivors: number;
  attachments_found: number;
  metadata_rows_written: number;
  extracted: number;
  failed: number;
  skipped: number;
  source_gone: number;
  dry_run: boolean;
};

function isSourceGone(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("404");
}

export const attachmentsBackfillDebtor = inngest.createFunction(
  { id: "attachments-backfill-debtor", retries: 1, concurrency: { limit: 1 } },
  { event: "debtor-email/attachments.backfill.run" },
  async ({ event, step }) => {
    const data = (event?.data as BackfillEventData | undefined) ?? {};
    const dryRun = data.dry_run === true;
    // WR-06 (sales backfill): non-positive limit means "no limit", not slice(0,0).
    const limit =
      typeof data.limit === "number" && data.limit > 0
        ? data.limit
        : Number.POSITIVE_INFINITY;
    const batchSize =
      typeof data.batch_size === "number" && data.batch_size > 0
        ? data.batch_size
        : DEFAULT_BATCH_SIZE;
    const cap = typeof data.cap === "number" ? data.cap : BACKFILL_HARD_CAP;
    const mailboxes =
      Array.isArray(data.mailboxes) && data.mailboxes.length > 0
        ? data.mailboxes
        : DEBTOR_MAILBOXES;

    const until = data.until ?? new Date().toISOString();
    const since =
      data.since ??
      new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 86_400_000).toISOString();

    // ---- 1. Select the corpus across all debtor mailboxes (fail-loud cap) ----
    const corpus = await step.run("select-corpus", async () => {
      const admin = createAdminClient();
      // Read up to cap+1; length === readCap is indistinguishable from a
      // truncated read → fail loud (no silent truncation).
      const readCap = cap + 1;
      const { data: rows, error } = (await admin
        .schema("email_pipeline")
        .from("emails")
        .select("id, source_id, mailbox")
        .in("mailbox", mailboxes)
        .gte("received_at", since)
        .lt("received_at", until)
        .order("received_at", { ascending: false })
        .limit(readCap)) as { data: CorpusRow[] | null; error: unknown };
      if (error) throw error as Error;

      const corpusRows = rows ?? [];
      if (corpusRows.length >= readCap) {
        throw new Error(
          `Debtor attachment backfill: corpus truncated at readCap=${readCap} ` +
            `(cap=${cap}) for ${SWARM_TYPE} mailboxes=[${mailboxes.join(",")}] ` +
            `in [${since}, ${until}). Narrow the window or raise cap explicitly ` +
            `— never silently truncate.`,
        );
      }
      return Number.isFinite(limit) ? corpusRows.slice(0, limit) : corpusRows;
    });

    // ---- 2. Load registry caps + extract switch -----------------------------
    const setup = await step.run("load-setup", async () => {
      const admin = createAdminClient();
      const swarmRow = await loadSwarm(admin, SWARM_TYPE);
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
            rawCaps.max_attachments_per_mail ??
            DEFAULT_CAPS.maxAttachmentsPerMail,
        },
      };
    });

    const summary: Summary = {
      mails_scanned: 0,
      survivors: 0,
      attachments_found: 0,
      metadata_rows_written: 0,
      extracted: 0,
      failed: 0,
      skipped: 0,
      source_gone: 0,
      dry_run: dryRun,
    };

    // ---- 3. Iterate in bounded batches (rate-limited against Graph) ---------
    for (let i = 0; i < corpus.length; i += batchSize) {
      const batchIdx = Math.floor(i / batchSize);
      const batch = corpus.slice(i, i + batchSize);

      const batchResult = await step.run(
        `backfill-batch-${batchIdx}`,
        async () => {
          const admin = createAdminClient();

          // Survivor set for THIS batch = mails with a debtor.email_labels row
          // (reached Stage 2). Non-survivors were filtered as noise → skipped.
          const survivors = await resolveSurvivors(
            admin,
            batch.map((c) => c.id),
          );

          const local = {
            mails_scanned: 0,
            survivors: 0,
            attachments_found: 0,
            metadata_rows_written: 0,
            extracted: 0,
            failed: 0,
            skipped: 0,
            source_gone: 0,
          };

          for (const mail of batch) {
            local.mails_scanned += 1;
            const messageId = mail.source_id;
            const mailbox = mail.mailbox;
            if (!messageId || !mailbox) continue; // no Graph id/mailbox → skip

            // Survivor gate: only Stage-2-reaching mail matters for the V9.5
            // resolution baseline. Skip noise entirely (no Graph call).
            if (!survivors.has(mail.id)) continue;
            local.survivors += 1;

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

            // Dry-run: count only, write nothing.
            if (dryRun) continue;

            // Idempotent metadata upsert on (email_id, attachment_id). All rows
            // here are survivors → extract ON seeds 'pending' for the helper.
            const rows = kept.map((a) => ({
              swarm_type: SWARM_TYPE,
              email_id: mail.id,
              attachment_id: a.id,
              filename: a.name ?? null,
              content_type: a.contentType ?? null,
              size_bytes: a.size ?? null,
              is_inline: false,
              extraction_status: setup.extractOn ? "pending" : "not_requested",
            }));
            const { error: upErr } = await admin
              .schema("email_pipeline")
              .from("email_attachments")
              .upsert(rows, { onConflict: "email_id,attachment_id" });
            if (upErr) {
              local.failed += 1; // fail-soft per mail
              continue;
            }
            local.metadata_rows_written += rows.length;

            // Extraction via the SHARED Plan 04 helper (no reimplementation).
            // Re-select the just-upserted 'pending' rows for this email (same
            // shape the LIVE extractor loads) so backfill + live feed it
            // identically.
            if (setup.extractOn) {
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
                local.skipped += r.skipped;
                local.source_gone += r.source_gone;
              }
            }
          }

          return local;
        },
      );

      summary.mails_scanned += batchResult.mails_scanned;
      summary.survivors += batchResult.survivors;
      summary.attachments_found += batchResult.attachments_found;
      summary.metadata_rows_written += batchResult.metadata_rows_written;
      summary.extracted += batchResult.extracted;
      summary.failed += batchResult.failed;
      summary.skipped += batchResult.skipped;
      summary.source_gone += batchResult.source_gone;

      // Inter-batch delay — Graph rate-limit discipline (skip after last batch).
      if (i + batchSize < corpus.length) {
        await step.sleep(`backfill-delay-${batchIdx}`, INTER_BATCH_DELAY);
      }
    }

    return summary;
  },
);
