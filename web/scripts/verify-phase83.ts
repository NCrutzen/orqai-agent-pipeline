#!/usr/bin/env tsx
/**
 * Phase 83 verification harness.
 *
 * Read-only script that gates Phase 83 closure by running four checks against
 * post-deploy Supabase data and emitting a single PASS/FAIL verdict per check.
 *
 * Run:
 *   npx tsx web/scripts/verify-phase83.ts [--days=30] [--sample=20] [--pii-ceiling=0.05]
 *
 * Exits 0 only when V1..V4 all PASS. Exits 1 on any FAIL.
 *
 * Scope:
 *   V1  CONTEXT §1 — body_full_text coverage on FW:/Re: rows  (≥95%, 5% slack matches 83-05 permanent-Graph-404 tolerance)
 *   V2  CONTEXT §2 — body_full_text length > body_unique_text length on ≥95% of the same sample
 *   V3  CONTEXT §3 — D-09 Stage 3 input_size telemetry sanity (runs > 0, median chars > 500)
 *   V4  R-03 PII expansion sanity — Stage 0 injection_suspected false-positive ceiling (default 5%)
 *
 * CONTEXT §4 (≥50% reclassification gate) is NOT verified here — that is Phase 87's deliverable.
 * CONTEXT §5 (direct-debtor non-regression spot-check) is the operator-facing manual gate in
 *  .planning/phases/83-…/83-07-VERIFICATION.md.
 *
 * READ-ONLY contract: this file contains NO insert/update/delete/upsert calls.
 * The acceptance criteria grep gate enforces this; do not introduce writes.
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Load env from web/.env.local when invoked from repo root or from web/.
loadEnv({ path: path.resolve(process.cwd(), "web/.env.local") });
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

interface Args {
  days: number;
  sample: number;
  piiCeiling: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { days: 30, sample: 20, piiCeiling: 0.05 };
  for (const arg of argv) {
    const m = arg.match(/^--([a-z-]+)=(.+)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === "days") out.days = Number(v);
    else if (k === "sample") out.sample = Number(v);
    else if (k === "pii-ceiling") out.piiCeiling = Number(v);
  }
  return out;
}

function makeClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see web/.env.local).",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function printSql(label: string, sql: string): void {
  console.log(`\n--- ${label} (SQL) ---`);
  console.log(sql.trim());
  console.log("--- end SQL ---\n");
}

interface SampleRow {
  id: string;
  source_id: string | null;
  mailbox: string | null;
  subject: string | null;
  body_full_text: string | null;
  body_unique_text: string | null;
}

async function fetchFwReSample(
  supabase: SupabaseClient,
  days: number,
  sample: number,
): Promise<SampleRow[]> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const sql = `
    SELECT id, source_id, mailbox, subject, body_full_text, body_unique_text
    FROM email_pipeline.emails
    WHERE received_at >= '${cutoff}'
      AND (subject ILIKE 'FW:%' OR subject ILIKE 'Re:%')
    ORDER BY received_at DESC
    LIMIT ${sample};
  `;
  printSql("V1+V2 FW:/Re: sample", sql);

  const { data, error } = await supabase
    .schema("email_pipeline")
    .from("emails")
    .select("id, source_id, mailbox, subject, body_full_text, body_unique_text")
    .gte("received_at", cutoff)
    .or("subject.ilike.FW:%,subject.ilike.Re:%")
    .order("received_at", { ascending: false })
    .limit(sample);
  if (error) throw new Error(`V1/V2 query failed: ${error.message}`);
  return (data ?? []) as SampleRow[];
}

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

function checkV1(rows: SampleRow[], sample: number): CheckResult {
  const withBody = rows.filter(
    (r) => r.body_full_text !== null && r.body_full_text !== "",
  );
  const failing = rows.filter(
    (r) => r.body_full_text === null || r.body_full_text === "",
  );
  const required = Math.ceil(0.95 * sample);
  const pass = rows.length > 0 && withBody.length >= required;
  const detail = `V1 body coverage: ${withBody.length}/${rows.length} rows have body_full_text. Required >=95% (>=${required}/${sample}). ${pass ? "PASS" : "FAIL"}.`;
  console.log(detail);
  if (failing.length > 0) {
    const ids = failing.map((r) => r.id).join(", ");
    console.log(`V1 failing row_ids: ${ids}`);
    console.log(
      "  Cross-reference with 83-05-SUMMARY.md permanent-Graph-404 list before treating as a regression.",
    );
  }
  return { name: "V1", pass, detail };
}

function checkV2(rows: SampleRow[], sample: number): CheckResult {
  const wider = rows.filter((r) => {
    const fullLen = (r.body_full_text ?? "").length;
    const uniqueLen = (r.body_unique_text ?? "").length;
    return fullLen > uniqueLen;
  });
  const required = Math.ceil(0.95 * sample);
  const pass = rows.length > 0 && wider.length >= required;
  const detail = `V2 thread expansion: ${wider.length}/${rows.length} rows have full > unique. Required >=95% (>=${required}/${sample}). ${pass ? "PASS" : "FAIL"}.`;
  console.log(detail);
  return { name: "V2", pass, detail };
}

interface CoordinatorRow {
  decision_details: { input_size?: { input_chars?: number; truncated?: boolean } } | null;
}

async function checkV3(supabase: SupabaseClient): Promise<CheckResult> {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const sql = `
    SELECT
      count(*) AS runs,
      count(*) FILTER (WHERE (decision_details->'input_size'->>'truncated')::boolean = true) AS truncated_runs,
      percentile_disc(0.5) WITHIN GROUP (ORDER BY (decision_details->'input_size'->>'input_chars')::int) AS median_chars
    FROM coordinator_runs
    WHERE created_at >= now() - interval '24 hours';
  `;
  printSql("V3 coordinator_runs telemetry", sql);

  // We don't have a generic SQL RPC; pull rows and aggregate in JS to stay
  // within the standard REST surface.
  const { data, error } = await supabase
    .from("coordinator_runs")
    .select("decision_details")
    .gte("created_at", cutoff);
  if (error) throw new Error(`V3 query failed: ${error.message}`);
  const rows = (data ?? []) as CoordinatorRow[];
  const inputChars: number[] = [];
  let truncated = 0;
  for (const r of rows) {
    const sz = r.decision_details?.input_size;
    if (!sz) continue;
    if (typeof sz.input_chars === "number") inputChars.push(sz.input_chars);
    if (sz.truncated === true) truncated++;
  }
  inputChars.sort((a, b) => a - b);
  const median =
    inputChars.length === 0
      ? 0
      : inputChars[Math.floor((inputChars.length - 1) / 2)];
  const pass = rows.length > 0 && median > 500;
  const detail = `V3 telemetry: runs=${rows.length}, truncated_runs=${truncated}, median_input_chars=${median}. Required runs>0 AND median>500. ${pass ? "PASS" : "FAIL"}.`;
  console.log(detail);
  return { name: "V3", pass, detail };
}

interface AutomationRun {
  result: { stage?: string; verdict?: string } | null;
}

async function checkV4(
  supabase: SupabaseClient,
  ceiling: number,
): Promise<CheckResult> {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const sql = `
    SELECT
      count(*) AS stage0_runs,
      count(*) FILTER (WHERE result->>'verdict' = 'injection_suspected') AS suspected
    FROM automation_runs
    WHERE automation IN ('debtor-email-review','sales-email-review')
      AND result->>'stage' = 'safety_check'
      AND completed_at >= now() - interval '24 hours';
  `;
  printSql("V4 Stage 0 PII false-positive sanity", sql);

  const { data, error } = await supabase
    .from("automation_runs")
    .select("result")
    .in("automation", ["debtor-email-review", "sales-email-review"])
    .gte("completed_at", cutoff);
  if (error) throw new Error(`V4 query failed: ${error.message}`);
  const rows = (data ?? []) as AutomationRun[];
  const stage0 = rows.filter((r) => r.result?.stage === "safety_check");
  const suspected = stage0.filter(
    (r) => r.result?.verdict === "injection_suspected",
  );
  const ratio = stage0.length === 0 ? 0 : suspected.length / stage0.length;
  const pct = (ratio * 100).toFixed(2);
  const ceilingPct = (ceiling * 100).toFixed(2);
  // If stage0 traffic is zero in the 24h window, we cannot evaluate — flag as FAIL
  // (the operator should expand --days or wait for traffic before signing off).
  const pass = stage0.length > 0 && ratio <= ceiling;
  const detail = `V4 PII expansion: ${suspected.length}/${stage0.length} (${pct}%) Stage 0 injection_suspected. Ceiling ${ceilingPct}%. ${pass ? "PASS" : "FAIL"}.`;
  console.log(detail);
  if (stage0.length === 0) {
    console.log(
      "  V4 NOTE: no Stage 0 runs found in the last 24h — re-run when traffic exists, or widen the lookback in a follow-up.",
    );
  }
  return { name: "V4", pass, detail };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `Phase 83 verification harness — days=${args.days} sample=${args.sample} pii-ceiling=${args.piiCeiling}`,
  );
  console.log("Read-only: this script issues SELECTs only.\n");

  const supabase = makeClient();

  const results: CheckResult[] = [];

  // V1 + V2 share the same sample.
  const sampleRows = await fetchFwReSample(supabase, args.days, args.sample);
  results.push(checkV1(sampleRows, args.sample));
  results.push(checkV2(sampleRows, args.sample));

  // V3.
  results.push(await checkV3(supabase));

  // V4.
  results.push(await checkV4(supabase, args.piiCeiling));

  console.log("\n=== Phase 83 verification summary ===");
  for (const r of results) {
    console.log(`  ${r.name}: ${r.pass ? "PASS" : "FAIL"}`);
  }
  const allPass = results.every((r) => r.pass);
  console.log(`Overall: ${allPass ? "PASS" : "FAIL"}`);
  console.log(
    "\nReminder: Phase 87 retro-classification covers the >=50% reclassification gate (CONTEXT §4).",
  );
  console.log(
    "Reminder: CONTEXT §5 (direct-debtor non-regression spot-check) is a manual gate — see 83-07-VERIFICATION.md.",
  );

  process.exit(allPass ? 0 : 1);
}

// Only run when invoked as a script (not when imported by tests).
if (require.main === module) {
  main().catch((err) => {
    console.error("Verification harness crashed:", err);
    process.exit(1);
  });
}

export { parseArgs, checkV1, checkV2, fetchFwReSample };
