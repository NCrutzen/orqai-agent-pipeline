#!/usr/bin/env tsx
/**
 * Spike 011c — NXT search-endpoint SCHEMA probe (live NXT prod, read-only).
 *
 * Purpose: the offerte/order/sites lookups were built on a GUESSED response shape
 * that was never validated (spike 011b proved it wrong — every offerte resolved to
 * 512887). This probe captures the REAL shape of /api/{quotes,orders,sites}/search
 * so the fail-closed matcher (lookups/_match.ts) can be tightened to the exact
 * reference field, and so we can confirm whether `searchTerm` filters server-side.
 *
 * Privacy: prints the response STRUCTURE only — container shape, row count, first-
 * row KEYS, which key's value references the searched term, and the candidate
 * customer-id fields. It does NOT dump full rows / customer PII.
 *
 * Calls: 1 real + 1 bogus term per endpoint = 6 read-only prod searches.
 *
 * Usage:  cd web && npx tsx scripts/spike-011c-schema-probe.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { createClient } from "@supabase/supabase-js";
import { nxtRequest } from "@/lib/automations/nxt-zapier/nxt-client";
import { extractOfferteCandidates } from "@/lib/automations/sales-email/lookups/offerte";
import { extractOrderCandidates } from "@/lib/automations/sales-email/lookups/order";
import { extractPostcodeCandidates } from "@/lib/automations/sales-email/lookups/sites";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) { console.error("Missing Supabase env"); process.exit(1); }

const ENV = "production" as const;
const norm = (s: unknown) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");

interface Row { subject: string | null; body_text: string | null; }

async function firstRealTerm(kind: "offerte" | "order" | "postcode"): Promise<string | null> {
  const sb = createClient(SUPABASE_URL!, SERVICE_KEY!, { db: { schema: "email_pipeline" }, auth: { persistSession: false } });
  let from = 0;
  while (from < 2000) {
    const { data } = await sb.from("emails").select("subject, body_text")
      .eq("mailbox", "verkoop@smeba.nl").eq("direction", "inbound")
      .order("received_at", { ascending: true }).range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const r of data as Row[]) {
      const s = r.subject ?? "", b = r.body_text ?? "";
      const c = kind === "offerte" ? extractOfferteCandidates(s, b)
        : kind === "order" ? extractOrderCandidates(s, b)
        : extractPostcodeCandidates(s, b);
      if (c.length > 0) return c[0];
    }
    if (data.length < 1000) break; from += 1000;
  }
  return null;
}

function describe(label: string, term: string, data: unknown) {
  console.log(`\n  ── ${label}  searchTerm="${term}" ──`);
  const container = Array.isArray(data) ? "array"
    : data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).content) ? "{content:[]}"
    : data && typeof data === "object" ? "bare object" : typeof data;
  const rows: Record<string, unknown>[] = Array.isArray(data) ? data as Record<string, unknown>[]
    : data && Array.isArray((data as Record<string, unknown>).content) ? (data as Record<string, unknown>).content as Record<string, unknown>[]
    : data && typeof data === "object" ? [data as Record<string, unknown>] : [];
  console.log(`     container=${container}  rows=${rows.length}`);
  if (rows.length === 0) { console.log(`     (empty — does the endpoint filter or just return nothing?)`); return; }
  const row0 = rows[0];
  console.log(`     row[0] keys: ${Object.keys(row0).join(", ")}`);
  const t = norm(term);
  // which fields reference the searched term?
  const refFields = Object.entries(row0).filter(([, v]) => {
    if (v === null || typeof v === "object") return false;
    const nv = norm(v); return nv === t || (t.length >= 6 && nv.includes(t));
  }).map(([k]) => k);
  console.log(`     fields matching the term: ${refFields.length ? refFields.join(", ") : "(NONE — term not echoed → searchTerm may be ignored)"}`);
  // candidate customer-id fields
  const idFields = Object.keys(row0).filter((k) => /customer|account|client|debtor/i.test(k) && /id|nummer|no/i.test(k));
  console.log(`     candidate customer-id fields: ${idFields.length ? idFields.join(", ") : "(none obvious — keys above)"}`);
  // do all rows share one customerId (the 512887 smell)?
  const ids = new Set(rows.map((r) => r.customerId ?? r.customer_id ?? r.accountId).filter(Boolean).map(String));
  console.log(`     distinct customerId across ${rows.length} rows: ${ids.size}`);
}

async function probe(label: string, path: string, realTerm: string) {
  for (const [tag, term] of [["REAL", realTerm], ["BOGUS", label === "sites" ? "9999ZZ" : "ZZ999999"]] as const) {
    const res = await nxtRequest(ENV, "POST", path, { searchTerm: term }).catch((e) => { console.log(`   ${tag} call error: ${e instanceof Error ? e.message : e}`); return null; });
    if (res) { console.log(`  [${tag}] status=${res.status} ok=${res.ok}`); describe(`${label} ${tag}`, term, res.data); }
  }
}

async function main() {
  console.log(`\n=== Spike 011c — NXT search schema probe (LIVE prod, read-only) ===`);
  const offerte = await firstRealTerm("offerte");
  const order = await firstRealTerm("order");
  const postcode = await firstRealTerm("postcode");
  console.log(`Sampled real terms → offerte=${offerte} order=${order} postcode=${postcode}\n`);

  if (offerte) { console.log(`\n#### /api/quotes/search ####`); await probe("quotes", "/api/quotes/search", offerte); }
  if (order) { console.log(`\n#### /api/orders/search ####`); await probe("orders", "/api/orders/search", order); }
  if (postcode) { console.log(`\n#### /api/sites/search ####`); await probe("sites", "/api/sites/search", postcode); }
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
