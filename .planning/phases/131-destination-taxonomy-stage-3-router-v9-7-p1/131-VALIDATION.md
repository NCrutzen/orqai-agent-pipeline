---
phase: 131
slug: destination-taxonomy-stage-3-router-v9-7-p1
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-17
---

# Phase 131 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `131-RESEARCH.md` → Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (per `web/` `*.test.ts` convention; co-located `__tests__/`) |
| **Config file** | `web/vitest.config.*` (existing; confirm in Wave 0) |
| **Quick run command** | `cd web && npx vitest run <path>` |
| **Full suite command** | `cd web && npm test` |
| **Estimated runtime** | ~quick: seconds per file · full: ~minutes |

---

## Sampling Rate

- **After every task commit:** Run the requirement's `npx vitest run <path>` command.
- **After every plan wave:** Run `cd web && npm test` + `npm run codegen && git diff --exit-code` (codegen-drift gate).
- **Before `/gsd:verify-work`:** Full suite green + `npm run check:supabase` green (RLS).
- **Max feedback latency:** < 120 seconds (quick command per task).

---

## Per-Task Verification Map

> Requirement-level map from research. Task IDs are filled in once plans exist (Nyquist auditor refines). `Wave` column maps to the research's A–E decomposition.

| Req ID | Wave | Behavior | Test Type | Automated Command | File Exists |
|--------|------|----------|-----------|-------------------|-------------|
| ROUTE-01 | A | Seed contains exactly the frozen bucket set; no hardcoded bucket list / no swarm_type branch | unit + grep | `npx vitest run lib/swarms/__tests__/routing-destinations-seed.test.ts` + `grep -r "swarm_type === 'info-routing'" web/lib` (expect none) | ❌ W0 |
| ROUTE-02 | A | (bucket×brand)→mailbox resolves; fire-control-in-info@smeba cross-brand case; `env_id='BX'` filter intact | unit | `npx vitest run lib/swarms/__tests__/routing-resolve.test.ts` | ❌ W0 |
| ROUTE-03 | B | Agent output validated by closed-list Zod; invalid/empty → unrouted (no throw) | unit | `npx vitest run lib/.../__tests__/info-routing-coordinator-schema.test.ts` | ❌ W0 |
| ROUTE-04 | C | Verdict has all 6 fields on `coordinator_runs.decision_details.routing` + TELE-01 dual-write | unit (mocked supabase) | `npx vitest run lib/inngest/functions/__tests__/coordinator-routing-verdict.test.ts` | ❌ W0 |
| ROUTE-05 | D | layer (a) To/CC → already_addressed; layer (b) msg-id → already_addressed; non-dup → routable; id normalization | unit | `npx vitest run lib/.../__tests__/routing-dedup.test.ts` | ❌ W0 |
| ROUTE-06 | C | Ambiguous/below-threshold → unrouted (not forced bucket); unrouted queryable | unit | `npx vitest run lib/.../__tests__/routing-unrouted.test.ts` | ❌ W0 |
| ROUTE-07 | C | No Graph forward/move + no Stage-2 invoke reachable from 131 paths; `stage_3_routing` held | grep + unit | `grep -rn "graph.*forward\|/sendMail\|move" web/lib/inngest/functions/<routing block>` (expect none) + gate test | ❌ W0 |
| ROUTE-08 | E | per-bucket + overall match-rate vs human-actual; refuses verdict when graded_n too low | unit (pure fn) | `npx vitest run web/scripts/eval/__tests__/info-routing-precision-shadow.test.ts` | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `lib/swarms/__tests__/routing-destinations-seed.test.ts` — ROUTE-01 (assert seed migration row set; mirror `sales-noise-calibration.test.ts` migration-parsing style)
- [ ] `lib/swarms/__tests__/routing-resolve.test.ts` — ROUTE-02
- [ ] dedup + verdict + unrouted + schema tests (ROUTE-03/04/05/06) co-located with the routing-capability module
- [ ] `web/scripts/eval/__tests__/info-routing-precision-shadow.test.ts` — ROUTE-08 pure-fn test
- [ ] Confirm `web/vitest.config` + add `gen-routing-destinations.ts` to the `codegen` npm script
- [ ] Grep-gate fixtures for ROUTE-01 (no bucket literal) + ROUTE-07 (no forward / no Stage-2)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live shadow precision ≥85% vs human-actual destination | ROUTE-08 | Blocked on the delta-sync-on-info@ + Outlook-category prerequisite (outside 131); 0/8000 sampled rows currently carry categories | Build + unit-test the harness in 131; run the live measurement only after the prerequisite lands. Harness must refuse a verdict when `graded_n` too low (false-success guard). |
| Orq `info-routing-coordinator` agent registration (Studio JSON-schema Response Format) | ROUTE-03 | Orq MCP exposes no tool CRUD; the json_schema Response Format is set in Studio | Per CLAUDE.md Orq workflow: create json_schema resource in Studio → set agent Response Format dropdown = "JSON Schema"; verify via `get_agent`. |

*Automated coverage exists for all ROUTE-01..08 mechanisms; the two rows above are environment/operator-gated, not logic gaps.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
