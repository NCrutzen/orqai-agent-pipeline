/**
 * Phase 111 Plan 04 Task 2 (D-09) — own_outbound_invoice_loopback
 * false-archive-rate measurement for the sales-email swarm.
 *
 * D-09: `own_outbound_invoice_loopback` is the ONE inherited AP rule that is
 * NOT taken on inherited trust (the other 7 stay as-is — D-08). It mis-archived
 * ~40% on the debtor swarm and is disabled there. For sales we decide
 * enable/disable PURELY from the measured false-archive rate on the retro
 * corpus — there is NO preset default in this function.
 *
 * The measurement mirrors the live loopback worker: the rule only applies to
 * INBOUND mail (the worker checks `effectiveDirection === 'inbound'`, defaulting
 * missing→inbound). So the denominator here is the set of loopback-predicted,
 * would-archive, normalized-INBOUND rows; outbound/sent mail is excluded
 * (Pitfall 4). Among those, the false-archive rate is the share flagged
 * `false_archive_suspect` (a real inbound mail the loopback verdict would have
 * archived).
 *
 * The recommendation is derived from the measured rate against
 * LOOPBACK_FALSE_ARCHIVE_MAX (a documented threshold mirroring the debtor
 * disable precedent), NOT a hardcoded enable/disable. With no measured evidence
 * (n=0) we fail CLOSED to 'disable' — we never auto-enable a rule that
 * mis-archived ~40% elsewhere without data to justify it.
 *
 * Pure (no Date.now / no random) — safe under Inngest replay and deterministic
 * for the audit trail.
 *
 * NOTE: this delivers the MEASUREMENT + RECOMMENDATION only. The actual sales
 * loopback enable/disable registry change (if any) is a separate follow-up
 * migration informed by the live retro-run output — this module does not flip
 * anything.
 */

export const LOOPBACK_RULE_KEY = "own_outbound_invoice_loopback";

/**
 * Documented threshold: a loopback false-archive rate STRICTLY ABOVE this
 * fraction recommends 'disable'. Chosen well below the debtor ~40% over-fire
 * (0.40) so sales never inherits a comparably destructive rate; a rate at or
 * under the threshold is acceptable enough to 'enable'. This is the audit
 * datum's decision boundary — change it deliberately, with rationale.
 */
export const LOOPBACK_FALSE_ARCHIVE_MAX = 0.1;

export type NormalizedDirection = "inbound" | "outbound";

export type LoopbackVerdict = {
  predicted_category_key: string;
  normalized_direction: NormalizedDirection;
  /** True when the predicted noise key's live action is categorize_archive. */
  would_archive: boolean | null;
  /** True when this is a normalized-inbound mail the verdict would archive. */
  false_archive_suspect: boolean | null;
};

export type LoopbackRecommendation = "enable" | "disable";

export type LoopbackEvaluation = {
  /** Denominator: loopback-predicted, would-archive, normalized-inbound rows. */
  n: number;
  /** Among `n`, the share flagged false_archive_suspect. */
  falseArchiveRate: number;
  /** Data-driven recommendation vs LOOPBACK_FALSE_ARCHIVE_MAX (no preset). */
  recommendation: LoopbackRecommendation;
};

/**
 * Measure own_outbound_invoice_loopback's false-archive rate over
 * normalized-inbound mail and recommend enable/disable from the measured rate.
 */
export function evaluateLoopback(
  verdicts: ReadonlyArray<LoopbackVerdict>,
): LoopbackEvaluation {
  // Denominator: loopback rule, inbound only, would-archive only (the rows the
  // rule would actually act on). Outbound is excluded (Pitfall 4).
  const inDenom = verdicts.filter(
    (v) =>
      v.predicted_category_key === LOOPBACK_RULE_KEY &&
      v.normalized_direction === "inbound" &&
      v.would_archive === true,
  );

  const n = inDenom.length;
  const falseArchives = inDenom.filter(
    (v) => v.false_archive_suspect === true,
  ).length;

  const falseArchiveRate =
    n === 0 ? 0 : Number((falseArchives / n).toFixed(4));

  // Fail-closed: no measured evidence → 'disable' (never auto-enable a ~40%
  // debtor-mis-archiver without data). Otherwise, enable only when the measured
  // rate is at/under the documented threshold.
  const recommendation: LoopbackRecommendation =
    n === 0 || falseArchiveRate > LOOPBACK_FALSE_ARCHIVE_MAX
      ? "disable"
      : "enable";

  return { n, falseArchiveRate, recommendation };
}
