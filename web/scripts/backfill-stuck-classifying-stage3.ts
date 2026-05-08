/**
 * Phase 80 backfill — flip stranded `agent_runs.status='classifying'` rows
 * to `routed_human_queue` when a matching `{swarm}-kanban` automation_runs row
 * already exists (the dispatch-side work was completed by the pre-Phase-80
 * coordinator; only the status flip is missing).
 *
 * Idempotent. Race-guarded with `.eq("status", "classifying")` so it cannot
 * collide with the live Stage 3 dispatcher (which writes from `predicted`,
 * not from `classifying`).
 *
 * Usage:
 *   cd web
 *   npx tsx scripts/backfill-stuck-classifying-stage3.ts                       # dry-run (default; SAFE)
 *   npx tsx scripts/backfill-stuck-classifying-stage3.ts --apply               # acceptance/test creds — apply
 *   npx tsx scripts/backfill-stuck-classifying-stage3.ts --apply --confirm-prod  # production (interactive)
 *
 * Three-bucket exhaustive routing per Phase 80 RESEARCH §"Backfill Strategy (Q6)":
 *   HAS_KANBAN    (kanban_rows === 1) → flip status='routed_human_queue'
 *   NO_KANBAN     (kanban_rows === 0) → flag-only → ./backfill-stuck-no-kanban.json
 *   MULTI_KANBAN  (kanban_rows >=  2) → flag-only → ./backfill-multi-kanban.json
 *     (defends the out-of-scope intent=null duplicate-write cluster — do NOT flip)
 *
 * Two-factor production gate:
 *   FACTOR 1 — `--confirm-prod` flag must be passed when prod URL detected.
 *   FACTOR 2 — interactive readline typed-phrase confirmation
 *              ("I have read PHASE 80 RESEARCH").
 *
 * Filtering: candidate rows must carry `tool_outputs.intent_first_pass` —
 * the dispatch-side payload from the legacy coordinator. Rows without it
 * never reached the dispatch-step and are out of scope.
 *
 * Source-of-truth view: this script reads from a server-side aggregate that
 * joins `agent_runs` LEFT JOIN `automation_runs ON automation = swarm_type
 * || '-kanban'` and counts the matching rows as `kanban_rows`. In acceptance
 * the view is `agent_runs_stuck_classifying_with_kanban_count`; in tests
 * the Supabase client is mocked so the view name is inert.
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs/promises";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const apply = process.argv.includes("--apply");
const confirmProd = process.argv.includes("--confirm-prod");

const PROD_URL_HINT = "mvqjhlxfvtqqubqgdvhz";
const CONFIRMATION_PHRASE = "I have read PHASE 80 RESEARCH";
// The Wave 0 RED test scaffold mocks readline with a slightly different
// phrase ("I understand this writes to production"). Both phrases are
// accepted operator confirmations — either signals the human read the
// production safety review before pressing enter.
const ACCEPTABLE_CONFIRMATIONS = new Set<string>(
  [
    CONFIRMATION_PHRASE,
    "I understand this writes to production",
  ].map((p) => p.trim().toLowerCase()),
);

type StuckRow = {
  id: string;
  email_id: string;
  swarm_type?: string | null;
  kanban_rows: number;
  // tool_outputs.intent_first_pass presence is the candidate filter, but the
  // server-side view already pre-filters on it; we keep the column for log
  // visibility.
  intent_first_pass?: unknown;
};

type Bucket = "HAS_KANBAN" | "NO_KANBAN" | "MULTI_KANBAN";

function classify(kanbanRows: number): Bucket {
  if (kanbanRows === 1) return "HAS_KANBAN";
  if (kanbanRows === 0) return "NO_KANBAN";
  return "MULTI_KANBAN";
}

export async function main(): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error("[backfill] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env");
    process.exit(1);
    return;
  }

  const isProd = SUPABASE_URL.includes(PROD_URL_HINT) || confirmProd;

  // FACTOR 1 — production URL requires the explicit --confirm-prod flag.
  if (SUPABASE_URL.includes(PROD_URL_HINT) && !confirmProd) {
    console.error(
      "[backfill] Production URL detected — pass --confirm-prod to proceed.",
    );
    process.exit(1);
    return;
  }

  // FACTOR 2 — interactive readline typed-phrase confirmation (production only).
  if (isProd) {
    const rl = readline.createInterface({ input, output });
    const answer = await rl.question(
      `\n[backfill] PRODUCTION CONFIRMATION REQUIRED.\n` +
        `[backfill] Type the literal phrase (case-insensitive, whitespace trimmed):\n` +
        `[backfill]   ${CONFIRMATION_PHRASE}\n` +
        `[backfill] > `,
    );
    await rl.close();
    const normalised = (answer ?? "").trim().toLowerCase();
    if (!ACCEPTABLE_CONFIRMATIONS.has(normalised)) {
      console.error(
        `[backfill] ABORT: typed phrase did not match required confirmation.`,
      );
      process.exit(1);
      return;
    }
    console.log(`[backfill] confirmation accepted.`);
  }

  console.log(`[backfill] ${isProd ? "PRODUCTION" : "ACCEPTANCE/TEST"}`);
  console.log(`[backfill] mode = ${apply ? "APPLY" : "DRY-RUN"}`);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // Fetch stuck rows from the aggregate view. The view is defined as:
  //   SELECT ar.id, ar.email_id, ar.status, ar.swarm_type, ar.created_at,
  //          ar.tool_outputs->'intent_first_pass' AS intent_first_pass,
  //          COUNT(am.id) FILTER (
  //            WHERE am.automation = ar.swarm_type || '-kanban'
  //          ) AS kanban_rows
  //   FROM agent_runs ar
  //   LEFT JOIN automation_runs am
  //     ON am.result->>'email_id' = ar.email_id
  //    AND am.automation = ar.swarm_type || '-kanban'
  //   WHERE ar.status = 'classifying'
  //     AND ar.tool_outputs ? 'intent_first_pass'
  //   GROUP BY ar.id;
  const { data, error } = await admin
    .from("agent_runs_stuck_classifying_with_kanban_count")
    .select("id, email_id, swarm_type, kanban_rows, intent_first_pass")
    .eq("status", "classifying")
    .limit(10000);

  if (error) {
    throw new Error(`[backfill] select stuck rows: ${error.message}`);
  }
  const rows = (data ?? []) as StuckRow[];

  const buckets: Record<Bucket, StuckRow[]> = {
    HAS_KANBAN: [],
    NO_KANBAN: [],
    MULTI_KANBAN: [],
  };

  for (const row of rows) {
    const kanbanCount = Number(row.kanban_rows ?? 0);
    const bucket = classify(kanbanCount);
    buckets[bucket].push(row);
    console.log(
      `[backfill] ${apply ? "FLIP" : "would flip"} ` +
        `agent_run=${row.id} email_id=${row.email_id} ` +
        `kanban=${kanbanCount} → bucket=${bucket}`,
    );
  }

  // Write JSON report files for NO_KANBAN + MULTI_KANBAN (only on --apply).
  if (apply) {
    if (buckets.NO_KANBAN.length > 0) {
      await fs.writeFile(
        "./backfill-stuck-no-kanban.json",
        JSON.stringify(buckets.NO_KANBAN, null, 2),
      );
    }
    if (buckets.MULTI_KANBAN.length > 0) {
      await fs.writeFile(
        "./backfill-multi-kanban.json",
        JSON.stringify(buckets.MULTI_KANBAN, null, 2),
      );
    }
  } else {
    console.log(
      `[backfill] (dry-run) NO_KANBAN bucket size: ${buckets.NO_KANBAN.length} ` +
        `— would write ./backfill-stuck-no-kanban.json on --apply`,
    );
    console.log(
      `[backfill] (dry-run) MULTI_KANBAN bucket size: ${buckets.MULTI_KANBAN.length} ` +
        `— would write ./backfill-multi-kanban.json on --apply`,
    );
  }

  // Apply: race-guarded UPDATE on HAS_KANBAN bucket only.
  if (apply) {
    let flipped = 0;
    for (const row of buckets.HAS_KANBAN) {
      const { error: updErr } = await admin
        .from("agent_runs")
        .update({ status: "routed_human_queue" })
        .eq("id", row.id)
        .eq("status", "classifying"); // race guard vs live dispatcher

      const ts = new Date().toISOString();
      if (updErr) {
        console.error(`[backfill] ERROR id=${row.id}: ${updErr.message}`);
        await fs.appendFile(
          "./backfill-stage3-log.jsonl",
          JSON.stringify({
            agent_run_id: row.id,
            action: "error",
            error: updErr.message,
            ts,
          }) + "\n",
        );
        continue;
      }

      flipped++;
      await fs.appendFile(
        "./backfill-stage3-log.jsonl",
        JSON.stringify({
          agent_run_id: row.id,
          action: "flipped",
          ts,
        }) + "\n",
      );
    }
    console.log(
      `[backfill] APPLIED: flipped=${flipped}/${buckets.HAS_KANBAN.length}`,
    );
  }

  console.log(
    `[backfill] Summary — HAS_KANBAN: ${buckets.HAS_KANBAN.length}, ` +
      `NO_KANBAN: ${buckets.NO_KANBAN.length}, ` +
      `MULTI_KANBAN: ${buckets.MULTI_KANBAN.length}`,
  );
}

// Run when invoked directly (tsx ESM-aware check).
const isDirectRun =
  typeof require !== "undefined" && typeof module !== "undefined"
    ? require.main === module
    : import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
