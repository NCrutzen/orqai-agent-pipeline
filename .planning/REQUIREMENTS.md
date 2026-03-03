# Requirements: Orq Agent Designer V4.0

**Defined:** 2026-03-03
**Core Value:** Agent swarms don't operate in silos -- overlaps are surfaced, missing coordination is identified, and fixes are proposed or auto-applied across the entire swarm ecosystem.

## v1 Requirements

Requirements for V4.0 release. Each maps to roadmap phases.

### Ecosystem Mapping

- [ ] **ECO-01**: User can see a unified inventory of all agent swarms from local specs and live Orq.ai state
- [ ] **ECO-02**: User can see per-agent sync status (in-sync, drifted, spec-only, deployed-only)
- [ ] **ECO-03**: User can see orphan agents (deployed on Orq.ai without local spec) and ghost specs (local spec with no deployment)
- [ ] **ECO-04**: User can see a tool registry showing which tools are used across which swarms
- [ ] **ECO-05**: User can see a KB registry showing knowledge base usage across swarms
- [ ] **ECO-06**: User can read a human-readable ecosystem report summarizing the entire swarm landscape

### Drift Detection

- [ ] **DRIFT-01**: User can see field-by-field comparison between local spec and deployed Orq.ai state per agent
- [ ] **DRIFT-02**: User can see drift findings classified by severity (CRITICAL/WARNING/INFO)
- [ ] **DRIFT-03**: User can see a swarm-level drift summary showing how many agents are drifted per swarm
- [ ] **DRIFT-04**: User can see a reconciliation direction recommendation (update spec or re-deploy) per drift finding

### Overlap & Gap Analysis

- [ ] **OVLP-01**: User can see semantic role overlap detection across swarms (REDUNDANT/COMPLEMENTARY/CONFLICTING)
- [ ] **OVLP-02**: User can see tool duplication report showing shared tools across swarms
- [ ] **OVLP-03**: User can see blind spot identification highlighting missing handoffs between swarms
- [ ] **OVLP-04**: User can see a coordination gap report with specific recommendations
- [ ] **OVLP-05**: User can dismiss overlap findings as accepted (persisted so they don't resurface)

### Fix Proposals

- [ ] **FIX-01**: User can see structured fix proposals with before/after diff preview per finding
- [ ] **FIX-02**: User can see risk classification (LOW/MEDIUM/HIGH) per proposal
- [ ] **FIX-03**: User can approve or reject each fix proposal via HITL flow
- [ ] **FIX-04**: User can see shared context injection proposals (adding cross-swarm awareness to agent instructions)
- [ ] **FIX-05**: User can see data contract proposals for inter-swarm communication
- [ ] **FIX-06**: User can see fix provenance tracking (trigger, diff, approver, outcome)

### Command & Integration

- [ ] **CMD-01**: User can run `/orq-agent:audit` to trigger a full cross-swarm analysis
- [ ] **CMD-02**: User can see a structured ecosystem report (ECOSYSTEM-REPORT.md) after audit completes
- [ ] **CMD-03**: Pipeline auto-triggers a lightweight cross-swarm check after each new swarm design
- [ ] **CMD-04**: Auto-trigger runs in lightweight mode (map + overlap check only) to avoid blocking the pipeline

## v2 Requirements

Deferred to V4.1+. Tracked but not in current roadmap.

### Auto-Apply

- **FIX-07**: Low-risk fixes (shared context additions) auto-applied to spec files with audit trail
- **FIX-08**: Auto-apply requires evaluator re-run before confirming application

### Advanced Analysis

- **OVLP-06**: Cross-swarm data flow diagram visualization
- **OVLP-07**: Semantic coverage analysis (requires business domain context)
- **OVLP-08**: Instruction semantic diff (high token cost, marginal improvement over field-level)

### Maturity & Reporting

- **ECO-07**: Swarm maturity scorecard (spec completeness, deploy status, test coverage)
- **FIX-09**: Batch proposal review (select and apply multiple proposals in one session)
- **ECO-08**: Incremental analysis (only re-analyze changed swarms)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time agent performance monitoring | Orq.ai handles production observability natively |
| Automatic agent merging across swarms | Architectural decision requiring human judgment -- cannot be automated |
| Self-healing detect-fix-deploy loop | Unsupervised production changes are unacceptable for enterprise users |
| Cross-swarm deployment orchestration | Deploy one swarm at a time via existing V2.0 pipeline |
| Event trigger proposals | Depends on Orq.ai A2A Protocol maturity -- unconfirmed; defer until platform support is clear |
| Scheduled/periodic audits | Requires persistent infrastructure; better suited for V3.0 web UI |
| 3D graph visualization | Adds cognitive load without insight for current swarm sizes |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ECO-01 | Phase 17 | Pending |
| ECO-02 | Phase 17 | Pending |
| ECO-03 | Phase 17 | Pending |
| ECO-04 | Phase 17 | Pending |
| ECO-05 | Phase 17 | Pending |
| ECO-06 | Phase 17 | Pending |
| DRIFT-01 | Phase 18 | Pending |
| DRIFT-02 | Phase 18 | Pending |
| DRIFT-03 | Phase 18 | Pending |
| DRIFT-04 | Phase 18 | Pending |
| OVLP-01 | Phase 19 | Pending |
| OVLP-02 | Phase 19 | Pending |
| OVLP-03 | Phase 19 | Pending |
| OVLP-04 | Phase 19 | Pending |
| OVLP-05 | Phase 19 | Pending |
| FIX-01 | Phase 20 | Pending |
| FIX-02 | Phase 20 | Pending |
| FIX-03 | Phase 20 | Pending |
| FIX-04 | Phase 20 | Pending |
| FIX-05 | Phase 20 | Pending |
| FIX-06 | Phase 20 | Pending |
| CMD-01 | Phase 21 | Pending |
| CMD-02 | Phase 21 | Pending |
| CMD-03 | Phase 21 | Pending |
| CMD-04 | Phase 21 | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-03 after roadmap creation*
