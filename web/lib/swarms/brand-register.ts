// Phase 69 (CANO-02, D-11). Brand-register loader: resolves a single brand's
// metadata (signoff phrase, formal address, register language + dialect, NXT
// alias, iController company) from public.swarms.entity_brand for a given
// (swarm_type, brand_code) pair.
//
// Wave 0 (this commit) ships the skeleton + types only. The implementation
// lights up in Wave 2 once the migration (20260505a_entity_brand_expansion.sql)
// has been applied and entity_brand has the jsonb-of-objects shape. Until
// then loadBrandRegister throws a structured error (no defensive fallback per
// Phase 68 D-12 precedent + threat T-69-01).
//
// Cache: per-process Map keyed on (swarm_type, brand_code), invalidated only
// by Vercel cold start (Phase 68 D-15 precedent — brand metadata changes
// rarely).

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSwarm } from "./registry";

/**
 * Per-brand metadata as stored in swarms.entity_brand[i] after the Phase 69
 * Wave 1 migration. The shape is a strict superset of the Phase 68 string-only
 * seed (the old entry — `"smeba"` — corresponds to `code: "smeba"` here).
 *
 * Adding new fields is non-breaking; renaming or removing a field is a
 * registry-version bump (today: tracked via canonical_context_shape.version).
 */
export interface BrandRegister {
  code: string;
  display_name: string;
  register_language: "nl" | "fr" | "en" | "de";
  register_dialect: string;
  signoff_phrase: string;
  formal_address: string;
  nxt_database_alias: string;
  icontroller_company: string;
}

const BRAND_CACHE = new Map<string, BrandRegister>();

function cacheKey(swarmType: string, brandCode: string): string {
  return `${swarmType}::${brandCode}`;
}

/**
 * UnknownBrandError: thrown when a brand_code is not present in the registry
 * for the given swarm_type. Callers (Stage 4 handlers) should let this
 * propagate so the failure surfaces as `automation_runs.status='failed'`
 * rather than silently rendering with the wrong brand (threat T-69-01:
 * cross-brand register leak).
 */
export class UnknownBrandError extends Error {
  constructor(swarmType: string, brandCode: string, knownCodes: string[]) {
    super(
      `[brand-register] unknown brand_code=${brandCode} for swarm_type=${swarmType}; ` +
        `known codes: [${knownCodes.join(", ")}]`,
    );
    this.name = "UnknownBrandError";
  }
}

/**
 * MalformedRegistryError: thrown when swarms.entity_brand is still in the
 * legacy string-array shape (Phase 68 seed) — i.e. the Wave 1 migration
 * hasn't been applied yet, or was applied incorrectly. Distinct from
 * UnknownBrandError so callers can surface the right operator action.
 */
export class MalformedRegistryError extends Error {
  constructor(swarmType: string, detail: string) {
    super(`[brand-register] swarms.entity_brand for ${swarmType} is malformed: ${detail}`);
    this.name = "MalformedRegistryError";
  }
}

function isBrandRegister(value: unknown): value is BrandRegister {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.code === "string" &&
    typeof v.display_name === "string" &&
    typeof v.register_language === "string" &&
    typeof v.register_dialect === "string" &&
    typeof v.signoff_phrase === "string" &&
    typeof v.formal_address === "string" &&
    typeof v.nxt_database_alias === "string" &&
    typeof v.icontroller_company === "string"
  );
}

/**
 * Loads all brand-register rows for a swarm_type. Reads via loadSwarm so the
 * registry-cache TTL governs both reads. Throws MalformedRegistryError if the
 * stored shape is not the post-Phase-69 jsonb-of-objects shape.
 *
 * Wave 0 STATUS: skeleton. Implementation pending Wave 2 (after Wave 1 applies
 * the migration). Currently throws when called.
 */
export async function loadAllBrandRegisters(
  admin: SupabaseClient,
  swarmType: string,
): Promise<BrandRegister[]> {
  const swarm = await loadSwarm(admin, swarmType);
  if (!swarm) {
    throw new MalformedRegistryError(swarmType, "swarm row not found");
  }

  const raw = swarm.entity_brand as unknown;
  if (!Array.isArray(raw)) {
    throw new MalformedRegistryError(
      swarmType,
      `entity_brand is not an array (got ${typeof raw})`,
    );
  }

  // Phase 69 Wave 1 transitional guard — string-array shape means the
  // expansion migration hasn't been applied yet for this swarm.
  if (raw.length > 0 && typeof raw[0] === "string") {
    throw new MalformedRegistryError(
      swarmType,
      "entity_brand is still the legacy string-array shape; apply migration 20260505a",
    );
  }

  const brands: BrandRegister[] = [];
  for (const elem of raw) {
    if (!isBrandRegister(elem)) {
      throw new MalformedRegistryError(
        swarmType,
        `entity_brand element does not match BrandRegister shape: ${JSON.stringify(elem)}`,
      );
    }
    brands.push(elem);
  }
  return brands;
}

/**
 * Resolves a single brand's metadata. Throws UnknownBrandError if the code is
 * not present (no defensive fallback — threat T-69-01).
 *
 * Wave 0 STATUS: skeleton. Implementation pending Wave 2.
 */
export async function loadBrandRegister(
  admin: SupabaseClient,
  swarmType: string,
  brandCode: string,
): Promise<BrandRegister> {
  const key = cacheKey(swarmType, brandCode);
  const cached = BRAND_CACHE.get(key);
  if (cached) return cached;

  const all = await loadAllBrandRegisters(admin, swarmType);
  const hit = all.find((b) => b.code === brandCode);
  if (!hit) {
    throw new UnknownBrandError(
      swarmType,
      brandCode,
      all.map((b) => b.code),
    );
  }
  BRAND_CACHE.set(key, hit);
  return hit;
}

/** Test helper. Production callers MUST NOT use this. */
export function __resetBrandRegisterCacheForTests(): void {
  BRAND_CACHE.clear();
}
