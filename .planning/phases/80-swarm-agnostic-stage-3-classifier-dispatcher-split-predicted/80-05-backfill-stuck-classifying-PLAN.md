---
phase: 80
plan: 05
type: execute
wave: 4
depends_on: ["80-03"]
files_modified:
  - web/scripts/backfill-stuck-classifying-stage3.ts
autonomous: false
requirements: []
must_haves:
  truths:
    - "Backfill script exists, idempotent, with dry-run default and --apply gate"
    - "HAS_KANBAN bucket flips agent_runs.status='classifying' → 'routed_human_queue' with race guard .eq('status','classifying')"
    - "NO_KANBAN bucket writes flagged rows to JSON file, does NOT auto-flip"
    - "MULTI_KANBAN bucket (>=2 kanban rows) flagged-only, does NOT auto-flip (defends out-of-scope duplicate-write cluster)"
    - "Production execution gated by TWO factors: --confirm-prod flag AND interactive readline typed-phrase confirmation (\"I have read PHASE 80 RESEARCH\")"
    - "After execution: zero agent_runs rows in status='classifying' WITH tool_outputs.intent_first_pass AND a matching debtor-email-kanban row"
  artifacts:
    - path: "web/scripts/backfill-stuck-classifying-stage3.ts"
      provides: "One-shot backfill for the 407 stranded debtor-email rows"
      contains: "backfill-stuck-classifying-stage3"
      min_lines: 150
  key_links:
    - from: "backfill script"
      to: "agent_runs.status race-guarded UPDATE"
      via: ".update({status:'routed_human_queue'}).eq('status','classifying')"
      pattern: '\\.eq\\("status", "classifying"\\)'
    - from: "backfill script"
      to: "automation_runs join by email_id"
      via: ".eq('automation', `${swarm_type}-kanban`).eq('result->>email_id', email_id)"
      pattern: "kanban"
---

<objective>
Build the one-shot backfill script that resolves the 407 stranded `agent_runs` rows from before Phase 80 shipped. This is intentionally a separate wave (depends_on 80-03) so the script runs AFTER live traffic is on the new architecture, per RESEARCH §"Backfill execution timing" Open Question #6 recommendation.

Purpose: CONTEXT.md `<specifics>` documents 407 `agent_runs` rows stuck at `status='classifying'` with `tool_outputs.intent_first_pass` populated and a matching `debtor-email-kanban` `automation_runs` row already written — the work succeeded; only the status flip is missing. This script flips them to `routed_human_queue` idempotently, with race-guarded UPDATE so it cannot collide with the new live dispatcher.

Output: One TS script in `web/scripts/`, runnable via `npx tsx`. Wave 0 backfill tests turn GREEN. Production run requires explicit operator authorization (CHECKPOINT in this plan).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-CONTEXT.md
@.planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-RESEARCH.md
@.planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-PATTERNS.md
@web/scripts/replay-stage1-unknown-failures.ts
@CLAUDE.md

<interfaces>
<!-- From web/scripts/replay-stage1-unknown-failures.ts (primary analog) -->
- Pattern: env validation → admin client → SELECT batch → per-row decision → race-guarded UPDATE → log → emit-stale
- Status-guarded UPDATE: .eq("id", run.id).eq("status", "failed") (analog at lines 113-122)

<!-- Three-bucket logic per RESEARCH §"Backfill Strategy (Q6)" -->
HAS_KANBAN     (kanban_rows === 1)  → flip status='routed_human_queue'
NO_KANBAN      (kanban_rows === 0)  → write ./backfill-stuck-no-kanban.json, do NOT flip
MULTI_KANBAN   (kanban_rows >= 2)   → write ./backfill-multi-kanban.json, do NOT flip

<!-- SQL probe per RESEARCH (validate before UPDATE) -->
SELECT ar.id, ar.email_id, ar.status, ar.swarm_type, ar.created_at,
       (ar.tool_outputs ? 'intent_first_pass') AS has_intent_output,
       COUNT(am.id) FILTER (WHERE am.automation = ar.swarm_type || '-kanban') AS kanban_rows
FROM agent_runs ar
LEFT JOIN automation_runs am
  ON am.result->>'email_id' = ar.email_id
 AND am.automation = ar.swarm_type || '-kanban'
WHERE ar.status = 'classifying' AND ar.tool_outputs ? 'intent_first_pass'
GROUP BY ar.id;
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement backfill-stuck-classifying-stage3.ts</name>
  <read_first>
    - web/scripts/replay-stage1-unknown-failures.ts (full) — primary analog
    - web/scripts/__tests__/backfill-stuck-classifying-stage3.test.ts (built in plan 80-01) — RED tests this implementation must turn GREEN
    - 80-PATTERNS.md §"web/scripts/backfill-stuck-classifying-stage3.ts" — header structure, env validation, three-bucket routing, dry-run/apply
    - 80-RESEARCH.md §"Script design" + §"Safety guards" — full safety guard table
    - 80-CONTEXT.md §"Backfill (the 407 stuck rows)" — locked logic
    - CLAUDE.md "Test-First Pattern" — environment banner + acceptance default
  </read_first>
  <files>web/scripts/backfill-stuck-classifying-stage3.ts</files>
  <action>
    Create web/scripts/backfill-stuck-classifying-stage3.ts. Structure (copy/adapt from web/scripts/replay-stage1-unknown-failures.ts):

    1. Header docblock per PATTERNS.md:
       ```ts
       /**
        * Phase 80 backfill — flip stranded `agent_runs.status='classifying'` rows
        * to `routed_human_queue` when a matching {swarm}-kanban automation_runs row
        * already exists (the dispatch-side work is already done; only the status
        * flip is missing).
        *
        * Idempotent. Race-guarded with .eq("status", "classifying") so it cannot
        * collide with the live Stage 3 dispatcher.
        *
        * Usage:
        *   cd web
        *   npx tsx scripts/backfill-stuck-classifying-stage3.ts             # dry-run (default; SAFE)
        *   npx tsx scripts/backfill-stuck-classifying-stage3.ts --apply     # acceptance/test creds — apply
        *   npx tsx scripts/backfill-stuck-classifying-stage3.ts --apply --confirm-prod   # production
        *
        * Three-bucket routing:
        *   HAS_KANBAN    (1 matching kanban row) → flip status='routed_human_queue'
        *   NO_KANBAN     (0 matching kanban rows) → flag-only → ./backfill-stuck-no-kanban.json
        *   MULTI_KANBAN  (>= 2 matching kanban rows) → flag-only → ./backfill-multi-kanban.json
        *     (defends the out-of-scope intent=null duplicate-write cluster — do NOT flip)
        */
       ```

    2. Imports + arg parsing (copy analog lines 26-46):
       ```ts
       import { createClient } from "@supabase/supabase-js";
       import { writeFile, appendFile } from "node:fs/promises";

       const apply = process.argv.includes("--apply");
       const confirmProd = process.argv.includes("--confirm-prod");
       ```

    3. Env validation + environment banner + **two-factor production gate** (per CLAUDE.md test-first AND RESEARCH §"Safety guards"):
       ```ts
       import { createInterface } from "node:readline/promises";
       import { stdin as input, stdout as output } from "node:process";

       const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
       const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
       if (!SUPABASE_URL || !SERVICE_ROLE) {
         console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env");
         process.exit(1);
       }
       const isProd = SUPABASE_URL.includes("mvqjhlxfvtqqubqgdvhz") || confirmProd; // adjust prod URL match

       // FACTOR 1: --confirm-prod flag must be present when prod URL detected
       if (isProd && !confirmProd) {
         console.error("Production URL detected — pass --confirm-prod to proceed.");
         process.exit(1);
       }

       // FACTOR 2: interactive readline typed-phrase confirmation (production only)
       if (isProd) {
         const rl = createInterface({ input, output });
         const phrase = "I have read PHASE 80 RESEARCH";
         const answer = await rl.question(
           `\n[backfill] PRODUCTION CONFIRMATION REQUIRED.\n` +
           `[backfill] Type the literal phrase (case-insensitive, whitespace trimmed):\n` +
           `[backfill]   ${phrase}\n` +
           `[backfill] > `,
         );
         await rl.close();
         if (answer.trim().toLowerCase() !== phrase.toLowerCase()) {
           console.error(`[backfill] ABORT: typed phrase did not match required confirmation.`);
           process.exit(1);
         }
         console.log(`[backfill] confirmation accepted.`);
       }

       console.log(`[backfill] ${isProd ? "PRODUCTION" : "ACCEPTANCE/TEST"}`);
       console.log(`[backfill] mode = ${apply ? "APPLY" : "DRY-RUN"}`);
       ```

       Wrap `main()` to be async-callable so the readline `await` works at top level. The phrase is required ONLY for production (acceptance/test runs are unaffected). Tests must mock `node:readline/promises` to skip the prompt; document this in the test file.

    4. Main routine (export `main` so the test can import + invoke):
       ```ts
       export async function main(): Promise<void> {
         const admin = createClient(SUPABASE_URL!, SERVICE_ROLE!, { auth: { persistSession: false } });

         // 1) Fetch all stuck rows in one batch
         const { data: stuck, error } = await admin
           .from("agent_runs")
           .select("id, email_id, swarm_type, status, tool_outputs, created_at")
           .eq("status", "classifying");
         if (error) throw new Error(`select stuck rows: ${error.message}`);
         if (!stuck) return;

         // 2) Filter to rows whose tool_outputs has intent_first_pass
         const candidates = stuck.filter(
           (r) => r.tool_outputs && typeof r.tool_outputs === "object" && "intent_first_pass" in r.tool_outputs,
         );

         const buckets = { HAS_KANBAN: [] as typeof candidates, NO_KANBAN: [] as typeof candidates, MULTI_KANBAN: [] as typeof candidates };

         // 3) For each candidate, count matching kanban rows
         for (const row of candidates) {
           const swarm = row.swarm_type ?? "debtor-email";
           const { count } = await admin
             .from("automation_runs")
             .select("id", { count: "exact", head: true })
             .eq("automation", `${swarm}-kanban`)
             .filter("result->>email_id", "eq", row.email_id);
           const kanbanCount = count ?? 0;
           const bucket = kanbanCount === 1 ? "HAS_KANBAN" : kanbanCount === 0 ? "NO_KANBAN" : "MULTI_KANBAN";
           buckets[bucket].push(row);
           console.log(`[backfill] ${apply ? "FLIP" : "would flip"} agent_run=${row.id} email_id=${row.email_id} kanban=${kanbanCount} → bucket=${bucket}`);
         }

         // 4) Write JSON report files for NO_KANBAN + MULTI_KANBAN buckets (only on --apply; dry-run is read-only)
         if (apply) {
           await writeFile("./backfill-stuck-no-kanban.json", JSON.stringify(buckets.NO_KANBAN, null, 2));
           await writeFile("./backfill-multi-kanban.json", JSON.stringify(buckets.MULTI_KANBAN, null, 2));
         } else {
           console.log(`[backfill] (dry-run) NO_KANBAN bucket size: ${buckets.NO_KANBAN.length} — would write ./backfill-stuck-no-kanban.json on --apply`);
           console.log(`[backfill] (dry-run) MULTI_KANBAN bucket size: ${buckets.MULTI_KANBAN.length} — would write ./backfill-multi-kanban.json on --apply`);
         }

         // 5) Apply: race-guarded UPDATE on HAS_KANBAN bucket only
         if (apply) {
           let flipped = 0;
           for (const row of buckets.HAS_KANBAN) {
             const { error: updErr, count: updCount } = await admin
               .from("agent_runs")
               .update({ status: "routed_human_queue" }, { count: "exact" })
               .eq("id", row.id)
               .eq("status", "classifying"); // race guard
             if (updErr) {
               console.error(`[backfill] ERROR id=${row.id}: ${updErr.message}`);
               await appendFile("./backfill-stage3-log.jsonl", JSON.stringify({ agent_run_id: row.id, action: "error", error: updErr.message, ts: new Date().toISOString() }) + "\n");
               continue;
             }
             if ((updCount ?? 0) > 0) flipped++;
             await appendFile("./backfill-stage3-log.jsonl", JSON.stringify({ agent_run_id: row.id, action: "flipped", ts: new Date().toISOString() }) + "\n");
           }
           console.log(`[backfill] APPLIED: flipped=${flipped}/${buckets.HAS_KANBAN.length}`);
         }

         console.log(`[backfill] Summary — HAS_KANBAN: ${buckets.HAS_KANBAN.length}, NO_KANBAN: ${buckets.NO_KANBAN.length}, MULTI_KANBAN: ${buckets.MULTI_KANBAN.length}`);
       }

       if (require.main === module) {
         main().catch((err) => { console.error(err); process.exit(1); });
       }
       ```

    5. Notes:
       - Use `npx tsx` not `node` for execution (TS file).
       - The script does NOT call `emitAutomationRunStale` — the live dispatcher already keeps the lane fresh; backfilling stale rows doesn't need a broadcast (stretch decision per RESEARCH §"Safety guards" — log this in summary).
       - The "no fs/promises in CommonJS bundle" issue: if `require.main` doesn't work under tsx ESM, swap to `import.meta.url` check. Verify by running `npx tsx scripts/backfill-stuck-classifying-stage3.ts` after writing.

    6. Run vitest. The Wave 0 backfill tests should turn GREEN.
  </action>
  <verify>
    <automated>cd web && npx vitest run scripts/__tests__/backfill-stuck-classifying-stage3.test.ts 2>&1 | tail -40</automated>
  </verify>
  <acceptance_criteria>
    - File web/scripts/backfill-stuck-classifying-stage3.ts exists with >= 150 lines
    - `grep -cE "HAS_KANBAN|NO_KANBAN|MULTI_KANBAN" web/scripts/backfill-stuck-classifying-stage3.ts` returns >= 6 (each bucket name appears at least 2x — declaration + usage)
    - `grep -c '\\.eq("status", "classifying")' web/scripts/backfill-stuck-classifying-stage3.ts` returns >= 1 (race guard)
    - `grep -c "routed_human_queue" web/scripts/backfill-stuck-classifying-stage3.ts` returns >= 1
    - `grep -cE "intent_first_pass" web/scripts/backfill-stuck-classifying-stage3.ts` returns >= 1
    - `grep -cE "kanban_rows|automation.*-kanban" web/scripts/backfill-stuck-classifying-stage3.ts` returns >= 1
    - `grep -c "apply\\s*=" web/scripts/backfill-stuck-classifying-stage3.ts` returns >= 1 (--apply flag handling)
    - `grep -c "confirm-prod\\|confirmProd" web/scripts/backfill-stuck-classifying-stage3.ts` returns >= 1 (FACTOR 1: flag check)
    - `grep -cE "createInterface|readline" web/scripts/backfill-stuck-classifying-stage3.ts` returns >= 1 (FACTOR 2: interactive readline prompt)
    - `grep -c "I have read PHASE 80 RESEARCH" web/scripts/backfill-stuck-classifying-stage3.ts` returns >= 1 (FACTOR 2: typed-phrase string literal)
    - `grep -c "ACCEPTANCE\\|PRODUCTION" web/scripts/backfill-stuck-classifying-stage3.ts` returns >= 1 (environment banner)
    - `cd web && npx tsc --noEmit scripts/backfill-stuck-classifying-stage3.ts` succeeds
    - vitest output: all 6 backfill test cases (dry-run, HAS_KANBAN, NO_KANBAN, MULTI_KANBAN, status-precondition, readline-prod-gate) GREEN
  </acceptance_criteria>
  <done>Script implements three-bucket routing with race-guarded UPDATE; vitest backfill tests GREEN; tsc clean.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Operator authorization to run backfill against production</name>
  <what-built>
    Plan 80-05 Task 1 produced `web/scripts/backfill-stuck-classifying-stage3.ts`. Wave 0 unit tests are GREEN. Acceptance/test dry-run is automatable; production run requires explicit operator authorization per CLAUDE.md.
  </what-built>
  <how-to-verify>
    Run the script in this order, pausing at each gate:

    1. **Acceptance dry-run (no auth needed):**
       ```
       cd web
       SUPABASE_URL=<acceptance> SUPABASE_SERVICE_ROLE_KEY=<acceptance-sr> \
         npx tsx scripts/backfill-stuck-classifying-stage3.ts
       ```
       Expected: prints ACCEPTANCE/TEST, DRY-RUN, per-row would-flip lines, and bucket counts. Zero DB writes. Zero file writes (--apply not passed).

    2. **Acceptance apply:**
       ```
       cd web
       SUPABASE_URL=<acceptance> SUPABASE_SERVICE_ROLE_KEY=<acceptance-sr> \
         npx tsx scripts/backfill-stuck-classifying-stage3.ts --apply
       ```
       Expected: "APPLIED: flipped=N/M". Verify with SQL: `SELECT COUNT(*) FROM agent_runs WHERE status='classifying' AND tool_outputs ? 'intent_first_pass';` should be 0 on acceptance (modulo new in-flight rows).

    3. **Production dry-run (gated by BOTH factors):**
       ```
       cd web
       SUPABASE_URL=https://mvqjhlxfvtqqubqgdvhz.supabase.co \
         SUPABASE_SERVICE_ROLE_KEY=<prod-sr> \
         npx tsx scripts/backfill-stuck-classifying-stage3.ts --confirm-prod
       ```
       The script will pause and prompt:
       ```
       [backfill] PRODUCTION CONFIRMATION REQUIRED.
       [backfill] Type the literal phrase (case-insensitive, whitespace trimmed):
       [backfill]   I have read PHASE 80 RESEARCH
       [backfill] >
       ```
       Type the phrase exactly. Expected: prints "PRODUCTION", "DRY-RUN", per-row report. Three-bucket counts displayed. NO JSON files written in dry-run (gated behind --apply). Operator reviews on-screen counts before proceeding to step 4.

    4. **Production apply (final, requires --apply --confirm-prod AND typed-phrase confirmation):**
       ```
       cd web
       SUPABASE_URL=https://mvqjhlxfvtqqubqgdvhz.supabase.co \
         SUPABASE_SERVICE_ROLE_KEY=<prod-sr> \
         npx tsx scripts/backfill-stuck-classifying-stage3.ts --apply --confirm-prod
       ```
       The script will again pause for the typed-phrase prompt — type `I have read PHASE 80 RESEARCH` to proceed. JSON report files (`backfill-stuck-no-kanban.json`, `backfill-multi-kanban.json`) are now written.
       Expected: "APPLIED: flipped=N/M" where N is the HAS_KANBAN bucket count (~395 of the 407 per CONTEXT.md live-data observation). Validation SQL afterward:
       ```sql
       SELECT COUNT(*) FROM agent_runs WHERE status='classifying' AND tool_outputs ? 'intent_first_pass';
       -- Expected: 0 (or only the NO_KANBAN edge cases the operator chose not to flip)
       ```

    Operator decides what to do with the NO_KANBAN and MULTI_KANBAN flagged rows — those are out-of-scope for Phase 80 per CONTEXT.
  </how-to-verify>
  <resume-signal>Type "backfill complete" and paste the final SQL count, OR "abort backfill" with reason.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

- **Service-role Supabase access**: pre-existing trust boundary; same as the live coordinator. Script is local-execution only; no new external surface.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-80-08 | Tampering | Script races with live dispatcher | mitigate | `.eq("status", "classifying")` race guard — dispatcher's status precondition writes from `predicted`, not `classifying`, so the two cannot both flip the same row. |
| T-80-09 | Denial of Service | Mass UPDATE locks `agent_runs` table | accept | Per-row UPDATE (not bulk) at <500 row scale; Postgres handles trivially. |
| T-80-10 | Repudiation | Backfill flips wrong rows | mitigate | Three-bucket exhaustive routing; only HAS_KANBAN flipped; per-row append-log to `backfill-stage3-log.jsonl` for audit. |
| T-80-11 | Tampering | Operator runs against prod by accident | mitigate | `--confirm-prod` flag required when prod URL detected; environment banner printed at start. |
</threat_model>

<verification>
- `cd web && npx vitest run scripts/__tests__/backfill-stuck-classifying-stage3.test.ts` — 5/5 GREEN.
- Acceptance dry-run prints summary without writes.
- Acceptance apply: post-run SQL shows 0 rows in `classifying` with `intent_first_pass`.
- Production execution per checkpoint instructions; operator confirms count delta matches expectation (~395 of 407).
</verification>

<success_criteria>
- Script ships and tests are GREEN.
- Operator authorizes and runs against acceptance + production.
- Stranded-row count drops to ≈0 in production.
- NO_KANBAN and MULTI_KANBAN flagged rows preserved for the deferred follow-up phase per CONTEXT.md `<deferred>`.
</success_criteria>

<output>
After completion, create `.planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-05-SUMMARY.md` with: script structure, vitest GREEN output, dry-run + apply console excerpts (acceptance), final production SQL count delta (or "deferred — operator declined" if checkpoint paused).
</output>
