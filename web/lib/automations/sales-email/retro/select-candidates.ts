/**
 * Phase 111 Plan 03 Task 2 — sales-email Stage-1 retro candidate selector.
 *
 * Reads email_pipeline.emails across BOTH Smeba corpora and returns typed
 * retro candidates with a NORMALIZED direction:
 *
 *   - Outlook (live):    source='outlook' AND mailbox='verkoop@smeba.nl' (853)
 *   - SugarCRM (historic): source='sugarcrm' ALONE — its `mailbox` column holds
 *     SugarCRM bean labels ("Smeba Brandbeveiliging BV"), NOT email addresses,
 *     so filtering it by mailbox returns zero rows (Pitfall 5). Provenance is
 *     irrelevant for noise calibration — it is valid Smeba mail (D-01).
 *
 * Direction-value divergence (Pitfall 4): outlook rows use 'sent'/'incoming';
 * sugarcrm rows use 'inbound'/'outbound'. `normalizeDirection` collapses both
 * vocabularies so the D-09 loopback test runs only against normalized-inbound
 * mail.
 *
 * Hard cap with a fail-loud throw — narrow the window or raise the cap
 * explicitly rather than silently truncating (T-111-11 DoS guard).
 *
 * Pure (no clock reads, no randomness) — safe under Inngest replay (T-111-09).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const STAGE_1_RETRO_HARD_CAP = 40000;
export const SALES_OUTLOOK_MAILBOX = "verkoop@smeba.nl";

export type NormalizedDirection = "inbound" | "outbound";

export type RetroCandidate = {
  email_id: string;
  source: string;
  mailbox: string | null;
  normalized_direction: NormalizedDirection;
  subject: string | null;
  body: string | null;
  sender_email: string | null;
  received_at: string | null;
};

export type SelectCandidatesArgs = {
  swarm_type: string;
  since: string;
  until: string;
  cap?: number;
};

type EmailRow = {
  id: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  sender_email: string | null;
  source: string;
  mailbox: string | null;
  direction: string | null;
  received_at: string | null;
};

/**
 * Pitfall 4 — collapse the two source vocabularies into a single axis.
 * {inbound, incoming} → 'inbound'; {sent, outbound} → 'outbound'.
 * Unknown/missing values default to 'inbound' (mirrors the live loopback
 * worker's `effectiveDirection === 'inbound'` default).
 */
export function normalizeDirection(
  direction: string | null | undefined,
): NormalizedDirection {
  const d = (direction ?? "").trim().toLowerCase();
  if (d === "sent" || d === "outbound") return "outbound";
  // 'inbound', 'incoming', '', and anything else → inbound (fail-safe default).
  return "inbound";
}

const EMAIL_COLUMNS =
  "id, subject, body_text, body_html, sender_email, source, mailbox, direction, received_at";

function toCandidate(r: EmailRow): RetroCandidate {
  return {
    email_id: r.id,
    source: r.source,
    mailbox: r.mailbox,
    normalized_direction: normalizeDirection(r.direction),
    subject: r.subject,
    body: r.body_text ?? r.body_html ?? null,
    sender_email: r.sender_email,
    received_at: r.received_at,
  };
}

export async function selectCandidates(
  admin: Pick<SupabaseClient, "schema">,
  args: SelectCandidatesArgs,
): Promise<RetroCandidate[]> {
  const cap = args.cap ?? STAGE_1_RETRO_HARD_CAP;
  // +1 sentinel split across the two reads is awkward; instead read each
  // corpus up to cap+1 and enforce the cap on the merged total.
  const readCap = cap + 1;

  // Corpus A — live Outlook, pinned to the sales mailbox.
  const { data: outlookData, error: outlookErr } = (await admin
    .schema("email_pipeline")
    .from("emails")
    .select(EMAIL_COLUMNS)
    .eq("source", "outlook")
    .eq("mailbox", SALES_OUTLOOK_MAILBOX)
    .gte("received_at", args.since)
    .lt("received_at", args.until)
    .order("received_at", { ascending: false })
    .limit(readCap)) as { data: EmailRow[] | null; error: unknown };
  if (outlookErr) throw outlookErr as Error;

  // Corpus B — historic SugarCRM, source ONLY (Pitfall 5: no mailbox filter).
  const { data: sugarData, error: sugarErr } = (await admin
    .schema("email_pipeline")
    .from("emails")
    .select(EMAIL_COLUMNS)
    .eq("source", "sugarcrm")
    .gte("received_at", args.since)
    .lt("received_at", args.until)
    .order("received_at", { ascending: false })
    .limit(readCap)) as { data: EmailRow[] | null; error: unknown };
  if (sugarErr) throw sugarErr as Error;

  const merged = [...(outlookData ?? []), ...(sugarData ?? [])];

  if (merged.length > cap) {
    throw new Error(
      `Phase 111 D-01 Stage-1 retro cap exceeded: ${merged.length} rows for ${args.swarm_type} in [${args.since}, ${args.until}) (outlook=${(outlookData ?? []).length}, sugarcrm=${(sugarData ?? []).length}). Narrow the window or raise cap explicitly.`,
    );
  }

  return merged.map(toCandidate);
}
