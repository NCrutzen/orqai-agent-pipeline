# Phase 48: Foundation - Validation Strategy

**Status:** Deferred to post-execution
**Reason:** Phase 48 is a foundation phase that creates new components, tokens, database tables, and auth wiring. The components do not yet exist to test against.

## Approach

Tests will be added after Phase 48 execution via `/gsd:add-tests` or as part of Phase 49 when the components are consumed by real features.

## Test Map (from RESEARCH.md)

| Req ID | Behavior | Test Type | Notes |
|--------|----------|-----------|-------|
| AUTH-01 | Microsoft SSO button calls signInWithOAuth with azure provider | unit | Post-execution |
| AUTH-02 | OAuth identity linking | manual-only | Verified with real Microsoft account during checkpoint |
| AUTH-03 | Users without project_members redirected to access-pending | unit | Post-execution |
| DS-01 | Font CSS variables injected on html element | unit | Post-execution |
| DS-02 | ThemeProvider renders with data-theme attribute | unit | Post-execution |
| DS-03 | V7 tokens present in globals.css, existing tokens unchanged | manual-only | Visual regression |
| DS-04 | GlassCard component renders with correct CSS classes | unit | Post-execution |
| RT-02 | agent_events table exists with correct columns | integration | Verified via REST API probe |
| RT-03 | swarm_jobs table exists with correct columns | integration | Verified via REST API probe |
| RT-04 | swarm_agents table exists with correct columns | integration | Verified via REST API probe |

## Verification During Execution

Each plan has automated `<verify>` commands that confirm correctness at execution time:
- Plan 01: `next build` + grep checks for tokens, fonts, theme config
- Plan 02: REST API probes for all 4 tables returning HTTP 200
- Plan 03: `next build` + human verification of SSO flow
