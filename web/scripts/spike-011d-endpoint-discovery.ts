#!/usr/bin/env tsx
/**
 * Spike 011d — NXT search-endpoint DISCOVERY (live prod, read-only).
 *
 * Spike 011c proved the sales lookups call the wrong contract: /api/quotes/search
 * + /api/orders/search IGNORE `searchTerm` (return a default list), /api/sites/search
 * is 405. This probe tries proven-style variants (per nxt-client.ts: customers =
 * POST /api/customers {searchTerm}; items = POST /api/items/search {searchTerm,…})
 * to find the variant that actually FILTERS by the identifier.
 *
 * A variant "wins" if a returned row demonstrably references the searched term
 * (and ideally the bogus control returns nothing). Structure-only output (counts,
 * keys, match flags) — no PII values.
 *
 * Usage:  cd web && npx tsx scripts/spike-011d-endpoint-discovery.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { nxtRequest } from "@/lib/automations/nxt-zapier/nxt-client";

const ENV = "production" as const;
// Real identifiers sampled from the verkoop@ corpus (spike 011c). Low-sensitivity
// reference numbers, hardcoded so the probe is deterministic.
const OFFERTE = "SB014098";
const ORDER = "1633526";
const POSTCODE = "7543BK";

const norm = (s: unknown) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function rowsOf(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter((x) => x && typeof x === "object");
  if (data && typeof data === "object") {
    const c = (data as Record<string, unknown>).content;
    if (Array.isArray(c)) return c.filter((x) => x && typeof x === "object");
    return [data as Record<string, unknown>];
  }
  return [];
}
function valuesOf(row: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const v of Object.values(row)) {
    if (v === null || typeof v === "object") continue;
    out.push(String(v));
  }
  return out;
}
function matchCount(rows: Record<string, unknown>[], term: string): number {
  const t = norm(term);
  return rows.filter((r) => valuesOf(r).some((v) => { const nv = norm(v); return nv === t || (t.length >= 6 && nv.includes(t)); })).length;
}

interface Attempt { label: string; method: string; path: string; body?: unknown; }

async function run(a: Attempt, term: string) {
  const res = await nxtRequest(ENV, a.method, a.path, a.body).catch((e) => ({ status: -1, ok: false, data: String(e instanceof Error ? e.message : e) }));
  const rows = rowsOf(res.data);
  const m = matchCount(rows, term);
  const keys = rows[0] && typeof rows[0] === "object" ? Object.keys(rows[0]).slice(0, 6).join(",") : "—";
  const verdict = res.status === -1 ? "ERR" : !res.ok ? `HTTP ${res.status}` : m > 0 && rows.length <= 5 ? "★ FILTERED+MATCH" : m > 0 ? "match-in-list" : rows.length === 0 ? "empty" : "unfiltered-list";
  console.log(`  ${verdict.padEnd(18)} ${a.method} ${a.path}  ${a.body ? JSON.stringify(a.body) : ""}  → rows=${rows.length} match=${m} keys[${keys}]`);
  return { verdict, rows: rows.length, match: m };
}

async function main() {
  console.log(`\n=== Spike 011d — NXT endpoint discovery (LIVE prod, read-only) ===`);
  console.log(`terms: offerte=${OFFERTE} order=${ORDER} postcode=${POSTCODE}\n`);

  console.log(`#### QUOTES (resolve offerte → customerId) ####`);
  const quoteAttempts: Attempt[] = [
    { label: "q1", method: "POST", path: "/api/quotes", body: { searchTerm: OFFERTE } },
    { label: "q2", method: "POST", path: "/api/quotes/search", body: { searchTerm: OFFERTE, size: 200 } },
    { label: "q3", method: "POST", path: "/api/quotes/search", body: { reference: OFFERTE } },
    { label: "q4", method: "POST", path: "/api/quotes/search", body: { searchText: OFFERTE } },
    { label: "q5", method: "GET", path: `/api/quotes/search?searchTerm=${OFFERTE}` },
    { label: "q6", method: "GET", path: `/api/quotes?reference=${OFFERTE}` },
  ];
  for (const a of quoteAttempts) { await run(a, OFFERTE); await sleep(150); }

  console.log(`\n#### ORDERS (resolve order → customer; note: 011c row had NO customerId) ####`);
  const orderAttempts: Attempt[] = [
    { label: "o1", method: "POST", path: "/api/orders", body: { searchTerm: ORDER } },
    { label: "o2", method: "POST", path: "/api/orders/search", body: { searchText: ORDER } },
    { label: "o3", method: "GET", path: `/api/orders/search?searchTerm=${ORDER}` },
  ];
  for (const a of orderAttempts) { await run(a, ORDER); await sleep(150); }

  console.log(`\n#### SITES (resolve postcode → customerId; proven /api/sites is by customerId) ####`);
  const siteAttempts: Attempt[] = [
    { label: "s1", method: "POST", path: "/api/sites", body: { searchTerm: POSTCODE } },
    { label: "s2", method: "POST", path: "/api/sites", body: { postcode: POSTCODE } },
    { label: "s3", method: "GET", path: `/api/sites?postcode=${POSTCODE}` },
    { label: "s4", method: "GET", path: `/api/sites/search?searchTerm=${POSTCODE}` },
  ];
  for (const a of siteAttempts) { await run(a, POSTCODE); await sleep(150); }

  console.log(`\n★ = a variant that returned a SMALL set containing the searched identifier (the real filter).`);
  console.log(`If a ★ winner exists, re-confirm with a bogus term before wiring it into the lookup.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
