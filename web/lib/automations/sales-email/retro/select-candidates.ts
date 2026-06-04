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
  // Phase 111 WR-05: read each corpus up to cap+1 (the +1 is a truncation
  // sentinel). If a single corpus comes back with exactly readCap rows we
  // CANNOT distinguish "exactly readCap rows exist" from "more existed and
  // the DB truncated us" — so we fail loud PER CORPUS at length === readCap.
  // Only after both corpora pass the per-corpus truncation check do we
  // cap-check the merged total and dedup by email_id.
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

  const outlookRows = outlookData ?? [];
  const sugarRows = sugarData ?? [];

  // Phase 111 WR-05: per-corpus truncation detection. A corpus returning
  // exactly readCap rows is indistinguishable from a truncated read, so we
  // fail loud and name WHICH corpus truncated — the operator must narrow the
  // window or raise the cap rather than silently classify a partial sample.
  if (outlookRows.length >= readCap) {
    throw new Error(
      `Phase 111 D-01 Stage-1 retro: OUTLOOK corpus truncated at readCap=${readCap} for ${args.swarm_type} in [${args.since}, ${args.until}). Narrow the window or raise cap explicitly.`,
    );
  }
  if (sugarRows.length >= readCap) {
    throw new Error(
      `Phase 111 D-01 Stage-1 retro: SUGARCRM corpus truncated at readCap=${readCap} for ${args.swarm_type} in [${args.since}, ${args.until}). Narrow the window or raise cap explicitly.`,
    );
  }

  // Phase 111 WR-06: SugarCRM single-tenant invariant. email_pipeline.emails
  // is a shared multi-swarm table; corpus B is read on source='sugarcrm'
  // ALONE (no mailbox/entity filter, per Pitfall 5 — mailbox holds bean
  // labels). Today source='sugarcrm' is provably Smeba-only (the only
  // SugarCRM importer is the Smeba historic backfill). Encode that invariant
  // explicitly: any non-'sugarcrm' source leaking into this result set means
  // the query contract was violated — fail loud rather than biasing the sales
  // baseline / cluster-miner discovery surface with foreign-tenant mail.
  // If a second SugarCRM tenant is ever onboarded, replace this guard with a
  // real brand/entity scope on the corpus B query.
  for (const r of sugarRows) {
    if (r.source !== "sugarcrm") {
      throw new Error(
        `Phase 111 D-01 Stage-1 retro: SUGARCRM corpus invariant violated — row ${r.id} has source='${r.source}' (expected 'sugarcrm', assumed single-tenant Smeba). Add an explicit tenant scope before widening this corpus.`,
      );
    }
  }

  const merged = [...outlookRows, ...sugarRows];

  if (merged.length > cap) {
    throw new Error(
      `Phase 111 D-01 Stage-1 retro cap exceeded: ${merged.length} rows for ${args.swarm_type} in [${args.since}, ${args.until}) (outlook=${outlookRows.length}, sugarcrm=${sugarRows.length}). Narrow the window or raise cap explicitly.`,
    );
  }

  // Phase 111 WR-05: dedup by email_id. The same physical email can exist in
  // both corpora (e.g. a SugarCRM-imported copy of an Outlook mail); without
  // dedup it is classified twice and double-counts in the baseline. Also
  // prevents the downstream per-email `classify-${email_id}` Inngest step IDs
  // from colliding (WR-04). First occurrence wins (outlook before sugarcrm).
  const seen = new Set<string>();
  const deduped: EmailRow[] = [];
  for (const r of merged) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    deduped.push(r);
  }

  return deduped.map(toCandidate);
}
