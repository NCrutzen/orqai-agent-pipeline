#!/usr/bin/env node
// Phase 69 (CANO-02). Wave 1 post-migration smoke: connects to Supabase, reads
// swarms.entity_brand for swarm_type='debtor-email', and asserts every element
// is a jsonb object carrying the BrandRegister fields.
//
// Wave 0 ships the script; Wave 1 runs it after `apply_migration`.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-entity-brand-shape.mjs

import { createClient } from "@supabase/supabase-js";

const REQUIRED_FIELDS = [
  "code",
  "display_name",
  "register_language",
  "register_dialect",
  "signoff_phrase",
  "formal_address",
  "nxt_database_alias",
  "icontroller_company",
];

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error("[verify-entity-brand-shape] SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(2);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const swarmType = process.env.SWARM_TYPE ?? "debtor-email";

const { data, error } = await admin
  .from("swarms")
  .select("entity_brand")
  .eq("swarm_type", swarmType)
  .maybeSingle();

if (error) {
  console.error(`[verify-entity-brand-shape] supabase error:`, error);
  process.exit(3);
}
if (!data) {
  console.error(`[verify-entity-brand-shape] no swarm row for ${swarmType}`);
  process.exit(4);
}

const brands = data.entity_brand;
if (!Array.isArray(brands)) {
  console.error(`[verify-entity-brand-shape] entity_brand is not an array (got ${typeof brands})`);
  process.exit(5);
}
if (brands.length === 0) {
  console.error(`[verify-entity-brand-shape] entity_brand is empty`);
  process.exit(6);
}

const malformed = [];
for (const [i, elem] of brands.entries()) {
  if (typeof elem === "string") {
    malformed.push(`[${i}] still string ('${elem}') — migration 20260505a not applied`);
    continue;
  }
  if (!elem || typeof elem !== "object") {
    malformed.push(`[${i}] not object: ${JSON.stringify(elem)}`);
    continue;
  }
  for (const f of REQUIRED_FIELDS) {
    if (typeof elem[f] !== "string" || elem[f].length === 0) {
      malformed.push(`[${i}] ${elem.code ?? "?"} missing/empty field '${f}'`);
    }
  }
}

if (malformed.length > 0) {
  console.error("[verify-entity-brand-shape] FAIL:");
  for (const m of malformed) console.error("  -", m);
  process.exit(1);
}

console.log(
  `[verify-entity-brand-shape] OK: ${brands.length} brands valid for swarm_type=${swarmType}`,
);
console.log(`  codes: ${brands.map((b) => b.code).join(", ")}`);
