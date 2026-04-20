---
phase: 34
slug: skill-structure-format-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bash + grep (no runtime — skill files are markdown) |
| **Config file** | `orq-agent/scripts/lint-skills.sh` (Wave 0 installs) |
| **Quick run command** | `bash orq-agent/scripts/lint-skills.sh --file <path>` |
| **Full suite command** | `bash orq-agent/scripts/lint-skills.sh` |
| **Estimated runtime** | ~3 seconds |

Golden-hash check for the three protected entry points:

| Property | Value |
|----------|-------|
| **Command** | `bash orq-agent/scripts/check-protected-pipelines.sh` |
| **Mechanism** | Extract `<pipeline>…</pipeline>` block from each of 3 commands, sha256, diff against golden `.sha256` baseline |
| **Estimated runtime** | ~1 second |

---

## Sampling Rate

- **After every task commit:** Run `bash orq-agent/scripts/lint-skills.sh --file <modified-skill>` for every skill touched in the commit.
- **After every plan wave:** Run full `bash orq-agent/scripts/lint-skills.sh` (all 34 files) + `bash orq-agent/scripts/check-protected-pipelines.sh`.
- **Before `/gsd:verify-work`:** Full suite must exit 0.
- **Max feedback latency:** 5 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 34-01-01 | 01 | 0 | SKST-01..10 lint rule infra | unit | `bash orq-agent/scripts/lint-skills.sh --help` exits 0 | ❌ W0 | ⬜ pending |
| 34-01-02 | 01 | 0 | Protected-entry baseline | unit | `bash orq-agent/scripts/check-protected-pipelines.sh --baseline` writes 3 `.sha256` | ❌ W0 | ⬜ pending |
| 34-02-01 | 02 | 1 | SKST-01 (`allowed-tools` on top-level + commands) | integration | `bash orq-agent/scripts/lint-skills.sh --rule allowed-tools` exits 0 | ❌ W0 | ⬜ pending |
| 34-02-02 | 02 | 1 | SKST-03..10 sections on all 16 commands | integration | `bash orq-agent/scripts/lint-skills.sh --files orq-agent/commands/` exits 0 | ❌ W0 | ⬜ pending |
| 34-02-03 | 02 | 1 | Byte-identical pipeline for 3 protected entry points | integration | `bash orq-agent/scripts/check-protected-pipelines.sh` exits 0 | ❌ W0 | ⬜ pending |
| 34-03-01 | 03 | 1 | SKST-01 (subagent `tools:` allowlist) | integration | `bash orq-agent/scripts/lint-skills.sh --rule tools-declared --files orq-agent/agents/` exits 0 | ❌ W0 | ⬜ pending |
| 34-03-02 | 03 | 1 | SKST-03..10 sections on all 17 subagents | integration | `bash orq-agent/scripts/lint-skills.sh --files orq-agent/agents/` exits 0 | ❌ W0 | ⬜ pending |
| 34-04-01 | 04 | 2 | SKST-01..10 on top-level SKILL.md | integration | `bash orq-agent/scripts/lint-skills.sh --file orq-agent/SKILL.md` exits 0 | ❌ W0 | ⬜ pending |
| 34-04-02 | 04 | 2 | SKST-02 references policy documented | integration | `grep -q "Single-consumer resources" orq-agent/SKILL.md` exits 0 | ❌ W0 | ⬜ pending |
| 34-04-03 | 04 | 2 | SKST-02 multi-consumer invariant | integration | `bash orq-agent/scripts/lint-skills.sh --rule references-multi-consumer` exits 0 | ❌ W0 | ⬜ pending |
| 34-05-01 | 05 | 3 | Full-suite green | integration | `bash orq-agent/scripts/lint-skills.sh && bash orq-agent/scripts/check-protected-pipelines.sh` exits 0 | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `orq-agent/scripts/lint-skills.sh` — implements all 10 SKST rules + `--rule`, `--file`, `--files <dir>` flags
- [ ] `orq-agent/scripts/check-protected-pipelines.sh` — extracts `<pipeline>…</pipeline>` from `commands/orq-agent.md`, `commands/prompt.md`, `commands/architect.md`, sha256s them, compares against `.planning/phases/34-skill-structure-format-foundation/golden/*.sha256`
- [ ] `.planning/phases/34-skill-structure-format-foundation/golden/` directory with 3 baseline `.sha256` files captured BEFORE any format changes
- [ ] `orq-agent/scripts/README.md` — 10-line note explaining both scripts' purpose and exit codes

*All infrastructure new in Wave 0 — no existing test framework in repo (skill files are markdown).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `/orq-agent`, `/orq-agent:prompt`, `/orq-agent:architect` produce semantically identical output with a representative input | Success criterion #5 (byte-identical behavior) | The pipeline hash check catches structural drift in the `<pipeline>` block but cannot catch semantic regressions where a new section interacts with the runtime (e.g., `<files_to_read>` changes). One-time smoke: invoke each command with a canned fixture ("CRM deal-stage coaching agent") before and after this phase; compare resulting agent spec JSON with `diff`. | Capture pre-phase output to `/tmp/34-pre-{orq,prompt,architect}.json`. Apply format changes. Capture post-phase output to `/tmp/34-post-*.json`. `diff /tmp/34-pre-orq.json /tmp/34-post-orq.json` must be empty. Repeat for prompt and architect. |
| `Open in orq.ai` URLs resolve | SKST-10 | 4/11 URLs are inferred (per RESEARCH.md Confidence Assessment) — only a live click-through verifies | One-time: click each URL in each skill's "Open in orq.ai" section. URLs that 404 get a `TODO(SKST-10)` anchor and a comment citing the inferred-vs-verified status. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (lint script + golden hashes + README)
- [ ] No watch-mode flags (scripts exit after running)
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
