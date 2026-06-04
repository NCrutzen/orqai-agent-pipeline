// Phase 90 RESL-16 item 3 — per-source body selection for the Stage 2 resolver.
//
// The live resolver reads `body_text` only, missing quoted-thread identifiers on
// the `zapier-debtor-ingest` source (99.9% populated `body_full_text`). But a
// BLANKET COALESCE(body_full_text, body_text) craters the outlook path
// (outlook: 9.9% body_full_text / 99.8% body_text). So we branch on ingest source:
//   - source = 'zapier-debtor-ingest' -> prefer body_full_text (fall back to body_text)
//   - source = 'outlook' / 'sugarcrm' / anything else -> body_text
//   - empty string ('') is a fall-back trigger, NOT a value.
//
// This is a PURE helper (no I/O, deterministic) so it is replay-safe inside the
// Inngest worker's existing step.run — no nested step.run needed.
//
// 90-RESEARCH §RESL-16 item 3; 90-PATTERNS § stage-2 body fix.

/**
 * The ingest source for which the full quoted thread lands in body_full_text.
 * Outlook + SugarCRM populate body_text and leave body_full_text mostly empty,
 * so a full-text preference there would silently drop the resolver input.
 */
export const FULL_TEXT_SOURCE = "zapier-debtor-ingest" as const;

export interface BodySourceInput {
  source: string | null;
  body_full_text: string | null;
  body_text: string | null;
}

/**
 * Per-source resolver body selection (RESL-16 item 3). Object-arg form — this is
 * the canonical export the Plan-01 RED test (`body-source-selection.test.ts`)
 * gates GREEN against.
 *
 * Returns the body string the resolver should parse for identifiers. Empty
 * full-text is treated as absent (fall back to body_text). Never returns null.
 */
export function selectResolverBody({
  source,
  body_full_text,
  body_text,
}: BodySourceInput): string {
  const full = (body_full_text ?? "").trim();
  if (source === FULL_TEXT_SOURCE && full.length > 0) {
    return body_full_text as string;
  }
  return body_text ?? "";
}

/**
 * Positional convenience alias used at the worker wiring call-site
 * (stage-2-customer-resolver.ts). Identical selection logic to
 * `selectResolverBody`; kept as a thin wrapper so the worker reads
 * `selectBodyText(source, bodyFullText, bodyText)` per the 90-03 plan key_link.
 */
export function selectBodyText(
  source: string | null,
  bodyFullText: string | null,
  bodyText: string | null,
): string {
  return selectResolverBody({
    source,
    body_full_text: bodyFullText,
    body_text: bodyText,
  });
}
