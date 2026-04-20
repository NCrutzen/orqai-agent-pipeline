---
phase: 34-skill-structure-format-foundation
plan: 01
subsystem: testing
tags: [posix-shell, bash, lint, sha256, skill-format, skst]

requires: []
provides:
  - "POSIX lint script enforcing 10 SKST rules (allowed-tools, tools-declared, required-sections, references-multi-consumer)"
  - "Protected-pipeline SHA-256 verifier with Wave-0 baselines for /orq-agent, /orq-agent:prompt, /orq-agent:architect"
  - "Golden pre-format-change hashes of <pipeline> blocks (committed before any skill edit)"
  - "Executor-facing README documenting both scripts' CLI + sampling rates"
affects: [34-02, 34-03, 34-04, 34-05]

tech-stack:
  added: [bash, awk, shasum]
  patterns:
    - "POSIX-only validation scripts (zero runtime dependencies)"
    - "Golden SHA-256 hash of extracted XML block (not whole file) for byte-identical-behavior enforcement"
    - "FAIL:-prefixed output + exit-code-1 contract for all lint/verify scripts"

key-files:
  created:
    - orq-agent/scripts/lint-skills.sh
    - orq-agent/scripts/check-protected-pipelines.sh
    - orq-agent/scripts/README.md
    - .planning/phases/34-skill-structure-format-foundation/golden/orq-agent.sha256
    - .planning/phases/34-skill-structure-format-foundation/golden/prompt.sha256
    - .planning/phases/34-skill-structure-format-foundation/golden/architect.sha256
  modified: []

key-decisions:
  - "Golden baseline hashes extracted <pipeline> block only (via awk), not whole file — new SKST sections sit outside <pipeline>"
  - "Lint uses grep -qF (literal-string match) for all 9 H2 headings + awk frontmatter scan; zero new runtime deps"
  - "XML-tag-nesting guard flags sections accidentally nested inside <role>/<pipeline>/<files_to_read>/<objective>/<instructions>"
  - "Combined --rule X --file Y form added to lint CLI beyond plan minimum (cleaner arg parsing + matches acceptance-criteria test cases)"
  - "check-protected-pipelines.sh uses shasum -a 256 (macOS + Linux compat) not sha256sum"

patterns-established:
  - "Pattern: Wave-0 scripts + golden baselines captured BEFORE format-change waves edit anything"
  - "Pattern: Every lint/verify failure line starts with 'FAIL:' for grep-friendly CI integration"
  - "Pattern: Protected-pipeline script hard-codes list of entry points (orq-agent, prompt, architect) inside the script, not via args"

requirements-completed: [SKST-01, SKST-02, SKST-03, SKST-04, SKST-05, SKST-06, SKST-07, SKST-08, SKST-09, SKST-10]

duration: 3 min
completed: 2026-04-20
---

# Phase 34 Plan 01: Lint & Protected-Pipeline Infrastructure Summary

**POSIX lint script enforcing 10 SKST rules + SHA-256-based protected-pipeline verifier with 3 Wave-0 golden baselines captured before any skill-file edit.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-20T13:57:02Z
- **Completed:** 2026-04-20T14:00:44Z
- **Tasks:** 3
- **Files created:** 6 (2 scripts, 1 README, 3 golden .sha256)
- **Files modified:** 0

## Accomplishments

- `orq-agent/scripts/lint-skills.sh` (230 lines, POSIX bash) — enforces all 4 rule IDs across the default skill set (SKILL.md + 16 commands + 17 subagents) with --file / --files / --rule / combined `--rule X --file Y` modes
- `orq-agent/scripts/check-protected-pipelines.sh` (66 lines, POSIX bash) — extracts `<pipeline>` block via awk, SHA-256-hashes, diffs against golden; hard-codes the 3 protected command list
- 3 golden SHA-256 baselines captured and committed BEFORE any skill-file edit (Wave 0 prerequisite for Plans 02/03/04)
- `orq-agent/scripts/README.md` (47 lines) — executor-facing CLI contract reference for downstream plans

## Task Commits

Each task was committed atomically:

1. **Task 1: Create lint-skills.sh with all 10 SKST rules** — `a7dfee3` (feat)
2. **Task 2: Create check-protected-pipelines.sh and capture golden baselines** — `b66f2b9` (feat)
3. **Task 3: Write orq-agent/scripts/README.md** — `acda86e` (docs)

## Lint CLI (from --help)

```
Usage: bash orq-agent/scripts/lint-skills.sh [options]

Modes:
  (no args)                     Run ALL rules across default file set
                                (SKILL.md + commands/*.md + agents/*.md)
  --help                        Print this usage block and exit 0
  --file <path>                 Lint exactly one file against all applicable rules
  --files <dir>                 Lint every *.md directly under <dir> (non-recursive)
  --rule <rule-id>              Run ONLY the named rule across the default file set
  --rule <rule-id> --file <p>   Run ONLY the named rule against one file

Rule IDs:
  allowed-tools              commands + SKILL.md have non-empty 'allowed-tools:' frontmatter
  tools-declared             agents/*.md have non-empty 'tools:' frontmatter
  required-sections          all 9 H2 headings present, outside any XML block
  references-multi-consumer  every file under orq-agent/references/ is referenced by >= 2 skills

Exit codes:
  0  all checks pass
  1  any check failed (every failure prefixed with 'FAIL:')
```

## Protected-Pipeline CLI

```
Usage: bash orq-agent/scripts/check-protected-pipelines.sh [--baseline]

Modes:
  (no args)    Verify current <pipeline> block hashes vs golden. Exit 0 on all match.
  --baseline   Recompute hashes and write to golden/<cmd>.sha256. Use ONLY in Wave 0
               or when pipeline changes are intentional + documented in a SUMMARY.

Protected commands (hard-coded): orq-agent, prompt, architect
```

## Golden Baselines Captured (Wave 0, pre-format-change)

| Command | SHA-256 of `<pipeline>` block |
|---------|-------------------------------|
| `/orq-agent`          | `e05a45d065604d14e588d476c0dc50f9fb262fd9914f718b49318584e26e6d49` |
| `/orq-agent:prompt`   | `2db50ffe7883c4e63ae49afdc6d540e3c835ceea313d87dd8dba71504466431a` |
| `/orq-agent:architect`| `af05911f05d3acf99b80f41268e8c0c248338aa130882164cc03b22956bd9ab9` |

These pin the pre-SKST-migration state of the 3 entry-point pipeline blocks. Plans 02/03/04 modify sections OUTSIDE `<pipeline>`, so these hashes must remain stable. Any drift triggers `FAIL:` output with both hashes + re-baseline instruction.

## Verification Results

Ran all 7 verification steps from the plan:

1. `bash orq-agent/scripts/lint-skills.sh --help` → exit 0, prints "Usage:" ✓
2. `bash orq-agent/scripts/check-protected-pipelines.sh --baseline` → wrote 3 .sha256 files ✓
3. `bash orq-agent/scripts/check-protected-pipelines.sh` (verify) → exit 0 with "OK: ... matches" for all 3 ✓
4. `bash orq-agent/scripts/lint-skills.sh --rule references-multi-consumer` → exit 0 (all 8 refs have ≥2 consumers, matches RESEARCH.md graph) ✓
5. `bash orq-agent/scripts/lint-skills.sh` (full) → exit 1 with FAIL lines naming missing sections (EXPECTED: proves lint is wired; Plans 02/03/04 add the sections) ✓
6. `ls .planning/phases/34-skill-structure-format-foundation/golden/ | wc -l` → 3 ✓
7. `orq-agent/scripts/README.md` exists with all required headings + rule IDs + section names + sampling guidance ✓

## No Skill Files Modified

Confirmed via `git log --oneline b66f2b9^..HEAD -- orq-agent/commands orq-agent/agents orq-agent/SKILL.md` → empty. Zero changes to `orq-agent/commands/`, `orq-agent/agents/`, or `orq-agent/SKILL.md` — the baselines captured in Task 2 are pristine pre-migration state.

## Decisions Made

- **Golden hashes target `<pipeline>` block only, not whole file.** Rationale: Plans 02/03/04 will add new SKST sections OUTSIDE `<pipeline>` — those changes are intentional and expected. What must NOT change is the pipeline-orchestration behavior the commands invoke. Hashing only the `<pipeline>` block operationalizes "byte-identical in behavior" per ROADMAP criterion #5. (Matches RESEARCH.md Pitfall 3 recommendation.)
- **POSIX bash + grep/awk/shasum only — zero runtime dependencies.** Rejected Node+js-yaml and Python+PyYAML alternatives. Frontmatter in this repo is all single-line scalar keys, so awk between `---` markers suffices. Keeps CI wiring trivial for Phase 43.
- **Combined `--rule X --file Y` arg form added beyond plan minimum.** The plan's acceptance criteria included tests like `lint-skills.sh --rule allowed-tools --file orq-agent/SKILL.md`, so the CLI parses both positional and combined forms. Clean arg-parsing loop handles any order.
- **XML-tag-nesting guard implemented in required-sections rule.** Per RESEARCH.md Pitfall 1, new sections must not accidentally end up inside `<role>`/`<pipeline>`/`<files_to_read>`. For each H2 heading found, the script locates the nearest prior opening XML tag; if its matching closing tag appears AFTER the heading, flag it. Cheap grep/awk implementation, no XML parser needed.
- **`shasum -a 256` (not `sha256sum`).** macOS ships `shasum` built-in; Linux provides it via coreutils compat. Single script works on both platforms.

## Deviations from Plan

None — plan executed exactly as written. All 3 tasks completed in specified order (Task 2's critical ordering requirement — capture golden baselines BEFORE any skill-file edit — was honored, since no skill-file edits happened in Plan 01 at all).

## Issues Encountered

None. Scripts worked on first full run; all acceptance criteria and plan-level verifications passed.

## Authentication Gates

None — all operations are local POSIX shell commands.

## User Setup Required

None — no external service configuration required. Scripts are invoke-on-demand; CI wiring is deferred to Phase 43 (DIST).

## Next Phase Readiness

**Ready for Plans 02/03/04.** Wave-0 infrastructure is complete:

- Plans 02/03/04 can run `bash orq-agent/scripts/lint-skills.sh --file <edited-file>` after each skill-file edit to check conformance.
- Plans 02/03/04 MUST run `bash orq-agent/scripts/check-protected-pipelines.sh` after editing any of orq-agent.md / prompt.md / architect.md — if the hash changed, they placed new sections INSIDE `<pipeline>` by mistake (Pitfall 1).
- Plan 05 runs the full suite as its final gate before `/gsd:verify-work`.

## Self-Check: PASSED

Verified:
- `orq-agent/scripts/lint-skills.sh` exists + executable ✓
- `orq-agent/scripts/check-protected-pipelines.sh` exists + executable ✓
- `orq-agent/scripts/README.md` exists ✓
- `.planning/phases/34-skill-structure-format-foundation/golden/{orq-agent,prompt,architect}.sha256` all exist with 64-char hex ✓
- Commits `a7dfee3`, `b66f2b9`, `acda86e` all reachable via `git log --oneline --all` ✓

---
*Phase: 34-skill-structure-format-foundation*
*Completed: 2026-04-20*
