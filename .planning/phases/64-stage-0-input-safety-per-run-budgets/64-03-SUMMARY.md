---
phase: 64
plan: 03
subsystem: debtor-email
tags: [zapier-tools, allowlist, default-deny, intent, BUDG-02]
requirements: [BUDG-02]
dependency_graph:
  requires:
    - "Plan 64-01 (zapier_tools.allowed_for_intents column + backfill applied in Supabase)"
  provides:
    - "ToolNotAllowedForIntentError named export"
    - "callNxtTool(tool_id, input, intent) 3-arg signature"
    - "Default-deny intent allowlist enforcement before any HTTP POST to Zapier"
  affects:
    - "All callers of nxt-zap-client convenience exports must pass intent"
tech_stack:
  added: []
  patterns:
    - "Default-deny security guard (NULL or empty array → throws)"
    - "Test-only cache reset helper for module-scoped caches under vitest"
key_files:
  created: []
  modified:
    - "web/lib/automations/debtor-email/nxt-zap-client.ts"
    - "web/lib/automations/debtor-email/resolve-debtor.ts"
    - "web/lib/automations/debtor-email/__tests__/nxt-zap-client-allowlist.test.ts"
    - "web/tests/labeling/nxt-zap-client.test.ts"
decisions:
  - "Moved APP_URL guard to AFTER the allowlist check so default-deny fires regardless of env-var state (and so the Plan 01 RED scaffold can run with module-load-time env capture)."
  - "Added __resetZapierToolCacheForTests test-only export — needed because the registry cache is module-scoped and the RED scaffold mutates the row across test cases."
  - "Fixed a typo in Plan 01 RED test #1 (set tool_id=invoice_fetch but called identifier_lookup); corrected to identifier_lookup so the row is found and the allowlist guard becomes the failure surface."
metrics:
  duration_minutes: ~12
  tasks_completed: 2
  completed_date: "2026-04-30"
---

# Phase 64 Plan 03: Default-Deny Intent Allowlist on callNxtTool Summary

Implemented BUDG-02 (default-deny intent allowlist) by adding `ToolNotAllowedForIntentError`, extending `ZapierToolRow` + `loadTool` projection with `allowed_for_intents`, gating `callNxtTool` on intent immediately after registry load, and threading `intent: string` through every callsite + convenience export.

## Plan vs Reality

| Aspect | Planned | Actual |
|---|---|---|
| Tasks | 2 | 2 |
| Files modified | 2 (nxt-zap-client.ts + resolve-debtor.ts; plan also named invoice-copy-handler.ts which does not exist yet) | 4 (added the test scaffold + Plan 56 labeling test that share the signature) |
| RED test | 5 cases failing | 5/5 GREEN |
| Existing labeling tests | implicitly required to keep passing | 6/6 GREEN after intent threaded through TOOL_ROWS + callsites |

## Commits

| Task | Commit | Description |
|---|---|---|
| 1 | `0b19f59` | feat(64-03): default-deny intent allowlist on callNxtTool |
| 2 | `fc1bb02` | feat(64-03): thread intent through callNxtTool callsites |

## Callsite Inventory (output of Task 2 grep)

```
web/lib/automations/debtor-email/resolve-debtor.ts:91   lookupSenderToAccount(...)        intent="unknown"
web/lib/automations/debtor-email/resolve-debtor.ts:123  lookupIdentifierToAccount(...)    intent="unknown"
web/lib/automations/debtor-email/resolve-debtor.ts:139  lookupCandidateDetails(...)       intent="unknown"
web/lib/automations/debtor-email/resolve-debtor.ts:180  lookupCandidateDetails(...)       intent="unknown"
web/tests/labeling/nxt-zap-client.test.ts:148           callNxtTool("nxt.contact_lookup") intent="unknown"
web/tests/labeling/nxt-zap-client.test.ts:207           callNxtTool("nxt.contact_lookup") intent="unknown"
web/tests/labeling/nxt-zap-client.test.ts:229           callNxtTool("nxt.legacy_sync")    intent="unknown"
web/tests/labeling/nxt-zap-client.test.ts:248           callNxtTool("nxt.contact_lookup") intent="unknown"
web/tests/labeling/nxt-zap-client.test.ts:267           callNxtTool("nxt.contact_lookup") intent="unknown"
web/tests/labeling/nxt-zap-client.test.ts:284           callNxtTool("nxt.contact_lookup") intent="unknown"
```

Total production callsites updated: **4** (all in resolve-debtor.ts; all `intent="unknown"`).
Total test callsites updated: **6** (label-resolver test fixtures).

## Live Supabase Backfill ↔ Caller Intent Compatibility

Verified per the orchestrator's context note (migration applied; allowlists wired):

| Tool | Live `allowed_for_intents` | Production caller intent | Compatible? |
|---|---|---|---|
| `nxt.contact_lookup` | `['unknown', 'invoice_copy_request']` | `'unknown'` | yes |
| `nxt.identifier_lookup` | `['unknown', 'invoice_copy_request']` | `'unknown'` | yes |
| `nxt.candidate_details` | `['unknown', 'invoice_copy_request']` | `'unknown'` | yes |
| `nxt.invoice_fetch` | `['invoice_copy_request']` | n/a (no caller in this plan; future invoice-copy-handler) | reserved |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocker] Module-scoped registry cache leaked between test cases**
- **Found during:** Task 1 verification.
- **Issue:** `loadTool`'s 60-second cache is module-scoped. Across vitest tests in the same file the module is loaded once, so the first test's `setRegistryRow` data persisted; subsequent tests' mocks were never invoked.
- **Fix:** Added `__resetZapierToolCacheForTests()` named export and called it from the test scaffold's `beforeEach`. No production behavior change.
- **Files modified:** `web/lib/automations/debtor-email/nxt-zap-client.ts`, `web/lib/automations/debtor-email/__tests__/nxt-zap-client-allowlist.test.ts`
- **Commit:** `0b19f59`

**2. [Rule 1 — Bug] Plan 01 RED scaffold typo (tool_id mismatch in test #1)**
- **Found during:** Task 1 verification.
- **Issue:** Test #1 (NULL allowlist) set `tool_id: "nxt.invoice_fetch"` on the registry row but called `callNxtTool("nxt.identifier_lookup", ...)`. With matching tool_id absent from the cache map, the failure surface was "tool not found" — not the allowlist guard.
- **Fix:** Changed the row's `tool_id` to `"nxt.identifier_lookup"` so the lookup succeeds and the allowlist guard becomes the rejection surface (which is what the test asserts).
- **Files modified:** `web/lib/automations/debtor-email/__tests__/nxt-zap-client-allowlist.test.ts`
- **Commit:** `0b19f59`

**3. [Rule 1 — Bug] APP_URL guard ordering caused early-throw before allowlist**
- **Found during:** Task 1 verification.
- **Issue:** The plan said the default-deny guard fires "AFTER `loadTool` and BEFORE the `tool.pattern !==` check", but the existing `if (!APP_URL)` check ran BEFORE `loadTool`. The `APP_URL` constant is captured at module-load time, and the test scaffold's `beforeEach` sets the env var too late — so APP_URL was undefined and the function threw an unrelated error before reaching the allowlist guard.
- **Fix:** Moved the `if (!APP_URL)` check to AFTER both `loadTool` and the allowlist guard. This both (a) honors the plan's ordering spec and (b) gives the allowlist guard primacy as a security control. The existing "throws when NEXT_PUBLIC_APP_URL is unset" test in `tests/labeling/nxt-zap-client.test.ts` still passes because that test's row + intent satisfy the allowlist before the APP_URL check fires.
- **Files modified:** `web/lib/automations/debtor-email/nxt-zap-client.ts`
- **Commit:** `0b19f59`

**4. [Rule 1 — Bug] Existing labeling test (Plan 56) became broken by the new mandatory `intent` arg**
- **Found during:** Task 2 (`tsc --noEmit` reported 5 callsites needing 3 args).
- **Issue:** `web/tests/labeling/nxt-zap-client.test.ts` is a Plan 56 test that exercises happy-path flow. It mocks the registry but its `TOOL_ROWS` lacked `allowed_for_intents`, so under the new default-deny guard every call would be rejected.
- **Fix:** Added `allowed_for_intents` to all three TOOL_ROWS entries and threaded `intent="unknown"` through the 5 callsites (including the type-cast `legacy_sync` callsite in test #3). Tests still assert their original behaviors (HTTP POST shape, brand_id validation, sync-pattern rejection, missing env-var rejection, Zod parse failure).
- **Files modified:** `web/tests/labeling/nxt-zap-client.test.ts`
- **Commit:** `fc1bb02`

### Out-of-scope Pre-existing Issues (NOT fixed)

`tsc --noEmit` also reports pre-existing errors in:
- `lib/inngest/functions/__tests__/budget-breach-handler.test.ts` — RED scaffold for a future Plan 64-04/05 module not yet implemented.
- `lib/inngest/functions/__tests__/stage-0-safety-worker.test.ts` — RED scaffold for Stage 0 worker (different plan).
- `lib/stage-0/__tests__/{budget-counter,llm-verdict,regex-screen}.test.ts` — RED scaffolds for sibling plans in this phase.

Per the deviation scope rule (only fix issues directly caused by THIS plan's changes), these are out of scope. They are Plan 64-01 RED scaffolds owned by other 64-0X plans.

## Authentication Gates

None encountered. The plan was fully autonomous.

## Verification

| Step | Command | Result |
|---|---|---|
| 1 | `npx vitest run lib/automations/debtor-email/__tests__/nxt-zap-client-allowlist.test.ts` | 5/5 GREEN |
| 2 | `npx vitest run tests/labeling/nxt-zap-client.test.ts lib/automations/debtor-email/__tests__/` | 11/11 GREEN |
| 3 | `npx tsc --noEmit` | Zero errors in this plan's scope; 9 pre-existing errors in other plans' RED scaffolds (out of scope). |
| 4 | `grep -rn "callNxtTool(" web/lib/ web/app/ \| grep -v __tests__` | All hits compile against new 3-arg signature. |

## Threat Flags

None — this plan implements an existing threat-model mitigation; no new threat surface introduced.

## Self-Check: PASSED

Verified files exist:
- `web/lib/automations/debtor-email/nxt-zap-client.ts` — FOUND (modified)
- `web/lib/automations/debtor-email/resolve-debtor.ts` — FOUND (modified)
- `web/lib/automations/debtor-email/__tests__/nxt-zap-client-allowlist.test.ts` — FOUND (modified)
- `web/tests/labeling/nxt-zap-client.test.ts` — FOUND (modified)

Verified commits exist:
- `0b19f59` — FOUND (Task 1)
- `fc1bb02` — FOUND (Task 2)
