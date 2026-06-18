---
phase: 122
slug: cross-brand-scope-customer-resolution
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-18
---

# Phase 122 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 122-RESEARCH.md "Validation Architecture". Task IDs are assigned by the planner; rows below are requirement-keyed until plans exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `^4.1.0` (`web/package.json` `"test": "vitest run"`) |
| **Config file** | repo vitest config; engine tests live in `web/lib/agentic-pipeline/resolve/__tests__/` |
| **Quick run command** | `cd web && npx vitest run lib/agentic-pipeline/resolve` |
| **Full suite command** | `cd web && npm test` |
| **Estimated runtime** | ~30–90 seconds (quick set) / full suite minutes |

**Eval gate (live, NOT in the unit suite):**
`cd web && npx tsx scripts/eval/resolver-correctness-gate.ts --rows 37,85,95,96,97,98,67,69,70`

---

## Sampling Rate

- **After every task commit:** `cd web && npx vitest run lib/agentic-pipeline/resolve`
- **After every plan wave:** `cd web && npm test` + `npm run check:supabase` (RLS gate, pre-push hook)
- **Before `/gsd:verify-work`:** full suite green AND eval gate green (all reachable bucket-C rows pass)
- **Max feedback latency:** ~90 seconds (quick set)

---

## Per-Task Verification Map

> Requirement-keyed until the planner assigns task IDs. Each task that implements a row below MUST carry the matching `<automated>` command.

| Requirement | Wave | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|------|------------|-----------------|-----------|-------------------|-------------|--------|
| XSCOPE-01 (unique root → AUTO; ≥2 roots → suggestie) | 1 | confident-wrong (D-08 root-uniqueness) | cross-brand AUTO only when exactly one `root_party_id`; else suggestie | unit | `cd web && npx vitest run lib/agentic-pipeline/resolve/__tests__/cross-scope-auto.test.ts` | ❌ W0 | ⬜ pending |
| XSCOPE-01 (weak lone kind → suggestie, D-04) | 1 | confident-wrong (sender/domain ~21%) | lone weak signal cross-brand never AUTO | unit | `cd web && npx vitest run lib/agentic-pipeline/resolve/__tests__/cross-scope-suggestie.test.ts` | ❌ W0 | ⬜ pending |
| XSCOPE-01 (disagreeing signals → suggestie/unresolved, D-05) | 1 | confident-wrong | signals pointing at different customers never AUTO | unit | same as above | ❌ W0 (template: `corroboration-demote.test.ts`) | ⬜ pending |
| XSCOPE-02 (opt-out byte-identical) | 1 | — | `cross_scope` absent / `enabled:false` → output identical to today | unit | `cd web && npx vitest run lib/agentic-pipeline/resolve/__tests__/cross-scope-optout.test.ts` (or extend `port-equivalence.test.ts`) | ✅ (extend) | ⬜ pending |
| XSCOPE-02 (SWARM-02: no swarm-name branch) | 1 | elevation | gating reads `config.cross_scope?.enabled` only | static/grep | `! grep -rn "swarm_type ===\|swarm ===" web/lib/agentic-pipeline/resolve/` | ✅ (CI grep) | ⬜ pending |
| XSCOPE-03 (9 bucket-C rows resolve-correct or demote) | later | confident-wrong | bucket-C resolves to operator-confirmed customer or demotes to suggestie | integration (live) | `cd web && npx tsx scripts/eval/resolver-correctness-gate.ts --rows 37,85,95,96,97,98,67,69,70` | ❌ W0 (add `BUCKET_C`) | ⬜ pending |
| D-09 (misroute annotation present) | 1 | — | cross-brand resolve carries `cross_scope_misroute` (emit-only) | unit | cross-scope test asserts the annotation field | ❌ W0 | ⬜ pending |
| D-06 (`suggestie` → 0.7 numericConfidence) | 1 | — | new tier maps cleanly for the future Outlook-label phase | unit | `cd web && npx vitest run lib/pipeline-events` | ❌ W0 (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/lib/agentic-pipeline/resolve/__tests__/cross-scope-auto.test.ts` — XSCOPE-01 unique-root AUTO + misroute (D-09)
- [ ] `web/lib/agentic-pipeline/resolve/__tests__/cross-scope-suggestie.test.ts` — XSCOPE-01 ≥2 roots / weak-lone → suggestie (D-04/D-08)
- [ ] `web/lib/agentic-pipeline/resolve/__tests__/cross-scope-optout.test.ts` — XSCOPE-02 byte-identical when disabled (or extend `port-equivalence.test.ts`)
- [ ] Extend `web/scripts/eval/resolver-correctness-gate.ts` with `BUCKET_C` set + `bucketCResolvedOrDemoted` scoring + RERUN-FINDINGS section (XSCOPE-03)
- [ ] Extend `numericConfidence` test for the `suggestie` case
- [ ] Test fixtures: mocked `lookupResolveCandidates` returning multi-brand matches (template: existing `corroboration-*.test.ts` mocking pattern)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bucket-C live coverage (A1) | XSCOPE-03 | Whether all 9 bucket-C customers are live-indexed in `resolver_index` is unverifiable without a live eval run | Run the eval gate against the live substrate; rows whose customer is not indexed are reported separately, not counted as failures |
| Bulk Review renders suggestie + candidate set | D-07 | Visual confirmation the existing surface shows the new tier | Open Bulk Review on a re-run row that resolved cross-brand; confirm suggestie tier + candidate list render via the existing `inputs.candidates` projection (no UI change expected) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (Plan 122-01)
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-18 (plan-checker confirmed Wave-0 gap coverage + per-task automated verify + sampling continuity)
