// Forward-match Wilson grading — the operator's ground-truth idea (memory
// `forward-match-as-wilson-ground-truth`). Staff at info@ already forward most
// mail to the right department, so the ACTUAL forward destination is ground
// truth for the correct route. We compare the AI's held verdict bucket against
// the bucket the mail was actually forwarded to, accumulate per-bucket
// agree/disagree, and gate the forward-autoflip on a Wilson score lower bound
// (which, unlike a raw match-rate, stays conservative on small samples).
//
// This module is PURE / IO-free so it unit-tests without Supabase or Graph.
// The Graph reader + matcher lives in ./forward-observer.ts; the cron that
// wires them lives in web/lib/inngest/functions/info-routing-forward-observe.ts.

import type { RoutingDestinationLike } from "@/scripts/eval/info-routing-precision-shadow";

// z for a 95% one-sided lower bound. Reused as the default everywhere so the
// gate is stated once.
export const WILSON_Z_95 = 1.96;

// Release gate: a bucket goes live only when its Wilson LOWER bound ≥ this AND
// the sample is at least MIN_OBSERVED_N. 0.85 mirrors the existing
// MATCH_RATE_GATE so the two ground-truth channels agree on "good enough".
export const FORWARD_WILSON_GATE = 0.85;

// Minimum forward observations for a bucket before it can flip. The Wilson
// lower bound already punishes small n, but a hard floor keeps a single lucky
// 1/1 from ever clearing the gate.
export const MIN_OBSERVED_N = 20;

/**
 * Wilson score interval LOWER bound for a binomial proportion.
 * lower = (p̂ + z²/2n − z·√[(p̂(1−p̂) + z²/4n)/n]) / (1 + z²/n)
 * n === 0 → 0 (no evidence = no confidence). Never NaN. Pure.
 */
export function wilsonLowerBound(
  successes: number,
  n: number,
  z: number = WILSON_Z_95,
): number {
  if (n <= 0) return 0;
  const phat = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n);
  const lower = (centre - margin) / denom;
  // Clamp to [0,1] against floating-point spill.
  return lower < 0 ? 0 : lower > 1 ? 1 : lower;
}

/** One observed forward, reduced to the grading essentials. */
export interface ForwardObservation {
  /** The held verdict bucket the AI predicted. */
  predicted_bucket: string;
  /** The bucket the mail was ACTUALLY forwarded to (null = forwarded to a
   *  non-routing address → ungraded, never counted). */
  observed_bucket: string | null;
  /** The mailbox the verdict was produced for — the per-mailbox grouping axis. */
  source_mailbox: string;
}

export interface BucketWilsonGrade {
  bucket: string;
  /** graded observations for this bucket (observed_bucket non-null). */
  n: number;
  /** agreements (predicted === observed). */
  agree: number;
  /** raw agreement rate (agree/n), 0 when n===0. */
  observed_rate: number;
  /** Wilson lower bound of the agreement rate. */
  wilson_lower: number;
  /** true ⟺ n ≥ MIN_OBSERVED_N AND wilson_lower ≥ gate. */
  pass: boolean;
}

/**
 * Grade each PREDICTED bucket by Wilson lower bound over the forward
 * observations. A row with `observed_bucket === null` (forwarded somewhere that
 * is not a routing destination) is ungraded — it never enters the numerator or
 * denominator. Keyed by predicted bucket (the axis we release). Pure.
 */
export function gradeBucketsByWilson(
  observations: ForwardObservation[],
  opts: { gate?: number; z?: number; minN?: number } = {},
): Map<string, BucketWilsonGrade> {
  const gate = opts.gate ?? FORWARD_WILSON_GATE;
  const z = opts.z ?? WILSON_Z_95;
  const minN = opts.minN ?? MIN_OBSERVED_N;

  const byBucket = new Map<string, { n: number; agree: number }>();
  for (const o of observations) {
    if (o.observed_bucket === null) continue; // ungraded
    const e = byBucket.get(o.predicted_bucket) ?? { n: 0, agree: 0 };
    e.n += 1;
    if (o.predicted_bucket === o.observed_bucket) e.agree += 1;
    byBucket.set(o.predicted_bucket, e);
  }

  const out = new Map<string, BucketWilsonGrade>();
  for (const [bucket, { n, agree }] of byBucket) {
    const wilson_lower = wilsonLowerBound(agree, n, z);
    out.set(bucket, {
      bucket,
      n,
      agree,
      observed_rate: n === 0 ? 0 : agree / n,
      wilson_lower,
      pass: n >= minN && wilson_lower >= gate,
    });
  }
  return out;
}

/**
 * Map an actually-forwarded-to mailbox address → its routing bucket, via
 * routing_destinations.target_mailbox. Case-insensitive exact match. Returns
 * null when the address is not a known forward destination (a personal mailbox,
 * an external address, etc.) → that observation is ungraded. Pure.
 */
export function resolveObservedBucket(
  toAddress: string | null | undefined,
  destinations: RoutingDestinationLike[] & { target_mailbox?: string | null }[],
): string | null {
  if (!toAddress) return null;
  const needle = toAddress.trim().toLowerCase();
  if (!needle) return null;
  for (const d of destinations as Array<
    RoutingDestinationLike & { target_mailbox?: string | null }
  >) {
    const t = d.target_mailbox?.trim().toLowerCase();
    if (t && t === needle) return d.destination_key;
  }
  return null;
}
