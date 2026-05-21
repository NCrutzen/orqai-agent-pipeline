---
phase: 66-pipeline-consolidation-retire-triage-path
plan: 04
subsystem: docs + audit
tags: [audit, docs, cons-03, d-10, coordinator]
requires:
  - 66-01 (events/types/registry rename complete)
  - 66-02 (verdict-worker + label-resolver wired to coordinator on prior wave)
provides:
  - "CONS-03 audit lock — zero cross-handler imports, written allowlist of `<intent>.requested` emit sites"
  - "Doc reconciliation attestation — both canonical docs reviewed end-to-end; no legacy 'triage'/`debtor/email.received`/`debtor-email-triage` references remain; human-triage workflow language preserved"
affects:
  - docs/debtor-email-pipeline-architecture.md (read-only — no edits required)
  - docs/agentic-pipeline/stage-3-coordinator.md (read-only — no edits required)
tech-stack:
  added: []
  patterns:
    - "Audit-as-artifact: grep commands + outputs captured in summary become the CONS-03 invariant lock"
key-files:
  created: []
  modified: []
decisions:
  - "Lines 411 + 413 of docs/debtor-email-pipeline-architecture.md left untouched: both are human-operator triage workflow language ('operator must triage', 'unresolved-needing-triage'), NOT references to the retired Inngest function. Plan instruction explicit on this."
  - "Audit 2 (emit-site allowlist) widened: classifier-verdict-worker.ts emits via dynamic registry (`category.swarm_dispatch` string). It is the entry point that fans `<intent>.requested` event names today; classified as allowed."
metrics:
  duration: ~5 min
  completed_date: 2026-05-04
---

# Phase 66 Plan 04: CONS-03 Cross-Handler Import Audit + Doc Reconciliation Summary

CONS-03 invariant locked via two grep audits (zero cross-handler imports; every `debtor-email/<intent>.requested` emit site classified against an allowlist). Both canonical docs read end-to-end; no edits required — Phase 65/66 terminology already consistent and the only surviving "triage" mentions describe human operator workflow.

## Audit 1 — Cross-handler import ban (CONS-03)

**Command:**

```bash
grep -rn 'from "@/lib/inngest/functions/' web/lib/inngest/functions/ --include="*.ts" | grep -v __tests__
```

**Output:** _(empty — zero matches)_

`wc -l` returned `0`. Verification clause `[ "$(... | wc -l)" -eq 0 ]` → PASS.

**Result:** PASS. No Inngest function file imports another Inngest function file. CONS-03 holds and is now documented as the invariant.

## Audit 2 — Emit-site allowlist for `debtor-email/<intent>.requested`

**Command (initial scan, file-wide pattern + emit-narrowing filter):**

```bash
grep -rn 'debtor-email/[a-z-]*\.requested' web/lib/inngest/functions/ --include="*.ts" \
  | grep -v __tests__ | grep -v "// " | grep -E 'name:|inngest\.send|step\.run'
```

**Output:**

```
web/lib/inngest/functions/debtor-email-coordinator.ts:261:          name: "debtor-email/orchestrator.requested",
```

The narrow grep (which requires the literal string `debtor-email/<intent>.requested` _on the same line_ as `name:` / `inngest.send`) catches only one direct emit. The other legitimate emit sites use template literals or dynamic event names sourced from the `swarm_categories.swarm_dispatch` registry column, so they fall outside this exact-string grep but are within the same logical surface area. To produce a complete allowlist I expanded the search across all `inngest.send` / `step.sendEvent` invocations.

**Expanded scan (all dispatch verbs):**

```bash
grep -rn 'inngest\.send\|step\.sendEvent\|step\.invoke' web/lib/inngest/functions/ --include="*.ts" | grep -v __tests__
```

**Per-line classification:**

| File:Line | Event name (literal/dynamic) | Allowlist entry | Classification |
|---|---|---|---|
| `web/lib/inngest/functions/debtor-email-coordinator.ts:218` | dynamic — `category.swarm_dispatch` (string from `swarm_categories` registry; literal `<intent>.requested` per Plan 01 seed migration) | "single-shot dispatch via registry" | ALLOWED — single-shot Stage 4 handler dispatch, the canonical entry point |
| `web/lib/inngest/functions/debtor-email-coordinator.ts:260` | literal `"debtor-email/orchestrator.requested"` | "orchestrator escalation" | ALLOWED — emits the Stage 3.5 orchestrator trigger when escalation conditions hit |
| `web/lib/inngest/functions/coordinator-orchestrator.ts:93` | template literal `` `debtor-email/${h.intent}.requested` `` | "orchestrator fan-out, lines 90-108" | ALLOWED — Stage 3.5 fan-out across handlers per planner output |
| `web/lib/inngest/functions/classifier-verdict-worker.ts:162` | dynamic — `category.swarm_dispatch` string from registry (currently `debtor-email/label-resolve.requested`, `debtor-email/invoice-copy.requested`) | "registry-driven Stage 1→Stage 2 dispatch" | ALLOWED — this is the regex classifier's exit; the same dispatcher pattern as the coordinator's single-shot. CONS-03 prohibits one Inngest function file *importing* another, not registry-driven event emission. |
| `web/lib/inngest/functions/stage-0-safety-worker.ts:73, 109, 157` | `"classifier/screen.requested"`, `"pipeline/budget_breached"` | n/a | OUT OF SCOPE — events do not match `debtor-email/<intent>.requested` shape. Stage 0 → Stage 1 boundary. |
| `web/lib/inngest/functions/debtor-email-icontroller-cleanup-dispatcher.ts:96` | shard events (`step.sendEvent`) | n/a | OUT OF SCOPE — iController-cleanup shard fan-out, separate event family. |

**Plus one out-of-`web/lib/inngest/functions/` allowlist member explicitly noted in the plan:**

| File:Line | Event name | Classification |
|---|---|---|
| `web/lib/automations/debtor-email/coordinator/coordinator-complete.ts:56` | literal `"debtor-email/synthesis.requested"` | ALLOWED — synthesis trigger fired by RPC fan-in completion. Lives outside `web/lib/inngest/functions/` so does not appear in the function-directory grep, but is on the canonical taxonomy emit-site list per the plan. |

**Note on the plan's mention of `classifier-label-resolver.ts` emitting `debtor-email/coordinator.requested`:** the plan mentions Plan 03 adds this emit. As of this audit (run before Plan 03 lands its source-code changes — the two plans run as parallel siblings in Wave 3), `classifier-label-resolver.ts` does NOT yet emit `debtor-email/coordinator.requested`. Its terminal step is `close-automation-run` at line 166. Once Plan 03 lands, that emit will appear and is pre-allowlisted.

**Result:** PASS. Every `<intent>.requested` emit site (literal, template-literal, or dynamic-via-registry) is classified within the allowlist. Zero violations.

## Doc 1 — `docs/debtor-email-pipeline-architecture.md`

**End-to-end read:** completed 2026-05-04 (executor: Claude Opus 4.7 via gsd-execute-plan). File length: 440 lines.

**Mechanical-reference scan:**

```bash
grep -n "debtor-email-triage\|debtorEmailTriage\|debtor/email.received" docs/debtor-email-pipeline-architecture.md
```

**Output:** _(empty — zero matches)_

**Surviving "triage" matches (verified per the D-10 instruction to leave human-triage references untouched):**

```
411:- `unknown → unresolved` → still creates Kanban card (operator must triage)
413:This means the Kanban in live mode shows mostly drafts-needing-send + unresolved-needing-triage, not verification noise.
```

Both lines describe human-operator workflow ("operator must triage", "unresolved-needing-triage" as a Kanban-lane label). Neither references the retired Inngest function. **Left untouched** per the plan's explicit instruction.

**Description-by-old-function-id sweep:** I read the full file and checked every `Inngest functions` block, every "Wave 3" narrative paragraph, and every event-name reference. The doc uses canonical names throughout: `classifier-label-resolver`, `classifier-invoice-copy-handler`, `classifier-verdict-worker`, and `debtor-email/label-resolve.requested` / `debtor-email/invoice-copy.requested`. The Stage 3 coordinator is not described in this file (it lives in `docs/agentic-pipeline/stage-3-coordinator.md`); the architecture map stops at Stage 2 handlers, which is consistent with the cross-swarm split per the file's own preamble.

**Edits made:** none.

**Acceptance criteria check:**
- ✅ Zero occurrences of `debtor-email-triage`, `debtorEmailTriage`, `debtor/email.received`.
- ✅ The two existing "triage" matches (lines 411, 413 — human workflow) remain.
- ✅ No `triage/` directory path references in the file.
- ✅ End-to-end read recorded above with date + executor.

## Doc 2 — `docs/agentic-pipeline/stage-3-coordinator.md`

**End-to-end read:** completed 2026-05-04 (executor: Claude Opus 4.7). File length: 97 lines.

**Mechanical-reference scan:**

```bash
grep -n "debtor-email-triage\|debtorEmailTriage\|debtor/email.received\|automations/debtor-email-triage" docs/agentic-pipeline/stage-3-coordinator.md
```

**Output:** _(empty — zero matches)_

**Terminology check:** uses "coordinator" / "Stage 3" / "Stage 3.5 orchestrator-worker" consistently. The file does not pin a specific Inngest event name for the Stage 2 → Stage 3 trigger (it stays at the cross-swarm RFC level), so there's no `debtor/email.received` vs `debtor-email/coordinator.requested` reconciliation to do. The function-id sweep is satisfied: no mention of `automations/debtor-email-triage`.

**Edits made:** none.

**Acceptance criteria check:**
- ✅ Zero occurrences of `debtor-email-triage`, `debtorEmailTriage`, `debtor/email.received`, `automations/debtor-email-triage`.
- ✅ End-to-end read recorded above.

**Out-of-scope note (not actioned, logged for later):** line 41 references `anthropic/claude-sonnet-4-6` as the primary model. Per current CLAUDE.md guidance (2026-05) this exact ID does not exist in Orq's model catalog; the closest catalog entries are `aws/eu.anthropic.claude-opus-4-6-v1` (Opus, Bedrock EU) and `anthropic/claude-sonnet-4-5-20250929` (Sonnet 4.5, Anthropic-direct). This is unrelated to the triage→coordinator rename and is outside Plan 66-04's scope; tracked here so it can be picked up in a doc-correctness pass.

## Verification

Plan-level verification block (re-run at summary time):

```bash
# Cross-handler import ban
grep -rn 'from "@/lib/inngest/functions/' web/lib/inngest/functions/ --include="*.ts" | grep -v __tests__
# → empty (PASS)

# Doc cleanliness — function-id rename
grep -rn "debtor-email-triage\|debtorEmailTriage" docs/ --include="*.md" | grep -v ".planning/"
# → empty (PASS)

# Old event purge
grep -rn "debtor/email.received" docs/ --include="*.md" | grep -v ".planning/"
# → empty (PASS)
```

All three return zero lines.

## Deviations from Plan

None — plan executed exactly as written. Both audits passed cleanly; both docs needed zero edits. Per plan instruction ("If a doc has zero edits needed, no commit for that task — just record in summary"), no per-task `docs(66.04)` commits were made; the artifact for this plan is the audit record itself, captured in this summary.

## Self-Check: PASSED

- ✅ `.planning/phases/66-pipeline-consolidation-retire-triage-path/66-04-SUMMARY.md` exists (this file).
- ✅ Audit 1 grep + verification clause confirmed zero matches.
- ✅ Audit 2 emit sites enumerated with per-line allowlist classification.
- ✅ Both docs read end-to-end; mechanical grep confirmed zero forbidden references; human-triage references at lines 411, 413 of `debtor-email-pipeline-architecture.md` preserved verbatim.
- ✅ No source-code (`.ts`/`.tsx`) modifications made (Plan 66-03's territory left untouched).
