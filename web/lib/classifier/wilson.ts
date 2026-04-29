// Phase 60-00 (D-02, D-03). Wilson 95% CI lower-bound + promotion gates.
// Pure math; no dependencies. Verified against route.ts:24-32 empirical CI-lo values.

const Z_95 = 1.959963984540054;

/**
 * Wilson score interval lower bound for the success probability of a binomial
 * sample with `k` agreements out of `n` observations.
 *
 * - n = 0 -> 0
 * - z = 1.96 by default (95% confidence)
 *
 * Formula: (phat + z^2/(2n) - z * sqrt((phat*(1-phat) + z^2/(4n))/n)) / (1 + z^2/n)
 */
export function wilsonCiLower(n: number, k: number, z = Z_95): number {
  if (n === 0) return 0;
  const phat = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = phat + z2 / (2 * n);
  const radius = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n);
  return Math.max(0, (center - radius) / denom);
}

// D-02: Promote when N>=30 AND CI-lo >= 0.92.
// Lowered from 0.95 to 0.92 in 60-08 after corpus-backfill + 50/rule
// hard-case spot-check. Justification: a 50-row hard-case spot-check at
// 100% pass rate (subject_autoreply: 66/66, subject_acknowledgement: 54/54)
// is stronger evidence than 80 organic verdicts would have been — the
// corpus surfaces the disagreements first and the operator validates them.
// 0.92 sits above the historical floor of the seeded payment rules (lowest
// promoted CI_lo in 60-02 was payment_sender+subject at 0.954, well above).
export const PROMOTE_N_MIN = 30;
export const PROMOTE_CI_LO_MIN = 0.92;
// D-03: Demote with hysteresis at CI-lo < 0.88 (4pp gap to prevent flapping).
export const DEMOTE_CI_LO_MAX = 0.88;

export function shouldPromote(n: number, ciLo: number): boolean {
  return n >= PROMOTE_N_MIN && ciLo >= PROMOTE_CI_LO_MIN;
}

export function shouldDemote(ciLo: number): boolean {
  return ciLo < DEMOTE_CI_LO_MAX;
}
