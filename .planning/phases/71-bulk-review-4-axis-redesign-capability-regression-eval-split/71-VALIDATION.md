---
phase: 71
slug: bulk-review-4-axis-redesign-capability-regression-eval-split
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-05
---

# Phase 71 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from RESEARCH.md `## Validation Architecture` section.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing, used across `web/**/__tests__/`) |
| **Config file** | `web/vitest.config.ts` (existing) |
| **Quick run command** | `cd web && npx vitest run app/\(dashboard\)/automations/\[swarm\]/review web/lib/inngest/functions/__tests__/debtor-email-override-handler.test.ts web/lib/pipeline-events` |
| **Full suite command** | `cd web && npm test` |
| **Estimated runtime** | ~30 seconds (quick) / ~120 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run quick command above
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green; manual smoke test (file 1 capability + 1 regression override per axis through live UI on acceptance, verify each row via Supabase MCP) required.
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

The Override Coverage Matrix = {axis} × {capability, regression} × {happy, edge}. Task IDs will be assigned by the planner; the rows below are the verification commands each REVW requirement maps to.

| Verification | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---|---|---|---|---|---|---|---|---|---|
| Stage 1 override → reroute (capability) | TBD | TBD | REVW-01 | — | New category recorded; capability tag emitted | unit | `cd web && npx vitest run web/lib/inngest/functions/__tests__/debtor-email-override-handler.test.ts -t "axis-1.*capability"` | ❌ W0 | ⬜ pending |
| Stage 1 override → noise/archive (regression) | TBD | TBD | REVW-01 | — | Regression tag emitted; original category preserved | unit | `cd web && npx vitest run web/lib/inngest/functions/__tests__/debtor-email-override-handler.test.ts -t "axis-1.*regression"` | ❌ W0 | ⬜ pending |
| Stage 1 original event preserved as audit | TBD | TBD | REVW-01 | — | Append-only — original `pipeline_events` row immutable | integration | `cd web && npx vitest run web/lib/inngest/functions/__tests__/debtor-email-override-handler.test.ts -t "axis-1.*audit"` | ❌ W0 | ⬜ pending |
| Stage 2 override w/o re-run | TBD | TBD | REVW-02 | — | `customer_account_id` updated; no Stage 3+4 dispatch | unit | `cd web && npx vitest run -t "axis-2.*no-rerun"` | ❌ W0 | ⬜ pending |
| Stage 2 override re-emits coordinator-complete | TBD | TBD | REVW-02 | — | Confirmation gate respected; budget cap honored | integration | `cd web && npx vitest run -t "axis-2.*rerun"` | ❌ W0 | ⬜ pending |
| Stage 3 override dispatches new handler | TBD | TBD | REVW-03 | — | Handler resolved from `swarm_intents` registry | integration | `cd web && npx vitest run -t "axis-3.*dispatch"` | ❌ W0 | ⬜ pending |
| Stage 3 original Stage 4 row preserved | TBD | TBD | REVW-03 | — | Audit append-only | unit | `cd web && npx vitest run -t "axis-3.*audit"` | ❌ W0 | ⬜ pending |
| Stage 4 override emits draft_quality + reason, no handler re-run | TBD | TBD | REVW-04 | — | iController draft NOT mutated | unit | `cd web && npx vitest run -t "axis-4.*emit-only"` | ❌ W0 | ⬜ pending |
| Stage 4 override does NOT mutate iController | TBD | TBD | REVW-04 | — | No Browserless dispatch on Stage 4 override | unit | `cd web && npx vitest run -t "axis-4.*no-icontroller-mutation"` | ❌ W0 | ⬜ pending |
| Default `eval_type=regression` enforced | TBD | TBD | REVW-05 | T-D14 | Zod schema default; capability is opt-in | unit (zod) | `cd web && npx vitest run web/app/api/automations/debtor-email/override/__tests__/route.test.ts -t "default.*regression"` | ❌ W0 | ⬜ pending |
| Capability tag flows UI → POST → Inngest → emit row | TBD | TBD | REVW-05 | — | End-to-end tag propagation | integration | `cd web && npx vitest run -t "eval_type.*capability"` | ❌ W0 | ⬜ pending |
| View returns one row per email with all 4 stage decisions | TBD | TBD | REVW-06 | — | `pipeline_events_email_summary` shape | integration (DB) | `cd web && npx vitest run web/lib/pipeline-events/__tests__/email-summary.test.ts` | ❌ W0 | ⬜ pending |
| View `total_cost_cents` SUMs across events | TBD | TBD | REVW-06 | — | Aggregate correctness | integration (DB) | `cd web && npx vitest run -t "total_cost_cents.*sum"` | ❌ W0 | ⬜ pending |
| `loadPageData` reads from view | TBD | TBD | REVW-06 | — | Predicted-row feed sources view, not raw events | unit | `cd web && npx vitest run web/app/\(dashboard\)/automations/\[swarm\]/review/__tests__/load-page-data.test.ts -t "view"` | ✅ EXTEND | ⬜ pending |
| `operator_id` server-stamped, payload-ignored | TBD | TBD | D-13 | T-D13 | Spoof-safe — `auth.uid()` always wins | security | `cd web && npx vitest run -t "operator_id.*server-stamp"` | ❌ W0 | ⬜ pending |
| `reason` >1000 chars rejected | TBD | TBD | D-14 | T-D14 | Max-length zod constraint | security | `cd web && npx vitest run -t "reason.*max-length"` | ❌ W0 | ⬜ pending |
| Replay idempotency — handler invoked twice ≤2 emit rows | TBD | TBD | Pitfall 2 | — | UUIDs generated inside `step.run()` (Phase 65) | integration | `cd web && npx vitest run -t "replay.*idempotent"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/lib/inngest/functions/__tests__/debtor-email-override-handler.test.ts` — NEW. Covers REVW-01..REVW-05 axis fan-out + replay idempotency.
- [ ] `web/app/api/automations/debtor-email/override/__tests__/route.test.ts` — NEW. Covers payload validation, server-side `operator_id` stamping (D-13), max-length reason (D-14).
- [ ] `web/lib/pipeline-events/__tests__/email-summary.test.ts` — NEW. DB-integration test for `pipeline_events_email_summary` view shape, override-wins-latest semantics, cost SUM, tool_call_count rollup.
- [ ] `web/app/(dashboard)/automations/[swarm]/review/__tests__/load-page-data.test.ts` — EXTEND. Assert predicted-row feed reads `pipeline_events_email_summary` view (not raw events).
- [ ] `web/lib/inngest/functions/__tests__/classifier-verdict-worker.test.ts` — EXTEND or NEW. Assert override path emits override row BEFORE existing reroute logic.
- [ ] `web/lib/pipeline-events/__tests__/fixtures/override-events.ts` — NEW. Canonical payloads for each axis × {capability, regression}.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| Live UI submit-bar disables during in-flight submission | DoS pitfall | UI race-condition observable only in browser | Open Bulk Review on acceptance; submit override; confirm bar is disabled until POST resolves; refresh and confirm row from view |
| Realtime publication updates Bulk Review row after override | REVW-06 | Requires Supabase Realtime channel | Open two browser tabs on Bulk Review acceptance; submit override in tab A; confirm row updates in tab B within 2s |
| End-to-end: 1 capability + 1 regression override per axis | REVW-01..05 | Final smoke gate before `/gsd-verify-work` | File 8 overrides total via UI on acceptance; query `pipeline_events` via Supabase MCP and assert each `(axis, eval_type)` pair present with server-stamped `operator_id` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (5 NEW + 1 EXTEND files)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (quick) / 120s (full)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
