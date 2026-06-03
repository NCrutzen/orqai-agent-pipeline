// Phase 5 Plan 05-01 (D-01/D-02) — pure, testable /review page-data loader.
//
// The /review route (review/page.tsx) was a skeleton: it loaded only
// email_labels ids → hydrateBulkReviewRow → shell, passing senderLabels /
// subjectLabels / timestamps / mailboxLabels as `undefined`. Every row read
// "(unknown sender)" / "(no subject)" and the Mailbox filter was empty.
//
// This module extracts the email-data load OUT of review/page.tsx into a pure
// async function so it is unit-testable (mirrors stage-1's loadPageData). It
// widens the stage-1 body-preload projection (D-02) to also pull sender /
// subject / conversation_id / mailbox / received_at, and builds a per-row
// dry_run map from
// debtor.labeling_settings (REQ-07 / Plan 03).
//
// CRITICAL map-keying rule (RESEARCH Pitfall 2 / PATTERNS map-building rule):
// RowStripList keys ALL prop maps by `email_label_id`, NOT `email_id`. The
// email SELECT returns rows keyed by email_id, so every output map is built
// via the `row.email_label_id ↔ row.email_id` correspondence.
//
// dry_run default (RESEARCH A3 / Pitfall 4): debtor.labeling_settings is keyed
// by `source_mailbox` (text), default dry_run=true. A row whose recipient
// mailbox is NOT in labeling_settings defaults to dry_run=true — an unresolved
// row is NOT shown as live/"Auto-applied".
//
// Anti-pattern guard (RESEARCH Security § / T-05-02): mailbox resolution uses
// the chunked loadEmailMailboxes + loadMailboxLabels helpers (chunk at 50) —
// never a raw .in() over all email_ids (PostgREST >8KB silent-drop guard).
//
// Hard separation (RFC stage-1-regex.md + stage-3-coordinator.md): this loader
// reads raw email corpus fields (body/sender/subject) and the per-mailbox
// dry_run flag only — never a classification vocabulary. Safe under the
// stage-1 noise / stage-3 intent split.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BulkReviewRow } from "@/lib/bulk-review/types";
import { loadEmailMailboxes } from "./load-email-mailboxes";
import { loadMailboxLabels } from "./load-mailbox-labels";

export interface ReviewPageData {
  /** email_label_id → sender_name ?? sender_email */
  senderLabels: Record<string, string>;
  /** email_label_id → subject */
  subjectLabels: Record<string, string>;
  /** email_label_id → received_at (ISO) */
  timestamps: Record<string, string>;
  /** email_label_id → body_text (or body_html fallback) */
  bodyByRow: Record<string, string | null>;
  /** email_label_id → conversation_id */
  conversationByRow: Record<string, string | null>;
  /**
   * email_label_id → thread message count.
   *
   * Plan 03 (live UAT 2026-05-28): derived by counting email_pipeline.emails
   * rows that share this row's conversation_id (the same conversation_id +
   * received_at ordering ThreadModal/getThreadMessages uses to load the whole
   * thread). Null when the row has no conversation_id. A single-message thread
   * resolves to 1, so the "View full thread" gate (message_count > 1) correctly
   * stays hidden for genuinely single-message rows and appears for real threads.
   */
  messageCountByRow: Record<string, number | null>;
  /** email_label_id → mailbox display label */
  mailboxLabels: Record<string, string>;
  /** email_label_id → dry_run flag (default true when mailbox unresolved) */
  dryRunByRow: Record<string, boolean>;
}

interface EmailProjection {
  id: string;
  body_text: string | null;
  body_html: string | null;
  sender_email: string | null;
  sender_name: string | null;
  subject: string | null;
  conversation_id: string | null;
  mailbox: string | null;
  received_at: string | null;
}

interface LabelingSettingsRow {
  source_mailbox: string;
  dry_run: boolean | null;
}

// WR-03: the dry_run join is a pure address-STRING equality between
// labeling_settings.source_mailbox and emails.mailbox. A
// normalization mismatch (case, trailing whitespace, a `Name <addr>` display
// wrapper) silently fails the lookup → the row defaults to dry_run=true and a
// genuinely-live row loses its "Auto-applied" marker, understating live
// activity. Normalizing BOTH sides identically removes that silent mis-match.
// (The labeling_settings SELECT is intentionally unscoped: labeling_settings
// has no swarm/entity column and the /review route 404s for non-debtor swarms,
// so a cross-swarm address collision is latent, not live. Re-scope the SELECT
// here once a second swarm ships its own label table — see WR-03.)
function normalizeMailbox(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  // Strip a `Display Name <addr@host>` wrapper down to the bare address.
  const angle = raw.match(/<([^>]+)>/);
  const addr = (angle ? angle[1] : raw).trim().toLowerCase();
  return addr.length > 0 ? addr : null;
}

export async function loadReviewPageData(
  admin: SupabaseClient,
  rows: BulkReviewRow[],
  swarmType: string,
): Promise<ReviewPageData> {
  const empty: ReviewPageData = {
    senderLabels: {},
    subjectLabels: {},
    timestamps: {},
    bodyByRow: {},
    conversationByRow: {},
    messageCountByRow: {},
    mailboxLabels: {},
    dryRunByRow: {},
  };

  // email_id is the SELECT key; rows whose email_id is null produce no entries.
  const emailIds = rows
    .map((r) => r.email_id)
    .filter((x): x is string => !!x);

  if (emailIds.length === 0) return empty;

  const [emailsRes, mailboxIdMap, mailboxLabelMap, labelingRes] =
    await Promise.all([
      admin
        .schema("email_pipeline")
        .from("emails")
        .select(
          "id, body_text, body_html, sender_email, sender_name, subject, conversation_id, mailbox, received_at",
        )
        .in("id", emailIds),
      // email_pipeline.emails has NO mailbox_id column — resolve via the
      // chunked helper (T-05-02). Returns email_id → numeric mailbox_id.
      loadEmailMailboxes(admin, emailIds, swarmType),
      // numeric mailbox_id → display label.
      loadMailboxLabels(admin, swarmType),
      // dry_run flag keyed by source_mailbox text (Pitfall 4).
      admin
        .schema("debtor")
        .from("labeling_settings")
        .select("source_mailbox, dry_run"),
    ]);

  // GAP 1 guard: a failed email SELECT must NEVER again silently empty every
  // label map (the `?? []` degrade made all 966 live rows render
  // "(unknown sender)" / "(no subject)" when the SELECT named columns that did
  // not exist → PostgREST 42703). Throw loudly instead so a bad column name
  // surfaces in logs/UAT rather than shipping unknown-sender rows.
  if (emailsRes.error) {
    throw new Error(
      `loadReviewPageData: email_pipeline.emails SELECT failed: ${emailsRes.error.message}`,
    );
  }

  // Build email_id → projection.
  const emailById = new Map<string, EmailProjection>();
  for (const e of ((emailsRes.data as EmailProjection[] | null) ?? [])) {
    emailById.set(e.id, e);
  }

  // Plan 03 (live UAT 2026-05-28): derive per-conversation message counts so
  // the "View full thread" button surfaces for genuinely-threaded rows. The
  // count is the number of email_pipeline.emails rows sharing a conversation_id
  // — the exact corpus ThreadModal loads. Collect the distinct conversation_ids
  // in this batch and fetch their member ids (projection kept tiny: id +
  // conversation_id only). A row's count is its conversation's membership size;
  // a conversation_id with only one member resolves to 1 (button stays hidden).
  const convIds = Array.from(
    new Set(
      ((emailsRes.data as EmailProjection[] | null) ?? [])
        .map((e) => e.conversation_id)
        .filter((c): c is string => !!c),
    ),
  );
  const countByConversation = new Map<string, number>();
  if (convIds.length > 0) {
    const convCountRes = await admin
      .schema("email_pipeline")
      .from("emails")
      .select("id, conversation_id")
      .in("conversation_id", convIds);
    // A failed count read is non-fatal: degrade to null counts (button hidden)
    // rather than block the whole page on an optional enhancement.
    if (!convCountRes.error) {
      for (const r of ((convCountRes.data as Array<{
        conversation_id: string | null;
      }> | null) ?? [])) {
        if (r.conversation_id == null) continue;
        countByConversation.set(
          r.conversation_id,
          (countByConversation.get(r.conversation_id) ?? 0) + 1,
        );
      }
    }
  }

  // Build source_mailbox → dry_run. A mailbox absent from labeling_settings
  // resolves to `undefined` here so the per-row lookup below can fall through
  // to the `?? true` default (A3 / Pitfall 4 — an unresolved row is NOT live).
  const dryRunByMailbox: Record<string, boolean> = {};
  for (const s of ((labelingRes?.data as LabelingSettingsRow[] | null) ?? [])) {
    // labeling_settings.dry_run default is true; treat null as true.
    // Key by the NORMALIZED address (WR-03) so the per-row lookup below matches
    // regardless of case / whitespace / display-name wrapping differences.
    const key = normalizeMailbox(s.source_mailbox);
    if (key != null) dryRunByMailbox[key] = s.dry_run !== false;
  }

  const out: ReviewPageData = {
    senderLabels: {},
    subjectLabels: {},
    timestamps: {},
    bodyByRow: {},
    conversationByRow: {},
    messageCountByRow: {},
    mailboxLabels: {},
    dryRunByRow: {},
  };

  for (const row of rows) {
    const labelId = row.email_label_id;
    if (!row.email_id) continue; // null email_id → no map entries (no crash)
    const e = emailById.get(row.email_id);
    if (!e) continue;

    const sender = e.sender_name ?? e.sender_email;
    if (sender != null) out.senderLabels[labelId] = sender;
    if (e.subject != null) out.subjectLabels[labelId] = e.subject;
    if (e.received_at != null) out.timestamps[labelId] = e.received_at;

    out.bodyByRow[labelId] = e.body_text ?? e.body_html ?? null;
    out.conversationByRow[labelId] = e.conversation_id ?? null;
    // Plan 03 (live UAT 2026-05-28): message count = number of emails sharing
    // this row's conversation_id. Null when there is no conversation_id; the
    // thread gate (message_count > 1) then stays hidden, and a real multi-
    // message thread (count ≥ 2) now correctly exposes "View full thread".
    out.messageCountByRow[labelId] =
      e.conversation_id != null
        ? countByConversation.get(e.conversation_id) ?? null
        : null;

    // Mailbox label: email_id → mailbox_id → label.
    const mailboxId = mailboxIdMap.get(row.email_id);
    if (mailboxId != null) {
      const lbl = mailboxLabelMap[mailboxId];
      if (lbl) out.mailboxLabels[labelId] = lbl;
    }

    // dry_run: default true when the recipient mailbox is unknown (A3) — an
    // unresolved row is NOT live. The `?? true` falls through both an unknown
    // recipient and a recipient absent from labeling_settings.
    // Normalize the recipient identically to the source_mailbox key (WR-03)
    // so the address-string equality join cannot silently fail on a casing /
    // whitespace / `Name <addr>` mismatch and mislabel a live row as dry_run.
    const recipient = normalizeMailbox(e.mailbox);
    const resolved = recipient != null ? dryRunByMailbox[recipient] : undefined;
    out.dryRunByRow[labelId] = resolved ?? true;
  }

  return out;
}
