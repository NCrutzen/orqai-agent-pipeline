---
phase: 85
plan: 02
subsystem: debtor-email/stage-3-coordinator
tags: [zod-schema, discriminated-union, cache-key-flip, telemetry, v3-rollout, tdd]
wave: 1
depends_on: ["85-01"]
requires: ["INTENT_VERSION_V3 const", "intentAgentOutputSchemaV3", "intentAgentOutputSchemaAny"]
provides:
  - "INTENT_VERSION_V3 + intentAgentOutputSchemaV3 + IntentAgentOutputV3 + intentAgentOutputSchemaAny exported from coordinator/types.ts"
  - "Single-site tolerant Zod gate in invoke-intent.ts (V2|V3 discriminated parse)"
  - "Cache-key flipped to INTENT_VERSION_V3 in debtor-email-coordinator.ts"
  - "decision_details.intent_proposal + proposal_reason additively emitted on V3 outputs"
affects:
  - "web/lib/automations/debtor-email/coordinator/types.ts (additive — V2 retained)"
  - "web/lib/automations/debtor-email/coordinator/invoke-intent.ts (return type widened, error wording updated)"
  - "web/lib/automations/debtor-email/coordinator/__tests__/invoke-intent-v2.test.ts (error-regex relaxed to new wording)"
  - "web/lib/inngest/functions/debtor-email-coordinator.ts (cache-key, type annotations, provenance, telemetry)"
tech-stack:
  added: []
  patterns:
    - "z.discriminatedUnion on a literal-version key for forward-compat tolerant Zod parsing"
    - "Cache-key flip on a version literal as zero-migration cache invalidation (PATTERNS §A)"
    - "Spread-conditional decision_details emit so V2 rows stay byte-identical pre-V3 rollout"
key-files:
  created: []
  modified:
    - "web/lib/automations/debtor-email/coordinator/types.ts"
    - "web/lib/automations/debtor-email/coordinator/invoke-intent.ts"
    - "web/lib/automations/debtor-email/coordinator/__tests__/invoke-intent-v2.test.ts"
    - "web/lib/inngest/functions/debtor-email-coordinator.ts"
decisions:
  - "Sniff-then-safeParse (intent_version pre-check before schema selection) used as the discriminator pattern instead of z.discriminatedUnion().safeParse(parsed); functionally equivalent, PATTERNS §invoke-intent.ts-preferred shape because the per-version error message points at the right schema"
  - "Unified error wording 'Intent-agent output schema mismatch (version=...)'; old V2-only test regex `/v2 output schema mismatch/` relaxed to `/output schema mismatch/` (in-scope: direct consumer of the function whose contract this plan widens)"
  - "Cache-key flip ships in same plan-merge as schema landing; transient window where V2 outputs land under V3 cache key is acceptable because discriminated union accepts both (PATTERNS §A)"
  - "Provenance `intent_version` now sourced from `output.intent_version` (LLM response) on both agent_runs writeback and decision_details emit — per RESEARCH §2 'correct provenance anyway'"
  - "intent_proposal + proposal_reason stay V3-only in decision_details (spread-conditional). No write to swarm_intents — telemetry-only, V9.0 promotion gating intact"
metrics:
  duration_minutes: ~10
  completed: 2026-05-20
---

# Phase 85 Plan 02: V3 Schema + Tolerant Discriminator Parser + Cache-Key Flip Summary

Wave 1 landed the V3 Zod schema + a tolerant discriminated-union parser at the single Stage 3 transport gate, flipped the coordinator cache-key to V3, and additively emitted `intent_proposal` / `proposal_reason` into `coordinator_runs.decision_details` only on V3 outputs — all without touching `stage-3-dispatcher.ts`, `swarm_intents`, or any migration. 16 RED tests from Wave 0 (Plan 85-01) are now GREEN.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | V3 schema + INTENT_VERSION_V3 + discriminated-union export | `b18a62fe` | `coordinator/types.ts` |
| 2 | Tolerant V2\|V3 Zod gate + return-type widen | `74f9c5f0` | `coordinator/invoke-intent.ts` + `__tests__/invoke-intent-v2.test.ts` |
| 3 | Cache-key flip + decision_details additive emit + provenance + V2-annotation widening | `53ebb086` | `inngest/functions/debtor-email-coordinator.ts` |

## V3 Symbols Added (`coordinator/types.ts`)

- `INTENT_VERSION_V3 = "2026-05-19.v3" as const` — byte-identical to PATTERNS §types.ts literal-equality rule (must match Orq agent `output_schema.intent_version.const` once Plan 03 deploys).
- `intentAgentOutputSchemaV3` — V2 shape + `intent_proposal` (nullable, `string().max(64).regex(/^[a-z][a-z0-9_]*$/)`) + `proposal_reason` (nullable, `string().max(280)`).
- `type IntentAgentOutputV3 = z.infer<typeof intentAgentOutputSchemaV3>`.
- `intentAgentOutputSchemaAny = z.discriminatedUnion("intent_version", [V2, V3])` — single union entry point.
- `type IntentAgentOutputAny = z.infer<typeof intentAgentOutputSchemaAny>`.

V2 export (`INTENT_VERSION_V2`, `intentAgentOutputSchemaV2`, `IntentAgentOutputV2`, `rankedIntentEntrySchema`) untouched (D-07 — one release).

## Single Discriminator Site (`invoke-intent.ts`)

- Lines ~190–205 in the post-edit file: `version = parsed.intent_version`; `schema = version === INTENT_VERSION_V3 ? V3 : V2`; `schema.safeParse(parsed)`.
- `InvokeIntentResult.output` widened from `IntentAgentOutputV2` → `IntentAgentOutputV2 | IntentAgentOutputV3`.
- Error wording unified to `"Intent-agent output schema mismatch (version=${version}): ..."` (was `"Intent-agent v2 output schema mismatch: ..."`).
- Transport/AGENT_KEY/timeouts/idempotency/strip-fence parser untouched (PATTERNS §invoke-intent.ts).
- No discriminator branches scattered elsewhere — RESEARCH §2 single-switch invariant honoured.

## Cache-Key Flip + Provenance (`debtor-email-coordinator.ts`)

- **Edit 1 (cache-key, line 202):** `findCachedOutput(..., INTENT_VERSION_V3, ...)`. Version-literal flip ⇒ zero-migration V2 cache eviction (PATTERNS §A).
- **Edit 2 (decision_details, lines ~284–340):** `intent_version: output.intent_version` (was hardcoded `INTENT_VERSION_V2`). Spread-conditional `...(output.intent_version === INTENT_VERSION_V3 && { intent_proposal: ..., proposal_reason: ... })` — additive, mirrors Phase 83 D-09 `input_size` shape. V2-output runs emit byte-identical decision_details to pre-Phase-85.
- **Edit 3 (agent_runs provenance, line ~250):** `updateRun({ intent_version: output.intent_version, ... })` (was hardcoded `INTENT_VERSION_V2`). Audit trail now records actual LLM-emitted version.
- **Edit 4 (PLAN-CHECK blocker fix — V2-annotation widening):** Three call sites widened `IntentAgentOutputV2` → `IntentAgentOutputV2 | IntentAgentOutputV3`:
  - cachedFirst cast (~line 207)
  - `output` declaration (~line 215)
  - classifyResult cast (~line 267 + 271)
  - Import block: added `INTENT_VERSION_V3`, `IntentAgentOutputV3`.

## Verification

### Vitest (GREEN, Phase 85 scope)

```
$ npx vitest run lib/automations/debtor-email/coordinator/__tests__/invoke-intent-v3.test.ts \
                lib/automations/debtor-email/coordinator/__tests__/invoke-intent-v2.test.ts \
                lib/automations/debtor-email/coordinator/__tests__/types-v3.test.ts
Test Files  3 passed (3)
     Tests  22 passed (22)
```

Wider sweep (`coordinator + inngest`): **211 passed, 3 failed, 14 skipped, 4 todo (232)**. The 3 failures are in `classifier-verdict-worker.test.ts` with `TypeError: admin.schema is not a function` — baseline-confirmed pre-existing (failing on HEAD prior to any Phase 85 edits via `git stash` baseline run). Logged in `deferred-items.md`. Phase 85 introduces zero regressions.

### TypeScript (`tsc --noEmit`)

```
$ npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -30
(no output)
---FULL-TSC-DONE---
```

Clean. No new type errors in coordinator/, invoke-intent.ts, types.ts, escalation-gate, or audit panel.

### Grep invariants

| Check | Result |
|-------|--------|
| `INTENT_VERSION_V3` in coordinator | ✓ line 38 (import) + 202 (cache-key) + 329 (telemetry spread) |
| `discriminatedUnion` in types.ts | ✓ exactly one (line 150, on `intent_version`) |
| `intentAgentOutputSchemaV2` still exported in types.ts | ✓ lines 113, 121, 151 (D-07 retained) |
| `swarm_intents` writes in coordinator | ✓ none (only existing read-comments + dispatcher comments, untouched) |
| `supabase/migrations/` files in diff | ✓ none |
| `stage-3-dispatcher.ts` in diff | ✓ untouched (D-05) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing V2 test regex tied to obsolete error wording**
- **Found during:** Task 2 verify run
- **Issue:** `web/lib/automations/debtor-email/coordinator/__tests__/invoke-intent-v2.test.ts:91` asserted `/v2 output schema mismatch/`. The new tolerant gate emits `"Intent-agent output schema mismatch (version=...)"` — the `v2` substring was tied to the old hardcoded V2-only error message and is no longer accurate.
- **Fix:** Relaxed regex to `/output schema mismatch/` and renamed the test title to "rejects v1 single-label shape with informative schema-mismatch error". The Wave 0 V3 RED test (`invoke-intent-v3.test.ts:166`) already asserted the new wording (`/schema mismatch|intent_version/i`) — the V2 test is now consistent.
- **Files modified:** `web/lib/automations/debtor-email/coordinator/__tests__/invoke-intent-v2.test.ts`
- **Commit:** `74f9c5f0`
- **In-scope justification:** the V2 test is a direct consumer of `invokeIntentAgent`, whose contract Task 2 widens (return type + error message). Plan 02 explicitly says "existing types-v2.test.ts still passes (no V2 regression)" but does not anticipate the unified error wording change. Updating the V2 test regex is a direct dependency of Task 2's discriminator landing.

**2. [Rule 3 - Blocking] Worktree base mismatch**
- **Found during:** worktree_branch_check
- **Issue:** `git merge-base HEAD` returned `58af688b...` rather than the required Wave 0 base `1ebe980a...`.
- **Fix:** `git reset --hard 1ebe980a43bc46a8f326de06ec001dd6a1671f0d` per protocol; verified HEAD matches.
- **Commit:** N/A (pre-execution recovery).

**3. [Rule 3 - Blocking] Missing node_modules in worktree**
- **Found during:** Task 1 verify
- **Issue:** `npx vitest` failed with "Cannot find module 'vitest/config'" — `web/node_modules` did not exist in the fresh worktree.
- **Fix:** `cd web && npm ci --prefer-offline --no-audit --no-fund` (1375 packages installed, 14s).
- **Commit:** N/A (no code change).

### Architectural deviations
None.

### Out-of-scope flagged
- `escalation-gate.ts`, `Stage3EvidencePanel.tsx`, `coordinator-synthesis.ts` — RESEARCH §2 said these read shared keys (`ranked`/`language`/`urgency`) and need no widening. `tsc --noEmit` is clean on those files post-edit, confirming the analysis.

## Deferred Issues (Pre-Existing, Out-of-Scope)

Logged in `.planning/phases/85-stage-3-prompt-v3-intent-definitions-and-open-set-schema/deferred-items.md`:

- `classifier-verdict-worker.test.ts` — 3 failing tests with `admin.schema is not a function`. Baseline-confirmed pre-existing (fails identically before and after Phase 85 edits). Mock-shape issue in the test's Supabase admin stub, unrelated to Stage 3 / V3 schema.

## TDD Gate Compliance

Wave 0 (Plan 85-01) committed the RED tests (`test(...)`). Wave 1 (this plan) commits the implementation (`feat(...)`) that flips them GREEN. Three feat commits, no refactor commits needed.

Gate sequence verified in `git log --oneline`:
- `1ebe980a` (Wave 0 RED) — `docs(85-01): complete Wave 0 empirical inputs + RED tests plan`
- `b18a62fe` (this wave, Task 1 GREEN) — `feat(85-02): add V3 intent-agent schema + discriminated union`
- `74f9c5f0` (this wave, Task 2 GREEN) — `feat(85-02): tolerant V2|V3 Zod gate in invoke-intent`
- `53ebb086` (this wave, Task 3 GREEN) — `feat(85-02): coordinator cache-key flip + V3 telemetry emit`

## Threat Flags

None. No new network endpoints, no new auth paths, no schema migrations, no new file-access patterns. Telemetry write expanded into existing JSONB column. Hard separation (Stage 1 vs Stage 3) intact.

## Self-Check: PASSED

- ✓ `web/lib/automations/debtor-email/coordinator/types.ts` — V3 symbols present (verified via `grep -n "INTENT_VERSION_V3\|intentAgentOutputSchemaV3\|intentAgentOutputSchemaAny" types.ts`).
- ✓ `web/lib/automations/debtor-email/coordinator/invoke-intent.ts` — discriminator + widened return type present.
- ✓ `web/lib/inngest/functions/debtor-email-coordinator.ts` — `INTENT_VERSION_V3` at 4 sites incl. cache-key + spread-conditional; V2 annotations widened.
- ✓ Commit `b18a62fe` exists in `git log --oneline`.
- ✓ Commit `74f9c5f0` exists in `git log --oneline`.
- ✓ Commit `53ebb086` exists in `git log --oneline`.
- ✓ `git diff --stat HEAD~3 HEAD` includes zero migration files.
- ✓ `stage-3-dispatcher.ts` not in diff.
- ✓ Phase 85 vitest scope: 22/22 GREEN; full coordinator+inngest sweep: 211 passed (3 failures pre-existing, deferred).
- ✓ `tsc --noEmit` clean (no errors in any file, filtered or unfiltered).
