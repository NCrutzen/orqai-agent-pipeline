/**
 * Phase 91 (RESL-08) — Extract number back-search candidates from email
 * subject + body for the deterministic AUTO tier.
 *
 * Number back-search seeds (D-06): invoice_no (17/25/30/32/33-prefixed 8-digit),
 * order_no / quote_no / job_no (bare 4-8 digit numbers + branded references like
 * "SB017092"), po_no (alphanumeric purchase-order references), previous_customer_id
 * (6-7 digit legacy klantnummer). The substrate read (lookupResolveCandidates) is
 * KIND-AGNOSTIC — it matches any extracted token against any seeded
 * (kind, value_norm) row. value_norm is the RAW token (no leading-zero strip) so it
 * matches resolver_index.identifier_value_norm = CAST(id_org AS nvarchar).
 *
 * CR-02 (Phase 91 review) — PRECISION HARDENING. The ≥99%-precision AUTO tier's
 * ONLY defence against a wrong-but-confident resolve is candidate uniqueness, and
 * a short bare token (a 4-digit year `2026`, an amount, a postcode, an IBAN tail)
 * that happens to be seeded as a unique po_no/order_no/quote_no for ONE customer
 * would AUTO-resolve to that customer even when the email merely cited it as a
 * date/amount with no relation to them. So this extractor no longer casts a free
 * wide net for the loose kinds. Three tiers of trust:
 *
 *   1. INVOICE prefix family (17/25/30/32/33 + 6 digits) — emitted UNCONDITIONALLY.
 *      The prefix family is self-anchoring; collision with dates/amounts is
 *      effectively impossible at 8 digits with a fixed 2-digit prefix.
 *   2. BRANDED references ("SB017092", "UG2607942") — emitted UNCONDITIONALLY
 *      (verbatim + prefix-stripped numeric). The 2-alpha brand prefix is itself an
 *      anchor; bare prose never produces this shape.
 *   3. LOOSE tokens (bare numbers, alphanumeric PO refs) — emitted ONLY when a
 *      purchase-order / order / quote / job CONTEXT ANCHOR sits nearby in the same
 *      window (mirrors how extract-self-auth.ts anchors on `Klantnummer:`). A bare
 *      number with no order cue is dropped — it cannot AUTO-resolve. The bare
 *      floor is also raised to 5 digits so 4-digit years/amounts never qualify even
 *      when anchored.
 *
 * Pure function: no I/O, no DB, no step.run → replay-safe by construction.
 */
import { extractInvoiceCandidates } from "./extract-invoices";

// Branded reference: 2 alpha brand prefix + digit run, e.g. "SB017092",
// "UG2607942". Case-insensitive (WR-02): lowercase/mixed-case refs must match too.
// Captures the numeric tail for the prefix-stripped form.
const BRANDED_REF_PATTERN = /\b([A-Za-z]{2})(\d{4,9})\b/g;

// Context-anchored LOOSE token. We require a purchase-order / order / quote / job
// CUE within a short window BEFORE a candidate token, then accept the token that
// follows the cue. Cues (NL + EN), word-boundary anchored:
//   po, p.o., purchase order, your ref, our ref, ref(erence/erentie),
//   inkoopordernummer, bestelnummer/-bon, ordernummer/order, offerte(nummer)/quote,
//   werkbon/job(nr).
// The cue may be followed by a separator (":", "-", "nr", "no", "#", whitespace)
// then the token. The token itself is an identifier-shaped run: starts alnum, then
// alnum / - / ; contains at least one DIGIT; bare-numeric tokens must be >=5 digits
// (CR-02 floor — 4-digit years/amounts excluded). Length >=4 overall.
const ANCHORED_LOOSE_PATTERN = new RegExp(
  // ---- the cue ----
  "\\b(?:" +
    "p\\.?\\s?o\\.?|purchase\\s+order|inkoop(?:order)?(?:nummer|nr)?|" +
    "bestel(?:order)?(?:nummer|nr|bon)?|order(?:nummer|nr)?|" +
    "offerte(?:nummer|nr)?|quote(?:\\s+no)?|" +
    "werkbon|job(?:nummer|nr)?|" +
    "(?:your|our|uw|onze)\\s+ref(?:erence|erentie)?|ref(?:erence|erentie)?|kenmerk" +
  ")" +
  // ---- separator between cue and token ----
  "\\s*(?:nr\\.?|no\\.?|#|:|-)?\\s*" +
  // ---- the token (captured) ----
  "([A-Za-z0-9][A-Za-z0-9/-]{3,})\\b",
  "gi",
);

export interface NumberExtract {
  /** Deduped union of all candidate tokens, subject-first order preserved. */
  candidates: string[];
}

/** A purely-numeric token qualifies only at >=5 digits (CR-02 bare-number floor). */
function loosePass(tok: string): boolean {
  if (!/\d/.test(tok)) return false; // must carry a digit
  if (/^\d+$/.test(tok)) return tok.length >= 5; // bare-numeric floor
  return true; // alphanumeric (carries a letter) — the PO shape, kept
}

export function extractNumberCandidates(
  subject: string | null | undefined,
  body: string | null | undefined,
): NumberExtract {
  const subj = subject ?? "";
  const bodyText = body ?? "";

  const out: string[] = [];
  const seen = new Set<string>();
  const push = (tok: string) => {
    if (!tok || seen.has(tok)) return;
    seen.add(tok);
    out.push(tok);
  };

  // Tier 1 — invoice numbers (the proven prefix family) — unconditional, first.
  for (const c of extractInvoiceCandidates(subject, body).candidates) push(c);

  for (const text of [subj, bodyText]) {
    // Tier 2 — branded references: emit verbatim + prefix-stripped numeric.
    for (const m of text.matchAll(BRANDED_REF_PATTERN)) {
      push(m[0]); // "SB017092"
      push(m[2]); // "017092"
    }
    // Tier 3 — context-anchored loose tokens (PO / order / quote / job cue nearby).
    for (const m of text.matchAll(ANCHORED_LOOSE_PATTERN)) {
      const tok = m[1];
      if (loosePass(tok)) push(tok);
    }
  }

  return { candidates: out };
}
