#!/usr/bin/env tsx
/* eslint-disable no-console */
// READ-ONLY cross-swarm SPIKE (de-risks the agnostic-resolver consolidation phase,
// todo 2026-06-12). Runs the GENERIC number-search AUTO tier (resolve_candidates
// substrate, brand_scope=["SB"]) over a subset of verkoop@smeba.nl emails to prove
// the substrate resolves SALES numbers to SB customers — WITHOUT touching the live
// sales resolver (which still uses its bespoke offerte/order/factuur lookups).
//
// Faithful replica of identifier-match.ts number-tier gate: distinct-ROOT == 1,
// status denylist (auto-gate.ts), brand-family. NO live writes, NO config change.
//
// Usage: NXT_LOOKUP_WAIT_MS=60000 npx tsx scripts/_probe-sales-subset.ts [--limit N] [--resolved-check M]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { extractNumberCandidates } from "@/lib/automations/debtor-email/extract-numbers";
import { lookupResolveCandidates } from "@/lib/automations/debtor-email/nxt-zap-client";
import { isAutoEligibleStatus } from "@/lib/agentic-pipeline/resolve/steps/auto-gate";
import { stripEnvPrefix } from "@/lib/agentic-pipeline/resolve/strip-env-prefix";
import { selectBodyText } from "@/lib/agentic-pipeline/resolve/body-source";

for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const argv = process.argv.slice(2);
const limit = ((): number => {
  const i = argv.indexOf("--limit");
  return i >= 0 ? parseInt(argv[i + 1] ?? "25", 10) : 25;
})();
const resolvedCheck = ((): number => {
  const i = argv.indexOf("--resolved-check");
  return i >= 0 ? parseInt(argv[i + 1] ?? "15", 10) : 15;
})();

const NUMBER_KINDS = new Set(["invoice_no", "po_no", "order_no", "job_no", "quote_no", "previous_customer_id"]);
const ENV = "BX";
const NXT_DB = "nxt_benelux_prod"; // the value the resolve_candidates Zap recognises for BX
const BRAND = "SB";
const SCOPE = ["SB"];

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

type AutoOutcome = { customer: string; name: string } | null;

// Faithful replica of the engine's number-tier AUTO gate (identifier-match.ts).
async function numberSearchAuto(subject: string | null, body: string | null): Promise<{ ids: string[]; auto: AutoOutcome }> {
  const ids = extractNumberCandidates(subject ?? "", body ?? "").candidates;
  if (ids.length === 0) return { ids, auto: null };
  const res = await lookupResolveCandidates(
    { nxt_database: NXT_DB, brand_id: BRAND, environment_id: ENV, identifiers: ids, brand_scope: SCOPE },
    "unknown",
  ).catch(() => ({ matches: [] as Array<Record<string, unknown>> }));
  const inScope = (res.matches as Array<{ identifier_kind: string; status?: string | null; party_id: string; party_name: string; root_party_id?: string | null; brand_id?: string | null }>)
    .filter((m) => NUMBER_KINDS.has(m.identifier_kind) && isAutoEligibleStatus(m.status));
  if (inScope.length === 0) return { ids, auto: null };
  const rootOf = (m: { root_party_id?: string | null; party_id: string }) => m.root_party_id ?? m.party_id;
  const distinctRoots = Array.from(new Set(inScope.map(rootOf)));
  if (distinctRoots.length !== 1) return { ids, auto: null }; // >=2 roots → SUGGEST
  const winner = inScope.find((m) => rootOf(m) === distinctRoots[0])!;
  const brands = new Set([BRAND, ...SCOPE]);
  if (winner.brand_id && winner.brand_id !== "" && !brands.has(winner.brand_id)) return { ids, auto: null };
  return { ids, auto: { customer: stripEnvPrefix(distinctRoots[0], ENV), name: winner.party_name } };
}

async function loadEmail(email_id: string) {
  const { data } = await admin.schema("email_pipeline").from("emails")
    .select("id, subject, body_text, body_full_text, source").eq("id", email_id).maybeSingle();
  return data as { id: string; subject: string | null; body_text: string | null; body_full_text: string | null; source: string | null } | null;
}

async function main() {
  // unresolved sales subset
  const { data: unres } = await admin.schema("email_pipeline").from("resolution_audit")
    .select("email_id, customer_account_id, method")
    .eq("swarm_type", "sales-email").is("customer_account_id", null)
    .order("created_at", { ascending: false }).limit(limit);
  const unresolved = (unres ?? []) as Array<{ email_id: string }>;

  let auto = 0, suggest = 0, noIds = 0;
  const examples: string[] = [];
  console.log(`# Sales-subset number-search probe (brand_scope=["SB"], env=BX) — READ-ONLY\n`);
  console.log(`## Unresolved sales subset: ${unresolved.length}\n`);
  for (const r of unresolved) {
    const e = await loadEmail(r.email_id);
    if (!e) continue;
    const body = selectBodyText(e.source ?? null, e.body_full_text ?? null, e.body_text ?? null);
    const { ids, auto: a } = await numberSearchAuto(e.subject, body);
    if (ids.length === 0) noIds++;
    else if (a) { auto++; if (examples.length < 15) examples.push(`  AUTO  ${a.customer} (${a.name})  ids=${JSON.stringify(ids.slice(0, 6))} subj="${(e.subject ?? "").slice(0, 60)}"`); }
    else suggest++;
  }
  console.log(`**AUTO (single-root SB resolve):** ${auto}`);
  console.log(`**SUGGEST (>=2 roots / out-of-scope / no substrate match):** ${suggest}`);
  console.log(`**No number identifier in email:** ${noIds}`);
  console.log(`**AUTO rate over emails WITH an identifier:** ${auto + suggest > 0 ? Math.round((100 * auto) / (auto + suggest)) : 0}%\n`);
  console.log(`### AUTO examples\n${examples.join("\n")}\n`);

  // precision cross-check against already-resolved sales rows
  const { data: resv } = await admin.schema("email_pipeline").from("resolution_audit")
    .select("email_id, customer_account_id")
    .eq("swarm_type", "sales-email").not("customer_account_id", "is", null)
    .order("created_at", { ascending: false }).limit(resolvedCheck);
  const resolved = (resv ?? []) as Array<{ email_id: string; customer_account_id: string }>;
  let agree = 0, disagree = 0, noAuto = 0;
  const mism: string[] = [];
  console.log(`## Precision cross-check vs ${resolved.length} already-resolved sales rows\n`);
  for (const r of resolved) {
    const e = await loadEmail(r.email_id);
    if (!e) continue;
    const body = selectBodyText(e.source ?? null, e.body_full_text ?? null, e.body_text ?? null);
    const { auto: a } = await numberSearchAuto(e.subject, body);
    if (!a) { noAuto++; continue; }
    if (a.customer === r.customer_account_id) agree++;
    else { disagree++; if (mism.length < 10) mism.push(`  MISMATCH auto=${a.customer} vs known=${r.customer_account_id} (${a.name}) subj="${(e.subject ?? "").slice(0, 55)}"`); }
  }
  console.log(`**AUTO agrees with known customer:** ${agree}`);
  console.log(`**AUTO disagrees (investigate):** ${disagree}`);
  console.log(`**AUTO abstained (SUGGEST / no id):** ${noAuto}`);
  if (mism.length) console.log(`\n### Disagreements\n${mism.join("\n")}`);
}

main().then(() => process.exit(0));
