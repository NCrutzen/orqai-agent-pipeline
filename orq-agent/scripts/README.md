# orq-agent/scripts

Local validation scripts for Phase 34 Skill Structure & Format Foundation.
Invoke-on-demand only — CI wiring is deferred to Phase 43 (DIST).

## lint-skills.sh

**Purpose:** Enforce the 10 Skill Structure (SKST) rules across every skill file.

**Exit codes:** 0 = all checks pass; 1 = any check failed.

**Modes:**

- `bash orq-agent/scripts/lint-skills.sh` — full scan (SKILL.md + all commands + all subagents, all rules)
- `bash orq-agent/scripts/lint-skills.sh --help` — usage
- `bash orq-agent/scripts/lint-skills.sh --file <path>` — single file
- `bash orq-agent/scripts/lint-skills.sh --files <dir>` — every *.md in a directory
- `bash orq-agent/scripts/lint-skills.sh --rule <rule-id>` — single rule only
- `bash orq-agent/scripts/lint-skills.sh --rule <rule-id> --file <path>` — single rule on single file

**Rule IDs:** `allowed-tools`, `tools-declared`, `required-sections`, `references-multi-consumer`.

**Required H2 sections (SKST-03..10 + SKST-06):** Constraints, When to use, When NOT to use,
Companion Skills, Done When, Destructive Actions, Anti-Patterns, Open in orq.ai,
Documentation & Resolution.

## check-protected-pipelines.sh

**Purpose:** Enforce byte-identical behavior of the 3 protected entry points
(`/orq-agent`, `/orq-agent:prompt`, `/orq-agent:architect`) per ROADMAP Phase 34
success criterion #5. New SKST sections sit OUTSIDE `<pipeline>` blocks; this script
verifies the `<pipeline>` block itself is SHA-256-identical to the Phase 34 baseline.

**Exit codes:** 0 = all 3 pipeline blocks match golden; 1 = any mismatch.

**Modes:**

- `bash orq-agent/scripts/check-protected-pipelines.sh` — verify current vs golden
- `bash orq-agent/scripts/check-protected-pipelines.sh --baseline` — re-capture golden (Wave 0 only; intentional pipeline changes post-Phase-34 require explicit re-baseline with a note in the SUMMARY)

**Golden baselines live at:** `.planning/phases/34-skill-structure-format-foundation/golden/{orq-agent,prompt,architect}.sha256`

## Sampling rate (from 34-VALIDATION.md)

- After every skill-file commit: run `lint-skills.sh --file <modified-file>` (≤1s)
- After every plan wave: run full `lint-skills.sh` + `check-protected-pipelines.sh` (≤5s total)
- Before `/gsd:verify-work`: full suite must exit 0
