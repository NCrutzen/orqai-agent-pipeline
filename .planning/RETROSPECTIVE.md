# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v0.3 — Core Pipeline + V2.0 Foundation

**Shipped:** 2026-03-01
**Phases:** 11 | **Plans:** 28 | **Sessions:** ~10

### What Was Built
- Complete agent swarm generation pipeline (7 subagents: architect, researcher, spec-gen, orchestration-gen, tool-resolver, dataset-gen, readme-gen)
- Adaptive pipeline that adjusts depth based on input detail (5-dimension classification)
- KB-aware pipeline with end-to-end knowledge base support
- XML-tagged prompt strategy with Anthropic context engineering patterns
- Modular install system with capability tiers (core/deploy/test/full) and API key onboarding
- Claude Code skill distribution with install script and update command

### What Worked
- GSD wave-based execution kept plans small and focused (avg 2-3 tasks per plan)
- Parallel subagent spawning during execution phases saved significant time
- Gap closure cycle (audit → plan gaps → execute → re-audit) caught real issues (OWNER/REPO placeholders, wrong tool identifiers)
- Phase 04.x decimal numbering allowed inserting enhancement phases (discussion, tools, prompts, KB) without disrupting the core pipeline
- Verification after each phase caught issues early instead of accumulating them

### What Was Inefficient
- Phase 03 was never formally verified — its requirements were retroactively covered by Phase 04.1 verification, but the gap persisted through the entire milestone
- V1.0 SUMMARY.md files lack `one_liner` frontmatter field — made milestone accomplishment extraction harder
- Some plan checkboxes in ROADMAP.md weren't updated by executors (phases 05, 05.1, 05.2)
- REQUIREMENTS.md summary counters went stale after gap closure fixed the remaining issues

### Patterns Established
- Reference files as single source of truth (tool-catalog.md, orqai-agent-fields.md) with source-of-truth notes
- Conditional pipeline sections (KB detection, researcher skip) controlled by blueprint classification
- Capability-gated commands with upgrade messaging for unreached tiers
- Gap closure via decimal phases (05.1, 05.2) keeping the main phase sequence clean

### Key Lessons
1. **Verify every phase** — Phase 03 missing verification was a recurring audit finding. Even if a phase is "obviously correct," the verification step catches documentation and wiring gaps.
2. **Keep references authoritative** — Wrong memory tool identifiers propagated through multiple files (tool-catalog.md, tool-resolver.md) because the initial reference wasn't validated against the source of truth. Source-of-truth notes added in Phase 05.2 fix this pattern.
3. **Wire forward placements explicitly** — Phase 5 created API endpoints and evaluator type references for future phases, but didn't wire them to any consumer. While intentional, this creates "orphaned" artifacts that need tracking.
4. **SUMMARY.md frontmatter matters** — Missing `one_liner` fields made milestone reporting harder. Future plans should enforce frontmatter completeness.

### Cost Observations
- Model mix: ~60% sonnet (executors, verifiers), ~30% opus (orchestration, planning), ~10% haiku (quick tasks)
- Sessions: ~10 across 6 days
- Notable: V1.0 (22 plans) executed in ~1 hour of agent time. V2.0 foundation (6 plans) added ~15 minutes. Total wall-clock time dominated by human review, not agent execution.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v0.3 | ~10 | 11 | First milestone — established GSD patterns, gap closure cycle |

### Top Lessons (Verified Across Milestones)

1. Verify every phase — even small ones
2. Keep authoritative references and validate against source of truth
3. SUMMARY.md frontmatter completeness enables downstream tooling
