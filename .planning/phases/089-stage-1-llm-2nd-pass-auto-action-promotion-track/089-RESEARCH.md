# Phase 89: Stage 1 LLM 2nd-pass auto-action promotion track — Research

**Researched:** 2026-05-20
**Domain:** Inngest worker + Supabase registry (classifier_rules) + Wilson-CI promotion model — extend existing regex-rule promotion machinery to LLM 2nd-pass verdicts
**Confidence:** HIGH (every claim verified against the live code/SQL in this repo)

## Summary

Phase 89 is an extension phase, not a greenfield one. The promotion machinery (`classifier_rules` table, `classifier_rule_telemetry` view, `classifier-promotion-cron` Wilson-CI evaluator, `readWhitelist` cache, `isWhitelistMatch` gate in `classifier-screen-worker`) already exists and is **already swarm-agnostic** and **already rule_key-shape-agnostic**. The only reason LLM verdicts don't get auto-archived today is that the LLM path writes `agent_runs` rows **without** a `rule_key` (line 265-279 of `classifier-screen-worker.ts`), so the telemetry view's `WHERE rule_key IS NOT NULL` filter excludes them entirely and the whitelist check `whitelistSet.has(matchedRule)` evaluates against `"no_match"` (Pass 1's matchedRule when it abstained), which is never in the whitelist.

The fix is small and surgical: (1) one new field on the LLM-path `agent_runs` insert, (2) one new field on the `recordVerdict` write-path so operator approvals attribute to the same key, (3) a new Inngest one-shot seed function mirroring `classifier-backfill.ts`, (4) a one-shot UPDATE migration to backfill `rule_key` on historic LLM verdicts (rule_key only — never `human_verdict`), and (5) a verification harness that runs the Wilson-CI evaluator against post-backfill data to prove ≥1 promotable rule_key exists.

**Primary recommendation:** treat Phase 89 as 4 narrow, additive changes layered on top of the existing pipeline. Do NOT modify `classifier_rule_telemetry`, `classifier-promotion-cron`, `readWhitelist`, or the debtor-only dispatch gate. The existing mechanism does the work as soon as LLM verdicts carry the right `rule_key`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

1. **Telemetry source: reuse existing `classifier_rule_telemetry` view + `agent_runs.human_verdict`.** NO schema change to the view. The roadmap's "widen view to `email_feedback.verdict`" was misleading wording — `human_verdict` is already the canonical signal the promotion cron consumes. The two writes that must line up with the view's `(swarm_type, rule_key, human_verdict)` contract are: (a) LLM-verdict-time insert in `classifier-screen-worker` LLM path (around L265) — set `rule_key = "llm:" + parsed.category_key + ":" + parsed.confidence`; (b) Stage-1 review-time insert in `recordVerdict` (L168-193 of `actions.ts`) — the UI payload must pass the same `llm:*` key for LLM-verdict rows so operator approve/reject lands on the same `(swarm_type, rule_key)` aggregate. Do NOT modify `classifier_rule_telemetry`.

2. **Shadow-run validation: hybrid backfill (rule_key only, NOT human_verdict).** One-shot SQL migration `UPDATE public.agent_runs SET rule_key = 'llm:' || (tool_outputs->>'stage1_category') || ':' || confidence WHERE rule_key IS NULL AND tool_outputs ? 'stage1_category' AND confidence IS NOT NULL;`. Idempotent. Do **not** retro-stamp `human_verdict`. Mirror Phase 83 backfill harness pattern. Verification: a Wilson-CI shadow run on post-backfill data identifies ≥1 promotable `llm:*:high` rule_key.

3. **Seed strategy: eager all-combos `(swarm × noise_category × {high})`.** INSERT `candidate` rows into `classifier_rules` for every (active swarm × every `noise_category` in that swarm's `swarm_noise_categories` × `confidence='high'` only). `ON CONFLICT(swarm_type, rule_key) DO NOTHING`. Idempotent. Mirror `classifier-backfill.ts`. New Inngest one-shot function (event-triggered, not cron). Low/medium confidence stays in bulk-review by design.

4. **Cross-swarm scope: data cross-swarm, dispatch debtor-only.** `rule_key="llm:{cat}:{conf}"` written on **all** LLM verdicts regardless of swarm; `classifier_rules` seed covers **all** active swarms; promotion cron is already swarm-agnostic — no change. The auto-action dispatch gate `swarmRow.stage1_regex_module === DEBTOR_REGEX_MODULE_KEY` at `classifier-screen-worker.ts:401` **stays untouched** — refactoring it into a registry-driven action map is **Phase 88**'s job (info@smeba.nl info-routing swarm). Each future swarm wires its own dispatch handler when it onboards.

### Claude's Discretion

- Use the existing `classifier-promotion-cron` evaluator unchanged (already swarm-agnostic, already iterates the view).
- Reuse the `ON CONFLICT(swarm_type, rule_key) DO NOTHING` upsert pattern from `classifier-backfill.ts`.
- Mirror the Phase 83 30-day backfill harness pattern for the historic `rule_key` UPDATE.
- Do not touch `pipeline_events.decision_details.predictor` (Phase 999.8 D-11 already denormalized this).

### Deferred Ideas (OUT OF SCOPE)

- **Auto-action dispatch refactor** (lift debtor-only gate to registry-driven action map) → **Phase 88** (info-routing swarm forces the abstraction; Phase 89's cross-swarm data guarantees Phase 88 inherits a populated `classifier_rules`).
- **Widening promotion to `medium` confidence** → revisit after a stable `llm:*:high` rule proves out over 60 days.
- **`email_feedback.verdict` as a secondary telemetry source** → V9.0 Promotion Recommender.
- **Audit-panel surface for LLM rule_key status** (e.g., chip showing "promoted" vs "candidate") → existing `/classifier-rules` dashboard already exposes status.
</user_constraints>

<phase_requirements>
## Phase Requirements

Phase 89 has no formal `REQ-` IDs in REQUIREMENTS.md (Phase 89 was inserted under v8.1; the project's de-facto requirements are the 5 success criteria pasted verbatim from ROADMAP.md lines 1335-1340, repeated here):

| ID | Description | Research Support |
|----|-------------|------------------|
| SC-89-01 | `classifier_rules` carries `llm:*:high` rows for every active `(swarm × noise_category)` combination (eager seed via Inngest one-shot, idempotent ON CONFLICT) | §Code Examples: classifier-llm-seed function (mirrors `classifier-backfill.ts`). `swarm_noise_categories` rows already in registry; `swarms` row carries enabled flag (see DEBTOR_SWARM_ROW shape in gate.test.ts L163-182). |
| SC-89-02 | `classifier-screen-worker` LLM path writes `agent_runs.rule_key = "llm:" + category_key + ":" + confidence` and Stage-1 review UI threads the same key into `recordVerdict` | §Pinpoint Edit Sites: 2 sites. Worker insert at L265-279 (add `rule_key:` field). UI path at `stage-1/page.tsx` row loader + `recordVerdict` already accepts free-form `rule_key: z.string().min(1)` — no schema change there; just ensure the row loader synthesizes `llm:*` when the row's predictor was LLM. |
| SC-89-03 | Historic LLM verdicts backfilled with the new `rule_key` (idempotent; `human_verdict` NOT retro-stamped) — Wilson-CI shadow run on 30 days of corpus data identifies ≥1 promotable `llm:*:high` rule_key | §Code Examples: idempotent UPDATE migration. §Validation Architecture: harness pattern from `scripts/phase-65-regression-backfill.ts`. |
| SC-89-04 | After a `llm:*:high` rule_key is promoted, a matching LLM verdict on debtor-email produces `automation_runs` row with `triggered_by='stage-1-worker'` and `result.stage='categorize+archive'` | §Architecture Patterns: the existing `whitelistSet.has(matchedRule)` gate at `classifier-screen-worker.ts:492` activates automatically once both the rule is promoted AND the LLM `matchedRule` value is set. Both happen in this phase. |
| SC-89-05 | No changes to `classifier_rule_telemetry`, the promotion cron, or the debtor-only auto-action dispatch gate | §Architecture Patterns. Negative criterion — verified by `git diff --stat` not touching these files. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| LLM-verdict `rule_key` synthesis | Inngest worker (`classifier-screen-worker`) | — | Writes `agent_runs.rule_key` at predict-time inside `step.run("llm-call")`. Replay-safe (id already inside step.run per Phase 65 learning). |
| Operator-verdict `rule_key` attribution | Next.js server action (`recordVerdict` in `stage-1/actions.ts`) | Stage-1 row loader (`page.tsx`) | Server action accepts `rule_key` as free-form `z.string().min(1)` already; the row-loader RSC must synthesize `llm:*` from `pipeline_events.decision_details.predictor==='llm_2nd_pass'` + agent_runs row's `confidence`+`stage1_category`. |
| Eager seed of `llm:*:high` candidate rows | Inngest one-shot function | Supabase `classifier_rules` table | Mirrors `classifier-backfill.ts`; event-only trigger (`classifier/llm-rules-backfill.run`). |
| Historic `rule_key` backfill | SQL migration (one-shot UPDATE) | Verification harness (tsx script) | Idempotent UPDATE … WHERE rule_key IS NULL. Verification: tsx script runs Wilson-CI evaluator against post-backfill data. |
| Promotion (Wilson CI evaluation) | Existing cron (`classifier-promotion-cron`) — UNCHANGED | — | Already iterates `classifier_rule_telemetry` regardless of rule_key shape. Already swarm-agnostic. |
| Whitelist enforcement at predict-time | Existing gate (`isWhitelistMatch` at L492) — UNCHANGED | — | Already evaluates `whitelistSet.has(matchedRule)` against any string. |
| Auto-action dispatch (categorize+archive) | Existing debtor-only block (L401) — UNCHANGED | — | Locked decision: dispatch refactor is Phase 88's job. |

## Standard Stack

### Core (already installed — Phase 89 adds nothing new)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Inngest | (existing — see package.json) | Durable workers + one-shot event functions | Already runs `classifier-promotion-cron`, `classifier-backfill`, `classifier-screen-worker`. Replay safety patterns documented in CLAUDE.md. |
| Supabase JS | `^2.99.1` | Service-role writes to `classifier_rules`, `agent_runs`; `.upsert({ onConflict: "swarm_type,rule_key" })` | Already the persistence layer for every classifier table. |
| Zod | (existing) | `Stage1OutputSchema` enum `["low","medium","high"]` constrains the confidence component of the rule_key | Existing validator at `classifier-screen-worker.ts:76-80`; no extension needed for Phase 89. |
| Vitest | (existing) | Unit tests for new seed function + worker insert change + recordVerdict thread-through | Mirrors `classifier-screen-worker.gate.test.ts` mock harness. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@/lib/classifier/wilson` | local | `wilsonCiLower`, `shouldPromote`, `shouldDemote`, `PROMOTE_N_MIN=30`, `PROMOTE_CI_LO_MIN=0.92`, `DEMOTE_N_MIN=30`, `DEMOTE_CI_LO_MAX=0.88` | Verification harness in Phase 89 uses `wilsonCiLower(n, agree)` to identify promotable rule_keys on the post-backfill data. |
| `@/lib/swarms/registry` | local | `loadSwarm`, `loadSwarmNoiseCategories` | Seed function reads `(swarm × noise_category)` from these helpers. |
| `tsx` | (in devDeps; used by `npm run codegen`) | Run the verification harness script standalone | Phase 83 backfill is the precedent (1344 rows backfilled idempotently). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inngest one-shot seed function | SQL migration with INSERT … FROM (swarms × swarm_noise_categories) | Migration is more declarative but breaks the "registry-changes-via-codegen" pattern; Inngest function can be re-fired any time a new swarm/noise-category lands. **Decision: Inngest one-shot (mirrors `classifier-backfill.ts`).** |
| One-shot SQL UPDATE for historic backfill | Per-row Inngest backfill (replay-safe) | SQL UPDATE is one statement, idempotent, runs once at migration apply — no Inngest needed because there's no per-row side-effect. **Decision: SQL.** |
| `intent_proposal` field on `coordinator_runs` | Not applicable | Phase 86 territory; Stage 3 — out of scope. |

**Installation:** No new packages. The plan should NOT add anything to `package.json`.

**Version verification:** Not required — no new packages introduced.

## Architecture Patterns

### System Architecture Diagram

```
                    Email arrives (Stage 0 safe verdict)
                              │
                              ▼
                ┌──────────────────────────────┐
                │ classifier-screen-worker     │
                │   Step 1: load swarm + cats  │
                │   Step 2: regex (Pass 1)     │
                └──────┬───────────────────────┘
                       │
                       ▼
                ┌──────────────────────────┐
                │ regex returned 'unknown'?│
                └────┬─────────────────┬───┘
                no   │             yes │
                     │                 ▼
                     │      ┌─────────────────────────────────────────┐
                     │      │ Step 3: llm-call (Pass 2)              │
                     │      │   invokeOrqAgent("stage-1-category-…")  │
                     │      │                                         │
                     │      │ ★ PHASE 89 EDIT (#1):                  │
                     │      │   agent_runs.rule_key =                │
                     │      │     "llm:" + parsed.category_key       │
                     │      │     + ":" + parsed.confidence          │
                     │      └────────────────┬────────────────────────┘
                     │                       │
                     ▼                       ▼
                ┌──────────────────────────────────────────┐
                │ Step 4: emit pipeline_events            │
                │   decision_details.predictor='regex'    │
                │     OR 'llm_2nd_pass'                   │
                │   (already denormalized, no change)     │
                └──────────────┬───────────────────────────┘
                               │
                               ▼
                ┌──────────────────────────────────────────────┐
                │ Step 4.5: debtor-only dispatch (L401)        │
                │   if stage1_regex_module === DEBTOR_…        │
                │     load whitelist (readWhitelist)           │
                │     isWhitelistMatch = whitelistSet          │
                │       .has(regexOutcome.matchedRule)         │
                │                                              │
                │   ☆ NO PHASE 89 EDIT HERE                   │
                │   ☆ But once rule is promoted AND           │
                │     LLM matchedRule = "llm:auto_reply:high" │
                │     this gate flips true → auto-archive     │
                └──────────────────────────────────────────────┘

OPERATOR REVIEW PATH (Stage 1 Bulk Review UI):
                              │
       Operator clicks ✓ Approve on a row whose predictor='llm_2nd_pass'
                              │
                              ▼
                ┌──────────────────────────────────────────────┐
                │ recordVerdict(input) in stage-1/actions.ts   │
                │   schema: rule_key: z.string().min(1)        │
                │   (already free-form — accepts "llm:*")      │
                │                                              │
                │ ★ PHASE 89 EDIT (#2):                       │
                │   page.tsx row loader synthesizes            │
                │     rule_key = "llm:" + cat + ":" + conf     │
                │   when row.predictor='llm_2nd_pass'          │
                │                                              │
                │ Writes agent_runs row with that rule_key     │
                │   + human_verdict='approved'/'rejected_…'    │
                └──────────────┬───────────────────────────────┘
                               │
                               ▼
                ┌──────────────────────────────────────────────┐
                │ classifier_rule_telemetry view (UNCHANGED)   │
                │   GROUP BY (swarm_type, rule_key)            │
                │   n=count(*), agree=count filter approved    │
                │   WHERE rule_key IS NOT NULL                 │
                │     AND human_verdict IS NOT NULL            │
                └──────────────┬───────────────────────────────┘
                               │
                               ▼
                ┌──────────────────────────────────────────────┐
                │ classifier-promotion-cron (UNCHANGED)        │
                │   per (swarm_type, rule_key):                │
                │     wilsonCiLower(n, agree)                  │
                │     if shouldPromote → status='promoted'     │
                │     if shouldDemote → status='demoted'       │
                │   cron: TZ=Europe/Amsterdam 0 6 * * 1-5     │
                └──────────────────────────────────────────────┘

PHASE 89 ONE-SHOT SEED + BACKFILL (run once at deploy):
                              │
            ┌─────────────────┴────────────────────┐
            │                                      │
            ▼                                      ▼
  ┌──────────────────────────┐         ┌────────────────────────────┐
  │ Inngest one-shot:        │         │ SQL migration (one-shot):  │
  │ classifier-llm-seed      │         │ UPDATE agent_runs          │
  │   for each swarm:        │         │   SET rule_key=             │
  │     for each noise_cat:  │         │     'llm:'||stage1_category │
  │       INSERT candidate   │         │     ||':'||confidence       │
  │         rule_key=        │         │   WHERE rule_key IS NULL    │
  │           "llm:"+cat+":high" │     │     AND tool_outputs ?      │
  │       ON CONFLICT DO     │         │       'stage1_category'     │
  │         NOTHING          │         │     AND confidence IS NOT   │
  └──────────────────────────┘         │       NULL;                 │
                                       └────────────────────────────┘
```

### Recommended Project Structure (additions only)

```
supabase/migrations/
  20260520_phase89_llm_rule_key_backfill.sql      # NEW: one-shot UPDATE
web/lib/inngest/functions/
  classifier-llm-rules-seed.ts                    # NEW: mirrors classifier-backfill.ts
  __tests__/
    classifier-llm-rules-seed.test.ts             # NEW
    classifier-screen-worker.test.ts              # EDIT: add rule_key assertion
scripts/
  phase-89-shadow-eval.ts                         # NEW: Wilson-CI shadow report
```

**Files to EDIT (≤5 surgical edits):**
- `web/lib/inngest/functions/classifier-screen-worker.ts` — add `rule_key` field to `agent_runs.insert` at L265-279 (success path) AND mirror it in the failure-path insert at L306-318 (set rule_key='llm:unknown:low' for the failure-coerced row to keep that path observable).
- `web/lib/inngest/inngest.config.ts` (or wherever functions are registered) — register `classifierLLMRulesSeed`.
- `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx` — in the row-loader/row-shape (around L706 / L1163 per grep), synthesize `rule_key` for predictor='llm_2nd_pass' rows when threading into `recordVerdict`/`approvePrediction`. Verify against `pipeline_events.decision_details.predictor + .llm_category_key + .llm_confidence`.
- `web/app/(dashboard)/automations/[swarm]/stage-1/actions.ts` — `approvePrediction` already reads `run.rule_key` from `automation_runs.rule_key` (L857). Verify `automation_runs.rule_key` is populated for LLM-path predicted rows (the bulk-review write at `classifier-screen-worker.ts:548-574` writes `topic: finalCategoryKey` but does NOT write `automation_runs.rule_key`). **OPEN QUESTION resolved below: the worker must ALSO populate `automation_runs.rule_key` on the predicted bulk-review insert, OR `approvePrediction` must fall back to synthesizing it.**

### Pattern 1: Replay-safe `agent_runs` insert with synthetic rule_key

**What:** Extend the LLM path's existing insert (already inside `step.run("llm-call")`, already uses an id generated inside step.run per Phase 65) with a single new field.

**When to use:** Stage 1 worker, LLM 2nd-pass path only.

**Example:**

```typescript
// Source: web/lib/inngest/functions/classifier-screen-worker.ts:265-279
// EDIT: add rule_key field (one line addition)
const insertSuccess = await admin.from("agent_runs").insert({
  id,
  swarm_type,
  automation_run_id: automation_run_id ?? null,
  email_id,
  inngest_run_id: inngestRunId,
  entity: entity ?? null,
  status: "predicted",
  confidence: parsed.confidence,
  reasoning: parsed.reasoning,
  rule_key: `llm:${parsed.category_key}:${parsed.confidence}`,  // ★ NEW
  tool_outputs: {
    stage1_category: parsed.category_key,
    gated_to: finalKey,
  },
});
```

Also mirror the same `rule_key` synthesis on the matchedRule emit-site so the `whitelistSet.has(matchedRule)` check at L492 sees `"llm:auto_reply:high"` instead of `"no_match"`:

```typescript
// Source: web/lib/inngest/functions/classifier-screen-worker.ts (around L491)
// EDIT: when llmInvoked=true, synthesize matchedRule from LLM output
const effectiveMatchedRule = llmInvoked && llmCategoryKey && llmConfidence
  ? `llm:${llmCategoryKey}:${llmConfidence}`
  : (regexOutcome.matchedRule ?? "");
const isWhitelistMatch = whitelistSet.has(effectiveMatchedRule);
```

Note: this changes the value passed to `whitelistSet.has(...)`. Existing regex behavior is preserved because `llmInvoked=false` falls through to `regexOutcome.matchedRule ?? ""` (unchanged).

### Pattern 2: Eager seed mirroring `classifier-backfill.ts`

**What:** One-shot Inngest function that reads `(swarms × swarm_noise_categories)` and upserts `candidate` rule rows.

**When to use:** Once at deploy; re-runnable any time a new swarm or noise category lands (idempotent).

**Example:**

```typescript
// NEW FILE: web/lib/inngest/functions/classifier-llm-rules-seed.ts
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarmNoiseCategories } from "@/lib/swarms/registry";

const CONFIDENCE_LEVELS = ["high"] as const; // CONTEXT D-03: high only.

export const classifierLLMRulesSeed = inngest.createFunction(
  { id: "classifier/llm-rules-seed", retries: 1 },
  { event: "classifier/llm-rules-seed.run" },
  async ({ step }) => {
    return step.run("seed-llm-rules", async () => {
      const admin = createAdminClient();
      const now = new Date().toISOString();

      // Read every active swarm from the registry.
      const { data: swarmRows, error: swarmErr } = await admin
        .from("swarms")
        .select("swarm_type")
        .eq("enabled", true);
      if (swarmErr) throw new Error(`swarms load failed: ${swarmErr.message}`);

      let seeded = 0;
      for (const sw of swarmRows ?? []) {
        const cats = await loadSwarmNoiseCategories(admin, sw.swarm_type);
        // Exclude the 'unknown' fall-through key — it routes to Stage 2,
        // not categorize_archive, so promoting an LLM rule_key for it is
        // a category error (hard-separation: 'unknown' has action='manual_review'
        // or 'swarm_dispatch', never 'categorize_archive').
        for (const cat of cats.filter((c) => c.category_key !== "unknown" && c.enabled !== false)) {
          for (const conf of CONFIDENCE_LEVELS) {
            const rule_key = `llm:${cat.category_key}:${conf}`;
            const { error } = await admin.from("classifier_rules").upsert(
              {
                swarm_type: sw.swarm_type,
                rule_key,
                kind: "agent_intent",   // ★ NOTE: the existing enum is ('regex','agent_intent') — 'agent_intent' is the closest fit for "LLM 2nd-pass output". DO NOT introduce a new kind value (would require migration + check-constraint change). See Open Question 1.
                status: "candidate",
                n: 0,
                agree: 0,
                ci_lo: null,
                last_evaluated: null,
                notes: "Phase 89 — LLM 2nd-pass noise classifier",
              },
              { onConflict: "swarm_type,rule_key" },
            );
            if (error) {
              throw new Error(`upsert failed for ${rule_key}: ${error.message}`);
            }
            seeded++;
          }
        }
      }
      return { seeded };
    });
  },
);
```

### Pattern 3: Historic backfill SQL migration (idempotent)

```sql
-- Source: copy CONTEXT decision verbatim
-- web/supabase/migrations/20260520_phase89_llm_rule_key_backfill.sql
UPDATE public.agent_runs
SET rule_key = 'llm:' || (tool_outputs->>'stage1_category') || ':' || confidence
WHERE rule_key IS NULL
  AND tool_outputs ? 'stage1_category'
  AND confidence IS NOT NULL;
```

Idempotent because the `WHERE rule_key IS NULL` clause excludes already-updated rows on re-run.

### Anti-Patterns to Avoid

- **DON'T** modify `classifier_rule_telemetry`. Locked decision. The view already does the right thing.
- **DON'T** modify the dispatch gate at `classifier-screen-worker.ts:401`. Locked decision (Phase 88's job).
- **DON'T** introduce a per-swarm `if swarm_type === '…'` branch anywhere — violates `docs/collaboration.md` rule #1 ("Per-swarm if-branch in classify.ts / classifier worker") and REQ-6 enforced by `classifier-screen-worker.test.ts` regex grep.
- **DON'T** generate UUIDs or `Date.now()` outside `step.run()` (CLAUDE.md Phase 65 replay-id learning). The existing insert already follows this; preserve it.
- **DON'T** destructure `inngest.send`. CLAUDE.md commit dae6276. The existing worker uses the `SendFn` cast pattern.
- **DON'T** retro-stamp `human_verdict` in the backfill migration. Locked CONTEXT decision Q2.
- **DON'T** hand-edit `*.generated.ts` files.
- **DON'T** seed `llm:unknown:*` rule_keys. `unknown` has `action='manual_review'` or `'swarm_dispatch'`, never `'categorize_archive'` — promoting it would activate auto-archive on the fall-through bucket. The seed code explicitly filters `category_key !== "unknown"`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Wilson CI lower bound calculation | Custom binomial formula | `wilsonCiLower(n, agree)` in `@/lib/classifier/wilson` | Already verified vs. empirical CI-lo values (Phase 60-00 D-02). Constants tuned via Phase 60-08 (PROMOTE_CI_LO_MIN=0.92) + 2026-05-20 asymmetric-hysteresis fix (DEMOTE_N_MIN=30). |
| Whitelist set caching | Custom in-memory cache | `readWhitelist(admin, swarm_type)` in `@/lib/classifier/cache` | 60s TTL + last-known-good fallback + FALLBACK_WHITELIST for debtor-email already implemented. |
| Promotion cron loop | Custom evaluator | `classifierPromotionCron` Inngest function | Already shadow-mode by default (`CLASSIFIER_CRON_MUTATE=false`), already iterates view, already handles `manual_block`, already writes append-only `classifier_rule_evaluations` audit. |
| Telemetry aggregation | Custom GROUP BY | `classifier_rule_telemetry` view | Already correct contract: `(swarm_type, rule_key, n, agree)` where agree = count filter `human_verdict IN ('approved','edited_minor')`. |
| ON CONFLICT upsert pattern | Custom INSERT … ON CONFLICT … in raw SQL | Supabase JS `.upsert(..., { onConflict: "swarm_type,rule_key" })` | Already used in `classifier-backfill.ts:57-71`. Same unique constraint exists on `classifier_rules`. |
| Inngest one-shot trigger | Cron set to run-once | Event-only trigger (`{ event: "classifier/llm-rules-seed.run" }`) | Mirrors `classifier-backfill.ts:50`. Fired manually via Inngest dashboard at deploy; re-runnable any time. |

**Key insight:** Phase 89 is mostly composition of existing pieces — the only new code is one Inngest function file (~40 lines), one SQL migration (~5 lines), one field added to an existing insert, and the synthesis of `effectiveMatchedRule`. The verification harness is ~50 lines of tsx.

## Runtime State Inventory

Phase 89 is an extension phase, not a rename/refactor/migration. Still, per the rename-checklist principle ("after every file is updated, what runtime systems still have stale state?"), here is the inventory:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `public.agent_runs` rows where `rule_key IS NULL` for historic LLM verdicts. Expected ~tens to low-hundreds of rows based on Phase 74's launch date (2026-05-06) + observation "3 of 9 noise verdicts/day are LLM". | One-shot SQL UPDATE migration (CONTEXT Q2 decision). Idempotent. |
| Stored data (secondary) | `public.automation_runs` rows for predicted bulk-review LLM rows have `topic` set but **may not have `rule_key`** populated (the worker's `write-predicted-bulk-review` step at L548-574 does not include `rule_key` in the INSERT). | **Plan must verify this with a quick SELECT** and decide: (a) extend the worker to write `automation_runs.rule_key='llm:*'` going forward, AND (b) backfill historic predicted rows OR have `approvePrediction` synthesize the key from `pipeline_events.decision_details` if `run.rule_key` is null on an LLM-predictor row. See Open Question 1. |
| Live service config | None — no n8n / Datadog / external service refs in this phase. | None |
| OS-registered state | None — no Task Scheduler / pm2 / systemd refs. | None |
| Secrets/env vars | `CLASSIFIER_CRON_MUTATE` — existing flag, not changing. Leave at `false` for Phase 89 shadow validation; flip to `true` after operator review (already the process used for Phase 60-07). | Document in plan: do NOT flip mutate flag as part of Phase 89; that's a separate operational step after the shadow report identifies the first promotable rule. |
| Build artifacts / installed packages | `web/lib/swarms/*.generated.ts` and `web/lib/automations/debtor-email/coordinator/*.generated.ts` — only affected if `Stage1OutputSchema.confidence` enum or `swarm_noise_categories` shape changes (both unchanged). | `npm run codegen && git diff --exit-code` as CI gate (already standard per CLAUDE.md). Should produce zero diff for Phase 89. |

## Common Pitfalls

### Pitfall 1: `automation_runs.rule_key` may be unset for LLM-predicted bulk-review rows
**What goes wrong:** `approvePrediction` (L856-858) throws `automation_runs.rule_key missing` if the worker's predicted-bulk-review insert (L548-574) doesn't write `rule_key`. Grepping shows that insert does NOT carry rule_key. So today, when a regex predicts and the row goes to bulk-review, the row has rule_key=null and `approvePrediction` would throw. **This may already be a latent bug** for regex predicted rows; verify with a quick SELECT.
**Why it happens:** The worker's audit-row writes at L548-574, L631-650, L670-688, L702-727, L730-754 all set `topic: finalCategoryKey` but never `rule_key`. Yet `approvePrediction` requires it (line 855-857).
**How to avoid:** **Plan must inspect this carefully.** Two options: (a) extend ALL the worker's `automation_runs.insert` sites to include `rule_key: effectiveMatchedRule` (regex matchedRule OR LLM-synthesized), (b) make `approvePrediction` fall back to deriving rule_key from `pipeline_events.decision_details` when `run.rule_key` is null. Option (a) is the cleaner write-path fix; option (b) is the safer compatibility shim. **Recommendation:** do both — write rule_key going forward, fall back when historic. Discuss in plan-check.
**Warning signs:** Test failures in `approvePrediction` path with `automation_runs.rule_key missing`. Pre-existing operator pain on regex predicted rows would have surfaced this already, so check whether `recordVerdict` calls today are sourcing rule_key from a different place than `automation_runs.rule_key` (probably from `pipeline_events` decision_details — see `recordVerdict.predictor` derivation at L147-166 for the precedent).

### Pitfall 2: `effectiveMatchedRule` change can flip behavior on regex rows
**What goes wrong:** If the change to `effectiveMatchedRule` is wrong, a regex-matched row's `matchedRule` could become `"llm:*"` and miss the existing promoted-regex whitelist (which has rule_keys like `payment_subject`). Behavior regression.
**Why it happens:** Confusing the regex matchedRule with the LLM rule_key.
**How to avoid:** Strict guard: `if (llmInvoked && llmCategoryKey && llmConfidence)` ELSE keep `regexOutcome.matchedRule ?? ""`. Add a test case for regex-path (llmInvoked=false) that asserts `matchedRule="payment_subject"` is preserved.
**Warning signs:** `classifier-screen-worker.gate.test.ts` "regex hit" test fails. Or live regression: `automation_runs` rows with `result.predicted.rule="payment_subject"` no longer auto-archive.

### Pitfall 3: `kind` enum on classifier_rules — choosing `'regex'` vs `'agent_intent'`
**What goes wrong:** `classifier_rules.kind` has check constraint `kind in ('regex', 'agent_intent')`. Neither is a perfect fit for "LLM 2nd-pass noise classifier output." Picking `'regex'` is semantically wrong; picking `'agent_intent'` overloads the term (it was coined for Stage 3 intent agent rule_keys like `intent:copy_invoice`). Introducing a new value `'llm_noise_2nd_pass'` requires a migration that drops + re-adds the check constraint, plus updating any UI consumer that filters on `kind`.
**Why it happens:** The existing enum was designed before Stage 1 LLM 2nd-pass existed (Phase 60 predates Phase 74).
**How to avoid:** **Recommended:** use `'agent_intent'` (semantically nearest neighbor: it's an LLM agent's output used as a rule_key) and document the overload in the seed function's `notes` field. **Alternative:** plan a tiny check-constraint migration if discuss-phase wants a new value. ★ See Open Question 2.
**Warning signs:** UI on `/classifier-rules` dashboard grouping by `kind` looks weird ("agent_intent" rows mixed with Stage 3 intent rules). Acceptable for Phase 89; Phase 88+/V9 can revisit.

### Pitfall 4: Eager seed runs before swarms table is populated for new swarms
**What goes wrong:** If `/gsd-execute-phase 89` runs before a new swarm (e.g. info@smeba.nl per Phase 88) is INSERTed into `swarms`, the seed misses that swarm's `llm:*:high` rows. Operator onboards the new swarm, Phase 89 seed isn't re-fired, so the new swarm's LLM verdicts never accumulate telemetry under the right rule_key.
**Why it happens:** Phase 89 is independent of 88; either order is valid.
**How to avoid:** Document that the seed event MUST be re-fired any time a new swarm or `swarm_noise_categories` row is added. Idempotency guarantees safety. Optionally: add an `inngest.send({name:"classifier/llm-rules-seed.run"})` call to the post-deploy hook for any swarm-registry migration. **For Phase 89 itself:** plan can fire the seed twice — once now for debtor-email + sales-email (current swarms), and document the re-fire requirement in the seed function's JSDoc.
**Warning signs:** New swarm onboards, telemetry view shows `(swarm_type='info-routing', rule_key='llm:…', n=15, agree=15)` but `classifier_rules` has no matching row, so the cron's `ruleByKey.get(key)` returns undefined → defaults to `status='candidate'`. Actually — this works! The cron treats missing rule as candidate. So the failure mode is softer than feared: no row in `classifier_rules` just means the dashboard doesn't show the rule, but promotion can still happen (cron inserts on promote via UPDATE … but UPDATE on a non-existent row is a no-op). Need to verify this. **Open Question 3.**

### Pitfall 5: Stage 1 LLM agent output enum may evolve
**What goes wrong:** If `Stage1OutputSchema.confidence` ever gains a `"very_high"` level, the seed function (which hardcodes `CONFIDENCE_LEVELS = ["high"]`) silently drops it.
**Why it happens:** The seed function is hand-edited and the Zod schema is hand-edited; no codegen link between them today.
**How to avoid:** Comment in the seed function pointing at `Stage1OutputSchema` as the source of truth for the confidence enum. If the schema changes, re-fire the seed. Optionally: derive `CONFIDENCE_LEVELS` from a shared const exported from `Stage1OutputSchema`.

## Code Examples

### Verified pattern 1: Inngest one-shot event function

```typescript
// Source: web/lib/inngest/functions/classifier-backfill.ts:48-81
export const classifierBackfill = inngest.createFunction(
  { id: "classifier/backfill", retries: 1 },
  { event: "classifier/backfill.run" },
  async ({ step }) => {
    return step.run("seed-classifier-rules", async () => {
      const admin = createAdminClient();
      // … upsert loop with onConflict: "swarm_type,rule_key"
    });
  },
);
```

### Verified pattern 2: agent_runs insert inside step.run with synthetic rule_key

```typescript
// Source: web/lib/inngest/functions/classifier-screen-worker.ts:240-280
// Replay-safe: id generated INSIDE step.run per Phase 65 learning
const llmResult = await step.run("llm-call", async () => {
  const id = crypto.randomUUID();  // ★ inside step.run — CLAUDE.md
  // …
  const insertSuccess = await admin.from("agent_runs").insert({
    id,
    swarm_type,
    /* … existing fields … */
    // PHASE 89 ★ NEW:
    rule_key: `llm:${parsed.category_key}:${parsed.confidence}`,
  });
});
```

### Verified pattern 3: Wilson CI evaluator (reusable from harness)

```typescript
// Source: web/lib/classifier/wilson.ts
import { wilsonCiLower, shouldPromote } from "@/lib/classifier/wilson";
const ci_lo = wilsonCiLower(telemetry.n, telemetry.agree);
const willPromote = shouldPromote(telemetry.n, ci_lo); // n>=30 && ci_lo>=0.92
```

### Verified pattern 4: Backfill harness script (Phase 65 precedent)

```typescript
// Source: scripts/phase-65-regression-backfill.ts (existence verified)
// Pattern: standalone tsx script, reads Supabase via service role,
// processes in batches, prints summary. Idempotent.
// Phase 89 harness reads classifier_rule_telemetry post-backfill,
// computes ci_lo for every (swarm_type, rule_key) starting "llm:",
// lists rule_keys with shouldPromote(n, ci_lo)=true.
```

### Verified pattern 5: Tests — mock harness for classifier-screen-worker

```typescript
// Source: web/lib/inngest/functions/__tests__/classifier-screen-worker.gate.test.ts:25-122
// Pattern: vi.mock for client/registry/Orq/admin; makeStepStub for step.run;
// adminMock tracks agent_runs inserts in agentRunsInserts: Record<string,unknown>[]
// Phase 89 test additions:
//   - "LLM high → agent_runs row carries rule_key='llm:payment_admittance:high'"
//   - "regex hit → matchedRule preserved (effectiveMatchedRule fallback)"
//   - "isWhitelistMatch=true when promoted llm:auto_reply:high in whitelist"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| LLM verdicts always bulk-review (matchedRule="no_match") | LLM verdicts carry `llm:{cat}:{conf}` rule_key; promotable via existing Wilson-CI | Phase 89 (this phase) | Closes auto-archive gap observed 2026-05-19 (3 LLM noise → 3 bulk-review). |
| Per-swarm if-branch for auto-action | Registry-driven dispatch via `stage1_regex_module` + `swarm_noise_categories.action` | Phase 68 (registry generalisation) — completed | Phase 89 inherits this; debtor-only dispatch gate at L401 is the last per-swarm vestige, deferred to Phase 88. |
| `PROMOTE_CI_LO_MIN = 0.95` | `PROMOTE_CI_LO_MIN = 0.92` | Phase 60-08 | Phase 89 inherits 0.92 floor. |
| Demotion at any n | `DEMOTE_N_MIN = 30` | 2026-05-20 (asymmetric-hysteresis fix) | Phase 89 inherits — LLM rules cannot flip-demote from low n. |
| Phase 74 prompt-only stage-1 classifier | Phase 999.8 confidence gate (`high`→auto, `medium/low`→bulk-review) | Phase 999.8 | Phase 89 layers on top: only `high` confidence is even a candidate for promotion (per CONTEXT Q3). |

**Deprecated/outdated:** none relevant to this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `automation_runs.rule_key` is NOT populated on the LLM-path predicted bulk-review insert at L548-574 (verified by grep — no `rule_key` field in that insert block). Therefore `approvePrediction` would throw `rule_key missing` on LLM-predicted rows today. | Pitfall 1 / Edit Sites | HIGH — if A1 wrong and rule_key IS set somewhere I missed, Pitfall 1 is moot. Plan should SELECT one row to verify. |
| A2 | Choosing `kind='agent_intent'` on the new `llm:*:high` `classifier_rules` rows will not break the `/classifier-rules` dashboard. | Pitfall 3 | LOW — dashboard groups by category, not by kind (verified by reading `candidate-rule-list.tsx`); the kind column is informational. |
| A3 | The Phase 999.8 gate (`gateClearsForAutoArchive`) at L802-805 still applies AFTER Phase 89 makes LLM rules promotable — only `high` confidence promotion + high confidence at predict time produces auto-archive. Medium/low LLM verdicts go to bulk-review regardless of rule_key promotion. | Architecture diagram | LOW — verified: the gate is independent of the whitelist check; both must clear. CONTEXT Q3 explicitly seeds `high` only. |
| A4 | The debtor-only dispatch gate at L401 currently inspects `regexOutcome.matchedRule` (which is "no_match" for LLM path). After Phase 89's `effectiveMatchedRule` change, the LLM path will see the synthesized `llm:*:high` value, which means the dispatch gate's `isWhitelistMatch` will flip true once the rule is promoted. This is the intended SC-89-04 mechanism. | Pattern 1 | HIGH — this is THE behavior change. If wrong, SC-89-04 doesn't satisfy. Plan must add an integration test asserting "promoted llm:auto_reply:high + LLM auto_reply high → labeled" branch returns `dispatch: "labeled"`. |
| A5 | `swarms` table has a column queryable as `.eq("enabled", true)` for the seed function loop. | Pattern 2 example | LOW — visible in DEBTOR_SWARM_ROW fixture (`enabled: true` at gate.test.ts L168). Verify with one SELECT before plan locks. |
| A6 | The seed function should EXCLUDE `category_key='unknown'` because that category's action is `manual_review` / `swarm_dispatch`, never `categorize_archive`. | Pattern 2 example + Anti-Patterns | HIGH — promoting `llm:unknown:high` would activate auto-archive on the fall-through bucket and silently drop every email the LLM is unsure about. CRITICAL filter. |
| A7 | The historic backfill `UPDATE` correctly recovers rule_key for LLM verdicts because `tool_outputs.stage1_category` is written on both success path (L275-278) and failure path (L317). Verified by reading both insert sites. | Pattern 3 | LOW — confirmed in code. |

## Open Questions (RESOLVED)

1. **Does `automation_runs.rule_key` get written for predicted rows today, or is it always null and `approvePrediction` was untested in that path?**
   - What we know: Worker's bulk-review insert (L548-574) does NOT include `rule_key`. `approvePrediction` (L855-858) requires it.
   - What's unclear: Whether regex-predicted rows that go to bulk-review (rare: regex+matched but `!auto_label_enabled` or `!isWhitelistMatch`) have ever been operator-approved post-Phase-82.6. If yes, somewhere fills rule_key; if no, this is a latent bug.
   - RESOLVED BY PLAN 01 WAVE 0 PROBE: Plan Wave 0 inserts one SELECT to check: `SELECT id, rule_key, result->>'predicted'->>'rule' FROM automation_runs WHERE automation='debtor-email-review' AND status='predicted' AND swarm_type='debtor-email' LIMIT 10`. If `rule_key IS NULL` for these rows, Phase 89 plan must extend the worker to also write `automation_runs.rule_key` (using same `effectiveMatchedRule` value) — this is the cleanest fix and benefits regex rows too. Decision recorded as DECISION-01 in 089-WAVE0-PROBE.md (default YES; Plan 02 Edit Site 4 applies).

2. **`classifier_rules.kind` enum: use `'agent_intent'` or introduce `'llm_noise_2nd_pass'`?**
   - What we know: Existing enum is `('regex', 'agent_intent')`. `'agent_intent'` was coined for Stage 3 intent agent rule_keys (`intent:copy_invoice`); using it for Stage 1 LLM 2nd-pass overloads the term.
   - What's unclear: Whether discuss-phase wants the cleaner semantic split now or later.
   - RESOLVED: Default to `'agent_intent'` for Phase 89 (zero migration cost, semantically nearest); document as a known overload. Locked in CONTEXT D-03 + implemented in Plan 03 seed function. If plan-check or discuss-phase want a new value, a 1-line check-constraint migration suffices: `ALTER TABLE classifier_rules DROP CONSTRAINT classifier_rules_kind_check; ALTER TABLE classifier_rules ADD CONSTRAINT classifier_rules_kind_check CHECK (kind IN ('regex','agent_intent','llm_noise_2nd_pass'));` (deferred — not Phase 89's scope).

3. **Cron behavior when telemetry row exists for a rule_key with no `classifier_rules` row:**
   - What we know: `classifier-promotion-cron` builds `ruleByKey` map then calls `evaluateRule(admin, t, ruleByKey.get(key), mutate)` — `rule` is `undefined` when missing.
   - What `evaluateRule` does with undefined: `const status = rule?.status ?? "candidate"`. So it treats missing as candidate. Then `promote = status === "candidate" && shouldPromote(...)`. If true, the UPDATE … WHERE rule_key=… runs against zero rows (no-op). Telemetry row is still recorded but rule never flips to promoted in the table.
   - RESOLVED: this is fine for Phase 89 — the seed populates every active (swarm × cat × high) combo so the UPDATE has a target. For a swarm onboarded post-Phase-89, the re-fire-the-seed protocol is the prevention. Documented in Plan 03 seed function JSDoc (RE-FIRE requirement).

4. **How does today's row-loader thread rule_key into `recordVerdict`?**
   - What we know: `recordVerdict` accepts `rule_key: z.string().min(1)`. `approvePrediction` reads it from `automation_runs.rule_key`. Some other call sites (e.g. `race-cohort-banner.tsx:80`) call `recordVerdict` directly with their own rule_key value.
   - What's unclear: Whether the Stage 1 row loader currently passes rule_key in its row shape that feeds the override/approve UI.
   - RESOLVED BY PLAN 01 WAVE 0 PROBE: Plan Wave 0 reads `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx` around L700-720 and L1160-1170 (greppable hits) to inventory the row shape. If row.rule_key already exists from a `pipeline_events`/`agent_runs` join, the LLM path's new rule_key flows through automatically once the worker writes it. If not, add a small RSC-side derivation: `row.rule_key ?? synthesizeLlmRuleKey(row.decision_details)`. DECISION-02 in 089-WAVE0-PROBE.md locks the exact `decision_details` field paths the Plan 05 row-loader synthesizes from.

## Environment Availability

Phase 89 has no new external dependencies — all infra (Supabase, Inngest, Orq.ai) is already provisioned and serving the existing classifier-screen-worker / classifier-promotion-cron. **Step 2.6: no new probes needed.**

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase (service role) | Migration + worker insert + seed function | ✓ | (existing) | — |
| Inngest | New one-shot seed function | ✓ | (existing — function registers via `inngest.config.ts`) | — |
| Orq.ai `stage-1-category-classifier` agent | Already invoked by classifier-screen-worker LLM path | ✓ | (existing — Phase 74 + Phase 999.8 calibration) | — |
| `npm run codegen` | CI gate (should produce zero diff for Phase 89) | ✓ | (existing — `tsx scripts/gen-entity-types.ts`) | — |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing) |
| Config file | `web/vitest.config.ts` (existing) |
| Quick run command | `cd web && npx vitest run lib/inngest/functions/__tests__/classifier-screen-worker.test.ts lib/inngest/functions/__tests__/classifier-screen-worker.gate.test.ts` |
| Full suite command | `cd web && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC-89-01 | `classifier_rules` carries `llm:*:high` rows after seed run | unit | `npx vitest run lib/inngest/functions/__tests__/classifier-llm-rules-seed.test.ts` | ❌ Wave 0 |
| SC-89-01 | Seed is idempotent (re-run produces zero new rows) | unit | (same test file, additional case) | ❌ Wave 0 |
| SC-89-01 | Seed excludes `category_key='unknown'` | unit | (same test file, guard case) | ❌ Wave 0 |
| SC-89-02 | Worker LLM path writes `agent_runs.rule_key='llm:{cat}:{conf}'` | unit | `npx vitest run lib/inngest/functions/__tests__/classifier-screen-worker.test.ts -t "rule_key"` | ✅ (edit existing) |
| SC-89-02 | Worker `effectiveMatchedRule` = LLM rule_key when llmInvoked=true | unit | (extend `classifier-screen-worker.gate.test.ts` or sibling) | ✅ (extend) |
| SC-89-02 | Regex-hit path's matchedRule is preserved (no regression) | unit | (extend `classifier-screen-worker.gate.test.ts` regex-hit case) | ✅ (extend) |
| SC-89-02 | `recordVerdict` accepts `rule_key='llm:auto_reply:high'` and writes to `agent_runs` | unit | `npx vitest run app/\\(dashboard\\)/automations/\\[swarm\\]/stage-1/__tests__/actions.predictor.test.ts` | ✅ (extend) |
| SC-89-03 | Idempotent SQL migration applied; second run no-op | manual + SQL diff | Manual: `psql -f supabase/migrations/20260520_phase89_…sql` twice; expect 0 rowcount on 2nd run | ❌ Wave 0 (migration apply is a checkpoint) |
| SC-89-03 | Shadow report identifies ≥1 promotable `llm:*:high` rule_key | integration script | `cd web && npx tsx scripts/phase-89-shadow-eval.ts` | ❌ Wave 0 |
| SC-89-04 | Promoted `llm:auto_reply:high` → LLM verdict `(auto_reply, high)` → dispatch="labeled" | unit | (new test case in `classifier-screen-worker.gate.test.ts` or `.dispatch.test.ts` sibling) | ❌ Wave 0 |
| SC-89-04 | Live verification: post-promotion, `automation_runs` row with `triggered_by='stage-1-worker' AND result->>'stage'='categorize+archive'` exists for a known LLM-categorized email | manual (operator UAT) | `SELECT id, result FROM automation_runs WHERE triggered_by='stage-1-worker' AND result->>'stage'='categorize+archive' AND result->>'predicted'->>'rule' LIKE 'llm:%' ORDER BY created_at DESC LIMIT 5` | manual-only |
| SC-89-05 | Negative check — git diff doesn't touch `classifier_rule_telemetry.sql`, `classifier-promotion-cron.ts`, or `classifier-screen-worker.ts:401` | static lint | `git diff --name-only main…HEAD \| grep -E '(classifier_rule_telemetry\|promotion-cron)' \| wc -l` should be `0`; AND `git diff classifier-screen-worker.ts` should not modify L401 dispatch gate condition | manual review |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run lib/inngest/functions/__tests__/classifier-screen-worker.test.ts lib/inngest/functions/__tests__/classifier-screen-worker.gate.test.ts lib/inngest/functions/__tests__/classifier-llm-rules-seed.test.ts`
- **Per wave merge:** `cd web && npx vitest run lib/inngest/ app/\\(dashboard\\)/automations/\\[swarm\\]/stage-1/`
- **Phase gate:** Full suite green (`cd web && npm test`) before `/gsd-verify-work`. Plus the shadow-eval tsx script returning ≥1 promotable rule_key. Plus operator UAT confirming SC-89-04 live verification SELECT.

### Wave 0 Gaps
- [ ] `web/lib/inngest/functions/__tests__/classifier-llm-rules-seed.test.ts` — unit test for new seed function (mocking swarms + swarm_noise_categories loaders, asserting upsert calls with correct rule_keys, idempotency, excludes 'unknown')
- [ ] `web/lib/inngest/functions/classifier-llm-rules-seed.ts` — new Inngest function
- [ ] `supabase/migrations/20260520_phase89_llm_rule_key_backfill.sql` — one-shot UPDATE
- [ ] `scripts/phase-89-shadow-eval.ts` — Wilson-CI shadow reporter (reads view, filters `rule_key LIKE 'llm:%'`, prints promotable rule_keys with their n/agree/ci_lo)
- [ ] Extension of `classifier-screen-worker.gate.test.ts` (or sibling `.rule-key.test.ts`) with the new rule_key + effectiveMatchedRule assertions
- [ ] Extension of `recordVerdict` tests for `llm:*` rule_key acceptance + agent_runs write assertion

*(No framework install needed; vitest already configured.)*

## Security Domain

`security_enforcement` config: not set in `.planning/config.json` → treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth change in this phase. |
| V3 Session Management | no | Server actions inherit existing Supabase auth context (already authenticated). |
| V4 Access Control | yes | `recordVerdict` already gates via `createClient()` for reviewer email; service-role for the actual writes. Phase 89 adds no new endpoints. New Inngest seed function is service-role-only (no client surface). |
| V5 Input Validation | yes | `rule_key` is already validated as `z.string().min(1)` (free-form). Phase 89 doesn't tighten it — that's intentional (regex AND LLM rule_keys coexist per agent_runs.sql comment L27). Backfill SQL uses `tool_outputs->>'stage1_category'` which could be any JSON value; constraint: the resulting rule_key string is only ever passed to `whitelistSet.has(...)` (read-only) — no SQL injection vector. |
| V6 Cryptography | no | No new crypto. UUIDs already generated inside step.run via `crypto.randomUUID()`. |

### Known Threat Patterns for {Inngest worker + Supabase service-role + Next.js server action}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tampered form submission promoting arbitrary rule_key | Tampering | Existing `mutateRuleStatus` (L557-600) verifies the rule exists in `candidate` status before promoting. Phase 89 inherits this safeguard. |
| Operator double-action via stale tab | Tampering | Existing `assertActionable` (L321-329) gate. Phase 89 inherits. |
| Replay-induced double-write of agent_runs | Tampering / replay | Existing step.run-scoped id generation. Phase 89's new rule_key field is inside the same step.run, replay-safe. |
| Backfill UPDATE running twice and double-counting | Tampering | Idempotent `WHERE rule_key IS NULL` clause. Documented CONTEXT decision Q2. |
| Seed function fires before swarm onboard, missing new swarm's rule_keys | DoS (soft) | Document re-fire requirement; cron's `evaluateRule` is graceful when classifier_rules row is absent (Open Q3). |

## Sources

### Primary (HIGH confidence — verified by reading the live file in this session)
- `web/lib/inngest/functions/classifier-screen-worker.ts` (849 lines, full read) — Phase 89 edit sites L265-279, L401, L491-492, L548-574.
- `web/lib/inngest/functions/classifier-promotion-cron.ts` (220 lines, full read) — Wilson-CI evaluator, telemetry/rules load, evaluateRule contract.
- `web/lib/inngest/functions/classifier-backfill.ts` (81 lines, full read) — eager-seed precedent.
- `web/app/(dashboard)/automations/[swarm]/stage-1/actions.ts` (878 lines, full read) — recordVerdict + approvePrediction contracts, predictor derivation pattern, rule mutation safeguard.
- `supabase/migrations/20260428_classifier_rules.sql` (full read) — table shape, kind enum, status enum, unique(swarm_type,rule_key).
- `supabase/migrations/20260428_classifier_rule_telemetry.sql` (full read) — view definition, rule_key+human_verdict filter.
- `supabase/migrations/20260428_public_agent_runs.sql` (full read) — agent_runs columns, rule_key as free-form text, swarm_type+rule_key index, human_verdict enum.
- `web/lib/classifier/wilson.ts` (full read) — thresholds (PROMOTE_N_MIN=30, PROMOTE_CI_LO_MIN=0.92, DEMOTE_N_MIN=30, DEMOTE_CI_LO_MAX=0.88).
- `web/lib/classifier/cache.ts` (full read) — readWhitelist contract, 60s TTL, FALLBACK_WHITELIST.
- `web/lib/inngest/functions/__tests__/classifier-screen-worker.gate.test.ts` (full read) — mock harness pattern, fixture shapes (DEBTOR_SWARM_ROW, DEBTOR_CATEGORIES).
- `docs/agentic-pipeline/stage-1-regex.md` (full read) — RFC noise-filter contract, source-of-truth invariant for noise key enum, hard-separation rule.
- `docs/collaboration.md` (full read) — workspace + codegen + migration discipline.
- `.planning/phases/089-stage-1-llm-2nd-pass-auto-action-promotion-track/089-CONTEXT.md` + `089-DISCUSSION-LOG.md` (full read) — locked decisions.
- `.planning/ROADMAP.md` Phase 89 detail block (L1331-1342) and summary (L606) — acceptance criteria.
- `.planning/STATE.md` (full read) — v8.0 closure status, v8.1 sequencing.
- `CLAUDE.md` (in context) — Inngest replay rules, codegen pattern, Orq.ai patterns, Wilson-CI promotion lineage.

### Secondary (MEDIUM confidence — grepped, not fully read)
- Stage-1 row loader at `page.tsx:706` + `:1163` (grep hits for `recordVerdict` shape comments). Plan should fully read these spans during Wave 0.
- `web/app/(dashboard)/automations/[swarm]/_shell/_lib/build-stage-audit-map.ts:389` — `rule_key: matchedRule ?? category` derivation in the audit-map builder; suggests UI already has a synthesis path that LLM rows would inherit.

### Tertiary (none — no LOW-confidence claims in this research)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library already in use; no new deps.
- Architecture: HIGH — verified against live code, RFC docs, and CONTEXT decisions; aligns with all four locked decisions.
- Pitfalls: HIGH for #1-#5 (each verified against code); #1 has an explicit Open Question + recommended Wave 0 SELECT to confirm.
- Validation architecture: HIGH — mirrors existing classifier-screen-worker.gate.test.ts patterns; seed test is a clean unit-mock surface.

**Research date:** 2026-05-20
**Valid until:** 2026-06-20 (30 days — stable internal code; only invalidated by a new classifier_rules schema change or a Phase 88 dispatch-gate refactor landing first).
