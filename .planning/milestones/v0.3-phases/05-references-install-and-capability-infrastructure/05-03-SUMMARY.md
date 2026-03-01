---
phase: 05-references-install-and-capability-infrastructure
plan: 03
subsystem: infra
tags: [bash, installer, tier-selection, api-key, mcp, config]

# Dependency graph
requires:
  - phase: 01-08 (V1.0)
    provides: existing install.sh with download/verify/rollback
provides:
  - Extended installer with tier selection (core/deploy/test/full)
  - API key validation against Orq.ai /v2/models
  - MCP server auto-registration for deploy+ tiers
  - Config file at .orq-agent/config.json with tier and profile
  - Idempotent shell profile injection for ORQ_API_KEY
affects: [05-04, 06-deploy, 07-test, 08-iterate]

# Tech tracking
tech-stack:
  added: [curl-api-validation, claude-mcp-add]
  patterns: [idempotent-shell-profile-write, capability-tier-gating, config-file-creation]

key-files:
  created: []
  modified: [install.sh]

key-decisions:
  - "Config stored at $INSTALL_DIR/.orq-agent/config.json (install-relative, not project-relative)"
  - "MCP URL configurable via ORQAI_MCP_URL env var, defaulting to https://mcp.orq.ai"
  - "Node.js used for JSON operations (already a prerequisite) instead of jq"
  - "Re-install preserves model_overrides from existing config"

patterns-established:
  - "Tier hierarchy: full > test > deploy > core with cascading capabilities"
  - "API key lives exclusively in shell profile, never in config files"
  - "MCP registration is best-effort (warn on failure, don't abort)"

requirements-completed: [INST-01, INST-02, INST-03]

# Metrics
duration: 2min
completed: 2026-03-01
---

# Phase 5 Plan 3: Install Infrastructure Summary

**Extended install.sh with tier selection UI, API key validation via /v2/models, MCP auto-registration, and .orq-agent/config.json creation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-01T08:46:33Z
- **Completed:** 2026-03-01T08:48:02Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Tier comparison table displayed during install with core/deploy/test/full selection
- API key validated against Orq.ai GET /v2/models endpoint before proceeding
- Idempotent shell profile injection (update-in-place or append) for ORQ_API_KEY
- MCP server auto-registered via claude mcp add for deploy+ tiers with fallback on failure
- Config file created with tier, model_profile (default "quality"), and MCP registration status
- Re-install scenario handled: detect existing config, offer to keep tier, preserve model_overrides

## Task Commits

Each task was committed atomically:

1. **Task 1: Add tier selection and API key validation to install script** - `0ce3ec3` (feat)

**Plan metadata:** [pending]

## Files Created/Modified
- `install.sh` - Extended from 181 to 340 lines with V2.0 capability setup (tier selection, API key validation, MCP registration, config creation, updated success banner)

## Decisions Made
- Config file stored at install directory (`$INSTALL_DIR/.orq-agent/config.json`) rather than project-relative, since tier and profile are global settings
- MCP server URL made configurable via `ORQAI_MCP_URL` environment variable (defaults to `https://mcp.orq.ai`) per research recommendation
- Used Node.js for JSON config file writing (already a prerequisite) rather than adding jq dependency
- Re-install preserves user's `model_overrides` from existing config to avoid losing customizations

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Install script ready for capability-gated commands (deploy, test, iterate)
- Config file format established for capability gate function in command files
- Shell profile injection pattern established for API key management
- MCP registration in place for Phase 6 deploy operations

---
*Phase: 05-references-install-and-capability-infrastructure*
*Completed: 2026-03-01*
