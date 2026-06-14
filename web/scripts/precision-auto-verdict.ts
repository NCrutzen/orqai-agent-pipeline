#!/usr/bin/env tsx
/* eslint-disable no-console */
// Phase 91 — FOCUSED AUTO-tier verdict runner (READ-ONLY).
//
// Why this exists alongside precision-dry-run.ts: the full engine fall-through
// fires ~5-6 Zap calls/row across 4 Zaps (self_auth + number + legacy invoice +
// candidate_details + sender + thread) — a 504-row replay is ~2500 calls/~5h AND
// the legacy path throws uncaught on a slow lookup (crash). The verdict is ONLY
// about the AUTO tier precision (self_auth + number back-search), so this runner
// measures EXACTLY that: ONE resolve_candidates call per row, both AUTO gates
// replicated verbatim from self-auth-match.ts + identifier-match.ts, no engine,
// no legacy. Forces NXT_LOOKUP_POLL_ONLY (no realtime WebSocket churn at scale).
//
// Usage:
//   cd web && npx tsx scripts/precision-auto-verdict.ts [--limit N] [--sample out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { extractSelfAuthCandidates } from "@/lib/automations/debtor-email/extract-self-auth";
import { extractNumberCandidates } from "@/lib/automations/debtor-email/extract-numbers";
import { lookupResolveCandidates } from "@/lib/automations/debtor-email/nxt-zap-client";
import { isAutoEligibleStatus } from "@/lib/agentic-pipeline/resolve/steps/auto-gate";
import { stripEnvPrefix } from "@/lib/agentic-pipeline/resolve/strip-env-prefix";
import { selectBodyText } from "@/lib/agentic-pipeline/resolve/body-source";

// Load .env.local. nxt-zap-client reads NEXT_PUBLIC_APP_URL + NXT_LOOKUP_POLL_ONLY
// at CALL time, so setting them here (before main runs) is sufficient.
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
process.env.NXT_LOOKUP_POLL_ONLY = "1"; // scale-safe wait (no per-call realtime channel)

const argv = process.argv.slice(2);
const limit = (() => { const i = argv.indexOf("--limit"); return i >= 0 ? parseInt(argv[i + 1] ?? "", 10) : undefined; })();
const samplePath = (() => { const i = argv.indexOf("--sample"); return i >= 0 ? argv[i + 1] : undefined; })();

const ENV = "BX";
const SELF_AUTH_KINDS = new Set(["customer_no", "site_no"]);
const NUMBER_KINDS = new Set(["invoice_no", "po_no", "order_no", "job_no", "quote_no", "previous_customer_id"]);

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

type Match = { identifier_kind: string; identifier_value_norm: string; party_id: string; party_name: string; root_party_id?: string | null; brand_id?: string | null; status?: string | null; is_unique_in_scope?: boolean };
type Sample = { email_id: string; tier: "self_auth" | "number_search"; identifier_kind: string; customer_account_id: string; customer_name: string; matched_identifiers: string[] };

function brandOk(winnerBrand: string | null | undefined, brandId: string, brandScope: string[]): boolean {
  if (winnerBrand == null || winnerBrand === "") return true;
  return new Set([brandId, ...brandScope]).has(winnerBrand);
}

async function main() {
  // per-mailbox settings + Berki-style brand widening
  const { data: settingsRows } = await admin.schema("debtor").from("labeling_settings").select("source_mailbox, nxt_database, brand_id");
  const settings = new Map<string, { nxt_database: string | null; brand_id: string | null }>();
  for (const s of (settingsRows ?? []) as Array<{ source_mailbox: string; nxt_database: string | null; brand_id: string | null }>)
    settings.set(s.source_mailbox, { nxt_database: s.nxt_database, brand_id: s.brand_id });
  const { data: swarm } = await admin.from("swarms").select("resolution_config").eq("swarm_type", "debtor-email").maybeSingle();
  const brandScopeByMailbox: Record<string, string[]> =
    (swarm?.resolution_config as { scope?: { brand_scope_by_mailbox?: Record<string, string[]> } } | null)?.scope?.brand_scope_by_mailbox ?? {};

  const { data: labels } = await admin.schema("debtor").from("email_labels").select("email_id, source_mailbox, conversation_id").is("customer_account_id", null);
  let rows = (labels ?? []) as Array<{ email_id: string; source_mailbox: string | null }>;
  if (limit && limit > 0) rows = rows.slice(0, limit);

  let processed = 0, noId = 0, noSettings = 0, autoSelf = 0, autoNum = 0, suggest = 0, errors = 0;
  const byKind = new Map<string, number>();
  const emitted: Sample[] = [];
  console.log(`# Phase 91 AUTO-tier verdict runner (READ-ONLY, poll-only)\n`);
  console.log(`**Unresolved population:** ${(labels ?? []).length}${limit ? ` (processing ${rows.length})` : ""}\n`);

  for (const label of rows) {
    const mbx = label.source_mailbox ?? "";
    const st = settings.get(mbx);
    if (!st || !st.nxt_database || !st.brand_id) { noSettings++; continue; }
    const { data: e } = await admin.schema("email_pipeline").from("emails").select("id, subject, body_text, body_full_text, source").eq("id", label.email_id).maybeSingle();
    if (!e) { noSettings++; continue; }
    const body = selectBodyText(e.source ?? null, e.body_full_text ?? null, e.body_text ?? null);
    const saCands = new Set(extractSelfAuthCandidates(e.subject, body).candidates);
    const numCands = new Set(extractNumberCandidates(e.subject ?? "", body ?? "").candidates);
    const allIds = Array.from(new Set([...saCands, ...numCands]));
    if (allIds.length === 0) { noId++; continue; }
    processed++;
    const brandId = st.brand_id;
    const brandScope = brandScopeByMailbox[mbx] ?? [brandId];

    let matches: Match[] = [];
    try {
      const res = await lookupResolveCandidates({ nxt_database: st.nxt_database, brand_id: brandId, environment_id: ENV, identifiers: allIds, brand_scope: brandScope }, "unknown");
      matches = (res.matches ?? []) as Match[];
    } catch (err) {
      errors++;
      console.warn(`[err] ${label.email_id}: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    // self_auth tier (DIRECT party; is_unique_in_scope kept — granularity agrees)
    const sa = matches.filter((m) => SELF_AUTH_KINDS.has(m.identifier_kind) && saCands.has(m.identifier_value_norm) && m.is_unique_in_scope && isAutoEligibleStatus(m.status));
    const saParties = Array.from(new Set(sa.map((m) => m.party_id)));
    if (saParties.length === 1) {
      const w = sa.find((m) => m.party_id === saParties[0])!;
      if (brandOk(w.brand_id, brandId, brandScope)) {
        autoSelf++;
        emitted.push({ email_id: label.email_id, tier: "self_auth", identifier_kind: w.identifier_kind, customer_account_id: stripEnvPrefix(w.party_id, ENV), customer_name: w.party_name, matched_identifiers: Array.from(saCands) });
        continue;
      }
    }
    // number-search tier (ROOT rollup; distinct-root gate)
    const num = matches.filter((m) => NUMBER_KINDS.has(m.identifier_kind) && numCands.has(m.identifier_value_norm) && isAutoEligibleStatus(m.status));
    const rootOf = (m: Match) => m.root_party_id ?? m.party_id;
    const roots = Array.from(new Set(num.map(rootOf)));
    if (roots.length === 1) {
      const w = num.find((m) => rootOf(m) === roots[0])!;
      if (brandOk(w.brand_id, brandId, brandScope)) {
        autoNum++;
        byKind.set(w.identifier_kind, (byKind.get(w.identifier_kind) ?? 0) + 1);
        emitted.push({ email_id: label.email_id, tier: "number_search", identifier_kind: w.identifier_kind, customer_account_id: stripEnvPrefix(roots[0], ENV), customer_name: w.party_name, matched_identifiers: num.map((m) => m.identifier_value_norm) });
        continue;
      }
    }
    suggest++;
  }

  const autoTotal = autoSelf + autoNum;
  const denom = processed; // rows with >=1 identifier that we actually queried
  console.log(`## Distribution\n`);
  console.log(`**Processed (had >=1 identifier):** ${processed}   **No identifier:** ${noId}   **No NXT settings/email:** ${noSettings}   **Lookup errors:** ${errors}`);
  console.log(`**AUTO total:** ${autoTotal}  (${denom ? Math.round((100 * autoTotal) / denom) : 0}% of processed)`);
  console.log(`  - self_auth AUTO:     ${autoSelf}`);
  console.log(`  - number-search AUTO: ${autoNum}  (BINDING gate slice)`);
  console.log(`**SUGGEST:** ${suggest}\n`);
  console.log(`### number-search AUTO by kind`);
  for (const [k, v] of Array.from(byKind.entries()).sort()) console.log(`  - ${k}: ${v}`);

  const out = samplePath ?? "/tmp/auto-verdict-sample.json";
  writeFileSync(out, JSON.stringify(emitted.map((s) => ({ ...s, correct: null })), null, 2));
  console.log(`\n**AUTO sample (${emitted.length}) written to ${out}** — hand-grade \`correct\` true/false, the number-search slice is the gate.`);
}

main().then(() => process.exit(0));
