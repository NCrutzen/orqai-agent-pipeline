#!/usr/bin/env tsx
/**
 * Spike 011 — Phase B: sales resolution-LIFT measurement (LIVE NXT).
 *
 * ⚠️ HITS LIVE NXT PROD. The identifier lookups call `nxtRequest("production", ...)`
 * which talks DIRECTLY to https://sb.n-xt.org with a harvested bearer token (the
 * allowWrite gate lives in the proxy route, NOT here). With --with-zapier it ALSO
 * calls the Zapier SQL webhook (sender + factuur). All calls are READS (search
 * endpoints), but they are real prod traffic. Run only with explicit go-ahead.
 *
 * It measures what Phase A could not: for the ≥1-identifier sales emails, do the
 * signals actually RESOLVE, and when ≥2 resolve do they AGREE (corroboration →
 * confidence) or CONFLICT (corroboration catches a would-be false positive)?
 *
 * Safety rails: deterministic sample (--seed), hard --limit, sequential with a
 * delay, and a resumable on-disk cache so a re-run never re-hits NXT for an email
 * already measured. Default = nxtRequest-only (offerte/order/postcode), ONE
 * transport, small sample. --with-zapier adds sender/factuur (second transport).
 *
 * Usage:
 *   cd web && npx tsx scripts/spike-011b-sales-resolution-lift.ts --limit 40
 *   cd web && npx tsx scripts/spike-011b-sales-resolution-lift.ts --limit 80 --with-zapier
 *
 * See .planning/spikes/011-sales-corroboration-opportunity/README.md (Phase B).
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { extractOfferteCandidates } from "@/lib/automations/sales-email/lookups/offerte";
import { lookupOfferteToAccount } from "@/lib/automations/sales-email/lookups/offerte";
import { extractOrderCandidates, lookupOrderToAccount } from "@/lib/automations/sales-email/lookups/order";
import { extractPostcodeCandidates, lookupPostcodeToAccount } from "@/lib/automations/sales-email/lookups/sites";
import { extractInvoiceCandidates } from "@/lib/automations/debtor-email/extract-invoices";
import { lookupSenderToAccount, lookupIdentifierToAccount } from "@/lib/automations/debtor-email/nxt-zap-client";

// ---- args ----
const argv = process.argv.slice(2);
function argVal(flag: string, def: string): string {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : def;
}
const LIMIT = parseInt(argVal("--limit", "40"), 10);
const SEED = parseInt(argVal("--seed", "42"), 10);
const WITH_ZAPIER = argv.includes("--with-zapier");
const NXT_ENV = "production" as const;
const DELAY_MS = 150;

// Sales registry scope (public.swarms sales-email): brand SB, consolidated "nxt" db.
const BRAND_ID = "SB";
const NXT_DATABASE = "nxt";
const OWN_TENANT = ["smeba.nl", "smeba-fire.be", "moyneroberts.com"];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in web/.env.local");
  process.exit(1);
}

const MAILBOX = "verkoop@smeba.nl";
const CACHE = `../.planning/spikes/011-sales-corroboration-opportunity/spike-011b-cache.json`;

interface Row { id: string; subject: string | null; body_text: string | null; sender_email: string | null; }
type SignalResult = Record<string, string | null>; // signal -> account_id or null

function domainOf(e: string | null): string | null {
  if (!e) return null;
  const at = e.lastIndexOf("@");
  return at === -1 ? null : e.slice(at + 1).toLowerCase().trim();
}
function isOwn(e: string | null): boolean {
  const d = domainOf(e);
  return !!d && OWN_TENANT.some((t) => d === t || d.endsWith(`.${t}`));
}
// Deterministic LCG shuffle (CONVENTIONS: reproducible samples).
function seededPick<T>(arr: T[], n: number, seed: number): T[] {
  let s = seed >>> 0;
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    s = (1103515245 * s + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchSubset(): Promise<Row[]> {
  const sb = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    db: { schema: "email_pipeline" }, auth: { persistSession: false },
  });
  const PAGE = 1000; const rows: Row[] = []; let from = 0;
  while (true) {
    const { data, error } = await sb.from("emails")
      .select("id, subject, body_text, sender_email")
      .eq("mailbox", MAILBOX).eq("direction", "inbound")
      .order("received_at", { ascending: true }).range(from, from + PAGE - 1);
    if (error) { console.error(error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < PAGE) break; from += PAGE;
  }
  // Keep only emails with ≥1 identifier (the resolvable subset).
  return rows.filter((r) => {
    const s = r.subject ?? "", b = r.body_text ?? "";
    return extractOfferteCandidates(s, b).length > 0 || extractOrderCandidates(s, b).length > 0 ||
      extractPostcodeCandidates(s, b).length > 0 || extractInvoiceCandidates(s, b).candidates.length > 0;
  });
}

async function resolveSignals(r: Row): Promise<SignalResult> {
  const s = r.subject ?? "", b = r.body_text ?? "";
  const out: SignalResult = {};

  // --- resolver_index SQL back-search transport (Phase 120-02) ---
  const salesCtx = { nxt_database: NXT_DATABASE, brand_id: BRAND_ID };
  if (extractOfferteCandidates(s, b).length > 0) {
    const hit = await lookupOfferteToAccount(salesCtx, s, b).catch(() => null);
    out.offerte = hit?.customer_account_id ?? null;
  }
  if (extractOrderCandidates(s, b).length > 0) {
    const hit = await lookupOrderToAccount(salesCtx, s, b).catch(() => null);
    out.order = hit?.customer_account_id ?? null;
  }
  if (extractPostcodeCandidates(s, b).length > 0) {
    const hit = await lookupPostcodeToAccount(salesCtx, s, b).catch(() => null);
    out.postcode = hit?.customer_account_id ?? null;
  }

  // --- Zapier transport (sender + factuur) — opt-in ---
  if (WITH_ZAPIER) {
    if (!isOwn(r.sender_email) && r.sender_email) {
      const res = await lookupSenderToAccount(
        { nxt_database: NXT_DATABASE, brand_id: BRAND_ID, sender_email: r.sender_email }, "unknown",
      ).catch(() => ({ matches: [] as Array<{ top_level_customer_id: string }> }));
      const ids = Array.from(new Set(res.matches.map((m) => m.top_level_customer_id)));
      out.sender = ids.length === 1 ? ids[0] : null; // ambiguous → unresolved (iteration-1 rule)
    }
    const inv = extractInvoiceCandidates(s, b).candidates;
    if (inv.length > 0) {
      const res = await lookupIdentifierToAccount(
        { nxt_database: NXT_DATABASE, brand_id: BRAND_ID, invoice_numbers: inv }, "unknown",
      ).catch(() => ({ matches: [] as Array<{ top_level_customer_id: string }> }));
      const ids = Array.from(new Set(res.matches.map((m) => m.top_level_customer_id)));
      out.factuur = ids.length === 1 ? ids[0] : null;
    }
  }
  return out;
}

async function main() {
  console.log(`\n=== Spike 011 Phase B — sales resolution LIFT (LIVE NXT${WITH_ZAPIER ? " + Zapier" : ", nxtRequest only"}) ===`);
  const subset = await fetchSubset();
  const sample = seededPick(subset, Math.min(LIMIT, subset.length), SEED);
  console.log(`≥1-identifier subset: ${subset.length}  |  sampling: ${sample.length} (seed ${SEED})  |  delay ${DELAY_MS}ms`);
  console.log(`Brand ${BRAND_ID} · db ${NXT_DATABASE} · env ${NXT_ENV}\n`);

  const cache: Record<string, SignalResult> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  let i = 0;
  for (const r of sample) {
    i++;
    if (!cache[r.id]) {
      try {
        cache[r.id] = await resolveSignals(r);
      } catch (e) {
        console.error(`  [${i}/${sample.length}] FATAL on ${r.id}: ${e instanceof Error ? e.message : e}`);
        console.error(`  (likely NXT token harvest / Zapier secret not available locally — stopping, cache preserved)`);
        break;
      }
      writeFileSync(CACHE, JSON.stringify(cache, null, 2));
      await sleep(DELAY_MS);
    }
    const res = cache[r.id];
    const resolved = Object.entries(res).filter(([, v]) => v);
    process.stdout.write(`  [${i}/${sample.length}] ${Object.entries(res).map(([k, v]) => `${k}=${v ?? "∅"}`).join(" ") || "(none)"}\n`);
    void resolved;
  }

  // --- aggregate over cached sample ---
  const measured = sample.map((r) => cache[r.id]).filter(Boolean);
  const N = measured.length;
  console.log(`\n--- Aggregate over ${N} measured emails ---`);

  const signals = WITH_ZAPIER ? ["sender", "offerte", "postcode", "order", "factuur"] : ["offerte", "postcode", "order"];
  console.log(`Per-signal resolve rate (hits / emails where that signal was attempted):`);
  for (const sig of signals) {
    const attempted = measured.filter((m) => sig in m).length;
    const hits = measured.filter((m) => m[sig]).length;
    console.log(`  ${sig.padEnd(9)} ${String(hits).padStart(4)}/${String(attempted).padStart(4)}  ${attempted ? ((100 * hits) / attempted).toFixed(1) : "0.0"}%`);
  }

  let multiResolved = 0, agree = 0, conflict = 0;
  const conflicts: string[] = [];
  for (let k = 0; k < sample.length; k++) {
    const m = cache[sample[k].id]; if (!m) continue;
    const accounts = Array.from(new Set(Object.values(m).filter(Boolean) as string[]));
    const nResolvedSignals = Object.values(m).filter(Boolean).length;
    if (nResolvedSignals >= 2) {
      multiResolved++;
      if (accounts.length === 1) agree++;
      else { conflict++; conflicts.push(`   ${sample[k].id}  ${Object.entries(m).map(([s, v]) => `${s}=${v}`).join(" ")}`); }
    }
  }
  const anyResolved = measured.filter((m) => Object.values(m).some(Boolean)).length;
  console.log(`\n--- Corroboration payoff ---`);
  console.log(`  emails resolved by ≥1 signal     ${anyResolved}/${N}  (${N ? ((100 * anyResolved) / N).toFixed(1) : 0}%)`);
  console.log(`  emails with ≥2 signals RESOLVED  ${multiResolved}`);
  console.log(`    └ AGREE (same account, confidence↑) ${agree}`);
  console.log(`    └ CONFLICT (diff account, FP caught) ${conflict}`);
  if (conflicts.length) { console.log(`\n  Conflicts (corroboration prevented a wrong resolve):`); conflicts.forEach((c) => console.log(c)); }
  console.log(`\n(cache: ${CACHE} — re-run is free + resumable)\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
