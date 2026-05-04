---
phase: 69
slug: handler-agent-canonicalisation-cross-swarm-reuse
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-04
---

# Phase 69 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && npm test -- --run --reporter=dot` |
| **Full suite command** | `cd web && npm test -- --run` |
| **Live smoke command** | `cd web && LIVE_SMOKE=1 npm test -- --run __tests__/canonicalisation/live-smoke.test.ts` |
| **Estimated runtime** | ~25s offline; +~30s for LIVE_SMOKE=1 (3 live Orq calls) |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite green + LIVE_SMOKE=1 green at least once at end of Wave 5
- **Max feedback latency:** 30 seconds offline

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 69-01-01 | 01 | 0 | CANO-02 | — | migration is idempotent + nullable-safe | unit | `cd web && npm test -- --run __tests__/migrations/20260505a.test.ts` | ❌ W0 | ⬜ pending |
| 69-01-02 | 01 | 1 | CANO-02 | — | live `swarms.entity_brand` row matches expected jsonb-of-objects shape | smoke | `node scripts/verify-entity-brand-shape.mjs` | ❌ W0 | ⬜ pending |
| 69-02-01 | 02 | 0 | CANO-03 | — | migration sets `swarm_type='cross-cutting'` only on body agent | unit | `cd web && npm test -- --run __tests__/migrations/20260505b.test.ts` | ❌ W0 | ⬜ pending |
| 69-03-01 | 03 | 2 | CANO-02 | — | `loadBrandRegister` returns typed metadata; throws on unknown code | unit | `cd web && npm test -- --run web/lib/swarms/__tests__/brand-register.test.ts` | ❌ W0 | ⬜ pending |
| 69-03-02 | 03 | 2 | CANO-02 | T-69-01 | brand_code from registry — no fallback to hardcoded list | unit | `cd web && npm test -- --run web/lib/swarms/__tests__/brand-register-no-fallback.test.ts` | ❌ W0 | ⬜ pending |
| 69-04-01 | 04 | 2 | CANO-02 | — | codegen produces valid TS literal-union from live registry | unit | `cd web && npm run codegen && npm test -- --run __tests__/codegen/entity-types.test.ts` | ❌ W0 | ⬜ pending |
| 69-05-01 | 05 | 3 | CANO-01 | — | invoice-copy handler invokes body agent with new brand_register input shape | unit | `cd web && npm test -- --run web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts` | ✅ existing | ⬜ pending |
| 69-05-02 | 05 | 3 | CANO-01 | T-69-02 | handler does not pass cross-brand register data to agent | unit | `cd web && npm test -- --run web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler-isolation.test.ts` | ❌ W0 | ⬜ pending |
| 69-06-01 | 06 | 4 | CANO-01 | — | Orq agent prompt updated; `get_agent` returns expected `<brand_register>` block | manual | `mcp__orqai-mcp__get_agent debtor-copy-document-body-agent` | ✅ existing | ⬜ pending |
| 69-06-02 | 06 | 4 | CANO-01 | — | model fallback chain has no invalid IDs (no `mistral-large-latest`) | manual | `mcp__orqai-mcp__list_models` | ✅ existing | ⬜ pending |
| 69-07-01 | 07 | 5 | CANO-01 | — | 6 debtor-brand fixtures pass | unit | `cd web && npm test -- --run __tests__/canonicalisation/debtor-fixtures.test.ts` | ❌ W0 | ⬜ pending |
| 69-07-02 | 07 | 5 | CANO-04 | — | 1 UK fixture (`smeba-uk`) passes; setup/teardown isolates row | unit | `cd web && npm test -- --run __tests__/canonicalisation/uk-ie-fixture.test.ts` | ❌ W0 | ⬜ pending |
| 69-07-03 | 07 | 5 | CANO-04 | — | 3 sales-email-stub fixtures pass without prompt edits | unit | `cd web && npm test -- --run __tests__/canonicalisation/sales-fixtures.test.ts` | ❌ W0 | ⬜ pending |
| 69-07-04 | 07 | 5 | CANO-01 | — | live Orq smoke (1 debtor + 1 sales-stub + 1 UK) returns valid JSON | smoke | `cd web && LIVE_SMOKE=1 npm test -- --run __tests__/canonicalisation/live-smoke.test.ts` | ❌ W0 | ⬜ pending |
| 69-08-01 | 08 | 6 | CANO-01..04 | — | docs marked as IMPLEMENTED; CANO-* checked in REQUIREMENTS | grep | `grep -q "CANO-01.*IMPLEMENTED" docs/agentic-pipeline/stage-4-handler.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/__tests__/migrations/20260505a.test.ts` — pgtap-style assertion harness for entity_brand jsonb expansion
- [ ] `web/__tests__/migrations/20260505b.test.ts` — assert orq_agents row updates only the body agent
- [ ] `web/lib/swarms/__tests__/brand-register.test.ts` — `loadBrandRegister` happy path + unknown-code throw
- [ ] `web/lib/swarms/__tests__/brand-register-no-fallback.test.ts` — confirms no defensive fallback
- [ ] `web/__tests__/codegen/entity-types.test.ts` — generated `entity.generated.ts` matches live registry
- [ ] `web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler-isolation.test.ts` — single-brand input isolation
- [ ] `web/__tests__/canonicalisation/debtor-fixtures.test.ts` + 6 fixture JSON files (one per existing brand)
- [ ] `web/__tests__/canonicalisation/uk-ie-fixture.test.ts` + UK fixture (synthetic `smeba-uk` brand row, setup/teardown)
- [ ] `web/__tests__/canonicalisation/sales-fixtures.test.ts` + 3 sales-email-stub fixtures
- [ ] `web/__tests__/canonicalisation/live-smoke.test.ts` (LIVE_SMOKE=1 gated)
- [ ] `scripts/verify-entity-brand-shape.mjs` — Wave 1 post-migration verification
- [ ] `scripts/gen-entity-types.ts` — codegen script (D-03)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Orq.ai prompt diff approved before PATCH | CANO-01 | Operator must visually confirm `<brand_register>` block replaces `<entity_register>` block correctly | At Wave 4 entry: run `mcp__orqai-mcp__get_agent debtor-copy-document-body-agent` → diff against `Agents/debtor-email-swarm/agents/debtor-copy-document-body-agent.md` proposed update → operator says "apply" → run `update_agent` → re-run `get_agent` → confirm `model.parameters` + `response_format` preserved |
| Supabase migration apply via MCP | CANO-02, CANO-03 | Phase 67/68 precedent: operator-gated `apply_migration` checkpoint | At Wave 1 entry: paste migration content into `mcp__supabase__apply_migration` with operator confirmation; run `verify-entity-brand-shape.mjs` after |
| Live Orq smoke green at end of Wave 5 | CANO-01 | LIVE_SMOKE=1 hits production Orq.ai endpoint; CI cannot run unsupervised | Operator runs `cd web && LIVE_SMOKE=1 npm test -- --run __tests__/canonicalisation/live-smoke.test.ts` once at Wave 5 close |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s offline
- [ ] LIVE_SMOKE=1 green at least once before phase close
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
