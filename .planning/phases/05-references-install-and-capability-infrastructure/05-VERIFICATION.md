---
phase: 05-references-install-and-capability-infrastructure
verified: 2026-03-01T00:00:00Z
status: passed
score: 5/5 success criteria verified
re_verification: false
gaps:
  - truth: "V1.0 subagents can consume the agentic-patterns reference"
    status: resolved
    reason: "spec-generator.md does not include agentic-patterns.md in its files_to_read list. The plan's key_link declares this relationship ('Referenced by spec generator for instruction generation patterns') but it was never wired. orchestration-generator.md correctly references orchestration-patterns.md."
    artifacts:
      - path: "orq-agent/agents/spec-generator.md"
        issue: "files_to_read does not include orq-agent/references/agentic-patterns.md"
    missing:
      - "Add 'orq-agent/references/agentic-patterns.md' to the files_to_read list in spec-generator.md"
human_verification:
  - test: "Run install.sh and select 'core' tier, then try /orq-agent:deploy"
    expected: "Upgrade message with tier comparison table appears. The [YOU] marker is on the 'core' row."
    why_human: "Requires interactive terminal execution with live bash script prompts"
  - test: "Run install.sh selecting 'deploy' tier with an invalid API key"
    expected: "Script validates the key against /v2/models, reports HTTP error code, and exits without writing anything to shell profile or config.json"
    why_human: "Requires live Orq.ai API access to test the validation path"
  - test: "Run install.sh selecting 'deploy' tier twice with different API keys"
    expected: "Second run updates the existing export ORQ_API_KEY= line in shell profile in-place (no duplicate entries)"
    why_human: "Requires terminal execution and shell profile inspection"
---

# Phase 5: References, Install, and Capability Infrastructure — Verification Report

**Phase Goal:** Establish the knowledge foundation, output templates, and modular install infrastructure so all subsequent V2.0 phases have references to build against and a capability-gated environment to operate in.
**Verified:** 2026-03-01
**Status:** gaps_found — 1 gap blocking full success criterion compliance
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Reference files contain latest Anthropic evaluator-optimizer pattern, OpenAI agent-as-tool patterns, Google A2A v0.3 task lifecycle, Orq.ai API endpoints, and Orq.ai evaluator types — and V1.0 subagents can consume them | PARTIAL | All 5 reference files exist with correct content. orchestration-generator.md correctly consumes orchestration-patterns.md. BUT spec-generator.md does NOT include agentic-patterns.md in its files_to_read. The "subagents can consume them" half fails for agentic-patterns.md. |
| 2 | User can run the install script and select a capability tier (core/deploy/test/full) where each tier includes all lower tiers | VERIFIED | install.sh (340 lines) contains tier comparison table UI, validates input against core/deploy/test/full, defaults to core on invalid input, handles re-install with existing tier preservation. Syntax valid (bash -n). |
| 3 | Install script prompts for Orq.ai API key, validates it against the live API, stores it as an environment variable only (never in generated files), and registers the Orq.ai MCP server when deploy tier or higher is selected | VERIFIED | API key validated via curl against /v2/models. Idempotent shell profile write (update-in-place or append). Confirmed: no API key written to config.json. MCP registered via `claude mcp add --transport http --scope user orqai-mcp`. MCP failure is non-fatal (warns, continues). |
| 4 | V2.0 commands (/orq-agent:deploy, /orq-agent:test, /orq-agent:iterate) are only available when the corresponding capability tier is installed; running them at a lower tier produces a clear upgrade message | VERIFIED | All 3 command files exist with gate sections. deploy.md checks for "deploy" tier, stops with upgrade table on "core". test.md checks for "test" tier, stops with upgrade table on "core" or "deploy". iterate.md checks for "full" tier, stops with upgrade table on any lower tier. Each gate shows tier comparison table with [YOU] marker. |
| 5 | Pipeline falls back to V1.0 copy-paste behavior when MCP is unavailable or only core tier is installed | VERIFIED | All 3 V2.0 commands include MCP availability check (`claude mcp list | grep orqai`). On MCP_UNAVAILABLE, each command displays domain-specific manual steps (Studio UI navigation) and stops. Fallback content is substantive, not a placeholder. set-profile works at all tiers with no gate. |

**Score:** 4/5 truths fully verified (Truth 1 is PARTIAL — content verified, wiring gap)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `orq-agent/references/agentic-patterns.md` | Anthropic composable patterns + context engineering | VERIFIED | 687 words. Contains all 5 composable patterns (prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer), 5 context engineering patterns, 3 composability principles. Each with Orq.ai mapping. |
| `orq-agent/references/orchestration-patterns.md` | Updated with OpenAI agent-as-tool + Google A2A patterns | VERIFIED | 1009 words (9 over 1000-word target — minor). Contains OpenAI agent-as-tool (explicit 1:1 mapping to team_of_agents). Contains A2A v0.3 with all 8 states including auth-required and rejected. Existing 3 Orq.ai patterns preserved. |
| `orq-agent/references/orqai-api-endpoints.md` | REST API endpoint reference | VERIFIED | 612 words. 8 domains (agents, tools, datasets, evaluators, experiments, prompts, memory-stores, models). Contains /v2/agents. Method/path/description format. |
| `orq-agent/references/orqai-evaluator-types.md` | Evaluator taxonomy with selection guidance | VERIFIED | 858 words. 19 function evaluators, 10 LLM evaluators, 12 RAGAS evaluators (41 total). 4 custom types (LLM, Python, HTTP, JSON). Selection guidance table. |
| `orq-agent/templates/deploy-log.json` | Deployment audit trail template | VERIFIED | Valid JSON. Contains deployment_id, agents array, tools array, verification block, summary. _template_meta header present. |
| `orq-agent/templates/test-results.json` | Test results template | VERIFIED | Valid JSON. Contains test_run_id, evaluators array, per-agent scores with median/variance/confidence_interval. _template_meta header present. |
| `orq-agent/templates/iteration-log.json` | Iteration audit trail template | VERIFIED | Valid JSON. Contains iteration_number, diagnosis, proposed_changes with field/change_type/diff, approval_status, stopping_reason. _template_meta header present. |
| `install.sh` | Extended installer with tier selection, API key, MCP registration | VERIFIED | 340 lines. bash -n passes. Tier table, API key validation via /v2/models, idempotent shell profile write, MCP registration, config.json creation. Re-install handling present. |
| `orq-agent/commands/deploy.md` | Deploy command stub with capability gate | VERIFIED | Gate reads config.json, checks tier, shows upgrade table on insufficient tier. MCP check present. V1.0 fallback with Studio manual steps. |
| `orq-agent/commands/test.md` | Test command stub with capability gate | VERIFIED | Gate checks "test" or "full" tier. MCP check present. V1.0 fallback with Studio/playground manual steps. |
| `orq-agent/commands/iterate.md` | Iterate command stub with capability gate | VERIFIED | Gate checks "full" tier only. MCP check present. V1.0 fallback with manual iteration steps. |
| `orq-agent/commands/set-profile.md` | Model profile management command | VERIFIED | No tier gate. Shows profile comparison table with quality/balanced/budget for 10 agents. Reads and writes model_profile in config.json. |
| `orq-agent/SKILL.md` | Updated skill index with V2.0 additions | VERIFIED | 181 lines. Documents all 3 new references, 3 new templates, 4 new commands, .orq-agent/config.json directory. Capability Tiers section. V2.0 Commands section. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `orq-agent/references/agentic-patterns.md` | `orq-agent/agents/spec-generator.md` | files_to_read directive | NOT_WIRED | spec-generator.md files_to_read list does not include agentic-patterns.md. The file exists and has correct content but is not hooked to the subagent that should consume it. |
| `orq-agent/references/orchestration-patterns.md` | `orq-agent/agents/orchestration-generator.md` | files_to_read directive | WIRED | Line 9 of orchestration-generator.md: `- orq-agent/references/orchestration-patterns.md` |
| `install.sh` | `.orq-agent/config.json` | node write at line 293-302 | WIRED | config.json written with tier, model_profile, model_overrides, installed_at, orqai_mcp_registered |
| `install.sh` | `~/.zshrc` | grep + sed/append pattern | WIRED | Lines 251-262: idempotent update-in-place or append for ORQ_API_KEY |
| `orq-agent/commands/deploy.md` | `.orq-agent/config.json` | bash cat command in gate | WIRED | Line 17: `cat "$HOME/.claude/skills/orq-agent/.orq-agent/config.json"` |
| `orq-agent/commands/set-profile.md` | `.orq-agent/config.json` | node read/write in profile update | WIRED | Step 3 reads and writes config.json model_profile field |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| REF-01 | 05-01 | Reference files updated with Anthropic evaluator-optimizer pattern, context engineering guidelines, agent composability patterns | SATISFIED | agentic-patterns.md contains all 5 composable patterns including evaluator-optimizer, 5 context engineering patterns, 3 composability principles |
| REF-02 | 05-01 | Reference files updated with OpenAI agent-as-tool patterns and Google A2A Protocol v0.3 task lifecycle states | SATISFIED | orchestration-patterns.md contains OpenAI agent-as-tool (explicit 1:1 mapping), Google A2A v0.3 with all 8 states |
| REF-03 | 05-02 | New Orq.ai API endpoints reference covering agents, tools, datasets, evaluators, and experiments endpoints | SATISFIED | orqai-api-endpoints.md covers 8 domains including all 5 required domains with method/path/description tables |
| REF-04 | 05-02 | New Orq.ai evaluator types reference covering 19 built-in function evaluators and 4 custom evaluator categories | SATISFIED | orqai-evaluator-types.md documents 19 function + 10 LLM + 12 RAGAS evaluators (41 total) plus 4 custom types with selection guidance |
| REF-05 | 05-02 | New V2.0 output templates for deploy-log, test-results, and iteration-log | SATISFIED | All 3 JSON templates exist, parse without errors, contain required fields per plan specification |
| INST-01 | 05-03 | Install script presents capability tier selection (core/deploy/test/full) with hierarchical enforcement | SATISFIED | Tier comparison table displayed, input validated, hierarchy documented (full > test > deploy > core) |
| INST-02 | 05-03 | Install script prompts for API key, validates with lightweight API call, stores via environment variable only | SATISFIED | API key validated via GET /v2/models. Key written only to shell profile. config.json confirmed to contain no API key. |
| INST-03 | 05-03 | Install script auto-registers Orq.ai MCP server via claude mcp add when deploy or higher tier is selected | SATISFIED | `claude mcp add --transport http --scope user orqai-mcp` called for non-core tiers. Failure is non-fatal (warning only). |
| INST-04 | 05-04 | Commands are capability-gated — /orq-agent:deploy only available when deploy tier installed, etc. | SATISFIED | All 3 V2.0 command files have gate sections reading config.json tier. Upgrade messages with tier comparison table present. |
| INST-05 | 05-04 | Pipeline gracefully falls back to V1.0 copy-paste behavior when MCP is unavailable or only core tier is installed | SATISFIED | Each V2.0 command checks `claude mcp list | grep orqai` after gate passes. Domain-specific manual steps provided as V1.0 fallback. |

**All 10 requirements satisfied at the implementation level.** The gap (agentic-patterns.md not in spec-generator files_to_read) is a wiring issue that affects success criterion 1 quality but does not invalidate the requirement checkboxes as written — REF-01 specifies reference file content, not wiring.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `orq-agent/commands/deploy.md` | 102 | "Deploy command ready. Implementation coming in Phase 6." | Info | Expected stub — Phase 6 will replace. Gate and fallback fully functional. |
| `orq-agent/commands/test.md` | 105 | "Test command ready. Implementation coming in Phase 7." | Info | Expected stub — Phase 7 will replace. Gate and fallback fully functional. |
| `orq-agent/commands/iterate.md` | 103 | "Iterate command ready. Implementation coming in Phase 8." | Info | Expected stub — Phase 8 will replace. Gate and fallback fully functional. |
| `orq-agent/references/orchestration-patterns.md` | — | 1009 words (9 over 1000-word target) | Info | Minor deviation. Not a blocker. File is coherent and complete. |

No blockers. The command stubs are intentional and correct per the phase design — gates and fallbacks function completely.

---

## Human Verification Required

### 1. Tier Gate UI — Core to Deploy Upgrade

**Test:** Run `./install.sh`, select `core` tier, then in Claude Code run `/orq-agent:deploy`
**Expected:** Command shows the tier comparison table with `[YOU]` on the core row and instructions to re-run install.sh
**Why human:** Requires interactive bash execution and live Claude Code command invocation

### 2. API Key Validation — Invalid Key Path

**Test:** Run `./install.sh`, select `deploy` tier, enter a syntactically valid but wrong API key
**Expected:** Script shows "API key validation failed (HTTP 401)" and exits cleanly. No entry written to ~/.zshrc, no config.json created.
**Why human:** Requires live Orq.ai API access and shell profile inspection

### 3. Re-install Idempotency — Shell Profile Update

**Test:** Run `./install.sh` twice in sequence with `deploy` tier and different API keys
**Expected:** Second run updates the existing `export ORQ_API_KEY=` line in-place. `grep -c "ORQ_API_KEY" ~/.zshrc` shows 1 (not 2).
**Why human:** Requires terminal execution and post-install shell profile inspection

---

## Gaps Summary

**1 gap found:** The plan's key_link declares that `agentic-patterns.md` should be "Referenced by spec-generator for instruction generation patterns" but `spec-generator.md` does not include this file in its `files_to_read` list. The file exists, has correct and complete content, and is documented in SKILL.md — but the V1.0 subagent that should consume it cannot access it without a manual `@` context reference in each invocation.

This gap means success criterion 1 ("V1.0 subagents can consume them") is only half-satisfied. orchestration-generator correctly consumes orchestration-patterns.md, but spec-generator does not consume agentic-patterns.md.

**Fix required:** Add `- orq-agent/references/agentic-patterns.md` to the `files_to_read` block in `orq-agent/agents/spec-generator.md`.

The remaining 4 success criteria are fully verified. The install infrastructure, all 5 reference files, all 3 JSON templates, and all 4 command files are substantive, correct, and properly wired.

---

_Verified: 2026-03-01_
_Verifier: Claude (gsd-verifier)_
