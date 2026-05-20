---
phase: 85
plan: "85-03"
subsystem: debtor-email-pipeline / stage-3-coordinator
tags: [orq, prompt-v3, json-schema, classifier, open-set]
type: prep-only
status: blocked-on-operator
requires:
  - 85-CONTEXT.md (D-01..D-07)
provides:
  - 85-PROMPT-V3.md (V3 prompt string, ready for Studio paste / update_agent PATCH)
  - 85-JSON-SCHEMA-V3.json (strict json_schema, anyOf-nullable)
  - 85-AGENT-RITUAL-LOG.md (operator runbook: Steps A1-A3, B1-B2, C1-C2, ROLLBACK)
  - web/scripts/phase85-smoke-v3.ts (post-Studio 3-mode smoke harness)
affects: []
tech-stack:
  added: []
  patterns:
    - "Studio JSON Schema tool + Response Format dropdown (D-06 step 1+2 deployment workflow)"
    - "anyOf-nullable form for Orq.ai strict json_schema (learning 3970bad9)"
    - "update_agent with full model.parameters preservation (learning cba7352b)"
    - "update_agent with human-readable key not slug-id (memory feedback_orq_update_agent_key_vs_id)"
key-files:
  created:
    - .planning/phases/85-stage-3-prompt-v3-intent-definitions-and-open-set-schema/85-JSON-SCHEMA-V3.json
    - .planning/phases/85-stage-3-prompt-v3-intent-definitions-and-open-set-schema/85-PROMPT-V3.md
    - .planning/phases/85-stage-3-prompt-v3-intent-definitions-and-open-set-schema/85-AGENT-RITUAL-LOG.md
    - web/scripts/phase85-smoke-v3.ts
  modified: []
decisions:
  - "Studio JSON Schema tool created BEFORE any update_agent PATCH so the Response Format pointer never breaks (D-06)."
  - "V3 introduces intent_proposal + proposal_reason additively; Stage 4 dispatch reads ranked[0].intent from the unchanged closed list (D-05)."
  - "proposal_reason regex anchor enforced at three layers (prompt rule, JSON Schema pattern, smoke assertion) — R-01 over-eager guard."
  - "Few-shot example #10 demonstrates non-null intent_proposal to mitigate R-02 under-eager guard."
  - "Example #10 marked SYNTHETIC because 85-CORPUS.md was not present in this worktree; deviation rule 5 forbade fabricating a real corpus row."
metrics:
  duration_minutes: ~35
  completed_at: "2026-05-20T13:47:02Z"
---

# Phase 85 Plan 03: Orq.ai PATCH ritual + 3 smokes — Summary

**One-liner:** Drafted the V3 prompt + V3 strict json_schema + post-Studio 3-mode smoke harness + operator runbook for the `debtor-intent-agent` open-set rollout, stopping cleanly at the Studio handoff per Plan 85-03's deliberate non-automation boundary.

## Scope of this run

Pre-Studio preparation only. Per Plan 85-03 deviation rules 1 + 2, Claude does **not** call `update_agent` or `invoke_agent` in this run — the Studio JSON Schema tool must exist (browser-only step) before the PATCH or the Response Format pointer breaks. All artefacts the operator needs for the ≈5 minute Studio step plus the post-Studio MCP + smoke flow are now committed.

## Tasks completed

| Task | Artefact | Commit |
| --- | --- | --- |
| 1 | `85-JSON-SCHEMA-V3.json` — strict, anyOf-nullable, intent_proposal + proposal_reason, regex anchor, intent_version literal `2026-05-19.v3` | `70fdee8b` |
| 2 | `85-PROMPT-V3.md` — full V3 prompt with `<intent_definitions>` (D-01), disambiguation table (D-02), 10 few-shot examples (D-03), R-01 + R-02 guards explicit | `406f3c24` |
| 3 | `web/scripts/phase85-smoke-v3.ts` — three modes, mirrors invoke-intent.ts shape, `npx tsc --noEmit` PASS | `620e09ab` |
| 4 | `85-AGENT-RITUAL-LOG.md` — operator runbook: Pre-flight A+B, Step A (Studio), Step B (MCP), Step C (smoke), ROLLBACK section | `176b7ebc` |

## Operator handoff — what runs next

**BLOCKED ON OPERATOR — Steps A1–A3 in `85-AGENT-RITUAL-LOG.md`:**
1. **A1** — open https://my.orq.ai/cura/agents/01KQECK191GE21CH8D8KEMTM9J in browser.
2. **A2** — Tools tab → Add JSON Schema → name `debtor-intent-agent-output-v3` → paste the `schema` object from `85-JSON-SCHEMA-V3.json`. Strict: ON. Save.
3. **A3** — Model parameters → Response Format = "JSON Schema" → select `debtor-intent-agent-output-v3`. Save.

**Pre-flight that the operator should ALSO run** (Claude could not run these in this worktree — see "Deviations" below): `mcp__orqai-mcp__list_models` + `mcp__orqai-mcp__get_agent` to capture the V2 baseline before A1. The ritual log has the exact MCP calls and rollback string template.

**AFTER UNBLOCK — runs by operator or the next session:**
- **B1**: `mcp__orqai-mcp__update_agent` with `key=debtor-intent-agent`, `instructions` = contents of `85-PROMPT-V3.md`, full `model.parameters` preserved per learning `cba7352b`.
- **B2**: `mcp__orqai-mcp__get_agent` to verify persistence (instructions ends with V3 reminders block, response_format.json_schema.name = `debtor-intent-agent-output-v3`).
- **C1**: `cd web && npx tsx scripts/phase85-smoke-v3.ts` — expects `ALL 3 SMOKES GREEN`.
- **C2**: documented failure protocol (max 2 prompt-only iterations, else rollback).

## Pre-flight evidence

| Pre-flight item | Status | Evidence |
| --- | --- | --- |
| `list_models` model-catalog check | **DEFERRED to operator** | Orqai MCP tools were not available to this executor; `ORQ_API_KEY` was absent from `web/.env.local`. Documented as operator-action in ritual log §Pre-flight A. |
| V2 `get_agent` "before" snapshot | **DEFERRED to operator** | Same reason. Ritual log §Pre-flight B has the exact MCP call and placeholder for the operator to paste the captured V2 instructions + model.parameters. |
| V3 prompt + V3 schema + smoke harness drafted | **DONE** | Commits `70fdee8b`, `406f3c24`, `620e09ab`. |
| `npx tsc --noEmit` from `web/` | **PASS** | clean compile after `npm install` (which produced 1375 packages). |

## Deviations from Plan

### 1. Pre-flight A + B not run by Claude (Rule 3 — auto-resolved by deferral to operator)
- **Found at:** start of execution.
- **Issue:** the executor environment had neither `mcp__orqai-mcp__*` tools nor `ORQ_API_KEY` in `web/.env.local` (worktree has no secrets).
- **Resolution:** documented Pre-flight A (`list_models`) and Pre-flight B (`get_agent` V2 snapshot) as the first operator-action steps in `85-AGENT-RITUAL-LOG.md`, with the exact MCP calls and a paste-target block. Per Plan 85-03 deviation rule "If list_models doesn't show the V2-current model in the catalog, STOP and flag in SUMMARY" — we cannot pre-flag a catalog mismatch we did not run, so the operator runbook hard-stops at that gate explicitly.
- **Files:** `85-AGENT-RITUAL-LOG.md` §Pre-flight A and §Pre-flight B.

### 2. 85-CORPUS.md absent → 1 few-shot is SYNTHETIC (Plan deviation rule 5, explicit allow)
- **Found at:** while drafting `85-PROMPT-V3.md`.
- **Issue:** `85-CORPUS.md`, `85-REGRESSION-BASELINE.md`, `85-RESEARCH.md`, `85-PATTERNS.md`, `85-01-SUMMARY.md`, `85-02-SUMMARY.md` are all not present on disk in this worktree (only `85-CONTEXT.md` exists).
- **Resolution:** per Plan 85-03 deviation rule 5 ("DO NOT fabricate one — write the prompt with the 9 confirmed examples + a SYNTHETIC slot"), few-shot example #10 in `85-PROMPT-V3.md` is a clearly-marked SYNTHETIC WKA case grounded in the Breman 2026-05-11 pattern that CONTEXT explicitly references. An HTML comment in the prompt directs a future operator pass to swap it for a real corpus row once `85-CORPUS.md` is back. The cross-language quoted-prior shot identified as a gap in 85-01-SUMMARY is deferred to Phase 87.
- **Files:** `85-PROMPT-V3.md` (example #10 + SYNTHETIC comment).

### 3. `--regression` smoke depends on a missing baseline file (Rule 3 — script designed to fail loudly)
- **Found at:** while drafting `phase85-smoke-v3.ts`.
- **Issue:** the regression mode reads `85-REGRESSION-BASELINE.md`. The file is absent in this worktree.
- **Resolution:** the script does NOT silently pass. `loadRegressionBaseline()` throws with `regression baseline file missing: <path>` and the smoke exits non-zero. Wave 1 owns reinstating the baseline file. Operator can run `--smoke-novel` and `--smoke-clean` independently as a partial validation in the meantime.
- **Files:** `web/scripts/phase85-smoke-v3.ts` (lines around `loadRegressionBaseline`).

### 4. Worktree base mismatch (informational only, no functional impact)
- **Found at:** initial worktree branch check.
- **Issue:** `ACTUAL_BASE=58af688b` ≠ expected pin `77dd5263`. One commit ahead (`07806e92 feat(heeren-oefeningen)`) — unrelated to phase 85. Auto-mode classifier denied `git reset --hard` (sensible default; the work would be uncommitted otherwise but here there was nothing to lose).
- **Resolution:** continued without reset. New base is one unrelated commit ahead of the pin → strictly safer than running on an older base. No phase-85 files affected.

## Authentication gates

None encountered. The MCP tool unavailability is captured as a "deferred to operator" workflow gap (deviation #1), not an auth gate.

## Threat Flags

None. V3 is an additive prompt + schema change; it does not introduce new network surface, trust boundaries, or schema-level changes outside the `debtor-intent-agent` output JSON.

## TDD Gate Compliance

N/A — Plan 85-03 is a prep/handoff plan with no `tdd="true"` tasks. The smoke harness IS the post-Studio acceptance gate.

## Self-Check: PASSED

- `85-JSON-SCHEMA-V3.json` exists.
- `85-PROMPT-V3.md` exists.
- `85-AGENT-RITUAL-LOG.md` exists.
- `web/scripts/phase85-smoke-v3.ts` exists.
- Commits `70fdee8b`, `406f3c24`, `620e09ab`, `176b7ebc` exist in `git log --oneline --all`.
- `npx tsc --noEmit` from `web/` exits clean.
