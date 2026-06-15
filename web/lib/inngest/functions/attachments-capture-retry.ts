// Delayed attachment re-capture — fixes the ingest-moment Graph indexing race.
//
// At ingest (fired by Zapier seconds after the mail arrives), Microsoft Graph has
// often not yet indexed a freshly-arrived attachment, so getMessageMeta returns
// hasAttachments=false and the ingest-time captureAttachmentMetadata call seeds
// nothing — even for mails that genuinely carry a PDF (verified live 2026-06-15:
// Graph reports hasAttachments=true for the same message minutes later). The
// debtor ingest route therefore emits `pipeline/attachments.capture.retry` when
// the flag was false; this worker waits for Graph to catch up, re-fetches the
// (now-correct) flag, and re-runs capture.
//
// Idempotent: captureAttachmentMetadata upserts on (email_id, attachment_id), so
// re-running over an already-captured mail is a no-op. For genuine no-attachment
// mail the re-fetched flag stays false → capture returns early (no listAttachments
// call). For the race cases the flag is now true → capture seeds the 'pending'
// rows the Stage 1.5 extractor consumes.
//
// Swarm-agnostic (SWARM-02): swarm_type comes from the payload, never a literal.
// Replay-safety (CLAUDE.md Phase 65): all side effects in step.run; step.sleep is
// Inngest-durable; no non-deterministic ids are used as keys.
import { z } from "zod";
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMessageMeta } from "@/lib/outlook";
import { captureAttachmentMetadata } from "@/lib/automations/attachments/capture";

const EventDataSchema = z.object({
  swarm_type: z.string(),
  mailbox: z.string(),
  message_id: z.string(),
  email_id: z.string(),
});

export const attachmentsCaptureRetry = inngest.createFunction(
  { id: "attachments-capture-retry", retries: 1 },
  { event: "pipeline/attachments.capture.retry" },
  async ({ event, step }) => {
    const { swarm_type, mailbox, message_id, email_id } = EventDataSchema.parse(
      event.data,
    );

    // Wait for Graph to index the freshly-arrived attachment. The false→true
    // flip is observed within minutes of arrival; 120s is a safe margin. Debtor
    // stays dry_run — the attachment text only needs to reach Stage 2, not
    // instantly.
    await step.sleep("wait-for-graph-index", "120s");

    const result = await step.run("recapture", async () => {
      const admin = createAdminClient();
      // Re-fetch hasAttachments now that Graph has had time to index. Genuine
      // no-attachment mail stays false (capture no-ops, no listAttachments call);
      // the race cases are now true.
      const meta = await getMessageMeta(mailbox, message_id);
      return captureAttachmentMetadata({
        admin,
        swarmType: swarm_type,
        mailbox,
        messageId: message_id,
        emailId: email_id,
        hasAttachments: meta.hasAttachments,
      });
    });

    return { ok: true, swarm_type, email_id, captured: result.captured };
  },
);
