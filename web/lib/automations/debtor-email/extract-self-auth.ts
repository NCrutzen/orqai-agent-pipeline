/**
 * Phase 91 (RESL-07) — Extract self-auth customer-id candidates from email
 * subject + body for the deterministic AUTO tier.
 *
 * "Self-auth" = identifiers the sender stamps that authenticate WHO they are as
 * OUR customer. Three Moyne Roberts shapes — and ONLY these labelled contexts
 * (Phase 91 tightening): the original "any standalone 6-7 digit token" net
 * grabbed werkorder / opdrachtnummer / case ids that are NOT customer numbers,
 * flooding the AUTO tier with non-customer candidates that either return zero
 * substrate matches or (when ≥2 surfaced) fail-closed to SUGGEST — suppressing
 * real self-auth recall. We now extract ONLY from the labelled shapes:
 *   - aanmaning:  `{klantnummer} - {name}`   (e.g. `593290 - ACME Bouw BV`)
 *   - body label: `Klantnummer: {id}`        (e.g. `Klantnummer: 471214`)
 *   - werkbon:    `op locatie {site}`        (e.g. `op locatie 100234`)
 *
 * Self-auth klantnummers are UNPREFIXED 6-7 digit numbers (NOT the invoice
 * prefix family 17/25/30/32/33). value_norm is the RAW digit string — NO
 * leading-zero strip, NO reformat — so it matches
 * resolver_index.identifier_value_norm = CAST(id_org AS nvarchar) downstream.
 *
 * Pure function: no I/O, no DB, no step.run → replay-safe by construction.
 *
 * D-11 guards (deliberately ABSENT in P0's identifier-match.ts:11-13; added here
 * because this extractor feeds the >=99%-precision AUTO tier):
 *   1. labelled-context only — a bare 6-7 digit token is NEVER a candidate
 *      unless it sits in one of the three self-auth shapes above.
 *   2. R4-before-R1 — invoice-pattern tokens are removed from the id set
 *      (a token that is an invoice number is never also a customer id).
 *   3. `Ons klantnummer:` spans are stripped before matching (their id for us
 *      is NOT our customer id).
 *   4. ALL distinct ids are surfaced — the extractor never collapses to one, so
 *      the engine step (Wave 2) can fail closed to SUGGEST on >=2 distinct.
 */
import { extractInvoiceCandidates } from "./extract-invoices";

/** `{klantnummer} - {name}` — 6-7 digit id followed by ` - ` then a name word. */
const AANMANING_ID_PATTERN = /(?<!\d)(\d{6,7})\s*-\s+(?=\p{L})/gu;
/** `Klantnummer: {id}` / `klantnummer {id}` — labelled customer number (6-7). */
const KLANTNUMMER_ID_PATTERN = /klantnummer\s*:?\s*(\d{6,7})(?!\d)/gi;
/** `op locatie {site}` — werkbon site stamp (substrate match filters length). */
const WERKBON_SITE_PATTERN = /op\s+locatie\s+(\d{4,8})(?!\d)/gi;

/** `Ons klantnummer: 998877` — their id for us; excluded before matching. */
const ONS_KLANTNUMMER_PATTERN = /ons\s+klantnummer\s*:?\s*\d{6,7}/gi;

export interface SelfAuthExtract {
  candidates: string[]; // deduped, subject-first order preserved
  fromSubject: string[]; // higher-confidence signal
  fromBody: string[];
}

export function extractSelfAuthCandidates(
  subject: string | null | undefined,
  body: string | null | undefined,
): SelfAuthExtract {
  // R4 before R1: any token that is an invoice number must NOT also be treated
  // as a customer id. Compute the invoice set first and exclude it.
  const invoices = extractInvoiceCandidates(subject, body);
  const invoiceSet = new Set(invoices.candidates);

  const fromSubject = matchContexts(subject ?? "", invoiceSet);
  const fromBody = matchContexts(body ?? "", invoiceSet);

  // Dedupe, subject-first order preserved.
  const candidates = Array.from(new Set([...fromSubject, ...fromBody]));
  return { candidates, fromSubject, fromBody };
}

function matchContexts(text: string, invoiceSet: Set<string>): string[] {
  // Strip `Ons klantnummer: <id>` spans first so the id inside them can never
  // be matched (their id for us != our customer id). Replace with spaces to
  // preserve surrounding token boundaries.
  const scrubbed = text.replace(ONS_KLANTNUMMER_PATTERN, (m) => " ".repeat(m.length));

  const out: string[] = [];
  const push = (id: string) => {
    if (invoiceSet.has(id)) return; // R4 before R1
    if (!out.includes(id)) out.push(id);
  };
  // Labelled contexts only — aanmaning, then Klantnummer label, then werkbon.
  for (const m of scrubbed.matchAll(AANMANING_ID_PATTERN)) push(m[1]);
  for (const m of scrubbed.matchAll(KLANTNUMMER_ID_PATTERN)) push(m[1]);
  for (const m of scrubbed.matchAll(WERKBON_SITE_PATTERN)) push(m[1]);
  return out;
}
