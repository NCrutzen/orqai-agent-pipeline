---
phase: 09-guardrails-and-hardening
verified: 2026-03-01T18:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 9: Guardrails and Hardening Verification Report

**Phase Goal:** Users can promote test evaluators to production guardrails and deploy agents incrementally with quality gates that prevent shipping underperforming agents
**Verified:** 2026-03-01
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                          | Status     | Evidence                                                                                                   |
|----|----------------------------------------------------------------------------------------------------------------|------------|------------------------------------------------------------------------------------------------------------|
| 1  | User can run /orq-agent:harden and the system analyzes test results, suggests guardrails, and asks for approval before attaching them to agents | VERIFIED | harden.md Steps 4-5 check test-results.json, hardener.md Phase 3 implements full HITL approval (yes/modify/skip) before any API call |
| 2  | User can set minimum score thresholds per evaluator that act as quality gates blocking or warning on deploy    | VERIFIED | hardener.md Phase 6 compares median scores against configured thresholds; high-severity failures block (NOT PRODUCTION-READY), low-severity warn (ADVISORY WARNINGS) |
| 3  | Guardrails are attached to Orq.ai agents via native settings.guardrails API, not custom application-layer workarounds | VERIFIED | hardener.md Phase 5 (lines 276, 292, 314, 316) explicitly uses `settings.guardrails` array; anti-pattern block explicitly forbids `settings.evaluators` |
| 4  | Quality results are persisted in both deploy-log.md (summary) and quality-report.md (full details)             | VERIFIED | hardener.md Phase 6 Steps 6.2 and 6.3 write quality-report.md and append to deploy-log.md respectively; Step 6.4 writes quality-report.json |
| 5  | User can run /orq-agent:deploy --agent my-agent to deploy a single agent with its tool dependencies            | VERIFIED | deploy.md Step 3 parses `--agent agent-key`, Section 3.1 scopes to single agent + tool dependencies, Section 3.2 resolves tool deps |
| 6  | User can run /orq-agent:test --agent my-agent to test a single agent                                           | VERIFIED | test.md Step 3 documents `/orq-agent:test [--agent agent-key] [--all]` with backward-compatible positional arg |
| 7  | User can run /orq-agent:iterate --agent my-agent to iterate on a single agent                                  | VERIFIED | iterate.md Step 3 documents `/orq-agent:iterate [--agent agent-key] [--all]` with backward-compatible positional arg |
| 8  | When no --agent flag on deploy, user sees an interactive picker to select which agent(s) to deploy             | VERIFIED | deploy.md Section 3.1 shows picker format with "1. [all] Deploy all agents" and numbered per-agent entries |
| 9  | SKILL.md documents the harden command and --agent flags on all three existing commands                         | VERIFIED | SKILL.md line 93 adds harden to V2.0 Commands table; lines 98-105 add Command Flags section; line 141 adds Phase 9 subagents section; line 165 updates capability tiers |

**Score:** 9/9 truths verified

---

## Required Artifacts

### Plan 09-01 Artifacts

| Artifact                                   | Expected                                                       | Status    | Details                                       |
|--------------------------------------------|----------------------------------------------------------------|-----------|-----------------------------------------------|
| `orq-agent/agents/hardener.md`             | 6-phase pipeline: analyze, suggest, approve, write, API, gate | VERIFIED  | 498 lines; all 6 phases present with full detail; GUARD-01 and GUARD-02 labeled inline |
| `orq-agent/commands/harden.md`             | 7-step command: capability gate, MCP check, invoke subagent   | VERIFIED  | 283 lines; all 7 steps present; references agents/hardener.md at line 206 |
| `orq-agent/templates/quality-report.json` | Quality report template with per-agent guardrail and gate fields | VERIFIED | 32 lines; contains `swarm_name`, `agents`, `guardrails`, `quality_gate`, `production_ready`, `summary` |

### Plan 09-02 Artifacts

| Artifact                          | Expected                                                    | Status   | Details                                                              |
|-----------------------------------|-------------------------------------------------------------|----------|----------------------------------------------------------------------|
| `orq-agent/commands/deploy.md`    | Deploy command with --agent flag for per-agent deployment   | VERIFIED | `--agent` flag present; interactive picker present (line 133 onwards) |
| `orq-agent/commands/test.md`      | Test command with --agent flag (backward compatible)        | VERIFIED | `--agent` flag present at line 121-124; positional backward-compat documented |
| `orq-agent/commands/iterate.md`   | Iterate command with --agent flag (backward compatible)     | VERIFIED | `--agent` flag present at line 120-123; positional backward-compat documented |
| `orq-agent/SKILL.md`              | Updated skill index with harden command and --agent flags   | VERIFIED | harden command, hardener agent, quality-report.json, Command Flags section, Phase 9 subagents table, updated capability tiers all present |
| `orq-agent/agents/iterator.md`    | Guardrail violation checking in Phase 2 diagnosis           | VERIFIED | Step 2.2a (lines 93-107) checks `## Guardrails` section, surfaces violations with higher priority |

---

## Key Link Verification

| From                             | To                              | Via                                          | Status  | Details                                                    |
|----------------------------------|---------------------------------|----------------------------------------------|---------|------------------------------------------------------------|
| `commands/harden.md`             | `agents/hardener.md`            | command reads subagent instructions          | WIRED   | Line 206: "Read the hardener subagent instructions from `orq-agent/agents/hardener.md`" |
| `agents/hardener.md`             | `test-results.json`             | reads test results as input for suggestions  | WIRED   | Phase 1 Step 1.1 explicitly locates and reads test-results.json; stops if not found |
| `agents/hardener.md`             | Orq.ai Agents API               | PATCH settings.guardrails array              | WIRED   | Phase 5 Step 5.3: MCP `agents-update` with `settings.guardrails` payload; REST fallback `PATCH /v2/agents/{key}` |
| `commands/deploy.md`             | `agents/deployer.md`            | --agent flag passed to scope deployer        | WIRED   | Section 5.1 passes agent scope to deployer subagent pipeline |
| `SKILL.md`                       | `commands/harden.md`            | skill index references new harden command    | WIRED   | Line 93 entry in V2.0 Commands table references `commands/harden.md` |

---

## Requirements Coverage

| Requirement | Source Plan | Description                                                                       | Status    | Evidence                                                                 |
|-------------|-------------|-----------------------------------------------------------------------------------|-----------|--------------------------------------------------------------------------|
| GUARD-01    | 09-01       | Test evaluators can be promoted to runtime guardrails on deployed agents          | SATISFIED | hardener.md Phases 2 (suggest), 3 (approve), 5 (attach via settings.guardrails API) implement full promotion pipeline |
| GUARD-02    | 09-01       | User can set minimum score thresholds per evaluator as quality gates              | SATISFIED | hardener.md Phase 2 assigns per-evaluator thresholds; Phase 6 runs gate check (score vs threshold, high/low severity) and blocks on high-severity failure |
| GUARD-03    | 09-02       | User can deploy, test, and iterate agents individually before wiring orchestration | SATISFIED | deploy.md --agent flag with tool dependency scoping; test.md and iterate.md --agent flags; interactive picker for deploy; SKILL.md Command Flags section documents all flags |

No orphaned requirements found. All three GUARD requirements declared in plan frontmatter are accounted for and satisfied.

---

## Anti-Patterns Found

No blockers or warnings detected.

Checked hardener.md, harden.md, quality-report.json, deploy.md, test.md, iterate.md, SKILL.md, and iterator.md for:
- TODO/FIXME/placeholder comments: none found
- Empty implementations (`return null`, `return {}`, empty arrow functions): not applicable (markdown instruction files, not code)
- Stub returns: hardener.md Phase 5 makes real API calls; harden.md Step 5 invokes the subagent — no placeholder behavior found
- Key anti-patterns are explicitly documented as locked decisions within hardener.md (8 documented anti-patterns at the end of the file, including "Do NOT attach guardrails before testing" and "Do NOT skip user approval")

---

## Human Verification Required

The following behaviors require human execution to fully confirm:

### 1. HITL Approval Flow

**Test:** Run `/orq-agent:harden` after a test run. At the approval prompt for an agent, enter "modify", change a threshold, then confirm.
**Expected:** The modified threshold is reflected in the attached guardrail config and in the quality-report.md. The original suggestion is overwritten, not appended.
**Why human:** Interactive prompt/response flow cannot be verified by file inspection.

### 2. Interactive Deploy Picker

**Test:** Run `/orq-agent:deploy` without any `--agent` flag. Select a single agent number (not "all").
**Expected:** Only the selected agent and its tool dependencies are deployed. The orchestrator is skipped.
**Why human:** The picker requires user input to drive conditional logic; the scoping behavior can only be confirmed at runtime.

### 3. Quality Gate Blocking Behavior

**Test:** Configure a safety evaluator (severity: high) as a guardrail on an agent whose test results show a score below threshold. Run `/orq-agent:harden`.
**Expected:** The quality report marks the agent as NOT PRODUCTION-READY; the next-steps guidance directs the user to run `/orq-agent:iterate`.
**Why human:** Requires real test-results.json with a failing safety evaluator to trigger the blocking path.

### 4. Guardrail Violation Priority in Iterator

**Test:** Run `/orq-agent:iterate` on a swarm where an agent has a `## Guardrails` section and the corresponding evaluator is below threshold in test-results.json.
**Expected:** The iterator surfaces the guardrail violation first in its diagnosis, before regular evaluator failures, with the "This must be fixed before the agent is production-ready" message.
**Why human:** Requires a real swarm with guardrails already written by a prior harden run.

---

## Summary

Phase 9 achieves its goal. All three requirement IDs (GUARD-01, GUARD-02, GUARD-03) are fully satisfied by substantive, wired implementations:

- **GUARD-01** is delivered by a complete 6-phase hardener subagent pipeline that reads real test data, suggests guardrails with data-driven rules, collects HITL approval, and attaches guardrails to deployed agents via the native Orq.ai `settings.guardrails` API.
- **GUARD-02** is delivered by per-evaluator threshold configuration with strict (high-severity, blocking) and advisory (low-severity, warning) modes, backed by quality-report.md and quality-report.json outputs.
- **GUARD-03** is delivered by `--agent` flags on all three pipeline commands (deploy, test, iterate), an interactive agent picker on deploy, and full SKILL.md documentation of all new capabilities and flags.

The iterator guardrail violation feedback (Step 2.2a in iterator.md) creates the tighter loop between harden and iterate that the phase context specified as a locked decision.

No gaps, stubs, or orphaned requirements were found. Four items are flagged for human verification of interactive runtime behaviors.

---

_Verified: 2026-03-01_
_Verifier: Claude (gsd-verifier)_
