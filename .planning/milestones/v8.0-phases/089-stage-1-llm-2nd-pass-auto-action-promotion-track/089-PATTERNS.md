# Phase 89: Stage 1 LLM 2nd-pass auto-action promotion track — Pattern Map

**Mapped:** 2026-05-20
**Files analyzed:** 7 (3 new, 4 edits)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `web/lib/inngest/functions/classifier-llm-rules-seed.ts` (NEW) | Inngest one-shot | event-driven, upsert batch | `web/lib/inngest/functions/classifier-backfill.ts` | exact |
| `supabase/migrations/20260520_phase89_llm_rule_key_backfill.sql` (NEW) | SQL migration | one-shot UPDATE | `supabase/migrations/20260428_classifier_rules.sql` (schema ref); historic UPDATE shape from CONTEXT D-02 | role-match (no exact prior UPDATE-only migration) |
| `scripts/phase-89-shadow-eval.ts` (NEW) | tsx harness | read-only query + Wilson-CI compute | `scripts/phase-65-regression-backfill.ts` | exact (harness shape) |
| `web/lib/inngest/functions/classifier-screen-worker.ts` (EDIT L265-279, L306-318, L488-494) | Inngest worker | LLM-path insert + whitelist gate | self (regex-path insert at same file) | exact (in-file parity) |
| `web/app/(dashboard)/automations/[swarm]/stage-1/actions.ts` (EDIT `recordVerdict` ~L168-191) | Next.js server action | request-response, agent_runs insert | self (predictor derivation L147-166) | exact (already accepts free-form `rule_key`) |
| `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx` (EDIT row-loader ~L706, ~L1163) | RSC row-loader | SSR data shaping | self (predictor derivation L982-1004) | exact |
| `web/lib/inngest/functions/__tests__/classifier-llm-rules-seed.test.ts` (NEW) | vitest | mock harness | `web/lib/inngest/functions/__tests__/classifier-screen-worker.gate.test.ts` | role-match (gate test → seed test) |
| `web/lib/inngest/functions/__tests__/classifier-screen-worker.test.ts` (EDIT — add rule_key assertions) | vitest | mock harness | self (existing fixtures) | exact |

## Pattern Assignments

### `web/lib/inngest/functions/classifier-llm-rules-seed.ts` (Inngest one-shot, event-driven)

**Analog:** `web/lib/inngest/functions/classifier-backfill.ts` (full 81-line file)

**Header / imports pattern** (lines 1-15):
```typescript
// Phase 60-02 (D-04). One-shot Inngest function: seeds the 6 historical
// debtor-email rules into public.classifier_rules with computed Wilson CI-lo
// and status='promoted'. Idempotent via ON CONFLICT(swarm_type,rule_key).
//
// Trigger: send the `classifier/backfill.run` event manually via the Inngest
// dashboard or CLI. The function is event-only (no cron) so it never re-fires
// on its own.

import { inngest } from "@/lib/inngest/client";
import { wilsonCiLower } from "@/lib/classifier/wilson";
import { createAdminClient } from "@/lib/supabase/admin";
```

**createFunction shape** (lines 48-81):
```typescript
export const classifierBackfill = inngest.createFunction(
  { id: "classifier/backfill", retries: 1 },
  { event: "classifier/backfill.run" },
  async ({ step }) => {
    return step.run("seed-classifier-rules", async () => {
      const admin = createAdminClient();
      const now = new Date().toISOString();
      for (const s of SEEDS) {
        const ci_lo = wilsonCiLower(s.n, s.agree);
        const { error } = await admin.from("classifier_rules").upsert(
          {
            swarm_type: "debtor-email",
            rule_key: s.rule_key,
            kind: "regex",
            status: "promoted",
            n: s.n,
            agree: s.agree,
            ci_lo,
            last_evaluated: now,
            promoted_at: now,
            notes: s.notes ?? null,
          },
          { onConflict: "swarm_type,rule_key" },
        );
        if (error) {
          throw new Error(
            `[classifier/backfill] upsert failed for ${s.rule_key}: ${error.message}`,
          );
        }
      }
      return { seeded: SEEDS.length };
    });
  },
);
```

**Phase 89 adaptations to copy from this shape:**
- Same `inngest.createFunction({ id, retries: 1 }, { event }, async ({ step }) => step.run(...))` envelope.
- Same `.upsert(..., { onConflict: "swarm_type,rule_key" })` Supabase pattern.
- Differs in: (a) iterate `(swarms × loadSwarmNoiseCategories) × ["high"]` instead of a hard-coded SEEDS array, (b) `kind: "agent_intent"` (per RESEARCH Pitfall 3 / OQ2 — closest fit in current enum; no migration), (c) `status: "candidate"` (not `"promoted"` — these are not pre-validated), (d) `n: 0, agree: 0, ci_lo: null, last_evaluated: null, promoted_at: null`.
- **CRITICAL filter** (RESEARCH A6): `cats.filter((c) => c.category_key !== "unknown" && c.enabled !== false)` — `unknown` routes to Stage 2/3 dispatch, never `categorize_archive`. Promoting `llm:unknown:high` would silently auto-archive every uncertain email.
- Iterate active swarms via `admin.from("swarms").select("swarm_type").eq("enabled", true)` (mirrors `loadSwarm` filter at `registry.ts:42`).
- Use `loadSwarmNoiseCategories(admin, swarm_type)` from `@/lib/swarms/registry` (signature at `registry.ts:54-76`; already TTL-cached and last-known-good).

---

### `supabase/migrations/20260520_phase89_llm_rule_key_backfill.sql` (SQL migration, one-shot UPDATE)

**Analog:** `supabase/migrations/20260428_classifier_rules.sql` (schema/comment style only — no prior UPDATE-only migration in tree)

**Header style** (lines 1-3):
```sql
-- Phase 60-00 (D-05). public.classifier_rules: cross-swarm whitelist store
-- driving the auto-action decision per (swarm_type, rule_key). Service-role
-- writes only (cron + dashboard server actions); reads via cache.ts module.
```

**Phase 89 migration body** (verbatim from CONTEXT D-02):
```sql
-- Phase 89 (D-02). Historic backfill: mint synthetic LLM rule_keys on
-- agent_runs rows where the LLM 2nd-pass wrote a category + confidence but
-- left rule_key NULL. Idempotent via WHERE rule_key IS NULL. Does NOT
-- retro-stamp human_verdict — operator review signal stays honest.
UPDATE public.agent_runs
SET rule_key = 'llm:' || (tool_outputs->>'stage1_category') || ':' || confidence
WHERE rule_key IS NULL
  AND tool_outputs ? 'stage1_category'
  AND confidence IS NOT NULL;
```

**Pattern notes:**
- Idempotency lives in the `WHERE rule_key IS NULL` clause — second apply matches 0 rows.
- Apply via `psql -f supabase/migrations/20260520_phase89_llm_rule_key_backfill.sql` (no migration runner harness in repo; manual apply documented in CLAUDE.md Supabase Management API memory).
- Verification step: `SELECT rule_key, COUNT(*) FROM public.agent_runs WHERE rule_key LIKE 'llm:%' GROUP BY rule_key ORDER BY 2 DESC;`

---

### `scripts/phase-89-shadow-eval.ts` (tsx harness, read-only query)

**Analog:** `scripts/phase-65-regression-backfill.ts` (lines 1-80)

**Shebang + docblock + env loader pattern** (lines 1-72):
```typescript
#!/usr/bin/env tsx
/**
 * Phase 65 regression backfill (RESEARCH OQ5 + CONTEXT Claude's Discretion).
 *
 * Usage:
 *   cd /Users/nickcrutzen/Developer/agent-workforce
 *   tsx scripts/phase-65-regression-backfill.ts --limit 200 --days 14
 *
 * Env (loaded from web/.env.local — see loadEnvLocal below):
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Path alias `@/` is configured in web/tsconfig.json — outside that compile
// unit we must use relative paths.
import { loadSwarmCategories } from "../web/lib/swarms/registry";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

function loadEnvLocal(): void {
  const envPath = resolve(REPO_ROOT, "web/.env.local");
  // ... minimal .env parser, no dotenv dep
}
loadEnvLocal();
```

**Phase 89 adaptations:**
- Copy the `loadEnvLocal()` helper verbatim.
- Import `wilsonCiLower`, `shouldPromote` from `../web/lib/classifier/wilson` (relative path — Phase 65 uses the same convention).
- Read-only SELECT from `public.classifier_rule_telemetry` filtered `WHERE rule_key LIKE 'llm:%'`.
- For each row: compute `ci_lo = wilsonCiLower(n, agree)`, check `shouldPromote(n, ci_lo)`.
- Emit markdown report listing promotable rule_keys with their `(swarm_type, rule_key, n, agree, ci_lo)`.
- Acceptance: ≥1 row with `shouldPromote(...) === true` (SC-89-03).
- **Read-only — never writes.** Mirrors Phase 65's read-only contract.

---

### `web/lib/inngest/functions/classifier-screen-worker.ts` (EDIT — 3 surgical sites)

**Analog:** self (in-file parity between LLM path and regex path)

#### Edit Site 1: LLM success-path `agent_runs.insert` (L265-279)

**Current code** (`classifier-screen-worker.ts:265-279`):
```typescript
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
  tool_outputs: {
    stage1_category: parsed.category_key,
    gated_to: finalKey,
  },
});
```

**Phase 89 edit** (add one field):
```typescript
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
  rule_key: `llm:${parsed.category_key}:${parsed.confidence}`,  // ★ Phase 89
  tool_outputs: {
    stage1_category: parsed.category_key,
    gated_to: finalKey,
  },
});
```

**Replay safety pattern** (already present, do not break — `classifier-screen-worker.ts:237-240`):
```typescript
const llmResult = await step.run("llm-call", async () => {
  // Phase 65 replay-id learning (CLAUDE.md): non-deterministic
  // values used as DB keys MUST be generated INSIDE step.run.
  const id = crypto.randomUUID();
```
→ The new `rule_key` is deterministic from `parsed.{category_key,confidence}`, so it is replay-safe by construction.

#### Edit Site 2: LLM failure-path `agent_runs.insert` (L306-318)

**Current code** (`classifier-screen-worker.ts:306-318`):
```typescript
const failureInsert = await admin.from("agent_runs").insert({
  id,
  swarm_type,
  automation_run_id: automation_run_id ?? null,
  email_id,
  inngest_run_id: inngestRunId,
  entity: entity ?? null,
  status: "failed",
  confidence: "low",
  reasoning: null,
  error_message: msg,
  tool_outputs: { error: msg },
});
```

**Phase 89 edit** (RESEARCH §Files to EDIT — keep failure path observable):
```typescript
const failureInsert = await admin.from("agent_runs").insert({
  id,
  swarm_type,
  // ...unchanged...
  status: "failed",
  confidence: "low",
  reasoning: null,
  error_message: msg,
  rule_key: "llm:unknown:low",  // ★ Phase 89 — keep failure-path telemetry attributable
  tool_outputs: { error: msg },
});
```

#### Edit Site 3: derive `effectiveMatchedRule` before whitelist gate (~L488-494)

**Current code** (`classifier-screen-worker.ts:486-494`):
```typescript
const whitelist = await step.run(
  "load-whitelist",
  async () => Array.from(await readWhitelist(admin, "debtor-email")),
);
const whitelistSet = new Set(whitelist);
const matchedRule = regexOutcome.matchedRule ?? "";
const isWhitelistMatch = whitelistSet.has(matchedRule);
```

**Phase 89 edit** (RESEARCH Pattern 1; strict guard preserves regex behavior — Pitfall 2):
```typescript
const whitelist = await step.run(
  "load-whitelist",
  async () => Array.from(await readWhitelist(admin, "debtor-email")),
);
const whitelistSet = new Set(whitelist);
// ★ Phase 89: when LLM 2nd-pass was invoked, synthesize matchedRule from
// LLM output so the whitelist gate can match promoted `llm:*:high` rules.
// Regex path falls through unchanged (llmInvoked=false).
const effectiveMatchedRule =
  llmInvoked && llmCategoryKey && llmConfidence
    ? `llm:${llmCategoryKey}:${llmConfidence}`
    : (regexOutcome.matchedRule ?? "");
const isWhitelistMatch = whitelistSet.has(effectiveMatchedRule);
```

**DO NOT touch L401** (`if (swarmRow.stage1_regex_module === DEBTOR_REGEX_MODULE_KEY)`) — locked CONTEXT D-04 (Phase 88 owns dispatch refactor).

---

### `web/app/(dashboard)/automations/[swarm]/stage-1/actions.ts` `recordVerdict` (EDIT — verify, likely no code change)

**Analog:** self — `recordVerdict` already accepts free-form `rule_key: z.string().min(1)` and writes it to `agent_runs.rule_key` at L182.

**Existing insert** (`actions.ts:168-191`) — works as-is once UI threads `llm:*` key:
```typescript
const { data: ar, error: arErr } = await admin
  .from("agent_runs")
  .insert({
    swarm_type: parsed.swarm_type,
    automation_run_id: parsed.automation_run_id,
    email_id: parsed.email_id,
    entity: parsed.entity,
    rule_key: parsed.rule_key,        // ← already threaded — accepts "llm:auto_reply:high"
    predictor,
    human_verdict: effectiveDecision === "approve" ? "approved" : "rejected_other",
    human_notes: parsed.notes ?? null,
    corrected_category: parsed.override_category ?? null,
    verdict_set_at: verdictTimestamp,
    verdict_set_by: reviewerEmail,
  })
  .select("id")
  .single();
```

**Predictor derivation pattern** (`actions.ts:147-166`) — pattern to mirror in `page.tsx` row loader for `rule_key` synthesis:
```typescript
const { data: stage1Event } = await admin
  .from("pipeline_events")
  .select("decision_details")
  .eq("email_id", parsed.email_id)
  .eq("stage", 1)
  .eq("swarm_type", parsed.swarm_type)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

const details = ((stage1Event?.decision_details ?? {}) as {
  llm_invoked?: boolean;
  regex?: { invoked?: boolean; matchedRule?: string | null };
});
const predictor: "regex" | "llm_2nd_pass" | null =
  details.llm_invoked === true
    ? "llm_2nd_pass"
    : details.regex?.invoked === true
      ? "regex"
      : null;
```

**Phase 89 note:** `recordVerdict` itself likely needs no edit. The work is upstream — `page.tsx` row loader must synthesize `rule_key = "llm:" + cat + ":" + conf` from `decision_details.{llm_category_key, llm_confidence}` when `predictor === 'llm_2nd_pass'`, and thread that into the form payload that ultimately reaches `recordVerdict`.

---

### `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx` row loader (EDIT)

**Analog:** self — existing `PredictedRow` shape at L244-251 already carries `predictor` and `llmConfidence`.

**Existing predictor derivation** (`page.tsx:982-1004`):
```typescript
const rawPred = d.predictor;
const predictor: PredictedRow["predictor"] =
  rawPred === "regex" || rawPred === "llm_2nd_pass" ? rawPred : null;
// ...llmConfidence derivation...
return { ...r, predictor, llmConfidence };
```

**Phase 89 edit** (add `rule_key` synthesis next to predictor — RESEARCH OQ4):
```typescript
const rawPred = d.predictor;
const predictor: PredictedRow["predictor"] =
  rawPred === "regex" || rawPred === "llm_2nd_pass" ? rawPred : null;
const llmConfidence = /* existing */;
// ★ Phase 89: synthesize rule_key for LLM rows so recordVerdict can attribute
// operator approval to the same (swarm_type, rule_key) bucket as the prediction.
const llmCategoryKey =
  typeof d.llm_category_key === "string" ? d.llm_category_key : null;
const ruleKey: string | null =
  predictor === "llm_2nd_pass" && llmCategoryKey && llmConfidence
    ? `llm:${llmCategoryKey}:${llmConfidence}`
    : null;
return { ...r, predictor, llmConfidence, ruleKey };
```

**Then in the row-action wiring at ~L1163** (where the approve/override form posts to `recordVerdict`): pass `rule_key: row.ruleKey ?? <existing-fallback-from-automation_runs.rule_key>`.

**Wave 0 verification SELECT** (RESEARCH OQ1): before locking the plan, confirm whether `automation_runs.rule_key` is populated for predicted LLM rows today:
```sql
SELECT id, rule_key, result->'predicted'->>'rule'
FROM automation_runs
WHERE automation = 'debtor-email-review'
  AND status = 'predicted'
  AND swarm_type = 'debtor-email'
LIMIT 10;
```

---

### `web/lib/inngest/functions/__tests__/classifier-llm-rules-seed.test.ts` (NEW vitest)

**Analog:** `web/lib/inngest/functions/__tests__/classifier-screen-worker.gate.test.ts` (full mock harness lines 1-200)

**Mock harness pattern** (`gate.test.ts:25-124`):
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Inngest mock --------------------------------------------------------
const inngestSend = vi.fn().mockResolvedValue({ ids: ["evt"] });
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: inngestSend,
    createFunction: vi.fn((cfg, _trigger, handler) => ({
      __config: cfg,
      handler,
    })),
  },
}));

// ---- Registry mocks ------------------------------------------------------
const loadSwarmMock = vi.fn();
const loadSwarmNoiseCategoriesMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...args: unknown[]) => loadSwarmMock(...args),
  loadSwarmNoiseCategories: (...args: unknown[]) =>
    loadSwarmNoiseCategoriesMock(...args),
}));

// ---- Supabase admin mock -------------------------------------------------
const agentRunsInserts: Record<string, unknown>[] = [];
function makeAdminMock() {
  const insertFn = vi.fn(async (row: Record<string, unknown>) => {
    agentRunsInserts.push(row);
    return { data: null, error: null };
  });
  return {
    from: vi.fn((table: string) => {
      if (table === "agent_runs") return { insert: insertFn };
      return { insert: vi.fn(async () => ({ data: null, error: null })) };
    }),
    // ... schema chain for debtor.labeling_settings (not needed for seed test)
  };
}
let adminMock = makeAdminMock();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock),
}));

// ---- Step stub -----------------------------------------------------------
function makeStepStub(cache: Map<string, unknown>) {
  return {
    run: async (name: string, fn: () => Promise<unknown>) => {
      if (cache.has(name)) return cache.get(name);
      const v = await fn();
      cache.set(name, v);
      return v;
    },
  };
}
```

**Fixtures to reuse** (`gate.test.ts:163-210`): `DEBTOR_SWARM_ROW` (with `enabled: true`, `stage1_regex_module: "@/lib/debtor-email/classify"`) and `DEBTOR_CATEGORIES` (with `auto_reply`, `payment_admittance`, both `action: "categorize_archive"`).

**Phase 89 test cases:**
1. `seed inserts (swarm × cat × high) candidate rows` — assert upsert payload shape: `{ swarm_type, rule_key: "llm:auto_reply:high", kind: "agent_intent", status: "candidate", n: 0, agree: 0 }`.
2. `seed excludes category_key='unknown'` — fixture includes an `unknown` category; assert no `llm:unknown:high` upsert call.
3. `seed is idempotent` — re-fire handler; assert `onConflict: "swarm_type,rule_key"` is set on every upsert call.
4. `seed walks every enabled swarm` — mock `swarms` SELECT to return two rows; assert upserts for both swarm_types.

---

### `web/lib/inngest/functions/__tests__/classifier-screen-worker.test.ts` (EDIT — add rule_key assertions)

**Analog:** self + sibling `classifier-screen-worker.gate.test.ts` (same mock pattern, shared `agentRunsInserts: Record<string, unknown>[]` capture array).

**Pattern for new test cases** (mirror gate.test.ts mock fixtures):
1. `LLM high → agent_runs row carries rule_key='llm:payment_admittance:high'` — invoke handler with regex returning `unknown` so LLM path runs; mock `invokeOrqAgent` to return `{ category_key: "payment_admittance", confidence: "high", reasoning: "..." }`; assert `agentRunsInserts[0].rule_key === "llm:payment_admittance:high"`.
2. `LLM failure → agent_runs row carries rule_key='llm:unknown:low'` — mock `invokeOrqAgent` to throw; assert failure-path insert carries the sentinel rule_key.
3. `regex hit → effectiveMatchedRule preserved` — mock regex to return `{ matchedRule: "payment_subject", ... }`; assert `whitelistSet.has(...)` is called with `"payment_subject"` (not an LLM key). Pitfall 2 regression guard.
4. `promoted llm:auto_reply:high + LLM high → dispatch="labeled"` — seed `readWhitelist` mock to return `Set(["llm:auto_reply:high"])`; assert handler returns `dispatch: "labeled"`. SC-89-04 unit equivalent.

## Shared Patterns

### Inngest replay safety (CLAUDE.md Phase 65 learning)
**Source:** `classifier-screen-worker.ts:237-240` (in-file comment)
**Apply to:** All `step.run("llm-call", ...)` edits in Phase 89.
```typescript
const llmResult = await step.run("llm-call", async () => {
  // Phase 65 replay-id learning (CLAUDE.md): non-deterministic
  // values used as DB keys MUST be generated INSIDE step.run.
  const id = crypto.randomUUID();
  // ... insert uses id
});
```
**Phase 89 status:** `rule_key = "llm:${cat}:${conf}"` is deterministic from `parsed.*` — automatically replay-safe. The existing `id` generation pattern stays unchanged.

### Inngest send binding (CLAUDE.md commit dae6276)
**Source:** `classifier-screen-worker.ts:521` — `(inngest.send as unknown as SendFn)({...})`
**Apply to:** Any new `inngest.send` callsite in seed function. The seed file itself doesn't `send` (it only upserts), so this is informational — but **never destructure** `const send = inngest.send`.

### Supabase upsert with `onConflict`
**Source:** `classifier-backfill.ts:57-71`
**Apply to:** `classifier-llm-rules-seed.ts` seed loop.
```typescript
await admin.from("classifier_rules").upsert(
  { /* row */ },
  { onConflict: "swarm_type,rule_key" },
);
```
Backed by the unique index in `classifier_rules.sql:22`: `unique (swarm_type, rule_key)`.

### Registry helpers (TTL-cached, last-known-good)
**Source:** `web/lib/swarms/registry.ts:30-76` (`loadSwarm`, `loadSwarmNoiseCategories`)
**Apply to:** Seed function row enumeration.
- `loadSwarm` returns `null` if disabled/missing; honors 60s TTL.
- `loadSwarmNoiseCategories` returns `[]` on error with last-known-good fallback.
- Phase 89 seed: iterate active swarms with `admin.from("swarms").select("swarm_type").eq("enabled", true)` (direct SELECT — `loadSwarm` only loads one at a time), then per-swarm `loadSwarmNoiseCategories`.

### Wilson CI thresholds (DO NOT re-derive)
**Source:** `web/lib/classifier/wilson.ts` — `wilsonCiLower`, `shouldPromote`, `shouldDemote`, `PROMOTE_N_MIN=30`, `PROMOTE_CI_LO_MIN=0.92`, `DEMOTE_N_MIN=30`.
**Apply to:** `scripts/phase-89-shadow-eval.ts` only. **Never** re-derive in the seed function or worker — they leave `n`, `agree`, `ci_lo` to the existing `classifier-promotion-cron`.

### Hard-separation rule (RFC `docs/agentic-pipeline/stage-1-regex.md`)
**Apply to:** Seed function + worker rule_key synthesis.
- Stage 1 LLM `rule_key`s are minted from `swarm_noise_categories.category_key` ONLY.
- `swarm_intents` (Stage 3) MUST NOT contribute keys to the `llm:*:*` namespace.
- The seed explicitly filters `category_key !== "unknown"` because `unknown` has `action='swarm_dispatch'` (hands off to Stage 2/3), not `categorize_archive` — promoting it would violate the funnel.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | All Phase 89 surfaces have a strong analog in the existing codebase. |

## Metadata

**Analog search scope:**
- `web/lib/inngest/functions/` (Inngest workers + one-shots)
- `web/lib/inngest/functions/__tests__/` (vitest harness patterns)
- `web/app/(dashboard)/automations/[swarm]/stage-1/` (server actions + RSC row loader)
- `supabase/migrations/` (table schema + migration headers)
- `scripts/` (tsx harness patterns)
- `web/lib/swarms/registry.ts` (registry helpers)
- `web/lib/classifier/wilson.ts` (CI thresholds)

**Files scanned:** ~12 source + 4 test + 3 migration + 1 script.

**Pattern extraction date:** 2026-05-20
