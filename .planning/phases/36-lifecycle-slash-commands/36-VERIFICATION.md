---
phase: 36-lifecycle-slash-commands
verified: 2026-04-20T00:00:00Z
status: human_needed
score: 7/7 file-level must-haves verified; 3 live-MCP smokes require human
re_verification:
  previous_status: gaps_found
  previous_score: (plan-level 36-08 evidence trail — file-level complete, live-MCP smokes deferred)
  gaps_closed:
    - "LCMD-01..07 all file-level anchors present and linted"
    - "All 6 new command files exist under orq-agent/commands/"
    - "Cross-wiring in orq-agent/SKILL.md and orq-agent/commands/help.md verified"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "MCP round-trip per command against live Orq.ai workspace"
    expected: "Each of /orq-agent:workspace, :traces, :analytics, :models, :quickstart, :automations invokes the expected MCP tool(s) and returns live data from an authenticated Orq.ai workspace"
    why_human: "Requires live Orq.ai API key + MCP server; cannot be verified by static lint or grep"
  - test: "/orq-agent:quickstart 12-step UX flow on fresh workspace"
    expected: "All 12 sequential steps (connect MCP → enable models → create project → build agent → invoke → analyze traces → build evaluator → build dataset → run experiment → human review → annotation analysis → promote evaluator) complete cleanly on a new Orq.ai workspace; each copy-paste prompt runs without error"
    why_human: "UX judgement + live workspace state mutation; lint cannot evaluate flow naturalness or side-effect correctness"
  - test: "/orq-agent:automations --create writes a real Trace Automation rule"
    expected: "Invoking --create with AskUserQuestion answers actually POSTs to /v2/trace-automations (or MCP equivalent), the rule is retrievable by a subsequent list invocation, and the rule correctly triggers the target experiment on matching traces"
    why_human: "Requires live Orq.ai POST with valid credential; MCP vs REST fallback path can only be exercised against a real endpoint"
---

# Phase 36: Lifecycle Slash Commands — Verification Report

**Phase Goal:** Users can inspect workspace, traces, analytics, models, onboarding, and trace-automation rules directly from Claude Code via thin MCP-backed slash commands without opening the Orq.ai dashboard.
**Verified:** 2026-04-20
**Status:** human_needed
**Re-verification:** Yes — rolls up 36-08-VERIFICATION.md (plan-close evidence trail) into phase-level VERIFICATION.md

---

## Goal Achievement

### Observable Truths (mapped from ROADMAP Success Criteria)

| # | Truth (Success Criterion) | Status | Evidence |
|---|---------------------------|--------|----------|
| 1 | `/orq-agent:workspace [section]` prints single-screen overview of agents/deployments/prompts/datasets/experiments/projects/KBs/evaluators + analytics summary | ✓ VERIFIED (file-level) | `orq-agent/commands/workspace.md` (191 lines), banner `ORQ ► WORKSPACE` present, 8 entity subsections + analytics line, SKST lint exit 0 |
| 2 | `/orq-agent:traces` supports `--deployment --status --last --limit`, lists errors first with full trace IDs | ✓ VERIFIED (file-level) | `orq-agent/commands/traces.md` (190 lines), all 4 flags grep-anchored, `ORQ ► TRACES` banner, errors-first contract documented, SKST lint exit 0 |
| 3 | `/orq-agent:analytics` reports requests/cost/tokens/error-rate with `--last` and `--group-by (model\|deployment\|agent\|status)` | ✓ VERIFIED (file-level) | `orq-agent/commands/analytics.md` (212 lines), `ORQ ► ANALYTICS` banner, `--group-by` anchor, 4 dims + 4 metrics present, SKST lint exit 0 |
| 4 | `/orq-agent:models [search-term]` lists Model Garden grouped by provider, broken out by type (chat/embedding/image/rerank/etc.) | ✓ VERIFIED (file-level) | `orq-agent/commands/models.md` (208 lines), `ORQ ► MODELS` banner, chat/embedding/rerank tokens present, provider grouping, MSEL-02 snapshot-pin lint clean |
| 5 | `/orq-agent:quickstart` delivers 12-step interactive tour AND `/orq-agent:automations` lists/creates Trace Automation rules | ✓ VERIFIED (file-level) | `orq-agent/commands/quickstart.md` has exactly 12 `## Step N:` headings (219 lines); `orq-agent/commands/automations.md` has `--create` branch + `AskUserQuestion` gate (206 lines), SKST lint exit 0 |
| 6 | Live MCP round-trip: each command actually queries Orq.ai and returns real data | ? HUMAN NEEDED | Requires live API key + MCP registration — see human_verification[0] |
| 7 | Quickstart UX: 12-step flow feels natural on a fresh workspace | ? HUMAN NEEDED | Requires subjective UX validation on clean Orq.ai workspace — see human_verification[1] |
| 8 | Automations create: `--create` actually persists a rule via POST | ? HUMAN NEEDED | Requires live POST to `/v2/trace-automations` — see human_verification[2] |

**Score:** 5/5 ROADMAP file-level criteria VERIFIED; 3 live-behavior truths deferred to human verification.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `orq-agent/commands/workspace.md` | LCMD-01 workspace overview | ✓ VERIFIED | 191 lines, banner present, 8-entity subsections, SKST lint exit 0, referenced from SKILL.md + help.md |
| `orq-agent/commands/traces.md` | LCMD-02 traces query | ✓ VERIFIED | 190 lines, 4 flags (`--deployment`, `--status`, `--last`, `--limit`) + errors-first sort, SKST lint exit 0 |
| `orq-agent/commands/analytics.md` | LCMD-03 analytics report | ✓ VERIFIED | 212 lines, `--group-by` (model/deployment/agent/status) + 4 metrics, SKST lint exit 0 |
| `orq-agent/commands/models.md` | LCMD-04 Model Garden | ✓ VERIFIED | 208 lines, type breakdown (chat/embedding/image/rerank) + provider grouping, MSEL-02 snapshot-pin clean |
| `orq-agent/commands/quickstart.md` | LCMD-05 + LCMD-07 onboarding tour | ✓ VERIFIED | 219 lines, exactly 12 `## Step N:` headings covering Build → Evaluate → Optimize lifecycle |
| `orq-agent/commands/automations.md` | LCMD-06 trace automations | ✓ VERIFIED | 206 lines, list mode + `--create` + `AskUserQuestion` gate + yes/no confirmation |
| `orq-agent/SKILL.md` | Directory references all 6 new commands | ✓ VERIFIED | All 6 filenames grep-verified |
| `orq-agent/commands/help.md` | Banner references all 6 slash commands | ✓ VERIFIED | All 6 `/orq-agent:<cmd>` literals grep-verified |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `orq-agent/SKILL.md` | 6 new commands | filename references in commands directory listing | ✓ WIRED | All 6 `*.md` filenames present |
| `orq-agent/commands/help.md` | 6 new commands | `/orq-agent:<cmd>` literals in printed banner | ✓ WIRED | All 6 slash-command invocations present |
| Protected pipelines (orq-agent.md, prompt.md, architect.md) | Phase 34 golden baseline | SHA-256 hash match | ✓ WIRED | `check-protected-pipelines.sh` exit 0, all 3 byte-identical |
| Each new command | Orq.ai MCP tool set | tool invocations declared in frontmatter + referenced in body | ? HUMAN NEEDED | Declared statically; live round-trip not verifiable without API key |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| LCMD-01 | 36-01 | /orq-agent:workspace single-screen overview | ✓ SATISFIED (file-level) | workspace.md banner + 8 entities + analytics line; REQUIREMENTS.md line 14 marked `[x]` |
| LCMD-02 | 36-02 | /orq-agent:traces with 4 flags, errors-first | ✓ SATISFIED (file-level) | traces.md 4 flag anchors + errors-first contract; REQUIREMENTS.md line 15 marked `[x]` |
| LCMD-03 | 36-03 | /orq-agent:analytics requests/cost/tokens/error-rate | ✓ SATISFIED (file-level) | analytics.md --group-by + 4 metrics; REQUIREMENTS.md line 16 marked `[x]` |
| LCMD-04 | 36-04 | /orq-agent:models by provider + type | ✓ SATISFIED (file-level) | models.md type breakdown + MSEL-02 clean; REQUIREMENTS.md line 17 marked `[x]` |
| LCMD-05 | 36-05 | /orq-agent:quickstart onboarding (API key, MCP reg, routing) | ✓ SATISFIED (file-level) | quickstart.md covers API-key + MCP-registration steps; REQUIREMENTS.md line 18 marked `[x]` |
| LCMD-06 | 36-06 | /orq-agent:automations list/create | ✓ SATISFIED (file-level) | automations.md list + --create + AskUserQuestion; REQUIREMENTS.md line 19 marked `[x]` |
| LCMD-07 | 36-05 | quickstart 12-step tour | ✓ SATISFIED (file-level) | Exactly 12 `## Step N:` headings in quickstart.md; REQUIREMENTS.md line 20 marked `[x]` |

All 7 LCMD requirements file-level satisfied and marked `[x]` in REQUIREMENTS.md. No orphaned requirements.

### Anti-Patterns Found

None blocking. Anti-pattern scan on the 6 new command files + 2 modified files found only:
- `TODO(OBSV-07)` forward-link in `traces.md` — ℹ️ Info (intentional forward-reference for the `--identity` flag stub, documented in 36-02-PLAN.md as deliberate)

No placeholder returns, no empty handlers, no console.log-only implementations. Commands are declarative markdown instructions for the Claude runtime — "stub detection" is limited to LCMD phrase anchors, all 16/16 of which PASS.

### Human Verification Required

#### 1. MCP round-trip per command

**Test:** With an authenticated Orq.ai workspace and the Orq MCP server registered in Claude Code, invoke each of the 6 commands sequentially: `/orq-agent:workspace`, `/orq-agent:traces --last 1h`, `/orq-agent:analytics --last 24h --group-by model`, `/orq-agent:models`, `/orq-agent:quickstart` (first step), `/orq-agent:automations`.
**Expected:** Each returns live data formatted per its banner/section contract; no MCP errors or missing-tool warnings.
**Why human:** Requires live Orq.ai API credential + MCP registration; static lint cannot execute MCP tool calls.

#### 2. /orq-agent:quickstart UX flow

**Test:** On a fresh (empty) Orq.ai workspace, run `/orq-agent:quickstart` and follow all 12 steps in sequence, executing each copy-paste prompt.
**Expected:** The flow feels natural, each step's prompt runs cleanly without surprising errors, and the workspace ends with an evaluator promoted from Build → Evaluate → Optimize lifecycle.
**Why human:** UX naturalness is subjective; also exercises real workspace state mutation that lint cannot simulate.

#### 3. /orq-agent:automations --create persistence

**Test:** Run `/orq-agent:automations --create`, answer the `AskUserQuestion` prompts (trace filter, dataset, experiment), confirm on the yes/no gate, then run `/orq-agent:automations` again to list rules.
**Expected:** The newly created rule appears in the list; triggering a matching trace in the workspace fires the bound experiment.
**Why human:** Requires live POST to Orq.ai `/v2/trace-automations` (or MCP equivalent) with valid credential; persistence round-trip cannot be lint-verified.

---

### Gaps Summary

No file-level gaps. Every mechanical check specified in the phase brief passes:

- 6/6 new command files exist under `orq-agent/commands/` with substantive content (190-219 lines each)
- `bash orq-agent/scripts/lint-skills.sh` exits 0 (SKST rules green across full default set)
- `bash orq-agent/scripts/check-protected-pipelines.sh` exits 0 (3/3 SHA-256 matches)
- All required flags/section-tokens grep-verified in each command (16/16 phrase anchors PASS per 36-08-VERIFICATION.md)
- `orq-agent/SKILL.md` references all 6 new commands
- `orq-agent/commands/help.md` banner references all 6 slash-command literals
- LCMD-01..07 marked `[x]` in `.planning/REQUIREMENTS.md` (lines 14-20)

The phase goal — "users can inspect workspace, traces, analytics, models, onboarding, and trace-automation rules directly from Claude Code via thin MCP-backed slash commands without opening the Orq.ai dashboard" — is **structurally achieved** at the file level. The remaining surface area (live MCP data flow, UX naturalness, real POST persistence) is explicitly enumerated above as 3 human-only smokes and is out of scope for static verification.

---

*Verified: 2026-04-20*
*Verifier: Claude (gsd-verifier)*
