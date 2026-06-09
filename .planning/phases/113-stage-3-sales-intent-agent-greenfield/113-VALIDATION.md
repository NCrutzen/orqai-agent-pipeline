---
phase: 113
slug: stage-3-sales-intent-agent-greenfield
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-05
---

# Phase 113 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (web/) |
| **Config file** | web/vitest.config.ts |
| **Quick run command** | `cd web && npx vitest run <affected test files>` |
| **Full suite command** | `cd web && npx vitest run --silent` |
| **Estimated runtime** | ~80 seconds (full suite, 2529 tests) |

---

## Sampling Rate

- **After every task commit:** Run the affected test files via `npx vitest run <paths>`
- **After every plan wave:** Run the full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-T1 shared nullable entity_relationship axis | 01 | 1 | STAGE3-01 | T-113-01 | Zod-enum gate on axis; no `["string","null"]` shorthand | unit (tdd) | `cd web && npx vitest run lib/automations/sales-email/coordinator/__tests__/types.test.ts -t "entity_relationship"` | ❌ Wave 0 (new) | ⬜ pending |
| 01-T2 salesIntentOutputSchema | 01 | 1 | STAGE3-01 | T-113-05 | enum from codegen registry; closed-list Zod gate | unit (tdd) | `cd web && npx vitest run lib/automations/sales-email/coordinator/__tests__/types.test.ts` | ❌ Wave 0 (new) | ⬜ pending |
| 01-T3 invokeSalesIntentAgent Orq wrapper | 01 | 1 | STAGE3-01 | T-113-01/02 | Zod double-gate; ORQ key from env; 45s timeout | unit (tdd) | `cd web && npx vitest run lib/automations/sales-email/coordinator/__tests__/invoke-intent.test.ts` | ❌ Wave 0 (new) | ⬜ pending |
| 02-T1 coordinator agent-key + schema-map dispatch | 02 | 2 | STAGE3-01 | T-113-03/06 | registry-driven agent key + schema map; no literal swarm branch; debtor byte-neutral | unit (tdd) | `cd web && npx vitest run lib/inngest/functions/__tests__/coordinator-agent-key-dispatch.test.ts` | ❌ Wave 0 (new) | ⬜ pending |
| 02-T2 sales assemble-input | 02 | 2 | STAGE3-01 | — | re-export 8k-cap assembler (no drift) | typecheck | `cd web && npx tsc --noEmit 2>&1 \| grep -c "sales-email/coordinator/assemble-input" \| grep -q '^0$' && echo OK` | ❌ Wave 0 (new) | ⬜ pending |
| 02-T3 sales retro reconstruct-input | 02 | 2 | STAGE3-02 | T-113-01 | byte-comparable attachment fold; pure fn | unit (tdd) | `cd web && npx vitest run lib/automations/sales-email/retro/__tests__/reconstruct-input.test.ts` | ❌ Wave 0 (new) | ⬜ pending |
| 03-T1 sales retro-classify fn + bootstrap gate | 03 | 3 | STAGE3-02 | T-113-04/11 | side-channel isolation; bounded bootstrap bypass (empty-swarm_intents-only); tagged rows | unit (tdd) | `cd web && npx vitest run lib/inngest/functions/__tests__/sales-stage-3-retro-side-channel-isolation.test.ts lib/inngest/functions/__tests__/sales-stage-3-retro-bootstrap-gate.test.ts` | ❌ Wave 0 (new) | ⬜ pending |
| 03-T2 create sales-intent-agent + bootstrap retro + promoted_intents yaml | 03 | 3 | STAGE3-02 | T-113-02 | list_models-validated; strict json_schema (anyOf); promoted_intents hand-off | checkpoint (human-verify) | `cd web && npx tsx scripts/orq/manage-sales-intent-agent.ts` (script run) + Studio + bootstrap retro | ❌ (manual) | ⬜ pending |
| 04-T1 seed migration + hard-separation/other-routes tests | 04 | 4 | STAGE3-02, STAGE3-03 | T-113-05/08 | promoted vocab (yaml/DB fallback, never invented); ∅ noise intersection; 'other' routes | unit (tdd) | `cd web && npx vitest run lib/inngest/functions/__tests__/sales-hard-separation.test.ts lib/inngest/functions/__tests__/sales-other-routes.test.ts` | ❌ Wave 0 (new) | ⬜ pending |
| 04-T2 [BLOCKING] remote apply + codegen + agent enum | 04 | 4 | STAGE3-02, STAGE3-03 | T-113-09 | operator-authorized remote write; 3-way invariant; codegen no-drift | checkpoint (human-action) + CI gate | `cd web && npm run codegen && git diff --exit-code` · `cd web && npm run check:supabase` | ✅ (codegen script exists) | ⬜ pending |
| 05-T1 coordinator Stage-3 routing gate (pre-emit) | 05 | 5 | STAGE3-03 | T-113-10 | swarm-agnostic fail-closed gate before predicted-emit; debtor-neutral; dispatcher untouched | unit (tdd) | `cd web && npx vitest run lib/inngest/functions/__tests__/coordinator-stage3-routing-gate.test.ts` | ❌ Wave 0 (new) | ⬜ pending |
| 05-T2 Bulk Review sales retry verification + dead-letter smoke | 05 | 5 | STAGE3-03 | T-113-08 | swarm-uniformity (no debtor hardcode); retry accepts sales; gap=0 reconciliation | unit (tdd) + smoke | `cd web && npx vitest run lib/inngest/functions/__tests__/sales-bulk-review-retry.test.ts scripts/eval/__tests__/sales-stage3-deadletter-check.test.ts` | ❌ Wave 0 (new) | ⬜ pending |
| 05-T3 operator dry-run review + go-live flip | 05 | 5 | STAGE3-03 | T-113-09 | operator green-light; reversible routing flip; gap=0 pre-flip | checkpoint (human-verify) | `cd web && npx tsx scripts/eval/sales-stage3-deadletter-check.ts <window>` (gap=0) + operator review | ✅ (script from 05-T2) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All new test files are authored alongside their producing tasks (TDD where marked); none pre-exist. The vitest harness + codegen drift gate + check:supabase advisor lint are the existing infrastructure. New test files required before/with their tasks:

- [x] `lib/automations/sales-email/coordinator/__tests__/types.test.ts` — entity_relationship axis + salesIntentOutputSchema (01-T1, 01-T2)
- [x] `lib/automations/sales-email/coordinator/__tests__/invoke-intent.test.ts` — Orq wrapper Zod double-gate + `.raw`-on-failure (01-T3)
- [x] `lib/inngest/functions/__tests__/coordinator-agent-key-dispatch.test.ts` — registry agent-key + schema-map dispatch, no literal branch, debtor byte-neutral (02-T1)
- [x] `lib/automations/sales-email/retro/__tests__/reconstruct-input.test.ts` — attachment-fold byte-comparability, pure fn (02-T3)
- [x] `lib/inngest/functions/__tests__/sales-stage-3-retro-side-channel-isolation.test.ts` — source-grep side-channel guard (03-T1)
- [x] `lib/inngest/functions/__tests__/sales-stage-3-retro-bootstrap-gate.test.ts` — bounded bootstrap bypass (empty-only / refuse-after-seed / tagged / normal-gate-intact) (03-T1)
- [x] `lib/inngest/functions/__tests__/sales-hard-separation.test.ts` — sales intents ∩ noise keys = ∅ (04-T1)
- [x] `lib/inngest/functions/__tests__/sales-other-routes.test.ts` — 'other' placeholder → Kanban, no throw (04-T1)
- [x] `lib/inngest/functions/__tests__/coordinator-stage3-routing-gate.test.ts` — pre-emit dry-run gate, debtor non-regression, dispatcher-untouched guard (05-T1)
- [x] `lib/inngest/functions/__tests__/sales-bulk-review-retry.test.ts` — swarm-uniformity + retry accepts swarm_type='sales-email' (05-T2)
- [x] `scripts/eval/__tests__/sales-stage3-deadletter-check.test.ts` — reconciliation gap=0/gap=1 fixtures (05-T2)
- [x] CI gates (existing, no new file): `npm run codegen && git diff --exit-code` (3-way invariant), `npm run check:supabase` (RLS advisor)

*Existing infrastructure (vitest + codegen drift gate + check:supabase) covers the harness; new test files accompany new modules. Source: RESEARCH §Validation Architecture → Wave 0 Gaps.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Orq agent creation + Studio json_schema tool resource | STAGE3-02 | MCP/SDK has no tool CRUD — Studio-only (CLAUDE.md) | Run `manage-sales-intent-agent.ts`; create the json_schema tool in Studio; confirm model dropdown non-empty + Response Format set (03-T2) |
| Bootstrap retro populates cluster surface + operator promotion | STAGE3-02 | Human-in-the-loop promotion by design (D-01/D-02) | Trigger bootstrap retro (empty swarm_intents only); promote clusters to ~80% coverage; record `promoted_intents:` yaml in 113-03-SUMMARY (03-T2) |
| Remote seed migration apply | STAGE3-02/03 | Production-adjacent remote write needs operator authorization | `apply_migration` to mvqjhlxfvtqqubqgdvhz; codegen no-drift; re-PATCH agent enum (04-T2) |
| Live Stage 3 verdict + Bulk Review retry + go-live flip | STAGE3-03 | Requires deployed worker + live Orq agent + operator green-light | Review ~100 sales verdicts; confirm retry button works; flip the routing gate; record green-light + sample size in UAT (05-T3) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (checkpoints 03-T2/04-T2/05-T3 each have an automated pre-step: agent script run, codegen-diff gate, dead-letter smoke)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every wave has ≥1 automated unit/smoke command)
- [x] Wave 0 covers all MISSING references (all 11 new test files + 2 CI gates enumerated above)
- [x] No watch-mode flags (all commands use `vitest run`, not watch)
- [x] Feedback latency < 90s (affected-file runs are seconds; full suite ~80s)
- [x] `nyquist_compliant: true` set in frontmatter
- [x] `wave_0_complete: true` set in frontmatter

**Approval:** approved (planner — revision iteration 1)
