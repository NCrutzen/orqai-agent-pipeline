// Plan 01-02 — per-user rate limit for the support-tickets ingest route.
//
// Phase 1 uses a simple fixed-window counter over `public.support_tickets`
// rows: count rows where `submitter_id = $1 AND submitted_at > now() - 1h`.
// If count >= limit → deny with retry_after_seconds = 3600.
//
// Tradeoff (documented): fixed window means a submitter who bursts at 59:59
// can immediately burst again at 60:00. A sliding window or token-bucket
// (Redis or Upstash) is a Phase 2+ improvement. We accept the burst because
// Phase 1 ingest is internal-only behind HMAC; the rate limit's purpose is
// accidental-DoS protection, not adversarial throttling (which the HMAC
// already gates).
//
// We reuse `public.support_tickets` instead of introducing a per-user
// rate-limit table because Phase 1 should ship zero new persistence surfaces
// beyond the migration in Plan 01-01.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  retry_after_seconds?: number;
}

export async function checkRateLimit(
  supabase: SupabaseClient,
  submitter_id: string,
  limit_per_hour: number,
): Promise<RateLimitResult> {
  const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("support_tickets")
    .select("id", { count: "exact", head: true })
    .eq("submitter_id", submitter_id)
    .gte("submitted_at", oneHourAgoIso);

  if (error) {
    // Fail-OPEN on count-query errors. Rationale: a DB hiccup should not
    // bring down the ingest endpoint; the HMAC + body-size gates remain
    // the primary line of defense. Worst case = a single extra row admitted
    // past the limit. Surfacing this as a hard fail would convert a
    // transient infra issue into a user-visible 429 storm.
    return { allowed: true, count: 0, remaining: limit_per_hour };
  }

  const safeCount = count ?? 0;
  const remaining = Math.max(0, limit_per_hour - safeCount);
  if (safeCount >= limit_per_hour) {
    return {
      allowed: false,
      count: safeCount,
      remaining: 0,
      retry_after_seconds: 3600,
    };
  }
  return { allowed: true, count: safeCount, remaining };
}
