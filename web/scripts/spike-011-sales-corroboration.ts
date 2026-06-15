#!/usr/bin/env tsx
/**
 * Spike 011 — sales corroboration OPPORTUNITY probe (Phase A).
 *
 * READ-ONLY. No NXT, no network beyond the Supabase read, no writes. It reuses
 * the PRODUCTION sales extraction functions to measure, on the verkoop@smeba.nl
 * corpus, how often ≥2 INDEPENDENT resolution signals co-occur on one email —
 * the precondition for multi-signal corroboration (D-06).
 *
 * It does NOT resolve anything (that is Phase B, gated on live NXT). See
 * .planning/spikes/011-sales-corroboration-opportunity/README.md.
 *
 * Usage:  cd web && npx tsx scripts/spike-011-sales-corroboration.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv(); // fallback to .env if present

import { createClient } from "@supabase/supabase-js";
// PRODUCTION extractors — fidelity to the real sales resolver (no re-implemented regex).
import { extractOfferteCandidates } from "@/lib/automations/sales-email/lookups/offerte";
import { extractOrderCandidates } from "@/lib/automations/sales-email/lookups/order";
import { extractPostcodeCandidates } from "@/lib/automations/sales-email/lookups/sites";
import { extractInvoiceCandidates } from "@/lib/automations/debtor-email/extract-invoices";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing env. Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in web/.env.local",
  );
  process.exit(1);
}

const MAILBOX = "verkoop@smeba.nl";

// Own-tenant domains (source: public.swarms.tenant_domains for sales + spike findings).
const OWN_TENANT = ["smeba.nl", "smeba-fire.be", "moyneroberts.com"];

// Consumer freemail / ISP domains — a domain match here is NOT an org-level signal.
const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.nl", "hotmail.be",
  "outlook.com", "outlook.nl", "outlook.be", "live.nl", "live.com", "live.be",
  "msn.com", "yahoo.com", "yahoo.nl", "icloud.com", "me.com", "mac.com",
  "ziggo.nl", "kpnmail.nl", "home.nl", "telfort.nl", "hetnet.nl", "planet.nl",
  "casema.nl", "chello.nl", "upcmail.nl", "xs4all.nl", "online.nl",
  "quicknet.nl", "zeelandnet.nl", "tele2.nl", "caiway.nl", "freeler.nl",
  "wanadoo.nl", "skynet.be", "telenet.be", "proximus.be", "scarlet.be",
]);

// Probe-only intermediary detector (NOT a production extractor — estimate only).
const ON_BEHALF_OF =
  /\b(namens|op verzoek van|uw klant|t\.?b\.?v\.?|in opdracht van|on behalf of|for our client)\b/i;

interface Row {
  subject: string | null;
  body_text: string | null;
  sender_email: string | null;
  received_at: string;
}

type Kind = "offerte" | "order" | "postcode" | "factuur";
const IDENTIFIER_KINDS: Kind[] = ["offerte", "order", "postcode", "factuur"];

function domainOf(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  return email.slice(at + 1).toLowerCase().trim();
}

function senderClass(email: string | null): "own" | "freemail" | "corp" | "none" {
  const d = domainOf(email);
  if (!d) return "none";
  if (OWN_TENANT.some((t) => d === t || d.endsWith(`.${t}`))) return "own";
  if (FREEMAIL.has(d)) return "freemail";
  return "corp";
}

async function fetchCorpus(): Promise<Row[]> {
  const sb = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    db: { schema: "email_pipeline" },
    auth: { persistSession: false },
  });
  const PAGE = 1000;
  const rows: Row[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("emails")
      .select("subject, body_text, sender_email, received_at")
      .eq("mailbox", MAILBOX)
      .eq("direction", "inbound")
      .order("received_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("Query error:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function pct(n: number, total: number): string {
  return total === 0 ? "0.0%" : `${((100 * n) / total).toFixed(1)}%`;
}

async function main() {
  const rows = await fetchCorpus();
  const total = rows.length;
  console.log(`\n=== Spike 011 — sales corroboration OPPORTUNITY (read-only) ===`);
  console.log(`Mailbox: ${MAILBOX}  |  inbound rows: ${total}`);
  if (total === 0) return;
  const dates = rows.map((r) => r.received_at).filter(Boolean).sort();
  console.log(
    `Date range: ${dates[0]?.slice(0, 10) ?? "?"} → ${dates[dates.length - 1]?.slice(0, 10) ?? "?"}\n`,
  );

  // Per-kind presence counts + per-email signal sets.
  const kindCount: Record<string, number> = {
    offerte: 0, order: 0, postcode: 0, factuur: 0,
    corp_domain: 0, freemail: 0, own_domain: 0, on_behalf_of: 0,
    body_present: 0,
  };
  // Histogram of how many IDENTIFIER kinds are present per email.
  const idHist: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  // Pairwise co-occurrence among identifier kinds + corp_domain.
  const coKeys = [...IDENTIFIER_KINDS, "corp_domain"];
  const cooc: Record<string, number> = {};
  for (const a of coKeys) for (const b of coKeys) cooc[`${a}|${b}`] = 0;

  // Opportunity metrics.
  let A_oneId = 0; // ≥1 identifier
  let B_twoId = 0; // ≥2 identifier kinds
  let C_domainPlusId = 0; // corp domain ∩ ≥1 identifier
  let D_onBehalf = 0; // intermediary

  const samples: string[] = [];

  for (const r of rows) {
    const subject = r.subject ?? "";
    const body = r.body_text ?? "";
    if (body.length > 0) kindCount.body_present++;

    const present = new Set<string>();
    if (extractOfferteCandidates(subject, body).length > 0) present.add("offerte");
    if (extractOrderCandidates(subject, body).length > 0) present.add("order");
    if (extractPostcodeCandidates(subject, body).length > 0) present.add("postcode");
    if (extractInvoiceCandidates(subject, body).candidates.length > 0) present.add("factuur");

    const sc = senderClass(r.sender_email);
    if (sc === "corp") { present.add("corp_domain"); kindCount.corp_domain++; }
    else if (sc === "freemail") kindCount.freemail++;
    else if (sc === "own") kindCount.own_domain++;

    const onBehalf = ON_BEHALF_OF.test(`${subject}\n${body}`);
    if (onBehalf) { kindCount.on_behalf_of++; D_onBehalf++; }

    for (const k of IDENTIFIER_KINDS) if (present.has(k)) kindCount[k]++;

    const idKinds = IDENTIFIER_KINDS.filter((k) => present.has(k));
    idHist[Math.min(idKinds.length, 4)]++;

    if (idKinds.length >= 1) A_oneId++;
    if (idKinds.length >= 2) B_twoId++;
    if (present.has("corp_domain") && idKinds.length >= 1) C_domainPlusId++;

    // Co-occurrence (unordered pairs, counted once via a<b on the present set).
    const pres = coKeys.filter((k) => present.has(k));
    for (let i = 0; i < pres.length; i++)
      for (let j = i + 1; j < pres.length; j++)
        cooc[`${pres[i]}|${pres[j]}`]++;

    if (idKinds.length >= 2 && samples.length < 15) {
      samples.push(
        `   [${idKinds.join("+")}${present.has("corp_domain") ? "+corp" : ""}] ${subject.slice(0, 90)}`,
      );
    }
  }

  console.log(`--- Signal presence rate (of ${total} inbound) ---`);
  for (const k of ["offerte", "order", "postcode", "factuur"])
    console.log(`  ${k.padEnd(14)} ${String(kindCount[k]).padStart(5)}  ${pct(kindCount[k], total)}`);
  console.log(`  ${"corp_domain".padEnd(14)} ${String(kindCount.corp_domain).padStart(5)}  ${pct(kindCount.corp_domain, total)}`);
  console.log(`  ${"freemail".padEnd(14)} ${String(kindCount.freemail).padStart(5)}  ${pct(kindCount.freemail, total)}`);
  console.log(`  ${"own_domain".padEnd(14)} ${String(kindCount.own_domain).padStart(5)}  ${pct(kindCount.own_domain, total)}  (internal forward → D-07 quoted-sender)`);
  console.log(`  ${"on_behalf_of".padEnd(14)} ${String(kindCount.on_behalf_of).padStart(5)}  ${pct(kindCount.on_behalf_of, total)}  (probe-only heuristic)`);
  console.log(`  ${"body_present".padEnd(14)} ${String(kindCount.body_present).padStart(5)}  ${pct(kindCount.body_present, total)}\n`);

  console.log(`--- Identifier-kind count per email (offerte/order/postcode/factuur) ---`);
  for (const n of [0, 1, 2, 3, 4])
    console.log(`  ${n}${n === 4 ? "+" : " "} kind(s): ${String(idHist[n]).padStart(5)}  ${pct(idHist[n], total)}`);
  console.log("");

  console.log(`--- Pairwise co-occurrence (emails carrying BOTH) ---`);
  for (let i = 0; i < coKeys.length; i++)
    for (let j = i + 1; j < coKeys.length; j++) {
      const c = cooc[`${coKeys[i]}|${coKeys[j]}`];
      if (c > 0)
        console.log(`  ${coKeys[i]} + ${coKeys[j]}`.padEnd(34) + `${String(c).padStart(5)}  ${pct(c, total)}`);
    }
  console.log("");

  console.log(`--- OPPORTUNITY METRICS (the deliverable) ---`);
  console.log(`  A  ≥1 identifier present              ${String(A_oneId).padStart(5)}  ${pct(A_oneId, total)}`);
  console.log(`  B  ≥2 identifier KINDS (id×id corrob) ${String(B_twoId).padStart(5)}  ${pct(B_twoId, total)}`);
  console.log(`  C  corp_domain ∩ ≥1 identifier        ${String(C_domainPlusId).padStart(5)}  ${pct(C_domainPlusId, total)}   (spike 008/009 disambiguation case)`);
  console.log(`  D  on_behalf_of (intermediary)        ${String(D_onBehalf).padStart(5)}  ${pct(D_onBehalf, total)}   (domain match unsafe)`);
  console.log("");
  console.log(`  Corroboration SURFACE (B ∪ C)         ${pct(
    rows.filter((r) => {
      const subject = r.subject ?? "", body = r.body_text ?? "";
      const idn = IDENTIFIER_KINDS.filter((k) =>
        k === "offerte" ? extractOfferteCandidates(subject, body).length > 0 :
        k === "order" ? extractOrderCandidates(subject, body).length > 0 :
        k === "postcode" ? extractPostcodeCandidates(subject, body).length > 0 :
        extractInvoiceCandidates(subject, body).candidates.length > 0,
      ).length;
      return idn >= 2 || (senderClass(r.sender_email) === "corp" && idn >= 1);
    }).length,
    total,
  )}  ← share of sales mail where a 2nd signal can corroborate\n`);

  console.log(`--- Sample ≥2-identifier emails (eyeball) ---`);
  for (const s of samples) console.log(s);
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
