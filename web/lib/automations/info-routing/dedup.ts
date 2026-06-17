// Phase 131 Plan 04 Task 1 (ROUTE-05) — the two-layer duplicate-delivery guard.
//
// The only net-new logic in the phase. It answers ONE question: has the
// resolved target mailbox already received this email? If so the verdict's
// dedup field flips to `already_addressed` so Phase 132 never double-forwards.
//
// Layer (a) — ALWAYS (pure, IO-free):
//   The resolved target mailbox appears in the email's To/CC. The recipient
//   addresses are read from `raw_json.toRecipients`/`ccRecipients` — the flat
//   `recipients` column is NULL for zapier-info-routing-ingest rows (Pitfall 2)
//   — via `extractRecipientAddresses`, tolerant of all 3 live ingest shapes.
//
// Layer (b) — OPPORTUNISTIC (a single mockable DB read):
//   The same normalized `internet_message_id` (or `conversation_id`) is already
//   present where the mailbox ≈ the target mailbox, but ONLY for an INGESTED
//   target mailbox (order@ is ingested). The match is on the target mailbox's
//   ADDRESS, not the raw `mailbox` display-name string (info@ rows' `mailbox` is
//   a sugarcrm display name — Pitfall 3). A non-ingested target → graceful skip
//   + coverage-gap log, never throw, never block — layer (a) still decides (D-04).
//
// normalizeMessageId is applied to BOTH sides before the layer-(b) match: the
// source `raw_json.internetMessageId` carries `<…>` and the target column
// carries `<…>` in mixed case.

import type { RoutingDedup, RoutingDedupLayer } from "./verdict";

// ---- Layer (a): tolerant recipient extraction -----------------------------
// Copied verbatim from 131-RESEARCH §Code Examples. Handles all three live
// shapes: raw_json Graph ({emailAddress.address}), outlook recipients {to,cc}
// ({address}), sugarcrm recipients [{email}]. Lowercases + dedupes.
export function extractRecipientAddresses(emailRow: {
  recipients: unknown;
  raw_json: unknown;
}): string[] {
  const out: string[] = [];
  const raw = (emailRow.raw_json ?? {}) as {
    toRecipients?: Array<{ emailAddress?: { address?: string } }>;
    ccRecipients?: Array<{ emailAddress?: { address?: string } }>;
  };
  for (const r of [...(raw.toRecipients ?? []), ...(raw.ccRecipients ?? [])]) {
    const a = r?.emailAddress?.address;
    if (a) out.push(a.toLowerCase());
  }
  const rc = emailRow.recipients as
    | { to?: Array<{ address?: string }>; cc?: Array<{ address?: string }> }
    | Array<{ email?: string }>
    | null
    | undefined;
  if (rc && !Array.isArray(rc)) {
    // outlook {to,cc}
    for (const r of [...(rc.to ?? []), ...(rc.cc ?? [])]) {
      if (r?.address) out.push(String(r.address).toLowerCase());
    }
  } else if (Array.isArray(rc)) {
    // sugarcrm [{email}]
    for (const r of rc) {
      if (r?.email) out.push(String(r.email).toLowerCase());
    }
  }
  return [...new Set(out)];
}

// ---- Message-id normalization ---------------------------------------------
// strip leading/trailing <>, trim, lowercase — applied to BOTH sides before a
// layer-(b) match (source carries `<ID@host>`; target column `<id@HOST>`).
export function normalizeMessageId(s: string): string {
  // trim FIRST so outer whitespace doesn't defeat the ^<...>$ bracket strip,
  // then strip brackets, then lowercase (RESEARCH normalizer, whitespace-hardened).
  return s.trim().replace(/^<|>$/g, "").trim().toLowerCase();
}

// ---- Minimal structural Supabase admin surface ----------------------------
// Only what layer (b) needs: from(table).select(cols).eq(col,val) → rows. Kept
// structural so the layer-(b) DB read is mockable without the full client type.
interface DedupQueryResult {
  data: Array<{
    internet_message_id?: string | null;
    conversation_id?: string | null;
  }> | null;
  error: { message: string } | null;
}
interface DedupSelectBuilder extends PromiseLike<DedupQueryResult> {
  select: (cols: string) => DedupSelectBuilder;
  eq: (col: string, val: unknown) => DedupSelectBuilder;
  ilike: (col: string, val: unknown) => DedupSelectBuilder;
  limit: (n: number) => PromiseLike<DedupQueryResult>;
}
export interface DedupAdmin {
  from: (table: string) => DedupSelectBuilder;
}

export interface CheckDuplicateDeliveryArgs {
  emailRow: { recipients: unknown; raw_json: unknown };
  targetMailbox: string | null;
  admin: DedupAdmin;
  // The small known set of ingested target mailboxes (order@smeba.nl /
  // order@fire-control.nl per RESEARCH A7). Layer (b) runs ONLY for a target in
  // this set; everything else is a graceful skip + coverage-gap log.
  ingestedTargetMailboxes: string[];
}

/**
 * The two-layer duplicate-delivery check. Pure layer (a) + opportunistic,
 * mockable layer (b). Never throws on a layer-(b) miss or a non-ingested target.
 */
export async function checkDuplicateDelivery(
  args: CheckDuplicateDeliveryArgs,
): Promise<RoutingDedup> {
  const { emailRow, targetMailbox, admin, ingestedTargetMailboxes } = args;

  // No target → nothing to dedup against (unrouted verdict). Routable.
  if (!targetMailbox) {
    return { status: "routable", matched_layer: null };
  }

  const normalizedTarget = targetMailbox.toLowerCase();

  // ---- Layer (a): target in To/CC (pure) ----------------------------------
  const recipients = extractRecipientAddresses(emailRow);
  if (recipients.includes(normalizedTarget)) {
    return { status: "already_addressed", matched_layer: "to_cc" };
  }

  // ---- Layer (b): cross-mailbox id match (opportunistic) ------------------
  // Only for an ingested target mailbox. Non-ingested → graceful skip + log.
  const ingestedSet = new Set(ingestedTargetMailboxes.map((m) => m.toLowerCase()));
  if (!ingestedSet.has(normalizedTarget)) {
    console.warn(
      `[info-routing dedup] layer-b coverage gap: target mailbox "${targetMailbox}" is not ingested — skipping cross-mailbox dedup (layer (a) decides). Ingest it for full coverage.`,
    );
    return { status: "routable", matched_layer: null };
  }

  // Source identifiers from raw_json (the info-routing ingest shape). Normalize
  // before comparing; an absent id simply can't match (stays empty string).
  const raw = (emailRow.raw_json ?? {}) as {
    internetMessageId?: string | null;
    conversationId?: string | null;
  };
  const srcMessageId = raw.internetMessageId
    ? normalizeMessageId(String(raw.internetMessageId))
    : "";
  const srcConversationId = raw.conversationId
    ? String(raw.conversationId).trim().toLowerCase()
    : "";

  // Nothing to match on → routable (no false positive).
  if (!srcMessageId && !srcConversationId) {
    return { status: "routable", matched_layer: null };
  }

  // Query the target mailbox's ingested rows BY ADDRESS (Pitfall 3: match the
  // clean address, not the display-name `mailbox`). The read is replay-safe
  // because the coordinator wraps this whole call in step.run.
  const { data, error } = await admin
    .from("emails")
    .select("internet_message_id, conversation_id")
    .ilike("mailbox", normalizedTarget)
    .limit(50);

  if (error || !data) {
    // Treat a layer-(b) read error as a coverage gap, never a block (D-04).
    console.warn(
      `[info-routing dedup] layer-b read error for target "${targetMailbox}" — skipping cross-mailbox dedup: ${error?.message ?? "no data"}`,
    );
    return { status: "routable", matched_layer: null };
  }

  let conversationHit = false;
  for (const row of data) {
    if (
      srcMessageId &&
      row.internet_message_id &&
      normalizeMessageId(String(row.internet_message_id)) === srcMessageId
    ) {
      // message-id is the strongest signal — return immediately.
      return { status: "already_addressed", matched_layer: "message_id" };
    }
    if (
      srcConversationId &&
      row.conversation_id &&
      String(row.conversation_id).trim().toLowerCase() === srcConversationId
    ) {
      conversationHit = true;
    }
  }
  if (conversationHit) {
    return { status: "already_addressed", matched_layer: "conversation" };
  }

  return { status: "routable", matched_layer: null };
}

// Re-export the layer type for callers that build on the result.
export type { RoutingDedup, RoutingDedupLayer };
