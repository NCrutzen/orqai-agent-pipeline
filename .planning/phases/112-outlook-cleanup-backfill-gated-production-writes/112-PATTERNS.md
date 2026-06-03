# Phase 112: Outlook Cleanup + Backfill (gated production writes) - Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 6 (3 new code, 1 new migration, 1 modify, 1 extend-test)
**Analogs found:** 6 / 6

> This phase is ~90% wiring / ~10% new code. Every new file has a strong in-repo analog the planner should copy from. The going-forward live archive needs ZERO new code — only the flag-flip migration (D-02/D-03). The only genuinely new worker is the backfill sweeper. Do NOT route the auto-set through the verdict worker, and do NOT add a `swarms.side_effects` row (anti-patterns from RESEARCH).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `web/lib/inngest/functions/sales-email-stage-1-backfill.ts` (NEW) | inngest worker | batch | `web/lib/inngest/functions/stage-0-backfill.ts` | exact (same role + data flow) |
| `web/lib/automations/sales-email/backfill/disposition.ts` (NEW) | utility (pure) | transform | `supabase/migrations/20260603_sales_noise_calibration_flip.sql` (auto-set source) + `registry.ts:loadSwarmNoiseCategories` | role-match |
| `web/lib/automations/sales-email/backfill/select-backfill-candidates.ts` (NEW) | utility (pure) | CRUD (read) | `web/lib/automations/sales-email/retro/select-candidates.ts` | exact |
| `supabase/migrations/20260603x_sales_stage1_archive_golive.sql` (NEW) | migration | — | `supabase/migrations/20260603_sales_noise_calibration_flip.sql` | exact (mirror flip migration) |
| `web/lib/inngest/functions/classifier-verdict-worker.ts` (MODIFY — none expected; verify only) | inngest worker | event-driven | self (already swarm-agnostic, gated) | n/a — flag flip activates it |
| `web/lib/inngest/functions/__tests__/classifier-verdict-worker.test.ts` (EXTEND) | test | — | self | extend |

**Graph-id resolution / Bulk-Review-insert / dedup-ledger are not separate files** — they are patterns the backfill worker copies inline (see Shared Patterns).

## Pattern Assignments

### `web/lib/inngest/functions/sales-email-stage-1-backfill.ts` (NEW — inngest worker, batch)

**Analog:** `web/lib/inngest/functions/stage-0-backfill.ts` (mirror byte-for-byte)

**Function-shape + replay-safe runId + batched dedup loop** (`stage-0-backfill.ts:71-156`):
```ts
export const stage0Backfill = inngest.createFunction(
  { id: "stage-0/backfill", retries: 1 },
  { event: "pipeline.stage0.backfill" },
  async ({ event, step }) => {
    // Phase 65 replay-id rule — runId MUST be minted inside step.run.
    const runId = await step.run("resolve-run-id", async () => crypto.randomUUID());
    const candidates = await step.run("find-gaps", async () => { /* RPC / selectCandidates */ });

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batchIdx = Math.floor(i / BATCH_SIZE);
      const batch = candidates.slice(i, i + BATCH_SIZE);
      const batchResult = await step.run(`backfill-batch-${batchIdx}`, async () => {
        const admin = createAdminClient();
        // 1. Pre-insert dedup SELECT against pipeline_events (skip already-archived)
        const emailIds = batch.map((b) => b.email_id);
        const { data: existing } = await admin
          .from("pipeline_events").select("email_id, swarm_type")
          .in("email_id", emailIds).eq("stage", 0);   // backfill uses stage 4 (Stage-1 archive ledger)
        const existingKeys = new Set((existing ?? []).map((r) => `${r.email_id}|${r.swarm_type}`));
        // 2. per candidate: disposition → archive (auto) or queue (ambiguous)
      });
    }
  },
);
```

**Adaptations for 112:**
- `concurrency: { limit: 1 }` (research recommends single-flight; `stage-0-backfill` omits it — add it here for Graph rate-limit safety).
- `BATCH_SIZE` ~100-200 (NOT 500 — keep each batch step well under the 60s gateway, Pitfall 2). `stage-0-backfill` used 500 because it was pure DB inserts; this batch does Graph calls per row.
- The dedup SELECT filters `stage=4` (the Stage-1 archive ledger row), NOT `stage=0`. Use the same `existingKeys` Set pattern.
- `mode: 'report' | 'canary' | 'full'` off `event.data` (research OQ-4: build report mode). `report` runs selection + disposition + live-presence count, NO Graph write.
- Keep a `buildBackfillRow`-style PURE free function (`stage-0-backfill.ts:169-212`) so disposition is unit-testable from the test file — but put the disposition logic in `backfill/disposition.ts` (below).

---

### `web/lib/automations/sales-email/backfill/disposition.ts` (NEW — pure utility, transform)

**Analog:** `registry.ts:loadSwarmNoiseCategories` (auto-set source) + the 111 flip migration (which keys flip).

**Auto-set is read from the registry, NOT hardcoded** (`registry.ts:54-76`):
```ts
export async function loadSwarmNoiseCategories(
  admin: SupabaseClient, swarmType: string,
): Promise<SwarmNoiseCategoryRow[]> {
  // ... 60s-TTL cache + last-known-good ...
  const { data } = await admin
    .from("swarm_noise_categories").select("*")
    .eq("swarm_type", swarmType).eq("enabled", true)
    .order("display_order", { ascending: true });
  // returns rows incl. .action and .category_key
}
```

**Disposition logic (D-05/D-06)** — build the AUTO set from `action === 'categorize_archive'` minus loopback:
```ts
const cats = await loadSwarmNoiseCategories(admin, "sales-email");
const AUTO_KEYS = new Set(
  cats.filter((c) => c.action === "categorize_archive")
      .map((c) => c.category_key)
      .filter((k) => k !== "own_outbound_invoice_loopback"), // D-06 skip
);
// predicted === 'own_outbound_invoice_loopback'  → SKIP entirely (D-06: not archived, not queued)
// AUTO_KEYS.has(predicted) && confidence === 'high' → auto-archive
// else (payment_admittance / unknown / low-med conf / un-promoted) → Bulk Review queue
```

The 111 flip migration (`20260603_sales_noise_calibration_flip.sql:67-76`) documents WHICH keys carry `categorize_archive` (the 3 safe keys `auto_reply`/`ooo_temporary`/`ooo_permanent`) and WHICH deliberately stay `manual_review` (`payment_admittance`, `unknown` — must NEVER auto-archive). Read it to confirm the auto-set boundary, but derive the set at runtime from the registry (never re-encode the list).

**Keep this pure** (no clock, no randomness) like `select-candidates.ts` — see its docstring line 21 "Pure ... safe under Inngest replay (T-111-09)."

---

### `web/lib/automations/sales-email/backfill/select-backfill-candidates.ts` (NEW — pure utility, read)

**Analog:** `web/lib/automations/sales-email/retro/select-candidates.ts` (wrap/extend it)

**Reuse `selectCandidates` verbatim for corpus selection** (D-07) — it already handles the two corpora, cap+truncation guard, single-tenant invariant, direction normalization, and dedup-by-email_id (`select-candidates.ts:92-188`). Key invariants to preserve:
- Per-corpus truncation fail-loud at `length >= readCap` (lines 137-146).
- SugarCRM single-tenant guard, fail-loud on foreign source (lines 158-164).
- Dedup-by-email_id, outlook-before-sugarcrm (lines 179-185).
- `SALES_OUTLOOK_MAILBOX = "verkoop@smeba.nl"` (line 27).

**Extend with the live-presence + Graph-id join (D-07 + Pitfall 4)** — this is the ONE thing `selectCandidates` does not do. The `RetroCandidate` returns `email_id` only; the archive call needs the **Graph id** (`emails.source_id`), NOT `internet_message_id`. See Shared Pattern "Graph-id resolution" below. This file should also `.select` `source_id, internet_message_id` so the worker can resolve the Graph id per candidate.

---

### `supabase/migrations/20260603x_sales_stage1_archive_golive.sql` (NEW — migration, WRITTEN-NOT-APPLIED)

**Analog:** `supabase/migrations/20260603_sales_noise_calibration_flip.sql` (mirror exactly)

**Mirror the header + inertness/apply-note discipline** (`20260603_sales_noise_calibration_flip.sql:50-63`). That file's "APPLY NOTE" and "RLS / SCHEMA NOTE" blocks are the template:
- "This migration is NOT applied by the plan. A BLOCKING checkpoint task applies it via MCP against verified ref `mvqjhlxfvtqqubqgdvhz`." (D-02)
- "swarms is an EXISTING RLS-enabled table. UPDATE only — no new table, no new policy, no RLS work. No codegen."

**The flip itself — use `jsonb_set` to avoid clobbering sibling flags** (RESEARCH A2; `dry_run_config` carries `stage_1_archive`, `stage_1_cleanup`, `stage_3_labeling`, `stage_4_handlers`):
```sql
BEGIN;
UPDATE public.swarms
   SET dry_run_config = jsonb_set(dry_run_config, '{stage_1_archive}', 'false'::jsonb),
       updated_at = now()
 WHERE swarm_type = 'sales-email';
COMMIT;
```
The 111 flip used a plain `UPDATE ... SET action = ...` (whole-column), but `dry_run_config` is a jsonb object with siblings — `jsonb_set` is mandatory here (verify the live shape before writing).

**Migration-assertion test** — mirror `web/lib/swarms/__tests__/sales-noise-calibration.test.ts` (the 111 test that parses the SQL file and asserts the flip set). The 112 version parses this file and asserts it sets exactly `{stage_1_archive: false}` for `sales-email` with no sibling clobber.

---

### `web/lib/inngest/functions/classifier-verdict-worker.ts` (VERIFY ONLY — no code change expected)

**This is the going-forward live-archive path (D-03). The flag flip activates it; no edit needed.** The gate + telemetry are already correct (Phase 111 WR-01, `archiveLive` predicate at lines 130-150 and 270-330). The planner should NOT add a `swarms.side_effects` row (anti-pattern). Verify (don't rewrite) that:
- `archiveLive = !!category.outlook_label && !isStageBlocked(swarmRow, "stage_1_archive")` (lines 130-132).
- Both `categorize` + `archive` step.runs are gated on `archiveLive` (lines 133-150).
- The Stage-4 `emit-stage-4-handled` is gated on the SAME `archiveLive` (line 274) — no phantom telemetry.

**Extend the test** (`classifier-verdict-worker.test.ts`) for sales-live (flag=false) archive: mock `loadSwarm` + `isStageBlocked` (111 regression lesson — the gate must be mocked or sales stays inert). Verify archive fires ONLY when `stage_1_archive=false`.

## Shared Patterns

### Idempotency / dedup ledger (D-08) — the unique-violation no-op
**Source:** `web/lib/inngest/functions/classifier-verdict-worker.ts:311-328` (verified)
**Apply to:** the backfill worker's auto-archive `emitPipelineEvent(stage=4)` call (copy this catch verbatim).
```ts
try {
  await emitPipelineEvent(admin, {
    swarm_type, stage: 4, email_id, decision: "auto_archived_noise", ...
  });
} catch (err) {
  const code = (err as { code?: string } | null)?.code;
  const msg = (err as Error)?.message ?? "";
  const isUniqueViolation =
    code === "23505" || msg.includes("duplicate key value") ||
    msg.includes("23505") || msg.includes("pipeline_events_one_per_stage_email");
  if (isUniqueViolation) return; // already archived → idempotent no-op
  throw err;
}
```
**Nuance (RESEARCH State-of-the-Art):** the index is `... WHERE email_id IS NOT NULL AND override IS NULL` (migration `20260528a`). Backfill auto-archive rows are non-override → correctly deduped. Two layers: this ledger + the pre-batch dedup SELECT (from `stage-0-backfill.ts:114-130`).

### Graph-id resolution (Pitfall 4 — load-bearing)
**Source:** the verdict worker's `.or()` matcher (`classifier-verdict-worker.ts:179-181, 284-285`) + `client.ts:archiveEmail`/`categorizeEmail` (which take the Graph id).
**Apply to:** every backfill archive call. `archiveEmail(mailbox, messageId)` and `categorizeEmail` need the **Graph message id** (`emails.source_id`), NOT `internet_message_id`.
- For Outlook-ingest rows: use `emails.source_id` directly.
- For historic rows: look up by `internetMessageId` via Graph (`getMessageMeta`-style fetch, `client.ts:161-185`, returns `id`) to BOTH confirm live presence (D-07) AND obtain the Graph id. No Graph hit = no-op (D-07).
The verdict worker's `source_id.eq.${id},internet_message_id.eq.${id}` `.or()` shows the two-id ambiguity that this resolution must disambiguate.

### Graph archive with idempotent "already archived" (D-08 / A1)
**Source:** `web/lib/outlook/client.ts:392-413` (`archiveEmail`) + `:357-386` (`categorizeEmail`).
**Apply to:** auto-set archive inside the backfill `step.run`. Wrap the call; treat 404/`ErrorItemNotFound`/already-moved as no-op success on re-run:
```ts
const r = await archiveEmail(source_mailbox, graphMessageId);
if (!r.success) {
  if (/404|ErrorItemNotFound|already/i.test(r.error ?? "")) { /* no-op success */ }
  else throw new Error(`archive failed: ${r.error}`);
}
```
`archiveEmail` returns `{success:false,error}` on non-2xx (line 407-410). **[VERIFY in canary]** the exact already-archived behavior (A1/OQ-3) before trusting the substring.

### Ambiguous → Bulk Review (Finding 7 / Pattern 3)
**Source:** `web/app/(dashboard)/automations/[swarm]/stage-1/actions.ts:798-878` (`approvePrediction`) → `recordVerdict` → `classifier/verdict.recorded` → inline archive.
**Apply to:** the ambiguous lane only. INSERT an `automation_runs` row `status='predicted'` carrying `result.{message_id, source_mailbox, predicted_category}` + `email_id` + `rule_key`. `approvePrediction` hydrates `VerdictInput` from exactly those fields (lines 823-864) — match them or the approve action throws. **Match the producer fields the live ingest writes** (RESEARCH A5: verify the Bulk Review surface doesn't filter by `triggered_by`).

**Insert-dedup guard for the predicted-row INSERT** (Pitfall 2) — mirror the verdict worker's existence check (`classifier-verdict-worker.ts:211-219`):
```ts
const { data: existing } = await admin
  .from("automation_runs").select("id")
  .eq("automation", <bulk-review-automation>)
  .eq("result->>message_id", message_id).limit(1);
if (existing && existing.length > 0) return; // no second predicted row on re-run
```

### Replay-safety (CLAUDE.md Phase 65)
**Source:** `stage-0-backfill.ts:83-87`. Mint `runId`/timestamps INSIDE `step.run`. All Graph side-effects inside `step.run`. Never destructure `inngest.send`.

## Anti-Patterns (from RESEARCH — enforce in planning)
- **Do NOT** re-emit `classifier/verdict.recorded` for the AUTO set (creates `automation_runs`/`agent_runs` churn). Auto-set archives DIRECTLY via `categorizeEmail`+`archiveEmail` + direct `emitPipelineEvent`. The verdict path is ONLY for the ambiguous→operator-approved lane.
- **Do NOT** add a `swarms.side_effects` row for the Outlook archive (D-03/D-04 — inline path already archives; side_effects is the debtor iController pattern).
- **Do NOT** add a new ledger table (D-08 reuses `pipeline_events_one_per_stage_email`).
- **Do NOT** hardcode the auto-set category list (read `loadSwarmNoiseCategories`, filter `action==='categorize_archive'` minus loopback).
- **Do NOT** apply the flip migration during plan execution (D-02 — written-but-unapplied; apply is a `[BLOCKING]` human MCP action).
- **Do NOT** use `internet_message_id` for the Graph archive call (Pitfall 4 — needs `source_id`).

## No Analog Found
None. Every file has a strong in-repo analog.

## Metadata
**Analog search scope:** `web/lib/inngest/functions/`, `web/lib/outlook/`, `web/lib/automations/sales-email/retro/`, `web/lib/swarms/`, `web/app/(dashboard)/automations/[swarm]/stage-1/`, `supabase/migrations/`
**Files scanned:** 7 (all named by RESEARCH; verified in-repo)
**Pattern extraction date:** 2026-06-03
