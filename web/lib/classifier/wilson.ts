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

// D-02: Promote when N>=30 AND CI-lo >= 0.95.
export const PROMOTE_N_MIN = 30;
export const PROMOTE_CI_LO_MIN = 0.95;
// D-03: Demote with hysteresis at CI-lo < 0.92 (5pp gap to prevent flapping).
export const DEMOTE_CI_LO_MAX = 0.92;

export function shouldPromote(n: number, ciLo: number): boolean {
  return n >= PROMOTE_N_MIN && ciLo >= PROMOTE_CI_LO_MIN;
}

export function shouldDemote(ciLo: number): boolean {
  return ciLo < DEMOTE_CI_LO_MAX;
}
