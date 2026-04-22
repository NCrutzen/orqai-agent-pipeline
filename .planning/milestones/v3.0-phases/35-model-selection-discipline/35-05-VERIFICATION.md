# Phase 35 Verification

**Verified:** 2026-04-20
**Phase:** 35-model-selection-discipline
**Status:** COMPLETE

Full evidence trail for `/gsd:verify-work`: captured green output from the Phase 35 verification sweep (full-suite lint, isolated `snapshot-pinned-models` rule on default set + both fixtures, protected-pipelines SHA-256 check, pre-existing 4-rule regression sweep, phrase-presence greps, file inventory), a 3-row MSEL-{01,02,03}-to-check traceability table, and a 4-row ROADMAP Phase 35 Success Criteria checklist. Lint scripts are silent-on-success: empty stdout is the success signal; the trailing `exit: 0` line confirms the passing exit code.

---

## Captured Green Output

### 1. Full lint suite — all 5 rules × 33 default-set skill files

```bash
$ bash orq-agent/scripts/lint-skills.sh
```

```
exit: 0
```

_Silent-on-success: zero `FAIL:` lines across 1 × `orq-agent/SKILL.md` + 15 × `orq-agent/commands/*.md` + 17 × `orq-agent/agents/*.md` for all 5 rules (`allowed-tools`, `tools-declared`, `required-sections`, `references-multi-consumer`, `snapshot-pinned-models`)._

### 2. Isolated `snapshot-pinned-models` rule on default set

```bash
$ bash orq-agent/scripts/lint-skills.sh --rule snapshot-pinned-models
```

```
exit: 0
```

_No floating-alias `model:` lines across the 33 default-set files._

### 3. `snapshot-pinned-models` on positive fixture

```bash
$ bash orq-agent/scripts/lint-skills.sh --rule snapshot-pinned-models --file tests/fixtures/35-good-pin.md
```

```
exit: 0
```

_Dated-snapshot `model: anthropic/claude-sonnet-4-5-20250929` correctly accepted._

### 4. `snapshot-pinned-models` on negative fixture — **INTENTIONAL FAIL**

```bash
$ bash orq-agent/scripts/lint-skills.sh --rule snapshot-pinned-models --file tests/fixtures/35-bad-pin.md
```

```
FAIL: tests/fixtures/35-bad-pin.md:5 — floating-alias model ID (use a dated snapshot, e.g. claude-sonnet-4-5-20250929) [MSEL-02]
exit: 1
```

_`exit: 1` — **INTENTIONAL**; rule correctly rejects the floating-alias fixture (`model: openai/gpt-4o-latest`) with a line-numbered diagnostic that names the MSEL-02 requirement ID. This is the negative-path contract test for the snapshot-pinning rule._

### 5. Protected-pipeline SHA-256 hash check

```bash
$ bash orq-agent/scripts/check-protected-pipelines.sh
```

```
OK: orq-agent.sha256 matches
OK: prompt.sha256 matches
OK: architect.sha256 matches
exit: 0
```

_All three protected entry points' `<pipeline>` blocks remain byte-identical to the Phase 34 golden baselines. Plans 02/03/04 policy edits stayed strictly outside the `<pipeline>` blocks as designed._

### 6. Pre-existing 4-rule regression sweep

```bash
$ for rule in allowed-tools tools-declared required-sections references-multi-consumer; do
    echo "=== --rule $rule ==="
    bash orq-agent/scripts/lint-skills.sh --rule "$rule"
    echo "exit: $?"
  done
```

```
=== --rule allowed-tools ===
exit: 0
=== --rule tools-declared ===
exit: 0
=== --rule required-sections ===
exit: 0
=== --rule references-multi-consumer ===
exit: 0
```

_No Phase-34 invariant regressed under Phase 35 edits._

### 7. Phrase-presence greps (MSEL-01/02/03 policy text anchors)

```bash
$ {
    echo "=== researcher.md phrase checks ==="
    for phrase in "capable-first" "after quality baseline run" "cascade-candidate" "quality-equivalence experiment" "## Model Selection Policy"; do
      if grep -q "$phrase" orq-agent/agents/researcher.md; then echo "✓ $phrase"; else echo "✗ $phrase"; fi
    done
    echo "=== spec-generator.md phrase checks ==="
    for phrase in "snapshot-pinned" "regex reject" "alias-only -- pinning unavailable" "cascade-candidate" "Snapshot Pinning Rule (MSEL-02)" "Cascade Block Emission (MSEL-03)"; do
      if grep -q "$phrase" orq-agent/agents/spec-generator.md; then echo "✓ $phrase"; else echo "✗ $phrase"; fi
    done
    echo "=== catalog phrase checks ==="
    for phrase in "## Capable Tier Lookup" "claude-sonnet-4-5-20250929" "claude-opus-4-20250514" "claude-haiku-4-5-20251001" "gpt-4o-2024-11-20"; do
      if grep -q "$phrase" orq-agent/references/orqai-model-catalog.md; then echo "✓ $phrase"; else echo "✗ $phrase"; fi
    done
  }
```

```
=== researcher.md phrase checks ===
✓ capable-first
✓ after quality baseline run
✓ cascade-candidate
✓ quality-equivalence experiment
✓ ## Model Selection Policy
=== spec-generator.md phrase checks ===
✓ snapshot-pinned
✓ regex reject
✓ alias-only -- pinning unavailable
✓ cascade-candidate
✓ Snapshot Pinning Rule (MSEL-02)
✓ Cascade Block Emission (MSEL-03)
=== catalog phrase checks ===
✓ ## Capable Tier Lookup
✓ claude-sonnet-4-5-20250929
✓ claude-opus-4-20250514
✓ claude-haiku-4-5-20251001
✓ gpt-4o-2024-11-20
```

_16 of 16 phrase anchors present (5 researcher + 6 spec-generator + 5 catalog). Zero `✗` markers — every MSEL-{01,02,03} policy clause is grep-verifiable in its owning file._

### 8. File inventory

```
SKILL.md count: 1
commands/*.md count: 15
agents/*.md count: 17
fixtures count: 2
```

_Default-set totals: 1 + 15 + 17 = **33** skill files (matches Phase 34 baseline). Out-of-band fixtures: **2** (`tests/fixtures/35-bad-pin.md`, `tests/fixtures/35-good-pin.md`) — by design outside `default_file_set()` so the negative fixture's intentional FAIL never contaminates full-suite runs._

---

## MSEL Requirement Traceability

| Req | Description (verbatim from REQUIREMENTS.md §MSEL) | Check | Evidence command | Green? |
|-----|----------------------------------------------------|-------|------------------|--------|
| **MSEL-01** | Researcher capable-first; budget only as "after quality baseline run" alternative; Capable Tier Lookup present in catalog | Phrase-presence greps on `researcher.md` for `capable-first` + `after quality baseline run` + `## Model Selection Policy`; phrase-presence grep on `orqai-model-catalog.md` for `## Capable Tier Lookup` + 4 dated-snapshot IDs | `grep -q "capable-first" orq-agent/agents/researcher.md && grep -q "after quality baseline run" orq-agent/agents/researcher.md && grep -q "## Capable Tier Lookup" orq-agent/references/orqai-model-catalog.md` | ✓ (§7 researcher: 5/5 ✓; §7 catalog: 5/5 ✓) |
| **MSEL-02** | Spec-generator pins snapshots, never floating aliases | Full-suite lint + isolated `snapshot-pinned-models` rule on default set + positive fixture exit 0 + negative fixture exit 1; embedded lint-regex + alias-only exception grep in `spec-generator.md` | `bash orq-agent/scripts/lint-skills.sh --rule snapshot-pinned-models && bash orq-agent/scripts/lint-skills.sh --rule snapshot-pinned-models --file tests/fixtures/35-good-pin.md && ! bash orq-agent/scripts/lint-skills.sh --rule snapshot-pinned-models --file tests/fixtures/35-bad-pin.md && grep -q "snapshot-pinned" orq-agent/agents/spec-generator.md && grep -q "regex reject" orq-agent/agents/spec-generator.md && grep -q "alias-only -- pinning unavailable" orq-agent/agents/spec-generator.md` | ✓ (§1 exit 0; §2 exit 0; §3 exit 0; §4 exit 1 INTENTIONAL; §7 spec-generator: 6/6 ✓) |
| **MSEL-03** | Researcher proposes cascade with mandatory quality-equivalence experiment; spec-generator consumes cascade-candidate tag | Phrase-presence greps on `researcher.md` for `cascade-candidate` + `quality-equivalence experiment`; phrase-presence grep on `spec-generator.md` for `cascade-candidate` + `Cascade Block Emission (MSEL-03)` | `grep -q "cascade-candidate" orq-agent/agents/researcher.md && grep -q "quality-equivalence experiment" orq-agent/agents/researcher.md && grep -q "cascade-candidate" orq-agent/agents/spec-generator.md && grep -q "Cascade Block Emission (MSEL-03)" orq-agent/agents/spec-generator.md` | ✓ (§7 researcher: 5/5 ✓; §7 spec-generator: 6/6 ✓) |

---

## ROADMAP Phase 35 Success Criteria

Each row quotes the ROADMAP.md §Phase 35 Success Criteria verbatim (lines 138-142) with evidence from the captured-output sections above. Criteria 1 and 3 describe LLM-runtime behaviors; the grep/lint layer proves the policy text is in place in the owning skill files, and the LLM-level canned-input smoke is deferred to `/gsd:verify-work` per the 35-VALIDATION.md §Manual-Only Verifications table.

| # | ROADMAP criterion (verbatim) | Evidence | Status |
|---|-----------------------------|----------|--------|
| 1 | "Running the researcher on a sample use case returns the most capable tier model for the task as the primary recommendation; budget-profile downgrades only appear as an alternative tagged 'after quality baseline run.'" | Policy text in `orq-agent/agents/researcher.md`: `## Model Selection Policy` H2 section, `capable-first` ordering, `after quality baseline run` budget-alternative tag — §7 researcher checks 5/5 ✓. Catalog seed table in `orqai-model-catalog.md` §`## Capable Tier Lookup` with 4 task-category rows × dated-snapshot Primary + Alternative Primary columns — §7 catalog checks 5/5 ✓. LLM-runtime smoke deferred to `/gsd:verify-work` per 35-VALIDATION.md §Manual-Only Verifications row 1. | ✓ (file-level); **manual LLM smoke deferred** |
| 2 | "Every generated agent spec contains a snapshot-pinned model reference (e.g., `claude-sonnet-4-5-20250929`), never a floating alias." | `snapshot-pinned-models` lint rule integrated into `orq-agent/scripts/lint-skills.sh` (Plan 01); default-set run exits 0 (§2); positive fixture exits 0 (§3); negative fixture exits 1 with line-numbered MSEL-02 diagnostic (§4); spec-generator self-check + embedded lint regex + alias-only exception present in `orq-agent/agents/spec-generator.md` — §7 spec-generator checks 6/6 ✓. | ✓ (mechanical enforcement live) |
| 3 | "When a user requests cost optimization, the researcher proposes a model-cascade pattern (cheap-first + escalation) together with a mandatory quality-equivalence experiment step before the cascade is marked approved." | `cascade-candidate` tag + `quality-equivalence experiment` step present in `orq-agent/agents/researcher.md` Model Selection Policy section (§7 researcher 5/5 ✓); cascade template consumption + `Cascade Block Emission (MSEL-03)` subsection present in `orq-agent/agents/spec-generator.md` (§7 spec-generator 6/6 ✓); cascade ships with `approved: false` default until Phase 42 runtime executes the quality-equivalence experiment. LLM-runtime smoke deferred to `/gsd:verify-work`. | ✓ (file-level); **manual LLM smoke deferred** |
| 4 | "Existing `/orq-agent`, `/orq-agent:prompt`, `/orq-agent:architect` produce functionally equivalent output with the new policy applied (no regressions on the generator loop)." | `bash orq-agent/scripts/check-protected-pipelines.sh` exits 0 with all three SHA-256 matches (§5 — `orq-agent.sha256`, `prompt.sha256`, `architect.sha256`). `<pipeline>` blocks for the 3 protected commands are byte-identical to the Phase 34 golden baseline. Semantic spec-JSON equivalence diff deferred to `/gsd:verify-work` per 35-VALIDATION.md §Manual-Only Verifications row 2. | ✓ (byte-level); **manual semantic diff deferred** |

---

## Manual-Only Deferred Verifications

Per the 35-VALIDATION.md §Manual-Only Verifications table. These are **NOT** blockers for Phase 35 mechanical close — they are LLM-runtime properties validated by canned-input smoke during `/gsd:verify-work`.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Researcher produces capable-first recommendation end-to-end on a canned use case | MSEL-01 / ROADMAP criterion 1 | LLM-output verification; grep confirms policy text is in place but cannot confirm the LLM applied it at runtime. | Invoke `/orq-agent:research "Slack FAQ bot"` and confirm the primary recommendation is a capable-tier model (e.g., `anthropic/claude-sonnet-4-5-20250929`) with the budget downgrade labelled `after quality baseline run`. **DEFERRED to /gsd:verify-work.** |
| Three protected entry points produce functionally equivalent output with the new policy | MSEL-02 / ROADMAP criterion 4 | Semantic equivalence on LLM output is not byte-level (which the SHA-256 check already verified for `<pipeline>` blocks). | Invoke `/orq-agent "CRM deal-stage coaching agent"` before and after Phase 35; confirm agent-spec structure unchanged and the only differences are `model:` fields where the previously-floating alias has been replaced with its dated snapshot. **DEFERRED to /gsd:verify-work.** |

---

## File Inventory

| Bucket | Count | Status |
|--------|-------|--------|
| `orq-agent/SKILL.md` | 1 | ✓ all pass lint |
| `orq-agent/commands/*.md` | 15 | ✓ all pass lint |
| `orq-agent/agents/*.md` | 17 | ✓ all pass lint |
| **Default-set total** | **33** | ✓ full-suite lint exit 0 |
| `tests/fixtures/35-*.md` | 2 | out-of-default-set by design (explicit `--file` invocation) |
| **Script modified this phase** | 1 | `orq-agent/scripts/lint-skills.sh` gained `snapshot-pinned-models` rule (Plan 01, +27 insertions) |

---

## Downstream Consumer Note

Phases 36-43 must call `bash orq-agent/scripts/lint-skills.sh` on any new skill files before marking themselves complete (Phase 34 lateral invariant). **Phase 35 adds the invariant that any new `model:` line in any new skill file must pass the `snapshot-pinned-models` rule** — the regex `^[[:space:]]*-?[[:space:]]*model:[[:space:]]*[^[:space:]]+(-latest|:latest|-beta)[[:space:]]*$` rejects `-latest`, `:latest`, and `-beta` suffixes. CI wiring for the combined Phase 34 + Phase 35 lint suite is owned by Phase 43 (DIST).

Researcher + spec-generator now apply the three MSEL policies as runtime text rules; no runtime-code wiring is required because Orq.ai model selection is driven by the `model:` field in the generated agent spec, which the spec-generator emits and the `snapshot-pinned-models` rule guards.

---

## Deferred / Open Items

- **Embedding/speech alias-only models:** None currently appear in the default file set. If a future skill file adds an alias-only embedding or speech model, it MUST carry the comment `# alias-only -- pinning unavailable <YYYY-MM-DD>` per the spec-generator rule (documented inline in `orq-agent/scripts/lint-skills.sh`'s `check_snapshot_pinned_models` function). An explicit allow-list in the lint rule is **NOT implemented** (YAGNI, per 35-01 key-decisions) — revisit if such a model surfaces.
- **LLM-output semantic verification** (ROADMAP success criteria 1 + 4 require LLM-level smoke): **deferred to /gsd:verify-work**. Grep-level checks prove the policy text is in place in the owning files; LLM adherence at runtime is a runtime property validated by manual canned-input smoke during verify-work, per the 35-VALIDATION.md §Manual-Only Verifications table.

---

*Phase: 35-model-selection-discipline*
*Verified: 2026-04-20*
*Status: COMPLETE*
