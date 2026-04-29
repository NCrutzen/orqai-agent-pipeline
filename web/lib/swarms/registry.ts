// Phase 56.7-01 (D-06). Swarm registry loader/cache: 60s in-memory TTL keyed
// by swarm_type. On Supabase error, returns last-known-good cached value;
// otherwise null (loadSwarm) / [] (loadSwarmCategories).
//
// Mirrors the shape of web/lib/classifier/cache.ts. Cron, verdict-worker,
// and SSR routes all read through this layer so the registry stays a
// read-heavy, mutation-rare contract (D-06).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SwarmRow, SwarmCategoryRow } from "./types";

const SWARM_CACHE = new Map<string, { value: SwarmRow | null; expires: number }>();
const CATEGORIES_CACHE = new Map<string, { value: SwarmCategoryRow[]; expires: number }>();
const TTL_MS = 60_000;

export async function loadSwarm(
  admin: SupabaseClient,
  swarmType: string,
): Promise<SwarmRow | null> {
  const now = Date.now();
  const hit = SWARM_CACHE.get(swarmType);
  if (hit && hit.expires > now) return hit.value;

  const { data, error } = await admin
    .from("swarms")
    .select("*")
    .eq("swarm_type", swarmType)
    .eq("enabled", true)
    .maybeSingle();

  if (error) {
    if (hit) return hit.value; // last-known-good on error
    return null;
  }
  const value = (data as SwarmRow | null) ?? null;
  SWARM_CACHE.set(swarmType, { value, expires: now + TTL_MS });
  return value;
}

export async function loadSwarmCategories(
  admin: SupabaseClient,
  swarmType: string,
): Promise<SwarmCategoryRow[]> {
  const now = Date.now();
  const hit = CATEGORIES_CACHE.get(swarmType);
  if (hit && hit.expires > now) return hit.value;

  const { data, error } = await admin
    .from("swarm_categories")
    .select("*")
    .eq("swarm_type", swarmType)
    .eq("enabled", true)
    .order("display_order", { ascending: true });

  if (error) {
    if (hit) return hit.value;
    return [];
  }
  const value = (data as SwarmCategoryRow[] | null) ?? [];
  CATEGORIES_CACHE.set(swarmType, { value, expires: now + TTL_MS });
  return value;
}

// Test helper. Production callers MUST NOT use this.
export function __resetCacheForTests(): void {
  SWARM_CACHE.clear();
  CATEGORIES_CACHE.clear();
}
