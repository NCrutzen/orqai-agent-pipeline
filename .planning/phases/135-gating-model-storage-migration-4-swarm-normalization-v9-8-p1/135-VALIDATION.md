---
phase: 135
slug: gating-model-storage-migration-4-swarm-normalization-v9-8-p1
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
---

# Phase 135 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 135-RESEARCH.md "Validation Architecture". The load-bearing surface is the gate
> seam (`web/lib/pipeline-gating/dry-run-gate`) — the three pin tests staying green ARE the
> MIGRATE-02 "no behavior change" proof.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx vitest run lib/pipeline-gating` |
| **Full suite command** | `cd web && npm test` |
| **Estimated runtime** | ~5–10s quick · full suite ~minutes |

> Note: `web/node_modules` is absent in this worktree — Wave 0 must `cd web && npm ci` before any
> Vitest run. CI installs regardless.

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run lib/pipeline-gating`
- **After every plan wave:** Run `cd web && npm test`
- **Before `/gsd:verify-work`:** Full suite green + `npm run codegen && git diff --exit-code` (must be a no-op — gate config is NOT codegen'd) + `npm run check:supabase` 0 ERROR + the SQL trigger smoke + the seed read-back
- **Max feedback latency:** ~10s (quick gate run)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| W0 | — | 0 | MIGRATE-02 | — | Stage gate polarity unchanged (TRUE=blocked, MISSING=fail-closed) | unit | `cd web && npx vitest run lib/pipeline-gating/dry-run-gate/__tests__/dry-run-gate.test.ts` | ✅ keep green (rename fixtures) | ⬜ pending |
| W0 | — | 0 | MIGRATE-02 | — | Forward-bucket inverse polarity preserved (TRUE=released) | unit | `cd web && npx vitest run lib/pipeline-gating/dry-run-gate/__tests__/forward-bucket-release.test.ts` | ✅ keep green | ⬜ pending |
| W0 | — | 0 | MIGRATE-02 | — | intent_label gate fail-closed preserved | unit | `cd web && npx vitest run lib/pipeline-gating/dry-run-gate/__tests__/intent-label-gate.test.ts` | ✅ keep green | ⬜ pending |
| W0 | — | 0 | MIGRATE-02 | — | debtor effective gating preserved (cleanup LIVE via handler, labeling/invoice held) | unit | `cd web && npx vitest run lib/inngest/functions/__tests__/dry-run-gate-preservation.test.ts` | ✅ keep green | ⬜ pending |
| W0 | — | 0 | MODEL-02 | T-V5 | Handler tri-state: `live`→not blocked; `dry`/`off`/missing→blocked (fail-closed) | unit | `cd web && npx vitest run lib/pipeline-gating` | ❌ W0 new assertions | ⬜ pending |
| W0 | — | 0 | MODEL-03, MODEL-05 | — | `deriveMailboxMode`→Shadow/Dry/Live; highest-wins; `{}`→Shadow (fail-closed) | unit | `cd web && npx vitest run lib/pipeline-gating/dry-run-gate/__tests__/derive-mode.test.ts` | ❌ W0 new file | ⬜ pending |
| W0 | — | 0 | MIGRATE-03, D-05-R | — | sales derives the operator-intended mode (`Dry`); asserts archive-inert assumption (OQ-3) | unit | `cd web && npx vitest run lib/pipeline-gating/dry-run-gate/__tests__/derive-mode.test.ts` | ❌ W0 new assertion | ⬜ pending |
| W0 | — | 0 | D-03 | T-Repud | Shadow holds the Graph `AI:`-PATCH but NOT internal persistence (pipeline_events/automation_runs/email_labels) | unit | `cd web && npx vitest run lib/inngest/functions/__tests__/` | ❌ W0 new assertion | ⬜ pending |
| W0 | — | 0 | MODEL-04 | T-EoP | DB trigger RAISEs on `handler=live` with non-live trigger-stage (illegal UPDATE rejected) | integration (SQL) | SQL smoke via Management API: attempt illegal UPDATE → assert it fails; then `npm run check:supabase` | ❌ W0 SQL smoke | ⬜ pending |
| W0 | — | 0 | MIGRATE-03, D-09 | T-Tamper | Post-migration `gating_config` per swarm == verified seed table (read-back) | integration | Read-back query asserting each swarm's `gating_config` equals the seed | ❌ W0 read-back smoke | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `cd web && npm ci` — `web/node_modules` absent in this worktree
- [ ] `lib/pipeline-gating/dry-run-gate/__tests__/derive-mode.test.ts` — NEW: Shadow/Dry/Live, highest-wins, fail-closed→Shadow, sales-derives-Dry (MODEL-03, MODEL-05, D-05-R)
- [ ] New tri-state assertions in `dry-run-gate.test.ts` — MODEL-02 (`live`/`dry`/`off`); update fixtures `dry_run_config`→`gating_config`
- [ ] Shadow-suppression assertion in the intent-label worker test — D-03
- [ ] SQL trigger smoke (attempt illegal `handler=live` on non-live stage → assert RAISE) — MODEL-04
- [ ] Seed read-back smoke (post-migration `gating_config` per swarm == verified seed) — MIGRATE-03/D-09

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration apply to live `mvqjhlxfvtqqubqgdvhz` | MIGRATE-01/03 | Production registry write is operator-gated per prior phases (no auto-apply); applied via Supabase MCP / Management API | Re-query the 4-swarm seed at apply time (research valid-until 2026-07-02), apply migration, run the read-back smoke, confirm 0-ERROR advisor |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s (quick gate run)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
