// Phase 116-03 Task 1 — shared, swarm-agnostic attachment metadata capture.
//
// Called from BOTH ingest routes (sales + debtor) after the emails upsert
// resolves emailId. Reads attachment_config.capture / .extract off the loaded
// swarm row — registry data ONLY, NO === 'sales' / === 'debtor' (SWARM-02 /
// Pitfall 3). When capture is ON and the mail carries attachments, lists
// attachment metadata via Graph and upserts one email_pipeline.email_attachments
// row per real (non-inline, fileAttachment) attachment.
//
// Metadata ONLY — no binary download, no extraction here (D-05). Extraction is
// the post-Stage-1 worker's job (Plan 04); this helper just seeds the row's
// extraction_status from the registry `extract` switch (ON → 'pending', OFF →
// 'not_requested').
//
// Idempotent: upsert onConflict 'email_id,attachment_id' (mirrors the
// email_thread_messages / conversation_context onConflict pattern in the ingest
// routes) so Zapier retries don't double-insert.
//
// Fail-soft (D-03 — ingest is the hot path): every Graph / DB failure is
// swallowed and the helper returns { captured: 0 }. Ingest MUST NEVER fail
// because of attachments.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSwarm } from "@/lib/swarms/registry";
import { listAttachments } from "@/lib/outlook/client";

// Microsoft Graph @odata.type for a real file attachment (carries bytes).
// reference / item attachments carry no bytes → skipped at capture (Pitfall 5).
const FILE_ATTACHMENT_ODATA_TYPE = "#microsoft.graph.fileAttachment";

export interface CaptureAttachmentInput {
  admin: SupabaseClient;
  swarmType: string;
  mailbox: string;
  messageId: string;
  emailId: string;
  hasAttachments: boolean;
}

export interface CaptureAttachmentResult {
  captured: number;
}

/**
 * Registry-gated, swarm-agnostic attachment metadata capture.
 *
 * The `swarmType` arg flows ONLY into the loadSwarm key and the row's
 * swarm_type column — never into a branch condition. Behaviour difference
 * between swarms comes entirely from the registry switches (attachment_config),
 * which is exactly the D-13 proof: debtor capture turns on purely because its
 * registry row sets capture=true, with zero debtor-specific code.
 */
export async function captureAttachmentMetadata(
  input: CaptureAttachmentInput,
): Promise<CaptureAttachmentResult> {
  const { admin, swarmType, mailbox, messageId, emailId, hasAttachments } = input;

  // 1) Read the registry switches — data only, NO swarm literal (SWARM-02).
  const swarmRow = await loadSwarm(admin, swarmType);
  const captureOn = swarmRow?.attachment_config?.capture === true;
  const extractOn = swarmRow?.attachment_config?.extract === true;

  // [DIAG-915] TEMP diagnostic — remove after the attachment-capture gap is found.
  console.log(
    `[DIAG-915-CAPTURE] entry swarm=${swarmType} msg=${messageId} captureOn=${captureOn} extractOn=${extractOn} hasAttachments=${hasAttachments}`,
  );

  // 2) Gate: capture off OR no attachments → nothing to do.
  if (!captureOn || !hasAttachments) {
    return { captured: 0 };
  }

  try {
    // 3) List attachment metadata (zod-validated in listAttachments, Plan 02).
    const atts = await listAttachments(mailbox, messageId);

    // 4) Keep only real document attachments: drop inline (signatures/logos)
    //    and any non-fileAttachment @odata.type (reference/itemAttachment carry
    //    no bytes — never a capture row here; Pitfall 5 / A4).
    const kept = atts.filter(
      (a) =>
        a.isInline !== true &&
        a["@odata.type"] === FILE_ATTACHMENT_ODATA_TYPE,
    );

    // [DIAG-915] TEMP diagnostic — remove after the attachment-capture gap is found.
    console.log(
      `[DIAG-915-CAPTURE] listed msg=${messageId} atts=${atts.length} kept=${kept.length} ` +
        `types=${JSON.stringify(atts.map((a) => ({ t: a["@odata.type"], inline: a.isInline, name: a.name })))}`,
    );

    if (kept.length === 0) {
      return { captured: 0 };
    }

    // 5) One metadata row per kept attachment. extraction_status seeded from
    //    the registry extract switch (pending vs not_requested) — Plan 04 picks
    //    up the 'pending' rows. Metadata only: no storage_key, no extracted_text.
    const rows = kept.map((a) => ({
      swarm_type: swarmType,
      email_id: emailId,
      attachment_id: a.id,
      filename: a.name ?? null,
      content_type: a.contentType ?? null,
      size_bytes: a.size ?? null,
      is_inline: false,
      extraction_status: extractOn ? "pending" : "not_requested",
    }));

    // 6) Idempotent upsert on (email_id, attachment_id).
    const { error } = await admin
      .schema("email_pipeline")
      .from("email_attachments")
      .upsert(rows, { onConflict: "email_id,attachment_id" });

    if (error) {
      console.error(
        `[attachments/capture] upsert failed for email ${emailId} (${swarmType}):`,
        error.message,
      );
      return { captured: 0 };
    }

    return { captured: rows.length };
  } catch (err) {
    // Fail-soft: a Graph hiccup or any thrown error must not break ingest.
    console.error(
      `[attachments/capture] capture failed for ${messageId}@${mailbox} (${swarmType}):`,
      String(err),
    );
    return { captured: 0 };
  }
}
