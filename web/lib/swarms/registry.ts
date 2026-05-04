// Phase 56.7-01 (D-06). Swarm registry loader/cache: 60s in-memory TTL keyed
// by swarm_type. On Supabase error, returns last-known-good cached value;
// otherwise null (loadSwarm) / [] (loadSwarmCategories).
//
// Mirrors the shape of web/lib/classifier/cache.ts. Cron, verdict-worker,
// and SSR routes all read through this layer so the registry stays a
// read-heavy, mutation-rare contract (D-06).

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SwarmRow,
  SwarmCategoryRow,
  SwarmIntentRow,
  CanonicalContextShape,
} from "./types";
import {
  loadAllBrandRegisters,
  loadBrandRegister,
  __resetBrandRegisterCacheForTests,
  type BrandRegister,
} from "./brand-register";

const SWARM_CACHE = new Map<string, { value: SwarmRow | null; expires: number }>();
const CATEGORIES_CACHE = new Map<string, { value: SwarmCategoryRow[]; expires: number }>();
// Phase 68 — per-swarm cache for swarm_intents rows. Same TTL contract as
// the other caches (D-06 read-heavy, mutation-rare).
const INTENTS_CACHE = new Map<string, { value: SwarmIntentRow[]; expires: number }>();
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

// Phase 68 — load swarm_intents for a swarm_type. Mirrors the TTL +
// last-known-good pattern used by loadSwarmCategories.
export async function loadSwarmIntents(
  admin: SupabaseClient,
  swarmType: string,
): Promise<SwarmIntentRow[]> {
  const now = Date.now();
  const hit = INTENTS_CACHE.get(swarmType);
  if (hit && hit.expires > now) return hit.value;

  const { data, error } = await admin
    .from("swarm_intents")
    .select("*")
    .eq("swarm_type", swarmType);

  if (error) {
    if (hit) return hit.value;
    return [];
  }
  const value = (data as SwarmIntentRow[] | null) ?? [];
  INTENTS_CACHE.set(swarmType, { value, expires: now + TTL_MS });
  return value;
}

// Phase 68 — resolve an intent_key to its handler_event for a swarm_type.
// Returns null when the intent is not registered.
export async function loadHandlerEvent(
  admin: SupabaseClient,
  swarmType: string,
  intentKey: string,
): Promise<string | null> {
  const intents = await loadSwarmIntents(admin, swarmType);
  return intents.find((i) => i.intent_key === intentKey)?.handler_event ?? null;
}

// Phase 68 — read the canonical_context_shape jsonb for a swarm_type. Routes
// through loadSwarm so the SWARM_CACHE TTL governs both reads.
export async function loadCanonicalContextShape(
  admin: SupabaseClient,
  swarmType: string,
): Promise<CanonicalContextShape | null> {
  const swarm = await loadSwarm(admin, swarmType);
  return swarm?.canonical_context_shape ?? null;
}

// Phase 69 / CANO-02 — entity_brand registry helpers (re-exported from
// ./brand-register so callers have one canonical import path via swarms/registry).
export const loadEntityBrand = loadAllBrandRegisters;
export const loadEntityBrandRegister = loadBrandRegister;
export type { BrandRegister };

// Test helper. Production callers MUST NOT use this.
export function __resetCacheForTests(): void {
  SWARM_CACHE.clear();
  CATEGORIES_CACHE.clear();
  INTENTS_CACHE.clear();
  __resetBrandRegisterCacheForTests();
}
