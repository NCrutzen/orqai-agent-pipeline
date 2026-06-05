// Phase 116-04 Task 2 — shared per-email download→store→extract→update loop.
//
// This module OWNS the loop so BOTH the live stage-1.5 extractor worker (this
// plan) AND the Plan 06 backfill worker import it — single implementation, no
// drift (checker cross-plan-contract fix). It performs Graph download, Storage
// upload, extraction (via the pure extract.ts service), and the per-row table
// update. It is:
//   - swarm-agnostic: NO === 'sales' / === 'debtor'; the swarm_type only flows
//     into the row column via the caller, never into a branch here.
//   - fail-soft per attachment (D-03): a Graph 404 → status 'source_gone'; any
//     other throw → status 'extraction_failed'; the loop NEVER stops early and
//     this function NEVER rethrows. One bad attachment can't stall the funnel.
//   - replay-safe: storage keys are DETERMINISTIC `${emailId}/${attachmentId}.<ext>`
//     (both ids stable — NO randomUUID / Date.now, Pitfall 6). The caller wraps
//     the whole call in its own step.run for replay isolation.
//   - DoS-safe (T-116-11): returns ONLY ids/counts, NEVER the extracted text —
//     the text is written to the table, never serialized into an Inngest event.

import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadAttachmentValue } from "@/lib/outlook/client";
import {
  extractAttachment,
  type AttachmentCaps,
} from "@/lib/automations/attachments/extract";

const STORAGE_BUCKET = "email-attachments";

/** Caps the worker reads off the registry (snake_case jsonb) and the helper
 *  consumes — extends the pure service's AttachmentCaps with the per-mail count
 *  cap (an orchestration concern the pure service doesn't know about). */
export interface ExtractWorkerCaps extends AttachmentCaps {
  maxAttachmentsPerMail: number;
}

/** A 'pending' email_pipeline.email_attachments row the helper processes. */
export interface PendingAttachmentRow {
  id: string;
  attachment_id: string;
  filename?: string | null;
  content_type?: string | null;
}

export interface ExtractEmailAttachmentsInput {
  admin: SupabaseClient;
  emailId: string;
  mailbox: string;
  messageId: string;
  caps: ExtractWorkerCaps;
  rows: PendingAttachmentRow[];
}

export interface ExtractEmailAttachmentsResult {
  extracted: number;
  failed: number;
  source_gone: number;
}

// Map a content_type to a storage-key extension. Deterministic; defaults to
// 'bin' for unknown types so the key is always stable.
function extForContentType(contentType?: string | null): string {
  const ct = (contentType ?? "").toLowerCase().split(";")[0].trim();
  if (ct === "application/pdf") return "pdf";
  if (ct === "image/jpeg") return "jpg";
  if (ct === "image/png") return "png";
  return "bin";
}

// Detect a Graph 404 (deleted/moved mail or attachment) — fail-soft to
// 'source_gone' (D-12 precedent: the ingest route's is404 handling). The Graph
// helpers throw an Error whose message carries the status code.
function isSourceGone(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("404");
}

async function updateRow(
  admin: SupabaseClient,
  rowId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  // Timestamp generated HERE (inside the caller's step.run) — replay-safe.
  await admin
    .schema("email_pipeline")
    .from("email_attachments")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", rowId);
}

/**
 * Download → store → extract → update each pending attachment of one email.
 * Fail-soft per attachment; never throws to the caller. Returns only counts.
 */
export async function extractEmailAttachments(
  input: ExtractEmailAttachmentsInput,
): Promise<ExtractEmailAttachmentsResult> {
  const { admin, emailId, mailbox, messageId, caps, rows } = input;

  const result: ExtractEmailAttachmentsResult = {
    extracted: 0,
    failed: 0,
    source_gone: 0,
  };

  // Cap the number of attachments processed per mail (DoS / cost guard).
  const capped = rows.slice(0, Math.max(0, caps.maxAttachmentsPerMail));

  for (const row of capped) {
    try {
      // 1) Download raw bytes via the single Graph credential boundary.
      let bytes: ArrayBuffer;
      try {
        bytes = await downloadAttachmentValue(mailbox, messageId, row.attachment_id);
      } catch (err) {
        if (isSourceGone(err)) {
          await updateRow(admin, row.id, { extraction_status: "source_gone" });
          result.source_gone += 1;
          continue;
        }
        throw err; // non-404 download error → caught below → extraction_failed
      }

      // 2) Store the binary at a DETERMINISTIC key (replay-safe, upsert).
      const key = `${emailId}/${row.attachment_id}.${extForContentType(row.content_type)}`;
      const { error: uploadErr } = await admin.storage
        .from(STORAGE_BUCKET)
        .upload(key, bytes, {
          contentType: row.content_type ?? "application/octet-stream",
          upsert: true,
        });
      if (uploadErr) {
        // Storage failure is a fail-soft per-attachment outcome, not a throw.
        await updateRow(admin, row.id, { extraction_status: "extraction_failed" });
        result.failed += 1;
        continue;
      }

      // 3) Extract text (pure service: unpdf → vision; never throws).
      const extracted = await extractAttachment({
        bytes,
        contentType: row.content_type ?? "",
        filename: row.filename ?? undefined,
        caps,
      });

      // 4) Persist text + status + storage_key. Text → table, NEVER returned.
      await updateRow(admin, row.id, {
        extracted_text: extracted.text,
        extraction_status: extracted.status,
        storage_key: key,
      });

      if (extracted.status === "extracted") result.extracted += 1;
      else result.failed += 1;
    } catch {
      // Any unexpected throw → fail-soft. The funnel must never stall (D-03).
      try {
        await updateRow(admin, row.id, { extraction_status: "extraction_failed" });
      } catch {
        // Even the status write failed — swallow; we still must not rethrow.
      }
      result.failed += 1;
    }
  }

  return result;
}
