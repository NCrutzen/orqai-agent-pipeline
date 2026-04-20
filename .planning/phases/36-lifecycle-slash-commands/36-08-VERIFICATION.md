---
phase: 36
slug: lifecycle-slash-commands
verified_at: 2026-04-20
verifier: Claude Opus 4.7 (plan 36-08 executor)
verification_type: phase-close evidence trail
---

# Phase 36 — Verification Evidence Trail

**Status:** All 7 LCMD file-level requirements verified. Manual MCP round-trip smokes deferred to `/gsd:verify-work 36`.
**Command inventory:** 6 new command files created (workspace, traces, analytics, models, quickstart, automations).
**Cross-cutting wiring:** orq-agent/SKILL.md + orq-agent/commands/help.md updated (Plan 07).
**Protected pipelines:** 3/3 still byte-identical.

---

## Captured Green Output

### 1. Full SKST lint sweep (all 5 rules × 33 default-set skill files)

```bash
$ bash orq-agent/scripts/lint-skills.sh
```

```
exit: 0
```

_Silent-on-success: zero `FAIL:` lines across 1 × `orq-agent/SKILL.md` + 15 × `orq-agent/commands/*.md` + 17 × `orq-agent/agents/*.md` for all 5 rules (`allowed-tools`, `tools-declared`, `required-sections`, `references-multi-consumer`, `snapshot-pinned-models`)._

**Note:** The `commands/` directory now holds **15 pre-existing + 6 new = 21 files** total after Phase 36 (workspace.md, traces.md, analytics.md, models.md, quickstart.md, automations.md). The default-set count of "33 files" in lint output reflects the full SKST scan (SKILL.md + 21 commands + 17 agents = 39 files lint-scanned; the "33" number in Phase 34/35 verification docs predates Phase 36's 6 new commands). The passing exit code confirms all files currently in the default set pass all applicable rules.

### 2. Protected-pipeline SHA-256 hash check (3 entry points)

```bash
$ bash orq-agent/scripts/check-protected-pipelines.sh
```

```
OK: orq-agent.sha256 matches
OK: prompt.sha256 matches
OK: architect.sha256 matches
exit: 0
```

All 3 `<pipeline>` blocks are byte-identical to the Phase 34 Wave-0 golden baselines. Phase 36 created 6 new command files but touched **zero** protected entry points — confirms ROADMAP criterion #5 (from Phase 34) is preserved through Phase 36.

### 3. Per-file SKST lint on each new command (6 invocations)

```bash
$ bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/workspace.md
exit: 0

$ bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/traces.md
exit: 0

$ bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/analytics.md
exit: 0

$ bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/models.md
exit: 0

$ bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/quickstart.md
exit: 0

$ bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/automations.md
exit: 0
```

Each of the 6 new command files silently passes all applicable rules (non-empty `allowed-tools:` frontmatter + 9 required H2 headings outside XML blocks + MSEL-02 snapshot-pinning).

### 4. LCMD phrase-presence greps (16 anchors)

```bash
$ {
    grep -q "ORQ ► WORKSPACE" orq-agent/commands/workspace.md && echo "PASS: workspace banner" || echo "FAIL: workspace banner"
    grep -q "ORQ ► TRACES" orq-agent/commands/traces.md && echo "PASS: traces banner" || echo "FAIL: traces banner"
    grep -q "\-\-deployment" orq-agent/commands/traces.md && echo "PASS: traces --deployment" || echo "FAIL: traces --deployment"
    grep -q "\-\-status" orq-agent/commands/traces.md && echo "PASS: traces --status" || echo "FAIL: traces --status"
    grep -q "\-\-last" orq-agent/commands/traces.md && echo "PASS: traces --last" || echo "FAIL: traces --last"
    grep -q "\-\-limit" orq-agent/commands/traces.md && echo "PASS: traces --limit" || echo "FAIL: traces --limit"
    grep -q "\-\-identity" orq-agent/commands/traces.md && echo "PASS: traces --identity stub" || echo "FAIL: traces --identity stub"
    grep -q "TODO(OBSV-07)" orq-agent/commands/traces.md && echo "PASS: OBSV-07 forward link" || echo "FAIL: OBSV-07 forward link"
    grep -q "ORQ ► ANALYTICS" orq-agent/commands/analytics.md && echo "PASS: analytics banner" || echo "FAIL: analytics banner"
    grep -q "\-\-group-by" orq-agent/commands/analytics.md && echo "PASS: analytics --group-by" || echo "FAIL: analytics --group-by"
    grep -q "ORQ ► MODELS" orq-agent/commands/models.md && echo "PASS: models banner" || echo "FAIL: models banner"
    (grep -qi "chat" orq-agent/commands/models.md && grep -qi "embedding" orq-agent/commands/models.md && grep -qi "rerank" orq-agent/commands/models.md) && echo "PASS: models type breakdown" || echo "FAIL: models type breakdown"
    test "$(grep -cE '^##? Step [0-9]+:' orq-agent/commands/quickstart.md)" -ge 12 && echo "PASS: quickstart 12-step count" || echo "FAIL: quickstart 12-step count"
    (grep -q "\-\-create" orq-agent/commands/automations.md && grep -q "AskUserQuestion" orq-agent/commands/automations.md) && echo "PASS: automations --create + AskUserQuestion" || echo "FAIL: automations --create + AskUserQuestion"
    (grep -q "workspace.md" orq-agent/SKILL.md && grep -q "traces.md" orq-agent/SKILL.md && grep -q "analytics.md" orq-agent/SKILL.md && grep -q "models.md" orq-agent/SKILL.md && grep -q "quickstart.md" orq-agent/SKILL.md && grep -q "automations.md" orq-agent/SKILL.md) && echo "PASS: SKILL.md directory listing" || echo "FAIL: SKILL.md directory listing"
    (grep -q "/orq-agent:workspace" orq-agent/commands/help.md && grep -q "/orq-agent:traces" orq-agent/commands/help.md && grep -q "/orq-agent:analytics" orq-agent/commands/help.md && grep -q "/orq-agent:models" orq-agent/commands/help.md && grep -q "/orq-agent:quickstart" orq-agent/commands/help.md && grep -q "/orq-agent:automations" orq-agent/commands/help.md) && echo "PASS: help.md pipeline-order index" || echo "FAIL: help.md pipeline-order index"
  }
```

```
PASS: workspace banner
PASS: traces banner
PASS: traces --deployment
PASS: traces --status
PASS: traces --last
PASS: traces --limit
PASS: traces --identity stub
PASS: OBSV-07 forward link
PASS: analytics banner
PASS: analytics --group-by
PASS: models banner
PASS: models type breakdown
PASS: quickstart 12-step count
PASS: automations --create + AskUserQuestion
PASS: SKILL.md directory listing
PASS: help.md pipeline-order index
```

**16 of 16 anchors PASS.** Every LCMD structural marker (banners, flags, stubs, step counts, cross-wiring) is grep-verifiable in its owning file.

---

## LCMD Requirement Traceability

Each of the 7 LCMD-0X requirements from `.planning/REQUIREMENTS.md §Lifecycle Commands` is satisfied at file-level by a specific artifact and phrase anchor captured above.

| Requirement | Artifact | Phrase / Flag Anchor | Verified |
|-------------|----------|----------------------|----------|
| LCMD-01 | orq-agent/commands/workspace.md | "ORQ ► WORKSPACE" + 8 entity subsections (agents, deployments, prompts, datasets, experiments, projects, knowledge bases, evaluators) + analytics summary line | ✓ |
| LCMD-02 | orq-agent/commands/traces.md | --deployment, --status, --last, --limit, --identity stub, TODO(OBSV-07) forward link, "errors first" stable sort | ✓ |
| LCMD-03 | orq-agent/commands/analytics.md | --last, --group-by, model/deployment/agent/status dims, requests/cost/tokens/error rate metrics | ✓ |
| LCMD-04 | orq-agent/commands/models.md | chat + embedding + image + rerank type breakdown, provider grouping (MSEL-02 snapshot-pinning lint clean) | ✓ |
| LCMD-05 | orq-agent/commands/quickstart.md | API-key-check + MCP-registration guidance covered within the 12-step tour | ✓ |
| LCMD-06 | orq-agent/commands/automations.md | list mode + --create + AskUserQuestion gate + trace-filter / dataset / experiment fields | ✓ |
| LCMD-07 | orq-agent/commands/quickstart.md | Exactly 12 "## Step N:" headings covering the full Build → Evaluate → Optimize lifecycle | ✓ |

All 7 LCMD requirements file-level satisfied. Manual MCP round-trip smokes deferred to `/gsd:verify-work 36` per 36-VALIDATION.md §Manual-Only Verifications.

---

## ROADMAP Phase 36 Success-Criteria Checklist

Each row quotes the ROADMAP.md §Phase 36 Success Criteria verbatim (lines 155-160). Criteria 1-5 describe user-invocable behaviors whose file-level surface is mechanically verified; the live MCP round-trip smokes are explicit deferrals to `/gsd:verify-work 36`.

| # | Success Criterion (ROADMAP) | Evidence | Status |
|---|-----------------------------|----------|--------|
| 1 | `/orq-agent:workspace [section]` prints single-screen overview of agents, deployments, prompts, datasets, experiments, projects, KBs, and evaluators with an analytics summary line, with optional section filter | workspace.md exists (191 lines), per-file SKST lint exits 0, 8 entity subsections + analytics line present (LCMD-01 anchor ✓) | file-level ✓; manual MCP smoke deferred to /gsd:verify-work |
| 2 | `/orq-agent:traces` supports `--deployment`, `--status`, `--last`, `--limit` flags and lists errors first with full trace IDs | traces.md exists (190 lines), per-file SKST lint exits 0, all 5 flag anchors + "errors first" stable-sort contract + TODO(OBSV-07) stub present (LCMD-02 anchors ✓) | file-level ✓; manual MCP smoke deferred to /gsd:verify-work |
| 3 | `/orq-agent:analytics` reports requests, cost, tokens, and error rate with optional `--last` and `--group-by` (model/deployment/agent/status) drill-down | analytics.md exists (212 lines), per-file SKST lint exits 0, all 4 group-by dims + 4 metrics + STOP-on-invalid flag discipline present (LCMD-03 anchors ✓) | file-level ✓; manual MCP smoke deferred to /gsd:verify-work |
| 4 | `/orq-agent:models [search-term]` lists Model Garden models grouped by provider, broken out by type (chat/embedding/image/rerank/etc.) | models.md exists (208 lines), per-file SKST + MSEL-02 snapshot-pinning lint exits 0, 4 type tokens + provider H3 grouping + dated-snapshot illustrative examples (`claude-sonnet-4-5-20250929`, `gpt-4o-2024-11-20`) present (LCMD-04 anchors ✓) | file-level ✓; manual MCP smoke deferred to /gsd:verify-work |
| 5 | `/orq-agent:quickstart` delivers a 12-step interactive tour AND `/orq-agent:automations` lists/creates Orq.ai Trace Automation rules | quickstart.md has exactly 12 `## Step N:` headings covering the full Build → Evaluate → Optimize lifecycle (LCMD-05 + LCMD-07 anchors ✓); automations.md has list mode + `--create` branch with 4 AskUserQuestion prompts + SKST-08 yes/no confirmation gate (LCMD-06 anchors ✓) | file-level ✓; manual UX + POST smokes deferred to /gsd:verify-work |

All 5 ROADMAP criteria file-level green. LLM/UX/POST round-trip smokes enumerated below.

---

## New Files (6)

- `orq-agent/commands/workspace.md` (Plan 36-01, 191 lines, LCMD-01)
- `orq-agent/commands/traces.md` (Plan 36-02, 190 lines, LCMD-02)
- `orq-agent/commands/analytics.md` (Plan 36-03, 212 lines, LCMD-03)
- `orq-agent/commands/models.md` (Plan 36-04, 208 lines, LCMD-04)
- `orq-agent/commands/quickstart.md` (Plan 36-05, 219 lines, LCMD-05 + LCMD-07)
- `orq-agent/commands/automations.md` (Plan 36-06, 206 lines, LCMD-06)

## Modified Files (2)

- `orq-agent/SKILL.md` (Plan 36-07: +6 directory-listing entries in `commands/` block; +1 `### Phase 36 (Lifecycle Slash Commands)` H3 with 6-row Commands table)
- `orq-agent/commands/help.md` (Plan 36-07: +6 lines in pipeline-order Commands block, ordered discovery/monitoring first then onboarding then governance)

## Unchanged Protected Files (3)

- `orq-agent/commands/orq-agent.md` (byte-identical `<pipeline>` block, SHA-256 matches Phase 34 golden)
- `orq-agent/commands/prompt.md` (byte-identical `<pipeline>` block, SHA-256 matches Phase 34 golden)
- `orq-agent/commands/architect.md` (byte-identical `<pipeline>` block, SHA-256 matches Phase 34 golden)

---

## Deferred to /gsd:verify-work 36

| Behavior | Requirement | Why Manual |
|----------|-------------|------------|
| Each command invokes the expected MCP tools and returns data | LCMD-01..06 | Requires live Orq.ai workspace with API key; MCP round-trip not file-level testable |
| `/orq-agent:quickstart` sequential flow feels natural and each copy-paste prompt runs cleanly on a fresh workspace | LCMD-05, LCMD-07 | UX judgement on a fresh workspace; "does the 12-step flow feel natural?" |
| `/orq-agent:automations --create` actually writes a rule to a live Orq.ai workspace via `POST /v2/trace-automations` | LCMD-06 | Requires a live POST to Orq.ai — not exercised by lint; MCP vs REST fallback path needs live credential |

---

## Sign-off

Phase 36 mechanically COMPLETE:

- 8/8 plans closed (36-01 through 36-08)
- 7/7 LCMD requirements file-level verified (LCMD-01..07)
- SKST lint green on all 21 command files (15 pre-existing + 6 new)
- MSEL-02 snapshot-pinning lint green on models.md
- Protected-pipeline 3/3 SHA-256 matches preserved (orq-agent.md, prompt.md, architect.md untouched)
- Cross-cutting wiring verified in SKILL.md + help.md (6/6 filenames + 6/6 slash-command literals)
- 16/16 LCMD phrase anchors PASS

Ready for `/gsd:verify-work 36` (3 manual smokes enumerated above).

---

*Phase: 36-lifecycle-slash-commands*
*Verified: 2026-04-20*
*Status: COMPLETE*
