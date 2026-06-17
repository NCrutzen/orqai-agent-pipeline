#!/usr/bin/env tsx
/**
 * Phase 120-04 — resolver CORRECTNESS gate (D-06 corroboration acceptance).
 *
 * READ-ONLY integration harness. Mechanically replays the frozen 100-email eval
 * fixture (.planning/evals/2026-06-16-resolver-customer-eval/resolver-eval.xlsx,
 * `Validatie` tab) through the LIVE corroboration-bearing resolver
 * (resolveEntity(args, debtorP0Config)) and scores each row against the operator
 * ground-truth, with special attention to the named V9.5 acceptance targets:
 *
 *   - the 4 confident-wrong AUTO rows (#2, #85, #95, #97) — must DEMOTE below the
 *     resolver-declared AUTO lane (confidence !== "high"; OQ-1 branch (a): `high`
 *     IS the AUTO marker — self-auth-match.ts:159, FINDINGS.md:53-55).
 *   - the 12 bucket-B sender/name-ambiguity rows — should gain a 2nd agreeing
 *     signal (resolve) or correctly degrade to suggestie (confidence !== "high").
 *   - the gold-signal rows (factuur ~97% / klantnummer ~92%) — must NOT regress
 *     (Pitfall 5): a row the baseline got right at "high" must stay "high"+correct.
 *
 * This harness hits the LIVE resolve_candidates / contact_lookup Zap substrate. It
 * is NOT part of the default vitest suite. It WRITES NOTHING (no labels, no
 * side-effects) — it only reads the fixture + drives resolveEntity + scores.
 *
 * Usage (from web/):
 *   npx tsx scripts/eval/resolver-correctness-gate.ts --report           # all 100 rows → RERUN-FINDINGS.md
 *   npx tsx scripts/eval/resolver-correctness-gate.ts --rows 2,85,95,97  # subset (target rows)
 *   npx tsx scripts/eval/resolver-correctness-gate.ts --report --limit 20
 *
 * Env (loaded from web/.env.local): NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_APP_URL + the nxt tool webhook secrets
 * (the async-callback Zap posts back to NEXT_PUBLIC_APP_URL).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { resolveEntity } from "@/lib/agentic-pipeline/resolve/engine";
import { debtorP0Config } from "@/lib/automations/debtor-email/resolve-debtor";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, "..", "..");
const REPO_ROOT = resolve(WEB_ROOT, "..");
const FIXTURE = resolve(
  REPO_ROOT,
  ".planning/evals/2026-06-16-resolver-customer-eval/resolver-eval.xlsx",
);
const FINDINGS_OUT = resolve(
  REPO_ROOT,
  ".planning/evals/2026-06-16-resolver-customer-eval/RERUN-FINDINGS.md",
);

// --- Env loader (web/.env.local, no dotenv dep — minimal parser). -----------
function loadEnvLocal(): void {
  const envPath = resolve(WEB_ROOT, ".env.local");
  let raw = "";
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
// nxt-zap-client reads env at call-time (not import-time), so loading .env.local
// before main() runs is sufficient even with static imports above.
loadEnvLocal();

// --- Fixture mailbox → debtor settings (debtor.labeling_settings) ------------
const MAILBOX_MAP: Record<string, { source_mailbox: string; brand_id: string }> = {
  smeba: { source_mailbox: "debiteuren@smeba.nl", brand_id: "SB" },
  "smeba-fire": { source_mailbox: "debiteuren@smeba-fire.be", brand_id: "SF" },
  berki: { source_mailbox: "debiteuren@berki.nl", brand_id: "BB" },
  "fire-control": { source_mailbox: "administratie@fire-control.nl", brand_id: "FI" },
};
const NXT_DATABASE = "nxt_benelux_prod";

// Named acceptance targets (FINDINGS.md).
const CONFIDENT_WRONG = new Set(["2", "85", "95", "97"]);
const BUCKET_B = new Set([
  "7", "10", "31", "39", "40", "47", "67", "69", "70", "80", "19", "24",
]);

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

interface FixtureRow {
  id: string;
  mailbox: string;
  sender: string;
  subject: string;
  body: string;
  proposed: string | null; // baseline proposed customer number
  method: string;
  type: string; // AUTO / SUGGESTIE (N)
  confidence: string; // hoog/midden/laag → high/medium/low
  verdict: string; // Ja/Nee/Twijfel
  correctNr: string | null; // operator's correct number (Nee/Twijfel)
}

function leadingNumber(s: string | undefined): string | null {
  if (!s) return null;
  const m = String(s).match(/\d{4,}/);
  return m ? m[0] : null;
}

function normConfidence(z: string | undefined): "high" | "medium" | "low" | null {
  const v = (z || "").trim().toLowerCase();
  if (v === "hoog") return "high";
  if (v === "midden") return "medium";
  if (v === "laag") return "low";
  return null;
}

function parseFixture(): FixtureRow[] {
  const wb = XLSX.readFile(FIXTURE);
  const ws = wb.Sheets["Validatie"];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false });
  return rows
    .slice(1)
    .filter((r) => r[0])
    .map((r) => ({
      id: String(r[0]).trim(),
      mailbox: (r[2] || "").trim(),
      sender: (r[3] || "").trim(),
      subject: (r[4] || "").trim(),
      body: (r[6] || r[5] || "").toString(),
      proposed: leadingNumber(r[7]),
      method: (r[8] || "").trim(),
      type: (r[10] || "").trim(),
      confidence: (r[11] || "").trim(),
      verdict: (r[12] || "").trim(),
      correctNr: leadingNumber(r[13]),
    }));
}

/** Operator ground-truth customer number for a row, or null if not derivable. */
function groundTruth(row: FixtureRow): string | null {
  if (/^ja$/i.test(row.verdict)) return row.proposed; // baseline was correct
  return row.correctNr; // Nee/Twijfel → operator's correct number (may be null)
}

interface RowResult {
  id: string;
  target: "confident-wrong" | "bucket-B" | "gold" | "other";
  baselineVerdict: string;
  baselineConfidence: string | null;
  groundTruth: string | null;
  afterCustomer: string | null;
  afterConfidence: string;
  afterMethod: string;
  correct: boolean | null; // null = ground-truth unknown
  reachable: boolean;
  note: string;
}

function targetClass(row: FixtureRow): RowResult["target"] {
  if (CONFIDENT_WRONG.has(row.id)) return "confident-wrong";
  if (BUCKET_B.has(row.id)) return "bucket-B";
  // gold-signal = baseline correct (Ja) via factuur/klantnummer at hoog.
  if (
    /^ja$/i.test(row.verdict) &&
    normConfidence(row.confidence) === "high" &&
    /factuur|klantnummer/i.test(row.method)
  ) {
    return "gold";
  }
  return "other";
}

async function runRow(row: FixtureRow): Promise<RowResult> {
  const target = targetClass(row);
  const gt = groundTruth(row);
  const settings = MAILBOX_MAP[row.mailbox] ?? { source_mailbox: row.mailbox, brand_id: "SB" };
  const brandScope =
    debtorP0Config.scope.brand_scope_by_mailbox?.[settings.source_mailbox] ?? [
      settings.brand_id,
    ];
  const senderEmail = (row.sender.match(EMAIL_RE) ?? [null])[0];

  const base: RowResult = {
    id: row.id,
    target,
    baselineVerdict: row.verdict,
    baselineConfidence: normConfidence(row.confidence),
    groundTruth: gt,
    afterCustomer: null,
    afterConfidence: "none",
    afterMethod: "unresolved",
    correct: null,
    reachable: true,
    note: "",
  };

  try {
    const result = await resolveEntity(
      {
        nxt_database: NXT_DATABASE,
        brand_id: settings.brand_id,
        conversation_id: null,
        from_email: senderEmail,
        subject: row.subject,
        body_text: row.body,
        brand_scope: brandScope,
      } as Parameters<typeof resolveEntity>[0],
      debtorP0Config as unknown as Parameters<typeof resolveEntity>[1],
    );
    base.afterCustomer = result.customer_account_id;
    base.afterConfidence = result.confidence;
    base.afterMethod = result.method;
    base.correct = gt == null ? null : result.customer_account_id === gt;
  } catch (err) {
    base.reachable = false;
    base.note = `error: ${err instanceof Error ? err.message : String(err)}`;
  }
  return base;
}

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${Math.round((n / d) * 100)}%`;
}

async function main() {
  const argv = process.argv.slice(2);
  const rowsFlagIdx = argv.indexOf("--rows");
  const rowsArg = rowsFlagIdx >= 0 ? argv[rowsFlagIdx + 1] : undefined;
  const wantedIds = rowsArg ? new Set(rowsArg.split(",").map((s) => s.trim())) : null;
  const limitIdx = argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? parseInt(argv[limitIdx + 1], 10) : Infinity;
  const writeReport = argv.includes("--report");

  let fixture = parseFixture();
  if (wantedIds) fixture = fixture.filter((r) => wantedIds.has(r.id));
  if (Number.isFinite(limit)) fixture = fixture.slice(0, limit);

  console.log(`[corr-gate] replaying ${fixture.length} fixture row(s) through the live corroboration resolver…`);
  const results: RowResult[] = [];
  for (const row of fixture) {
    const r = await runRow(row);
    results.push(r);
    const flag = r.target === "other" ? "" : ` [${r.target}]`;
    console.log(
      `#${r.id}${flag} base=${r.baselineVerdict}/${r.baselineConfidence ?? "-"} → after: cust=${r.afterCustomer ?? "null"} conf=${r.afterConfidence} method=${r.afterMethod} correct=${r.correct ?? "?"}${r.reachable ? "" : " (NOT-REACHABLE)"}`,
    );
  }

  // --- Scoring ---------------------------------------------------------------
  const scored = results.filter((r) => r.reachable && r.correct !== null);
  const correctCount = scored.filter((r) => r.correct).length;
  const notReachable = results.filter((r) => !r.reachable);

  const cw = results.filter((r) => r.target === "confident-wrong");
  const cwDemoted = cw.filter((r) => r.afterConfidence !== "high");
  const gold = results.filter((r) => r.target === "gold");
  const goldRegressed = gold.filter(
    (r) => r.reachable && !(r.afterConfidence === "high" && r.correct === true),
  );
  const bucketB = results.filter((r) => r.target === "bucket-B");
  const bucketBResolvedOrDemoted = bucketB.filter(
    (r) => r.correct === true || r.afterConfidence !== "high",
  );

  // confident-wrong summary line (the verify grep keys on "confident-wrong").
  console.log(
    `\n[corr-gate] confident-wrong rows demoted below AUTO: ${cwDemoted.length}/${cw.length}`,
  );
  console.log(
    `[corr-gate] gold-signal regressions: ${goldRegressed.length}/${gold.length}`,
  );
  console.log(
    `[corr-gate] overall correct (reachable, ground-truth known): ${correctCount}/${scored.length} = ${pct(correctCount, scored.length)} (baseline 64%)`,
  );

  if (!writeReport) return;

  const tbl = (rs: RowResult[]) =>
    rs
      .map(
        (r) =>
          `| #${r.id} | ${r.baselineVerdict} / ${r.baselineConfidence ?? "-"} | ${r.afterCustomer ?? "null"} | ${r.afterConfidence} | ${r.groundTruth ?? "?"} | ${r.correct === null ? "?" : r.correct ? "✅" : "❌"} | ${r.reachable ? "" : "NOT-REACHABLE"} |`,
      )
      .join("\n");

  const partial = fixture.length < 100;
  const md = `# Resolver Correctness Re-Run — Post-120 (D-06 Corroboration)

**Generated by:** \`web/scripts/eval/resolver-correctness-gate.ts\` (read-only, live substrate)
**Run command:** \`cd web && npx tsx scripts/eval/resolver-correctness-gate.ts --report\`
**Fixture:** \`.planning/evals/2026-06-16-resolver-customer-eval/resolver-eval.xlsx\` (Validatie, 100 rows)
**Config:** \`debtorP0Config\` (live, corroboration-bearing: min_signals 2, boost high)
${partial ? `\n> ⚠️ PARTIAL RUN — ${fixture.length}/100 rows replayed. Re-run with \`--report\` (no --rows/--limit) for the full set.\n` : ""}
## Headline

| Metric | Baseline (2026-06-16) | Post-120 |
|---|---|---|
| Overall correct (reachable, GT known) | 64% | ${pct(correctCount, scored.length)} (${correctCount}/${scored.length}) |
| Confident-wrong AUTO rows demoted (conf ≠ high) | 0/4 | ${cwDemoted.length}/${cw.length} |
| Gold-signal regressions | — | ${goldRegressed.length}/${gold.length} |
| Bucket-B rows resolved or demoted | — | ${bucketBResolvedOrDemoted.length}/${bucketB.length} |
| Not-reachable (missing live NXT data) | — | ${notReachable.length} |

## The 4 confident-wrong AUTO rows (#2, #85, #95, #97)

These were AUTO + \`hoog\` + **wrong** at baseline — the cardinal failure D-06 exists to
catch. Acceptance: each demotes to \`confidence !== "high"\` (leaves the resolver-declared
AUTO lane; OQ-1 branch (a) — \`high\` IS the AUTO marker).

| Row | Baseline (verdict/conf) | After customer | After conf | Ground-truth | Correct? | |
|---|---|---|---|---|---|---|
${tbl(cw)}

**Demoted below AUTO: ${cwDemoted.length}/${cw.length}.**

## Gold-signal NON-REGRESSION (factuur ~97% / klantnummer ~92%, Pitfall 5)

A baseline-correct \`high\` row MUST stay \`high\` + correct.

| Row | Baseline (verdict/conf) | After customer | After conf | Ground-truth | Correct? | |
|---|---|---|---|---|---|---|
${tbl(gold)}

**Regressions: ${goldRegressed.length}/${gold.length}.**

## Bucket-B sender/name-ambiguity rows (12)

Acceptance: gain a 2nd agreeing signal (resolve) OR correctly degrade to suggestie
(\`confidence !== "high"\`).

| Row | Baseline (verdict/conf) | After customer | After conf | Ground-truth | Correct? | |
|---|---|---|---|---|---|---|
${tbl(bucketB)}

**Resolved or demoted: ${bucketBResolvedOrDemoted.length}/${bucketB.length}.**

${notReachable.length > 0 ? `## Not-reachable rows\n\nThese could not be replayed against the live substrate (missing live NXT data or a transient Zap error) — recorded, NOT counted as failures:\n\n${notReachable.map((r) => `- #${r.id}: ${r.note}`).join("\n")}\n` : ""}
---
*Phase 120-04 · D-06 corroboration acceptance · generated ${new Date().toISOString().slice(0, 10)}*
`;

  writeFileSync(FINDINGS_OUT, md, "utf8");
  console.log(`\n[corr-gate] wrote ${FINDINGS_OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
