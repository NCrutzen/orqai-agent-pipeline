// Phase 60-00 (D-08, D-28 step 3). Module-level cache for the promoted-rule
// whitelist, keyed by swarm_type. 60s TTL; on Supabase error returns last-known-
// good cached set, or FALLBACK_WHITELIST for the debtor-email swarm.
//
// FALLBACK_WHITELIST mirrors the 6 hardcoded rule_keys at
// web/app/api/automations/debtor-email/ingest/route.ts:39-46. Once Wave 4 of
// D-28 ships, the route reads exclusively from public.classifier_rules; the
// fallback remains as a defensive net during a degraded read.

import type { SupabaseClient } from "@supabase/supabase-js";

interface CacheEntry {
  rules: Set<string>;
  expires: number;
}

const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

export const FALLBACK_WHITELIST = new Set<string>([
  "subject_paid_marker",
  "payment_subject",
  "payment_sender+subject",
  "payment_system_sender+body",
  "payment_sender+hint+body",
  "payment_sender+body",
]);

export async function readWhitelist(
  admin: SupabaseClient,
  swarmType: string,
): Promise<Set<string>> {
  const now = Date.now();
  const hit = CACHE.get(swarmType);
  if (hit && hit.expires > now) return hit.rules;

  const { data, error } = await admin
    .from("classifier_rules")
    .select("rule_key")
    .eq("swarm_type", swarmType)
    .eq("status", "promoted");

  if (error) {
    // D-28 step 3 / RESEARCH Pitfall 1: graceful degradation.
    // Prefer last-known-good cache; otherwise the hardcoded debtor-email seed.
    if (hit) return hit.rules;
    return swarmType === "debtor-email" ? FALLBACK_WHITELIST : new Set<string>();
  }

  const rules = new Set<string>(
    (data ?? []).map((r: { rule_key: string }) => r.rule_key),
  );
  CACHE.set(swarmType, { rules, expires: now + TTL_MS });
  return rules;
}

// Exported for tests only -- DO NOT call from production code.
export function __resetCacheForTests(): void {
  CACHE.clear();
}
