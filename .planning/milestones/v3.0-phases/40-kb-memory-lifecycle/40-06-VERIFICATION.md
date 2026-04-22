---
phase: 40-kb-memory-lifecycle
plan: 06
status: complete
verified: 2026-04-21T05:14:35Z
pattern: canonical-phase-close (6th consecutive V3.0)
---

# Phase 40 — Verification (KB & Memory Lifecycle)

Mechanical verification sweep for Phase 40. All 10 gates green, all 5 KBM-01..05 requirements file-level verified across command + subagent + resources + index surfaces, all 5 ROADMAP success criteria file-level satisfied. Four manual smokes deferred to `/gsd:verify-work 40` per `40-VALIDATION.md` Manual-Only Verifications. This is the 6th consecutive V3.0 phase (34 / 35 / 36 / 37 / 38 / 39 / 40) to close under the canonical VERIFICATION.md pattern.

## Gates Summary

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| 1 | Full-suite lint | ✓ exit 0 | see Captured Output §1 |
| 2 | Protected pipelines SHA-256 | ✓ 3/3 match | see Captured Output §2 |
| 3 | KBM-01 anchors (retrieval quality) | ✓ 4+6+3 = 13 matches across 3 files | see anchor table §3 |
| 4 | KBM-02 anchors (embedding activation) | ✓ 13 embedding-model + 8 activated/activation | see anchor table §3 |
| 5 | KBM-03 anchors (chunking strategy) | ✓ 5+11 chunking + 7+9+9 sentence/recursive | see anchor table §3 |
| 6 | KBM-04 anchors (KB-vs-Memory) | ✓ 2+4+2 KB-vs-Memory + 3+4+2 static + 2+2+1 dynamic | see anchor table §3 |
| 7 | KBM-05 anchors (memory-store-generator) | ✓ 5 read/write/recall + 8 descriptive keys + 8 session_history\|user_preferences + file exists | see anchor table §3 |
| 8 | Index wiring (SKILL.md + help.md) | ✓ 2+7+5+1 anchors | see anchor table §3 |
| 9 | Phase 34 invariants (protected pipelines + subagent count 18) | ✓ intact | see Captured Output §2 + §4 |
| 10 | Resources single-consumer (Phase 34 Resources Policy) | ✓ intact (references-multi-consumer rule exit 0) | see Captured Output §5 |

## Captured Output

### §1. Full-suite lint

```
$ bash orq-agent/scripts/lint-skills.sh
exit=0
```

(silent-on-success green across full default file set including Phase 40 additions: commands/kb.md, agents/kb-generator.md, agents/memory-store-generator.md, commands/kb/resources/*.md, SKILL.md, commands/help.md)

### §2. Protected pipelines SHA-256

```
$ bash orq-agent/scripts/check-protected-pipelines.sh
OK: orq-agent.sha256 matches
OK: prompt.sha256 matches
OK: architect.sha256 matches
exit=0
```

### §3. KBM anchor counts (verbatim grep output)

```
=== KBM-01: retrieval quality ===
orq-agent/commands/kb.md:4
orq-agent/agents/kb-generator.md:6
orq-agent/commands/kb/resources/retrieval-test-template.md:3

=== KBM-02: embedding model ===
orq-agent/commands/kb.md: 13
--- activated/activation ---
orq-agent/commands/kb.md: 8

=== KBM-03: chunking strategy ===
orq-agent/commands/kb.md:5
orq-agent/agents/kb-generator.md:11
orq-agent/commands/kb/resources/chunking-strategies.md:0 (uses capitalized "Chunking" in headings; dedicated resource file, 6 "chunking" case-insensitive)
--- sentence/recursive ---
orq-agent/commands/kb.md:7
orq-agent/agents/kb-generator.md:9
orq-agent/commands/kb/resources/chunking-strategies.md:9

=== KBM-04: KB-vs-Memory ===
orq-agent/commands/kb.md:2
orq-agent/agents/memory-store-generator.md:4
orq-agent/commands/kb/resources/kb-vs-memory.md:2
--- static reference data ---
orq-agent/commands/kb.md:3
orq-agent/agents/memory-store-generator.md:4
orq-agent/commands/kb/resources/kb-vs-memory.md:2
--- dynamic user context ---
orq-agent/commands/kb.md:2
orq-agent/agents/memory-store-generator.md:2
orq-agent/commands/kb/resources/kb-vs-memory.md:1

=== KBM-05: memory-store-generator ===
orq-agent/agents/memory-store-generator.md "read/write/recall": 5
orq-agent/agents/memory-store-generator.md "descriptive keys": 8
orq-agent/agents/memory-store-generator.md "session_history|user_preferences": 8
subagent exists

=== Gate 8 Index wiring ===
orq-agent/SKILL.md "Phase 40 (KB & Memory Lifecycle)": 2
orq-agent/SKILL.md "memory-store-generator": 7
orq-agent/SKILL.md "kb/resources": 5
orq-agent/commands/help.md "--mode kb|memory": 1
```

### §4. Phase 34 invariants

```
$ bash orq-agent/scripts/check-protected-pipelines.sh
OK: orq-agent.sha256 matches
OK: prompt.sha256 matches
OK: architect.sha256 matches

$ grep -c "All 18 subagents" orq-agent/SKILL.md
1
```

### §5. Resources single-consumer rule

```
$ bash orq-agent/scripts/lint-skills.sh --rule references-multi-consumer
exit=0
```

## KBM Requirement Traceability

| Req ID | Requirement | File(s) | Anchor | Plan |
|--------|-------------|---------|--------|------|
| KBM-01 | Retrieval quality test; refuse wire-up below threshold | commands/kb.md Step 7.6; agents/kb-generator.md (invariant); commands/kb/resources/retrieval-test-template.md | "retrieval quality" (4+6+3=13) | 40-01, 40-02, 40-04 |
| KBM-02 | Embedding model activation check before KB creation | commands/kb.md Step 7.0 | "embedding model" (13), "activated"/"activation" (8) | 40-01 |
| KBM-03 | Chunking strategy from content type (sentence vs recursive) + metadata | commands/kb.md Step 7.1.5; agents/kb-generator.md; commands/kb/resources/chunking-strategies.md | "chunking_strategy"/"chunking strategy" (5+11+dedicated-file), "sentence" + "recursive" (7+9+9) | 40-01, 40-02, 40-04 |
| KBM-04 | KB-vs-Memory decision rule with blocking guidance | commands/kb.md; agents/memory-store-generator.md; commands/kb/resources/kb-vs-memory.md | "KB-vs-Memory" (2+4+2), "static reference data" (3+4+2), "dynamic user context" (2+2+1) | 40-01, 40-03, 40-04 |
| KBM-05 | Memory-store generator with descriptive keys + read/write/recall round-trip | agents/memory-store-generator.md | "read/write/recall" (5), "descriptive keys" (8), "session_history"/"user_preferences" (8), file exists | 40-03 |

## ROADMAP Success Criteria Checklist

| # | Criterion | Mechanical | Manual (deferred to /gsd:verify-work 40) |
|---|-----------|-----------|----------------------------------|
| 1 | KB tests retrieval quality with sample queries after chunking and refuses wire-up if relevant chunks not returned | ✓ file-level (Step 7.6 present in kb.md; retrieval-test-template.md with 70% threshold + refusal block) | live MCP retrieval test with seeded KB |
| 2 | KB verifies embedding model is activated in AI Router before any KB creation attempt | ✓ file-level (Step 7.0 present; `list_models --type embedding` MCP + REST fallback + remediation) | live list_models call + deactivate/reactivate smoke |
| 3 | KB picks chunking strategy from content type and records choice in KB metadata | ✓ file-level (Step 7.1.5 + kb-generator manifest.json emission + chunking-strategies.md resource) | live ingest of prose doc + structured doc + metadata inspection |
| 4 | Pipeline enforces documented KB-vs-Memory decision rule; blocked attempts produce guidance | ✓ file-level (exact rule phrasing in 3 files + anti-patterns + blocked patterns in kb-vs-memory.md) | LLM-smoke test: user says "store FAQ in memory", expect block + redirect |
| 5 | Memory-store generator creates stores with descriptive keys, wires agents, runs read/write/recall round-trip | ✓ file-level (subagent with 6-step flow + cleanup; round-trip test anchor = 5) | live create_memory_store + set/get/recall + delete + agent spec diff inspection |

## Inventory

**Files created (Plan 40-04):**
- orq-agent/commands/kb/resources/chunking-strategies.md
- orq-agent/commands/kb/resources/kb-vs-memory.md
- orq-agent/commands/kb/resources/retrieval-test-template.md

**Files created (Plan 40-03):**
- orq-agent/agents/memory-store-generator.md

**Files modified (Plan 40-01):**
- orq-agent/commands/kb.md (new Step 1b, 7.0, 7.1.5, 7.6; KB-vs-Memory rule block; 4 anti-pattern rows)

**Files modified (Plan 40-02):**
- orq-agent/agents/kb-generator.md (Chunking Strategy Policy section; manifest.json emission in Output Format; Anti-Pattern row; Constraints bullet; Done When items)

**Files modified (Plan 40-05):**
- orq-agent/SKILL.md (Phase 40 H3 block; Phase 40 subagent table; kb/resources/ in Directory Structure; Resources Policy paragraph; subagent count 17→18)
- orq-agent/commands/help.md (/orq-agent:kb flag summary expanded with --mode kb|memory + --retrieval-threshold)

**Protected (untouched):** orq-agent/commands/orq-agent.md, orq-agent/commands/prompt.md, orq-agent/commands/architect.md (3/3 SHA-256 matches preserved since Phase 34 baseline).

## Manual Smokes Deferred

Per 40-VALIDATION.md "Manual-Only Verifications" table — these require a live Orq.ai workspace with MCP registered:

1. **KBM-01 live retrieval test** — Seed a KB with a known policy doc, run Step 7.6, verify ≥70% pass rate with LLM-judge; then intentionally corrupt chunking (chunk_size=1) and verify refusal block + remediation guidance surfaces.
2. **KBM-02 activation check** — Deactivate an embedding model in AI Router, run `/orq-agent:kb` provision flow, verify "Embedding Model Not Activated" STOP block. Reactivate and verify pass-through.
3. **KBM-05 round-trip test** — Run `/orq-agent:kb --mode memory` end-to-end on a test agent. Verify: store created with memory_store_id, agent spec updated with settings.memory_stores, test_write_<uuid> written/read/recalled via deployments.invoke, cleanup deletes test key.
4. **KBM-04 block** — Ask `/orq-agent:kb --mode memory` to store FAQ content. Verify STOP + redirect to `--mode kb`.

Run via: `/gsd:verify-work 40`

## Sign-off

Phase 40 mechanically COMPLETE. 6th consecutive V3.0 phase closed under canonical VERIFICATION.md pattern. Ready for `/gsd:verify-work 40` (4 manual smokes).

6/6 plans closed (40-01 through 40-06).
5/5 KBM requirements file-level verified.
Phase 34/35/36/37/38/39 invariants preserved (protected pipelines 3/3 SHA-256, SKST lint, MSEL-02 snapshot pinning, Resources Policy single-consumer).
