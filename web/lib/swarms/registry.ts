// Phase 56.7-01 (D-06). Swarm registry loader/cache: 60s in-memory TTL keyed
// by swarm_type. On Supabase error, returns last-known-good cached value;
// otherwise null (loadSwarm) / [] (loadSwarmNoiseCategories).
//
// Mirrors the shape of web/lib/classifier/cache.ts. Cron, verdict-worker,
// and SSR routes all read through this layer so the registry stays a
// read-heavy, mutation-rare contract (D-06).

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SwarmRow,
  SwarmNoiseCategoryRow,
  SwarmIntentRow,
  RoutingDestinationRow,
  CanonicalContextShape,
} from "./types";
import {
  loadAllBrandRegisters,
  loadBrandRegister,
  __resetBrandRegisterCacheForTests,
  type BrandRegister,
} from "./brand-register";

const SWARM_CACHE = new Map<string, { value: SwarmRow | null; expires: number }>();
const CATEGORIES_CACHE = new Map<string, { value: SwarmNoiseCategoryRow[]; expires: number }>();
// Phase 68 — per-swarm cache for swarm_intents rows. Same TTL contract as
// the other caches (D-06 read-heavy, mutation-rare).
const INTENTS_CACHE = new Map<string, { value: SwarmIntentRow[]; expires: number }>();
// Phase 131 — per-swarm cache for routing_destinations rows. Same TTL contract
// as the other caches (D-06 read-heavy, mutation-rare).
const ROUTING_DEST_CACHE = new Map<string, { value: RoutingDestinationRow[]; expires: number }>();
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

export async function loadSwarmNoiseCategories(
  admin: SupabaseClient,
  swarmType: string,
): Promise<SwarmNoiseCategoryRow[]> {
  const now = Date.now();
  const hit = CATEGORIES_CACHE.get(swarmType);
  if (hit && hit.expires > now) return hit.value;

  // Quick task 260618-iwx: union the swarm's own rows with shared '*' rows.
  // Precedence + enabled filter run in JS (NOT at the DB): an own-swarm row
  // with enabled=false must be able to SHADOW (opt out of) a shared category,
  // so a DB-level .eq("enabled", true) would silently break opt-out by
  // dropping the shadow row before precedence is applied (Pitfall A).
  const { data, error } = await admin
    .from("swarm_noise_categories")
    .select("*")
    .in("swarm_type", [swarmType, "*"])
    .order("display_order", { ascending: true });

  if (error) {
    if (hit) return hit.value;
    return [];
  }
  const rows = (data as SwarmNoiseCategoryRow[] | null) ?? [];
  // Own-swarm row shadows the shared '*' row of the same category_key.
  const byKey = new Map<string, SwarmNoiseCategoryRow>();
  for (const row of rows) {
    const existing = byKey.get(row.category_key);
    if (!existing || (existing.swarm_type === "*" && row.swarm_type === swarmType)) {
      byKey.set(row.category_key, row);
    }
  }
  // Drop opted-out / disabled winners, then sort (the union may interleave).
  const value = Array.from(byKey.values())
    .filter((row) => row.enabled !== false)
    .sort((a, b) => a.display_order - b.display_order);
  CATEGORIES_CACHE.set(swarmType, { value, expires: now + TTL_MS });
  return value;
}

// Phase 68 — load swarm_intents for a swarm_type. Mirrors the TTL +
// last-known-good pattern used by loadSwarmNoiseCategories.
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

// Phase 131 (ROUTE-02) — load routing_destinations for a swarm_type. Clones the
// loadSwarmIntents TTL + last-known-good pattern. Filters `active=true` so a
// deactivated row stops resolving without a DELETE. Returns [] for swarms with
// no rows (debtor/sales) so the coordinator's routing capability block is
// skipped (byte-neutral). Projects only the columns the resolver/verdict need.
export async function loadRoutingDestinations(
  admin: SupabaseClient,
  swarmType: string,
): Promise<RoutingDestinationRow[]> {
  const now = Date.now();
  const hit = ROUTING_DEST_CACHE.get(swarmType);
  if (hit && hit.expires > now) return hit.value;

  const { data, error } = await admin
    .from("routing_destinations")
    .select("destination_key, brand, target_mailbox, outlook_category, active")
    .eq("swarm_type", swarmType)
    .eq("active", true);

  if (error) {
    if (hit) return hit.value; // last-known-good on error
    return [];
  }
  const value = (data as RoutingDestinationRow[] | null) ?? [];
  ROUTING_DEST_CACHE.set(swarmType, { value, expires: now + TTL_MS });
  return value;
}

// Phase 131 gap-closure — CROSS-SWARM framework sentinel for the "agent has no
// destination / human triage" outcome. This is a FRAMEWORK bucket-key (like
// null), NOT a swarm identity: any routing swarm may seed an `unrouted` row and
// the verdict builder short-circuits on it. Referencing this constant is allowed
// (it is not a `swarm_type` literal). Keep it in lockstep with the seeded
// `unrouted` destination_key.
export const UNROUTED_BUCKET = "unrouted";

// Phase 131 gap-closure — the result of resolving a (bucket × brand) against the
// registry. `matched` distinguishes "no active row matched" (matched:false →
// unrouted / don't-know) from "a row matched but its target_mailbox is NULL"
// (matched:true, target_mailbox:null → classified, no forward / "stays" — e.g.
// the info-routing `algemeen` bucket once its mailbox is nulled). The caller
// (buildRoutingVerdict) needs both bits to express the no-forward outcome
// WITHOUT mislabeling it unrouted.
export interface RoutingResolution {
  matched: boolean;
  target_mailbox: string | null;
}

// Phase 131 (ROUTE-02 + gap-closure) — pure (bucket × brand) → resolution.
//
// Resolution order (BUG 1 / CR-02):
//   1. EXACT match (destination_key === bucket AND brand === brand). This is the
//      cross-tenant safety case: a fire-control mail received at info@smeba
//      resolves to the fire-control mailbox, never smeba.
//   2. NO exact match → look at all active rows for the bucket. If EXACTLY ONE
//      row exists (single-tenant bucket: algemeen, sollicitaties, inspecties,
//      storingen, opleidingen), return its mailbox — the brand guess is
//      irrelevant because there is only one mailbox. The info-routing-coordinator
//      agent is instructed + few-shot-demonstrated to emit brand:null for these
//      no-brand buckets, yet every seeded row carries a non-null brand, so a
//      strict match would wrongly collapse them to unrouted.
//   3. Multiple rows for the bucket and no exact brand match (e.g. order_entry /
//      verkoop with brand=null) → genuinely ambiguous → matched:false.
//
// Returns `{matched:false, target_mailbox:null}` when no row resolves. Returns
// `{matched:true, target_mailbox}` when a row resolves — target_mailbox may be
// null (a "classified, no forward / stays" bucket). The two cases are distinct:
// the caller treats matched:false as unrouted, but matched:true + null target as
// a valid no-forward classification.
export function resolveRoutingDestination(
  destinations: RoutingDestinationRow[],
  bucket: string,
  brand: string | null,
): RoutingResolution {
  // (1) exact (bucket × brand) match wins — preserves cross-tenant safety.
  const exact = destinations.find(
    (d) => d.destination_key === bucket && d.brand === brand,
  );
  if (exact) return { matched: true, target_mailbox: exact.target_mailbox ?? null };

  // (2) no exact match → single-tenant fallback: a bucket with exactly one
  // active row has only one possible mailbox, so the brand guess is irrelevant.
  const bucketRows = destinations.filter((d) => d.destination_key === bucket);
  if (bucketRows.length === 1) {
    return { matched: true, target_mailbox: bucketRows[0].target_mailbox ?? null };
  }

  // (3) zero rows, or multiple rows with no exact brand match → ambiguous.
  return { matched: false, target_mailbox: null };
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
export type { BrandRegister };

// Test helper. Production callers MUST NOT use this.
export function __resetCacheForTests(): void {
  SWARM_CACHE.clear();
  CATEGORIES_CACHE.clear();
  INTENTS_CACHE.clear();
  ROUTING_DEST_CACHE.clear();
  __resetBrandRegisterCacheForTests();
}
