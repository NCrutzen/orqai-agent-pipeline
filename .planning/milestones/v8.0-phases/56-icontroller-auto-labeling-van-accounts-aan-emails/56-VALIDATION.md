---
phase: 56
slug: icontroller-auto-labeling-van-accounts-aan-emails
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-28
---

# Phase 56 — Validation Strategy

> Per-phase validation contract. Sourced from RESEARCH.md §Validation Architecture (lines 799-846).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + jsdom + @vitejs/plugin-react |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && pnpm vitest run tests/labeling` |
| **Full suite command** | `cd web && pnpm vitest run` |
| **Estimated runtime** | quick ~5s · full ~60s |

---

## Sampling Rate

- **After every task commit:** quick command (labeling subset)
- **After every plan wave:** full suite
- **Phase gate:** full suite green + probe artifact checked in + Smeba dry-run results reviewed before flipping `LABELING_CRON_MUTATE=true`
- **Max feedback latency:** 60s

---

## Per-Task Verification Map

CONTEXT.md uses Decision IDs D-00..D-31. Tests are mapped to decisions; planner assigns task IDs.

| Decision | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|----------|-----------|-------------------|-------------|--------|
| D-00/D-01 | Pipeline runs thread→sender→identifier→LLM; sender-hit short-circuits | unit | `pnpm vitest run tests/labeling/resolve-debtor.test.ts -t "sender-first ordering"` | ❌ W0 | ⬜ |
| D-03 | LLM only on multi-candidate ambiguity | unit | `pnpm vitest run tests/labeling/resolve-debtor.test.ts -t "LLM skipped on single-hit"` | ❌ W0 | ⬜ |
| D-04/D-05 | NXT-Zap client sends `{nxt_database, lookup_kind, payload}` + Bearer + 25s timeout | unit | `pnpm vitest run tests/labeling/nxt-zap-client.test.ts` | ❌ W0 | ⬜ |
| D-06 | Route 404s when `labeling_settings.nxt_database` null | integration | `pnpm vitest run tests/labeling/route.test.ts -t "no nxt_database"` | ❌ W0 | ⬜ |
| D-08/D-31 | Migration extends `classifier_rules.kind` CHECK; seeds invoice_legacy resolver | manual (DDL) | post-apply: `select kind from classifier_rules where rule_key='resolver:invoice_legacy_regex'` | manual | ⬜ |
| D-13 | LLM tiebreaker output Zod-validated; returns on bad JSON | unit | `pnpm vitest run tests/labeling/llm-tiebreaker.test.ts` | ❌ W0 | ⬜ |
| D-15/D-16 | `labelEmail` no-op on match; warns + skips on conflict | unit (mocked Page) | `pnpm vitest run tests/labeling/label-email-in-icontroller.test.ts` | ❌ W0 | ⬜ |
| D-17 | Probe artifact checked in | manual (operator) | `ls .planning/briefs/artifacts/debtor-email-label-probe-*` | manual | ⬜ |
| D-20/D-22 | Page renders RPC counts; tree groups by mailbox | component | `pnpm vitest run tests/labeling/page.test.tsx` | ❌ W0 | ⬜ |
| D-21 | Approve/Reject sync-writes `agent_runs.human_verdict` + `email_labels.reviewed_*` | unit | `pnpm vitest run tests/labeling/actions.test.ts` | ❌ W0 | ⬜ |
| D-23 | Drawer subscribes via AutomationRealtimeProvider on `automations:debtor-email-labeling:stale` | smoke | `pnpm vitest run tests/labeling/drawer.test.tsx -t "broadcast channel"` | ❌ W0 | ⬜ |
| D-24/D-25 | Flip cron promotes at N≥50, CI-lo≥0.95; demotes <0.92; respects `LABELING_CRON_MUTATE=false` | unit | `pnpm vitest run tests/labeling/flip-cron.test.ts` | ❌ W0 | ⬜ |
| D-28 | Every call writes email_labels row, even unresolved | integration | `pnpm vitest run tests/labeling/route.test.ts -t "always writes email_labels"` | ❌ W0 | ⬜ |
| D-29 | 404 `email_not_ingested` when email_pipeline.emails missing | integration | `pnpm vitest run tests/labeling/route.test.ts -t "404 email_not_ingested"` | ❌ W0 | ⬜ |
| D-30 | Per-mailbox aggregation in flip cron (Smeba canary) | unit | `pnpm vitest run tests/labeling/flip-cron.test.ts -t "per-mailbox aggregation"` | ❌ W0 | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/tests/labeling/route.test.ts` — POST flow, 404 cases, dry-run gate
- [ ] `web/tests/labeling/resolve-debtor.test.ts` — 4-laag pipeline branches
- [ ] `web/tests/labeling/nxt-zap-client.test.ts` — request/response/timeout
- [ ] `web/tests/labeling/llm-tiebreaker.test.ts` — Zod validation
- [ ] `web/tests/labeling/label-email-in-icontroller.test.ts` — idempotency
- [ ] `web/tests/labeling/flip-cron.test.ts` — Wilson per-mailbox, mutate flag
- [ ] `web/tests/labeling/page.test.tsx` — page render + tree
- [ ] `web/tests/labeling/drawer.test.tsx` — drawer + realtime channel
- [ ] `web/tests/labeling/actions.test.ts` — approve/reject sync write
- [ ] `web/lib/automations/debtor-email/probe-label-ui.ts` — probe artifact (BLOCKING for the Browserless module task)

Framework install: not needed (vitest already configured).

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Probe-script run on production iController | D-17 | Requires operator credentials + live iController DOM | Run `pnpm tsx web/lib/automations/debtor-email/probe-label-ui.ts`, review screenshots+DOM, commit findings as comments |
| NXT contactperson schema confirmation | D-01/D-04 | Requires operator NXT/Zapier access | Operator confirms table name, columns, link path to customer accounts; documented in `.planning/briefs/artifacts/nxt-contactperson-schema.md` |
| Zapier Zaps created (5 mailboxes) | D-04 | External system | Operator creates one Zap per Outlook mailbox; first Smeba Zap enabled in dry-run |
| Migration applied (CHECK extension + columns) | D-31 | Live DB | `[BLOCKING]` schema-push task in plan; same pattern as Phase 60-01 |
| 14-day shadow + Wilson flip per mailbox | D-26/D-30 | Time-windowed observation | Operator reviews `/automations/debtor-email-labeling`, spot-checks rows, flips `LABELING_CRON_MUTATE=true` after Smeba hits N≥50 + CI-lo≥0.95 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] No 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
