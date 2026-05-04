#!/usr/bin/env tsx
/**
 * Phase 65 regression backfill (RESEARCH OQ5 + CONTEXT Claude's Discretion).
 *
 * Re-runs the new v2 coordinator (debtor-intent-agent v2 with ranked output)
 * over recent production debtor-email rows from public.agent_runs, and
 * compares the v2 top-1 intent against the v1 single-label intent already
 * stored on each row. Produces a markdown report that confirms (or
 * contradicts) the ~80% single-shot success criterion (CORD-04).
 *
 * Usage:
 *   cd /Users/nickcrutzen/Developer/agent-workforce
 *   tsx scripts/phase-65-regression-backfill.ts --limit 200 --days 14
 *
 * Env (loaded from web/.env.local — see loadEnvLocal below):
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - ORQ_API_KEY
 *
 * The script is read-only against production Supabase data (does NOT write to
 * coordinator_runs or trigger any Inngest events). It does invoke the Orq
 * debtor-intent-agent v2 once per sampled row → real LLM cost. Default
 * --limit 200 throttled at 5 req/s (~40s wall clock, bounded cost).
 *
 * Acceptance gate (per Plan 65-05): >=70% top-1 agreement (sanity) AND
 * >=70% single_shot rate (loose lower bound for the CORD-04 ~80% target).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// We load Phase-65 production code directly (path alias `@/` is configured in
// web/tsconfig.json — outside that compile unit we must use relative paths).
import { invokeIntentAgent } from "../web/lib/automations/debtor-email/triage/invoke-intent";
import {
  evaluateEscalationGate,
  type EscalationDecision,
} from "../web/lib/automations/debtor-email/coordinator/escalation-gate";
import { loadSwarmCategories } from "../web/lib/swarms/registry";
import type { Entity } from "../web/lib/automations/debtor-email/triage/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Env loader (web/.env.local, no dotenv dep — minimal parser).
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvLocal();

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const argFlag = (k: string, def: string): string => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const LIMIT = parseInt(argFlag("limit", "200"), 10);
const DAYS = parseInt(argFlag("days", "14"), 10);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Comparison {
  email_id: string;
  agent_run_id: string;
  v1_intent: string | null;
  v1_confidence: string | null;
  v2_top1_intent: string;
  v2_top1_confidence: string;
  v2_ranked_count: number;
  agreement: boolean;
  escalation: EscalationDecision;
}

interface AgentRunRow {
  id: string;
  email_id: string;
  entity: string | null;
  inngest_run_id: string | null;
  intent: string | null;
  confidence: string | null;
  intent_version: string | null;
  tool_outputs: unknown;
  created_at: string;
}

interface EmailRow {
  id: string;
  subject: string | null;
  body_text: string | null;
  sender_email: string | null;
  sender_name: string | null;
  mailbox: string | null;
  received_at: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function deriveSenderDomain(senderEmail: string | null): string {
  if (!senderEmail) return "unknown";
  const at = senderEmail.indexOf("@");
  return at >= 0 ? senderEmail.slice(at + 1) : "unknown";
}

function escalationLabel(d: EscalationDecision): string {
  return d.kind === "single_shot" ? "single_shot" : `orchestrator/${d.reason}`;
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
  if (!process.env.ORQ_API_KEY) {
    throw new Error("ORQ_API_KEY must be set (loaded from web/.env.local)");
  }

  const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const since = new Date(Date.now() - DAYS * 86400_000).toISOString();
  console.log(
    `[regression] querying agent_runs swarm_type=debtor-email since=${since} limit=${LIMIT}`,
  );

  const { data: rows, error } = await admin
    .from("agent_runs")
    .select(
      "id, email_id, entity, inngest_run_id, intent, confidence, intent_version, tool_outputs, created_at",
    )
    .eq("swarm_type", "debtor-email")
    .gte("created_at", since)
    .not("intent", "is", null)
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (error) throw new Error(`agent_runs select: ${error.message}`);
  const candidates = (rows ?? []) as AgentRunRow[];
  console.log(`[regression] candidate rows: ${candidates.length}`);

  // Bulk-load corresponding email bodies from email_pipeline.emails.
  const emailIds = Array.from(new Set(candidates.map((r) => r.email_id)));
  const emailMap = new Map<string, EmailRow>();
  if (emailIds.length > 0) {
    // Chunk for safety (URL-length on .in()).
    for (let i = 0; i < emailIds.length; i += 500) {
      const chunk = emailIds.slice(i, i + 500);
      const { data: emails, error: emailErr } = await admin
        .schema("email_pipeline")
        .from("emails")
        .select("id, subject, body_text, sender_email, sender_name, mailbox, received_at")
        .in("id", chunk);
      if (emailErr) {
        console.warn(`[regression] email chunk ${i} error: ${emailErr.message}`);
        continue;
      }
      for (const e of (emails ?? []) as EmailRow[]) emailMap.set(e.id, e);
    }
  }
  console.log(`[regression] loaded ${emailMap.size} email bodies`);

  const categories = await loadSwarmCategories(admin, "debtor-email");
  if (categories.length === 0) {
    throw new Error("no swarm_categories rows for debtor-email — check Plan 01 seed");
  }

  const results: Comparison[] = [];
  let skipped = 0;
  let processed = 0;

  for (const r of candidates) {
    const email = emailMap.get(r.email_id);
    if (!email || !email.body_text) {
      skipped++;
      continue;
    }
    // v1 prediction is on agent_runs.intent directly (back-compat column).
    // tool_outputs.intent_first_pass MAY exist if the row was already re-processed by v2;
    // we always compare against the persisted top-1 (`intent` column) for a stable signal.
    const v1Intent = r.intent;
    const v1Confidence = r.confidence;

    try {
      const { output } = await invokeIntentAgent({
        email_id: r.email_id,
        // Use a synthetic inngest_run_id — agent_runs.inngest_run_id may be empty
        // for legacy rows. Idempotency cache is keyed on email_id+intent_version
        // only; this field is only logged in Orq variables for traces.
        inngest_run_id: r.inngest_run_id ?? `regression-${r.id}`,
        subject: email.subject ?? "",
        body_text: email.body_text,
        sender_email: email.sender_email ?? "unknown@unknown",
        sender_domain: deriveSenderDomain(email.sender_email),
        mailbox: email.mailbox ?? "unknown",
        entity: ((r.entity ?? "smeba") as Entity),
        received_at: email.received_at ?? r.created_at,
      });
      const decision = evaluateEscalationGate(output, categories);
      results.push({
        email_id: r.email_id,
        agent_run_id: r.id,
        v1_intent: v1Intent,
        v1_confidence: v1Confidence,
        v2_top1_intent: output.ranked[0].intent,
        v2_top1_confidence: output.ranked[0].confidence,
        v2_ranked_count: output.ranked.length,
        agreement: v1Intent === output.ranked[0].intent,
        escalation: decision,
      });
      processed++;
      if (processed % 25 === 0) {
        console.log(`[regression] processed=${processed} skipped=${skipped}`);
      }
    } catch (err) {
      console.warn(
        `[regression] skip ${r.email_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      skipped++;
    }
    // Throttle to ~5 req/s to respect Orq rate limits.
    await new Promise((res) => setTimeout(res, 200));
  }

  // ---- Aggregate ---------------------------------------------------------
  const total = results.length;
  const agree = results.filter((r) => r.agreement).length;
  const single = results.filter((r) => r.escalation.kind === "single_shot").length;
  const orch = total - single;
  const reasonHist: Record<string, number> = {};
  for (const r of results) {
    if (r.escalation.kind === "orchestrator") {
      reasonHist[r.escalation.reason] = (reasonHist[r.escalation.reason] ?? 0) + 1;
    }
  }

  const agreementPct = total ? (agree / total) * 100 : 0;
  const singlePct = total ? (single / total) * 100 : 0;
  const agreementGate = total > 0 && agreementPct >= 70;
  const singleGate = total > 0 && singlePct >= 70;

  const md = `# Phase 65 Regression Backfill Report

**Generated:** ${new Date().toISOString()}
**Sample window:** last ${DAYS} days
**Limit (CLI):** ${LIMIT}
**Candidate rows queried:** ${candidates.length}
**Successfully processed:** ${total}
**Skipped (missing body or LLM error):** ${skipped}

## Top-1 Agreement (v1 single-label vs v2 ranked[0].intent)

- **Total:** ${total}
- **Agreement:** ${agree} (${agreementPct.toFixed(1)}%)
- **Disagreement:** ${total - agree}

## Escalation Distribution (CORD-04 success criterion: ~80% single_shot)

- **single_shot:** ${single} (${singlePct.toFixed(1)}%)
- **orchestrator:** ${orch} (${total ? ((orch / total) * 100).toFixed(1) : "0.0"}%)

### Escalation reason breakdown

${
  Object.keys(reasonHist).length === 0
    ? "(none — every sample stayed on the single-shot path)"
    : Object.entries(reasonHist)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `- \`${k}\`: ${v}`)
        .join("\n")
}

## Disagreement detail (top 20)

${
  results.filter((r) => !r.agreement).slice(0, 20).length === 0
    ? "(none — full agreement)"
    : results
        .filter((r) => !r.agreement)
        .slice(0, 20)
        .map(
          (r) =>
            `- email=\`${r.email_id}\`: v1=\`${r.v1_intent}\` v2=\`${r.v2_top1_intent}\` (v2 ranked_count=${r.v2_ranked_count}, escalation=${escalationLabel(r.escalation)})`,
        )
        .join("\n")
}

## Acceptance Gate

- [${agreementGate ? "x" : " "}] ≥70% top-1 agreement (sanity check)
- [${singleGate ? "x" : " "}] ≥70% single_shot rate (loose lower bound for CORD-04 ~80% target)

${
  total === 0
    ? "**N=0 — no production data sampled. Gate is N/A; manual-emit verification (Task 3) is the substitute evidence.**"
    : agreementGate && singleGate
      ? "**Both gates green. CORD-04 satisfied empirically.**"
      : "**One or both gates failed — investigate before declaring Plan 05 complete.**"
}

## Sample notes

- Source: \`public.agent_runs\` filtered on \`swarm_type='debtor-email'\` AND \`intent IS NOT NULL\` AND \`created_at >= now() - ${DAYS} days\`.
- Email bodies pulled from \`email_pipeline.emails\` (one query per ≤500-id chunk).
- v1 intent compared = \`agent_runs.intent\` column (back-compat top-1, persisted by both v1 and v2 coordinator).
- LLM throttle: ~5 req/s.
- Sampled rows may include some that have ALREADY been re-processed by the live v2 coordinator (Plan 03 in production); those would naturally show 100% agreement and bias the report optimistically. Cross-check with \`intent_version\` distribution in the candidate set if the agreement number looks suspiciously high.
`;

  const reportPath = resolve(
    REPO_ROOT,
    ".planning/phases/65-stage-3-ranked-multi-intent-coordinator/65-regression-report.md",
  );
  writeFileSync(reportPath, md, "utf8");

  // Sidecar JSON with raw rows for downstream tooling.
  const jsonPath = reportPath.replace(/\.md$/, ".json");
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        sample_window_days: DAYS,
        cli_limit: LIMIT,
        candidate_rows: candidates.length,
        processed: total,
        skipped,
        top1_agreement_pct: agreementPct,
        single_shot_pct: singlePct,
        reason_histogram: reasonHist,
        results,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`[regression] wrote ${reportPath}`);
  console.log(`[regression] wrote ${jsonPath}`);
  console.log(
    `[regression] top-1 agreement: ${agreementPct.toFixed(1)}% | single_shot: ${singlePct.toFixed(1)}%`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
