# Requirements: Orq Agent Designer V5.0 Browser Automation

**Defined:** 2026-03-03
**Core Value:** Any colleague can go from a use case description to deployed, tested agents on Orq.ai — including agents that interact with browser-only systems via deterministic Playwright scripts.

## V5.0 Requirements

Requirements for browser automation milestone. Each maps to roadmap phases.

### Capabilities & Detection

- [ ] **CAP-01**: User can define application capabilities in a config file (system name, integration method, base URL, auth type, available flows)
- [ ] **CAP-02**: Pipeline detects browser automation needs by matching systems in use case against capabilities config
- [ ] **CAP-03**: Discussion step asks about unknown systems' integration method and writes discovered capabilities back to config file
- [ ] **CAP-04**: Pipeline supports mixed swarms where some agents use APIs and others use browser automation

### Script Generation

- [ ] **SCRIPT-01**: Pipeline generates deterministic Playwright TypeScript scripts from flow descriptions
- [ ] **SCRIPT-02**: Generated scripts use typed interface contract (async function with typed params and return values)
- [ ] **SCRIPT-03**: Generated scripts accept runtime parameters (customer ID, invoice number) via parameterized templates
- [ ] **SCRIPT-04**: Pipeline accepts Playwright codegen recordings as input to improve script accuracy when LLM-only generation fails
- [ ] **SCRIPT-05**: Pipeline tries LLM-only generation first, falls back to requesting codegen recording if self-test fails

### VPS MCP Server

- [ ] **VPS-01**: MCP server on VPS exposes Playwright scripts as workflow-level MCP tools (one tool per business flow)
- [ ] **VPS-02**: MCP server uses Streamable HTTP transport compatible with Orq.ai
- [ ] **VPS-03**: MCP server resolves credentials internally — credentials never flow through agent tool parameters
- [ ] **VPS-04**: MCP server secured with TLS and authentication (bearer token or equivalent)

### Deployment

- [ ] **DEPLOY-01**: Pipeline deploys generated scripts to VPS automatically (no manual SSH/SCP)
- [ ] **DEPLOY-02**: Script versioning — deployed scripts tracked by version with rollback capability
- [ ] **DEPLOY-03**: Self-test before deployment — generated scripts run against target system before being deployed

### Agent Wiring

- [ ] **WIRE-01**: Tool resolver extended with browser automation resolution path
- [ ] **WIRE-02**: Generated agent specs include correct MCP tool references pointing to VPS server

### Hardening

- [ ] **HARD-01**: Script health monitoring — MCP tool runs smoke tests on all deployed scripts and reports status
- [ ] **HARD-02**: Second system validation — pipeline works end-to-end for iController (not just NXT)

### Validation

- [ ] **VAL-01**: End-to-end NXT validation — user describes use case involving NXT, pipeline detects browser need, generates script, deploys, and wires agent spec

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Recording

- **REC-01**: Video recording + vision LLM approach for non-technical users to capture workflows
- **REC-02**: Automated codegen session launching from the pipeline (headless codegen)

### Additional Systems

- **SYS-01**: Intelly browser automation (may require headed browser / Xvfb on VPS)
- **SYS-02**: Auto-discovery of available workflows per system

## Out of Scope

| Feature | Reason |
|---------|--------|
| Dynamic/exploratory browser-use | Already handled by existing Orq.ai MCP tools |
| Generic browser primitives (click, type, navigate) | Tool proliferation problem — V5.0 uses workflow-level tools |
| Screenshot/vision-based interaction | Less reliable and more expensive than DOM/accessibility-based approach |
| Self-healing scripts | Masks UI changes; health monitoring + LLM regeneration is safer |
| Headed browser mode for agents | VPS runs headless; results returned as structured data |
| Browser automation for all systems at once | Validate pipeline on NXT first, then expand incrementally |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CAP-01 | Phase 22 | Pending |
| CAP-02 | Phase 22 | Pending |
| CAP-03 | Phase 22 | Pending |
| CAP-04 | Phase 23 | Pending |
| SCRIPT-01 | Phase 23 | Pending |
| SCRIPT-02 | Phase 23 | Pending |
| SCRIPT-03 | Phase 23 | Pending |
| SCRIPT-04 | Phase 23 | Pending |
| SCRIPT-05 | Phase 23 | Pending |
| VPS-01 | Phase 22 | Pending |
| VPS-02 | Phase 22 | Pending |
| VPS-03 | Phase 22 | Pending |
| VPS-04 | Phase 22 | Pending |
| DEPLOY-01 | Phase 24 | Pending |
| DEPLOY-02 | Phase 24 | Pending |
| DEPLOY-03 | Phase 24 | Pending |
| WIRE-01 | Phase 23 | Pending |
| WIRE-02 | Phase 24 | Pending |
| HARD-01 | Phase 25 | Pending |
| HARD-02 | Phase 25 | Pending |
| VAL-01 | Phase 24 | Pending |

**Coverage:**
- V5.0 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-03 after roadmap creation*
