// Phase 116-04 Task 2 — stage-1.5 attachment-extraction funnel worker.
//
// D-01 / D-02: extraction is a funnel step BETWEEN the Stage 1 verdict and the
// Stage 2 request. The classifier-verdict-worker (untouched) fires the event
// named in swarm_noise_categories.swarm_dispatch. For sales, 20260605c rewired
// the 'unknown' row's swarm_dispatch to 'sales-email/attachments.extract.requested'
// — i.e. THIS worker. It:
//   1. loads the email row + its 'pending' attachment rows + the swarm row,
//   2. reads the downstream Stage 2 event name from the REGISTRY
//      (attachment_config.stage2_dispatch_event — Plan 01 seed). NEVER a code
//      literal, NEVER a hardcoded sales fallback (that would reintroduce the
//      SWARM-02 break / T-116-14). A missing key is a fail-loud misconfiguration.
//   3. if extract is ON AND there are pending rows → runs extractEmailAttachments
//      (the shared helper — fail-soft per attachment, owned by extract-worker.ts
//      so Plan 06 backfill reuses it),
//   4. ALWAYS re-emits the registry Stage 2 event afterwards — even on helper
//      failure (D-03: the funnel is never a dead-end). Stage 2 then sees the
//      attachment text via its own load step (Plan 04b / resolver concat).
//
// extract OFF (debtor D-13, or any swarm whose dispatch points here with
// extract=false) → pure pass-through: helper called ZERO times, Stage 2 emitted
// immediately. No swarm literal gates this — only the registry `extract` switch.
//
// SWARM-02: no === 'sales' / === 'debtor'. Gating = the registry extract switch;
// the downstream event name = the registry stage2_dispatch_event.
//
// Replay-safety (CLAUDE.md Phase 65): all side effects in step.run; the shared
// helper generates its timestamps inside this worker's step.run; storage keys
// are deterministic; inngest.send is NEVER destructured (commit dae6276); the
// extracted text is written to the table, NEVER serialized into the emitted
// event (T-116-11).
//
// retries: 3 (was 0) — handoff-resilience fix (2026-06-16). The `load-context`
// emails .or() lookup intermittently hit the Postgres statement timeout (now
// also indexed, see 20260616 migration) and threw BEFORE `emit-stage-2`,
// dropping the email at the Stage 1.5→2 handoff. The re-emit is idempotent at
// the event level and the per-attachment writes are upserts, so retries replay
// safely; a terminal failure surfaces via onFailure.

import { z } from "zod";
import { inngest } from "@/lib/inngest/client";
import { recordWorkerFailure } from "@/lib/inngest/on-worker-failure";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm } from "@/lib/swarms/registry";
import {
  extractEmailAttachments,
  type PendingAttachmentRow,
} from "@/lib/automations/attachments/extract-worker";

// Inngest's typed `inngest.send` would reject a runtime-built event name; cast
// through unknown to widen past the strict event-name union. NEVER destructure
// inngest.send (CLAUDE.md commit-dae6276 this-binding safety).
type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;

// The exact data shape the classifier-verdict-worker emits on swarm_dispatch.
const EventDataSchema = z.object({
  automation_run_id: z.string(),
  swarm_type: z.string(),
  category_key: z.string(),
  message_id: z.string(),
  source_mailbox: z.string(),
});

export const stage1_5AttachmentExtractor = inngest.createFunction(
  {
    id: "stage-1_5-attachment-extractor",
    retries: 3,
    onFailure: async ({ error, event }) => {
      await recordWorkerFailure({
        stage: 1,
        stageLabel: "stage-1.5-attachment-extractor",
        event,
        error,
      });
    },
  },
  { event: "sales-email/attachments.extract.requested" },
  async ({ event, step }) => {
    const {
      automation_run_id,
      swarm_type,
      category_key,
      message_id,
      source_mailbox,
    } = EventDataSchema.parse(event.data);

    const admin = createAdminClient();

    // ---- 1. Load email row + pending attachment rows + swarm row -----------
    const context = await step.run("load-context", async () => {
      const { data: emailRow, error: emailErr } = await admin
        .schema("email_pipeline")
        .from("emails")
        .select("id")
        .or(`source_id.eq.${message_id},internet_message_id.eq.${message_id}`)
        .maybeSingle();
      if (emailErr) {
        throw new Error(`emails lookup failed: ${emailErr.message}`);
      }

      let pendingRows: PendingAttachmentRow[] = [];
      if (emailRow?.id) {
        const { data: rows, error: attErr } = await admin
          .schema("email_pipeline")
          .from("email_attachments")
          .select("id, attachment_id, filename, content_type")
          .eq("email_id", emailRow.id)
          .eq("extraction_status", "pending");
        if (attErr) {
          throw new Error(`email_attachments lookup failed: ${attErr.message}`);
        }
        pendingRows = (rows as PendingAttachmentRow[] | null) ?? [];
      }

      const swarmRow = await loadSwarm(admin, swarm_type);
      return { emailId: emailRow?.id ?? null, pendingRows, swarmRow };
    });

    // ---- 2. Resolve the downstream event name from the REGISTRY ------------
    // REQUIRED — Plan 01 seeds it. No code-literal fallback (T-116-14): a
    // registry without this key is a misconfiguration, not a default-to-sales.
    const downstreamEvent =
      context.swarmRow?.attachment_config?.stage2_dispatch_event;
    if (!downstreamEvent) {
      throw new Error(
        `attachment_config.stage2_dispatch_event missing for swarm '${swarm_type}' — ` +
          `the extractor cannot guess the Stage 2 event (no code-literal fallback). ` +
          `Seed it on public.swarms.attachment_config (Plan 01).`,
      );
    }

    // ---- 3. Extraction — the PENDING ROWS are authoritative (review WR-03) --
    // `loadSwarm` is a 60s TTL cache. Capture seeds extraction_status='pending'
    // from the extract switch READ AT INGEST TIME; this worker runs later in a
    // possibly-different lambda with a possibly-stale cache. If the cached
    // `extract` flag is stale-false right after an operator flips the switch,
    // gating on it would skip the already-seeded 'pending' rows, stranding them
    // at 'pending' forever (no sweeper re-queues them). So the existence of
    // 'pending' rows — which ALREADY encodes the capture-time extract=true
    // decision — drives extraction, NOT the cached switch. (extract=false at
    // capture seeds 'not_requested', so no 'pending' rows exist → pure
    // pass-through; the cached flag is only an informational fallback.)
    const extractOn = context.swarmRow?.attachment_config?.extract === true;
    const caps = context.swarmRow?.attachment_config?.caps ?? {};
    const hasPending = context.pendingRows.length > 0;

    if (context.emailId && hasPending) {
      try {
        const emailId = context.emailId;
        const pendingRows = context.pendingRows;
        await step.run("extract-attachments", () =>
          extractEmailAttachments({
            admin,
            emailId,
            mailbox: source_mailbox,
            messageId: message_id,
            caps: {
              maxSizeBytes: caps.max_size_bytes ?? 26214400,
              maxVisionPages: caps.max_vision_pages ?? 15,
              maxExtractedChars: caps.max_extracted_chars ?? 200000,
              maxAttachmentsPerMail: caps.max_attachments_per_mail ?? 20,
            },
            rows: pendingRows,
          }),
        );
      } catch (err) {
        // D-03: extraction failure must NEVER dead-end the funnel. Log and
        // fall through to the Stage 2 re-emit below (body-only resolution).
        console.error(
          `[stage-1.5-extractor] extraction failed for ${message_id} (${swarm_type}); ` +
            `proceeding to Stage 2 body-only:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    // ---- 4. ALWAYS re-emit the registry Stage 2 event ----------------------
    await step.run("emit-stage-2", async () => {
      await (inngest.send as unknown as SendFn)({
        name: downstreamEvent,
        data: {
          automation_run_id,
          swarm_type,
          category_key,
          message_id,
          source_mailbox,
        },
      });
    });

    return { ok: true, downstreamEvent, extractOn, processedPending: hasPending };
  },
);
