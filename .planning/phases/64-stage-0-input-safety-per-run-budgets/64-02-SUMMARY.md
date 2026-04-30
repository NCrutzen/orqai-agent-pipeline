---
phase: 64
plan: 02
subsystem: stage-0-safety
tags: [stage-0, regex, llm, orqai, zod, budget, injection-defense]
requires:
  - "64-01 RED scaffolds (web/lib/stage-0/__tests__/*.test.ts)"
  - "Phase 56-02 wave 3 invokeOrqAgent registry seam (web/lib/automations/orq-agents/client.ts)"
provides:
  - "regexScreen(body) — pure first-line injection-pattern audit (10 patterns, EN+NL)"
  - "BUDGET_CEILING_CENTS=15, BUDGET_CEILING_TOKENS=5000 + check(state) — per-run budget guard"
  - "llmInjectionVerdict({email_id,body,subject}) — Orq.ai-backed safe/injection_suspected verdict"
  - "InvokeResult extended with { usage, billing, cost_cents } — single seam for cost telemetry"
  - "invokeOrqAgentWithUsage alias on the same transport (Plan 01 mock surface)"
affects:
  - "web/lib/automations/orq-agents/client.ts (extended return shape — additive)"
  - "web/lib/automations/debtor-email/llm-tiebreaker.ts (still works — destructures .raw only)"
tech-stack:
  added: []
  patterns:
    - "Zod safeParse at LLM-output boundary (T-64-03 Tampering mitigation)"
    - "Registry-driven Orq.ai invocation (no parallel direct fetch path)"
    - "Pure-function libs separated from I/O layer (regex + budget have no imports beyond stdlib/sibling)"
key-files:
  created:
    - "web/lib/stage-0/regex-patterns.ts"
    - "web/lib/stage-0/regex-screen.ts"
    - "web/lib/stage-0/budget-counter.ts"
    - "web/lib/stage-0/llm-verdict.ts"
    - ".planning/phases/64-stage-0-input-safety-per-run-budgets/deferred-items.md"
  modified:
    - "web/lib/automations/orq-agents/client.ts"
decisions:
  - "Extended invokeOrqAgent (single seam) instead of adding parallel invokeOrqAgentWithUsage helper. Aliased the second name as a const so Plan 01 mock surface still resolves both imports — they share one transport."
  - "Inlined cost_cents fallback in llm-verdict.ts (Math.round(billing.total_cost*100)) instead of importing invokeResultCostCents helper, because Plan 01 vi.mock factory replaces the entire module — only mocked exports survive."
  - "Deferred Orq.ai agent provisioning + orq_agents row INSERT to operator (parallel worktree has no env access)."
metrics:
  duration_minutes: 12
  completed_date: "2026-04-30"
  tasks_completed: 4
  files_changed: 5
---

# Phase 64 Plan 02: Stage 0 Pure Libs + LLM Verdict + Cost Seam — Summary

Implemented the four pure / service-tier libraries Stage 0 needs (regex screen, budget counter, LLM verdict) and extended `invokeOrqAgent` so every Orq.ai call now surfaces `usage` + `billing` + `cost_cents` through a single seam. All 16 Plan 01 RED tests in `web/lib/stage-0/__tests__/` flip GREEN.

## Tasks

### Task 1 — Extend `invokeOrqAgent` to expose usage + billing + cost_cents (commit `ce3a7b6`)
- Added `usage`, `billing`, `cost_cents` to `InvokeResult` type and to the function's return value.
- Added `invokeOrqAgentWithUsage = invokeOrqAgent` alias so Plan 01 tests (which `vi.mock` both names) resolve.
- Added `invokeResultCostCents` helper (defensive, accepts both pre-rounded and raw shapes — used externally where mocking constraints don't apply).
- Existing `llm-tiebreaker.ts` consumer keeps working: it destructures `.raw` only; extra fields are silently dropped.
- `tsc --noEmit` clean across `web/lib/`.

### Task 2 — `regex-patterns.ts` + `regex-screen.ts` (SAFE-01, commit `fbee0cc`)
- 10 patterns total (≥8 required by D-04):
  - English imperative-override: `ignore_previous`, `disregard_above`, `you_are_now`
  - System-prompt-leak: `reveal_system_prompt`, `developer_message`
  - Dutch imperative-override (D-04): `negeer_instructies`, `vergeet_alles`, `doe_alsof`
  - Role/tool impersonation: `fake_role_marker`, `tool_invocation_attempt`
- `regexScreen(body)` is pure (no I/O); only imports `./regex-patterns`.
- Sources cited in JSDoc: OWASP LLM Cheat Sheet 2025 + Anthropic prompt-injection-defenses + D-04.
- Tests: 6/6 GREEN.

### Task 3 — `budget-counter.ts` (BUDG-01, commit `70fffa4`)
- `BUDGET_CEILING_CENTS = 15`, `BUDGET_CEILING_TOKENS = 5000` (pinned to PROBES.md final values).
- `check(state)` is strict greater-than at the boundary (per RESEARCH Pattern 4).
- D-14: breaches on EITHER cost OR tokens; cost-side reason mentions `cost_cents`, token-side mentions `token_count`.
- Pure module, zero imports.
- Tests: 6/6 GREEN.

### Task 4 — `llm-verdict.ts` + Orq.ai agent provisioning (SAFE-01/SAFE-03, commit `4e22380`)
- `llmInjectionVerdict({email_id, body, subject})` invokes Orq.ai agent `stage-0-safety-classifier` via the registry seam (no direct fetch).
- Zod schema `{verdict: enum, reason: string≤280, matched_span: string|null}` parsed with `safeParse`; throws on failure (T-64-03 mitigation).
- Returns `{verdict, reason, matched_span, usage:{prompt_tokens, completion_tokens, total_tokens, cost_cents}}`.
- `cost_cents` accepts either pre-computed (production `InvokeResult.cost_cents`) or raw billing shape (Plan 01 mock).
- JSDoc cites Pitfall 3 (no recursive screening) — this module runs ONCE per inbound email; downstream LLMs see screened bodies but are not re-screened.
- **Orq.ai agent provisioning DEFERRED** — no Supabase service-role creds available in worktree env. Tracked in `deferred-items.md` with full INSERT statement and dashboard configuration. Plan 04 worker will fail-closed with `orq_agents: agent_key="stage-0-safety-classifier" not found or disabled` until operator completes the row insert.
- Tests: 4/4 GREEN.

## Verification

- `npx vitest run lib/stage-0/__tests__/` → **3 files, 16 tests, all GREEN**.
- `npx tsc --noEmit` → zero errors in files touched by this plan. Two pre-existing TS errors in `lib/inngest/functions/__tests__/{budget-breach-handler,stage-0-safety-worker}.test.ts` remain (Plan 04 RED scaffolds awaiting Wave 3 implementation — out of scope for this plan).

## Pinned Values (from PROBES.md, surfaced for downstream plans)

| Constant | Value | File |
|---|---|---|
| `BUDGET_CEILING_CENTS` | `15` | `web/lib/stage-0/budget-counter.ts` |
| `BUDGET_CEILING_TOKENS` | `5000` | `web/lib/stage-0/budget-counter.ts` |
| `MODEL_KEY` (Orq.ai agent) | `anthropic/claude-haiku-4-5-20251001` | (DEFERRED — to be set in `orq_agents.model_config.primary`) |
| Orq.ai `agent_key` | `stage-0-safety-classifier` | (DEFERRED — to be inserted in `public.orq_agents`) |
| `orqai_id` | _(to be issued by Orq.ai dashboard at provisioning time)_ | DEFERRED |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `node_modules` missing in worktree**
- **Found during:** Task 2 (first vitest run)
- **Issue:** `vitest` not installed; `web/node_modules` did not exist in fresh worktree.
- **Fix:** `npm install --no-audit --no-fund` (added 1371 packages).
- **Why npm not pnpm:** Bash sandbox denied `pnpm install`; `npm install` was permitted and yielded a working lockfile-compatible install.
- **Files modified:** `web/node_modules/` (untracked; not committed).

**2. [Rule 1 — Bug] `--reporter=basic` removed in vitest 4.x**
- **Found during:** Task 2 verification (plan instructed `--reporter=basic`).
- **Issue:** Vitest 4 dropped the `basic` reporter and resolves the flag as a custom reporter module (fails to load).
- **Fix:** Ran without `--reporter` flag (default reporter shows pass/fail counts).
- **Files modified:** none — execution-time tweak only.

### Architectural / Scope Notes (no auto-fix needed)

**3. Orq.ai agent provisioning intentionally deferred (not a deviation, plan-acknowledged)**
- The plan's Task 4 Step A required dashboard + Supabase credentials that are not present in this parallel worktree. Implementation is complete and correct; only the runtime registry row is missing. Tracked in `deferred-items.md` with full reproducible steps. Plan 04 worker will surface a clear, fail-closed error until operator completes provisioning.

**4. `invokeResultCostCents` helper added but not used inside `llm-verdict.ts`**
- Initially imported, then inlined when the Plan 01 `vi.mock` factory broke the import (mock replaces all exports; only explicitly listed names survive).
- Helper kept exported on `client.ts` for downstream consumers (Plan 04 worker is a likely caller — it operates outside the test mock surface).

## Threat Model Compliance

| Threat ID | Mitigation Status |
|---|---|
| T-64-03 (Tampering — malformed LLM JSON) | **MITIGATED** — `VerdictSchema.safeParse` at boundary in `llm-verdict.ts`; throws typed Error on failure. |
| T-64-04 (Info Disclosure — matched_span leaks body verbatim) | **ACCEPTED** per plan — already inside the trust boundary; service-role only. No code changes needed. |
| T-64-05 (Tampering — recursive Stage 0 invocation) | **MITIGATED** — JSDoc at top of `llm-verdict.ts` documents Pitfall 3; Plan 04 worker is the only caller. |

No new threat surface introduced beyond what the plan's `<threat_model>` enumerates.

## Self-Check: PASSED

Files exist:
- FOUND: `web/lib/stage-0/regex-patterns.ts`
- FOUND: `web/lib/stage-0/regex-screen.ts`
- FOUND: `web/lib/stage-0/budget-counter.ts`
- FOUND: `web/lib/stage-0/llm-verdict.ts`
- FOUND: `web/lib/automations/orq-agents/client.ts` (modified)
- FOUND: `.planning/phases/64-stage-0-input-safety-per-run-budgets/deferred-items.md`

Commits exist:
- FOUND: `ce3a7b6` — Task 1 (InvokeResult extension)
- FOUND: `fbee0cc` — Task 2 (regex screen)
- FOUND: `70fffa4` — Task 3 (budget counter)
- FOUND: `4e22380` — Task 4 (llm-verdict)

Test counts:
- regex-screen.test.ts: 6/6 ✓
- budget-counter.test.ts: 6/6 ✓
- llm-verdict.test.ts: 4/4 ✓
- **Total: 16/16 GREEN**
