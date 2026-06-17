#!/usr/bin/env tsx
// Phase 120-04 — live smoke of the SALES resolver over resolve_candidates (43uuz1r).
// Proves: (a) 43uuz1r returns data live, (b) the sales corroboration path resolves
// the verified SB014098 → quote_no → BX228895 (Bever) case.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
function loadEnvLocal() {
  let raw = "";
  try { raw = readFileSync(resolve(WEB_ROOT, ".env.local"), "utf8"); } catch { return; }
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnvLocal();

const { lookupResolveCandidates } = await import("@/lib/automations/debtor-email/nxt-zap-client");

console.log("[sales-smoke] calling resolve_candidates (43uuz1r) for offerte 14098, scope SB…");
const res = await lookupResolveCandidates(
  { nxt_database: "nxt_benelux_prod", brand_id: "SB", environment_id: "BX", identifiers: ["14098"], brand_scope: ["SB"] },
  "sales_resolution",
);
console.log(`[sales-smoke] matches: ${res.matches.length}`);
for (const m of res.matches) {
  console.log(`  kind=${m.identifier_kind} value=${m.identifier_value_norm} party=${m.party_id} (${m.party_name}) scope=${m.scope_key} unique=${m.is_unique_in_scope}`);
}
const quote = res.matches.find((m) => m.identifier_kind === "quote_no" && m.scope_key === "SB" && m.is_unique_in_scope);
console.log(quote ? `[sales-smoke] ✅ quote_no → ${quote.party_id} (${quote.party_name})` : "[sales-smoke] ❌ no unique quote_no match");
