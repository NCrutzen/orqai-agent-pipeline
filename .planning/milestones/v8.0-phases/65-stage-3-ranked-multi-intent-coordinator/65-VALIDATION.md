---
phase: 65
slug: stage-3-ranked-multi-intent-coordinator
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-01
---

# Phase 65 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Plan 01 Task 1 lands the Wave 0 scaffolds; Plans 03 + 04 fill them with real assertions.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (per `web/vitest.config.ts`) |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx vitest run web/lib/automations/debtor-email/triage web/lib/automations/debtor-email/coordinator web/lib/automations/debtor-email/handlers web/lib/inngest/functions/__tests__/debtor-email-triage.test.ts web/lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts web/lib/inngest/functions/__tests__/debtor-email-synthesis.test.ts` |
| **Full suite command** | `cd web && npx vitest run` |
| **Estimated runtime** | ~30-45 seconds for the quick command, ~60s full suite |

---

## Sampling Rate

- **After every task commit:** Run the quick command above (latency <60s).
- **After every plan wave:** Run the full suite.
- **Before `/gsd-verify-work`:** Full suite green + Plan 05 regression report committed.
- **Max feedback latency:** 65 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 65-01-01 | 01 | 1 | CORD-01..04 (Wave 0 scaffolds) | — | scaffolds run as `it.todo` — no assertion regression | unit | `cd web && npx vitest run <8 scaffold files>` | ❌ W0 (created by this task) | ⬜ pending |
| 65-01-02 | 01 | 1 | CORD-01 | T-65-15 | INTENT_VERSION_V2 literal must match Studio Tool A | unit | `cd web && npx vitest run web/lib/automations/debtor-email/triage/__tests__/types-v2.test.ts` | ❌ W0 | ⬜ pending |
| 65-01-03 | 01 | 1 | CORD-01..04 (schema foundation) | T-65-01..06 | RPC SECURITY DEFINER + race-guard | n/a (manual SQL grep) | grep checks per Plan 01 Task 3 acceptance | n/a | ⬜ pending |
| 65-01-04 | 01 | 1 | CORD-01..04 (live schema) | T-65-06 | supabase db push applied | manual | `supabase db push` + `\d coordinator_runs` | n/a | ⬜ pending |
| 65-02-01 | 02 | 1 | CORD-01..03 | T-65-07 | Studio JSON Schema tools accept anyOf nullable (no array shorthand) | manual (Studio) | n/a | n/a | ⬜ pending |
| 65-02-02 | 02 | 1 | CORD-01..03 | T-65-08 | list_models pre-flight prevents unknown ID PATCH | manual | `mcp:list_models` snapshot grep | n/a | ⬜ pending |
| 65-02-03 | 02 | 1 | CORD-01 | T-65-09 | create-then-PATCH preserves response_format | manual | get_agent JSON snapshot grep | n/a | ⬜ pending |
| 65-02-04 | 02 | 1 | CORD-03 | T-65-10 | synthesis-agent receives structured HandlerOutput[] (not free text) | manual (prompt review) | n/a | n/a | ⬜ pending |
| 65-02-05 | 02 | 1 | CORD-01..03 | — | registry mirror migration applies idempotently | manual | grep migration file + db push | n/a | ⬜ pending |
| 65-03-01 | 03 | 2 | CORD-01, CORD-02 | T-65-15 | invokeIntentAgent v2 schema validation; pure escalation gate | unit | `cd web && npx vitest run web/lib/automations/debtor-email/triage/__tests__ web/lib/automations/debtor-email/coordinator/__tests__/escalation-gate.test.ts` | ❌ W0 | ⬜ pending |
| 65-03-02 | 03 | 2 | CORD-01, CORD-02, CORD-04 | T-65-12, T-65-14 | function id stable D-10; retries:0 recovery; vocabulary throw on missing dispatch | unit (mock-step) | `cd web && npx vitest run web/lib/inngest/functions/__tests__/debtor-email-triage.test.ts` | ❌ W0 | ⬜ pending |
| 65-04-01 | 04 | 2 | CORD-03 | T-65-17, T-65-19 | RPC race-guard via claim_synthesis; HandlerOutput[] structured input | unit (mock-step + pg-mock) | `cd web && npx vitest run web/lib/automations/debtor-email/handlers/__tests__/output-adapter.test.ts web/lib/automations/debtor-email/coordinator/__tests__/rpc-fanin.test.ts` | ❌ W0 | ⬜ pending |
| 65-04-02 | 04 | 2 | CORD-03 | T-65-18, T-65-20, T-65-23 | tool allowlist intact; retries:0; partial-synthesis branch never calls create-draft on empty outputs | unit (mock-step) | `cd web && npx vitest run web/lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts web/lib/inngest/functions/__tests__/debtor-email-synthesis.test.ts` | ❌ W0 | ⬜ pending |
| 65-04-03 | 04 | 2 | CORD-03 | T-65-21 | Stage 4 handler RPC fan-in only when from_orchestrator=true (no regression on single-shot) | unit (mock-step) | `cd web && npx vitest run web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts` | ✅ existing test file extended | ⬜ pending |
| 65-05-01 | 05 | 3 | CORD-04 | T-65-26 | regression report >=70% single_shot rate (sanity for ~80% target) | manual run | `tsx scripts/phase-65-regression-backfill.ts --limit 200` | n/a (script created Plan 05) | ⬜ pending |
| 65-05-02 | 05 | 3 | CORD-01..04 | T-65-25 | end-to-end synthetic events match expected coordinator_runs state | manual (Inngest dev-server) | dev-server emit + supabase query + screenshot | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 lives entirely in Plan 01 Task 1. All scaffolds created there:

- [ ] `web/lib/automations/debtor-email/triage/__tests__/types-v2.test.ts` — CORD-01 (filled in Plan 01 Task 2)
- [ ] `web/lib/automations/debtor-email/triage/__tests__/invoke-intent-v2.test.ts` — CORD-01 (filled in Plan 03 Task 1)
- [ ] `web/lib/automations/debtor-email/triage/__tests__/idempotency-cache-v2.test.ts` — CORD-04 (filled in Plan 03 Task 1)
- [ ] `web/lib/automations/debtor-email/coordinator/__tests__/escalation-gate.test.ts` — CORD-02 (filled in Plan 03 Task 1)
- [ ] `web/lib/automations/debtor-email/coordinator/__tests__/rpc-fanin.test.ts` — CORD-03 (filled in Plan 04 Task 1)
- [ ] `web/lib/inngest/functions/__tests__/debtor-email-triage.test.ts` — CORD-02 + CORD-04 (filled in Plan 03 Task 2)
- [ ] `web/lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts` — CORD-03 (filled in Plan 04 Task 2)
- [ ] `web/lib/inngest/functions/__tests__/debtor-email-synthesis.test.ts` — CORD-03 (filled in Plan 04 Task 2)
- [ ] `web/lib/automations/debtor-email/handlers/__tests__/output-adapter.test.ts` — CORD-03 (created in Plan 04 Task 1; not in Plan 01 scaffold list — added during planning)
- [x] No new framework install needed — Vitest already in `web/package.json`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `supabase db push` applies migrations to live DB | CORD-01..04 | TypeScript builds use generated types, not live DB; only DB push catches schema drift | Plan 01 Task 4 [BLOCKING] checkpoint with psql verification queries |
| Orq Studio JSON Schema tool resources created | CORD-01..03 | MCP exposes no tool CRUD per CLAUDE.md observation 2026-05-01 | Plan 02 Task 1 [BLOCKING] human-action checkpoint |
| Studio Response Format dropdown set per agent | CORD-01..03 | Studio UI step; no automation seam | Plan 02 Tasks 3 + 4 — verified via get_agent JSON snapshot |
| End-to-end pipeline smoke (4 escalation reasons) | CORD-01..04 | Requires Inngest dev-server + Next.js + live Orq | Plan 05 Task 3 [BLOCKING] human-verify checkpoint |
| Bulk Review badge visual | CORD-03 | UI rendering inspection | Plan 05 Task 3 — included in screenshots |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (manual-only items justified above)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (manual checkpoints are explicit and isolated)
- [x] Wave 0 covers all MISSING references (8 scaffolds in Plan 01 + 1 in Plan 04)
- [x] No watch-mode flags (all `vitest run`, never `vitest watch`)
- [x] Feedback latency < 65s (quick command targets ~30-45s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-01
