#!/usr/bin/env tsx
/**
 * Phase 89 shadow-eval (SC-89-03 acceptance harness).
 *
 * Reads public.classifier_rule_telemetry, filters rule_key LIKE 'llm:%',
 * computes wilsonCiLower(n, agree) per row, and prints all (swarm_type,
 * rule_key) pairs that satisfy shouldPromote(n, ci_lo).
 *
 * READ-ONLY. Never writes. Mirrors Phase 65 harness contract.
 *
 * Usage:
 *   cd /Users/nickcrutzen/Developer/Agent\ Workforce
 *   npx tsx scripts/phase-89-shadow-eval.ts
 *
 * Env (loaded from web/.env.local — see loadEnvLocal below):
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * Acceptance (SC-89-03): output must list ≥1 promotable rule_key OR
 * document the pending-accumulation timeline (per 089-06-PUSH-LOG.md: all
 * 839 backfilled rows have human_verdict=NULL, so classifier_rule_telemetry
 * — which filters on human_verdict IS NOT NULL — currently surfaces zero
 * llm:* rows; promotability is gated on operator retro-review).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Path alias `@/` is configured in web/tsconfig.json — outside that compile
// unit we must use relative paths.
import { wilsonCiLower, shouldPromote } from "../web/lib/classifier/wilson";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Env loader (web/.env.local, no dotenv dep — minimal parser).
// Copied verbatim from scripts/phase-65-regression-backfill.ts.
// ---------------------------------------------------------------------------
function loadEnvLocal(): void {
  const envPath = resolve(REPO_ROOT, "web/.env.local");
  let raw: string;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvLocal();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TelemetryRow {
  swarm_type: string;
  rule_key: string;
  n: number;
  agree: number;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (loaded from web/.env.local)",
    );
  }

  const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await admin
    .from("classifier_rule_telemetry")
    .select("swarm_type, rule_key, n, agree")
    .like("rule_key", "llm:%");
  if (error) throw new Error(`telemetry load failed: ${error.message}`);

  const rows = (data ?? []) as TelemetryRow[];

  console.log("# Phase 89 Shadow Report\n");
  console.log(`**Generated:** ${new Date().toISOString()}`);
  console.log(`**Source:** public.classifier_rule_telemetry`);
  console.log(`**Filter:** rule_key LIKE 'llm:%'`);
  console.log(`**Rows returned:** ${rows.length}\n`);

  console.log("| swarm_type | rule_key | n | agree | ci_lo | promotable |");
  console.log("|---|---|---|---|---|---|");

  let promotableCount = 0;
  // Sort by n desc for readability.
  const sorted = [...rows].sort((a, b) => b.n - a.n);
  for (const row of sorted) {
    const ci_lo = wilsonCiLower(row.n, row.agree);
    const promote = shouldPromote(row.n, ci_lo);
    if (promote) promotableCount++;
    console.log(
      `| ${row.swarm_type} | ${row.rule_key} | ${row.n} | ${row.agree} | ${ci_lo.toFixed(3)} | ${promote ? "PROMOTE" : ""} |`,
    );
  }

  console.log(`\n**Promotable rule_keys: ${promotableCount}**`);
  console.log(
    `**SC-89-03 acceptance:** ${promotableCount >= 1 ? "PASS — at least one promotable rule_key" : "PENDING — 0 promotable rule_keys on current telemetry. Per 089-06-PUSH-LOG.md, the 839 backfilled agent_runs rows all have human_verdict IS NULL; classifier_rule_telemetry filters on human_verdict IS NOT NULL, so backfilled rows do NOT yet contribute to (n, agree). Mechanism is shipped (Plans 02-06); first promotion happens after operator retro-review accumulates n>=30 verdicts with ci_lo>=0.92 on at least one llm:*:high rule_key (most likely candidate: llm:auto_reply:high with 70 backfilled rows + 32 for llm:payment_admittance:high)."}`,
  );
  // Exit 0 even on PENDING — this is a documented expected state for Phase 89
  // post-backfill. The harness is itself the acceptance artefact (it ran,
  // queried, computed Wilson-CI correctly; the empty result is the truth).
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
