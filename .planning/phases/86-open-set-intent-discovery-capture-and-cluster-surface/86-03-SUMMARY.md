---
phase: 86-open-set-intent-discovery-capture-and-cluster-surface
plan: 03
subsystem: intent-proposals
tags: [ui, discovery-surface, rsc, server-actions, telemetry, read-only]
requires:
  - public.intent_proposal_clusters (Plan 01 snapshot table — RSC read source)
  - public.intent_proposal_views (Plan 01 telemetry table — server-action insert target)
  - web/lib/automations/intent-proposals/types.ts (ClusterRow shape)
  - "Inngest event intent-proposals.refresh (Plan 02 — fired by the manual refresh button)"
provides:
  - DiscoveryTabStrip peer component (web/app/(dashboard)/automations/[swarm]/_shell/discovery-tab-strip.tsx)
  - Intent Proposals RSC page (web/app/(dashboard)/automations/[swarm]/intent-proposals/page.tsx)
  - Intent Proposals client shell (web/app/(dashboard)/automations/[swarm]/intent-proposals/client-shell.tsx)
  - logTabView + triggerRefresh server actions (web/app/(dashboard)/automations/[swarm]/intent-proposals/actions.ts)
affects:
  - none (no edits to derive-stage-tabs.ts, no edits to stage-X pages, no edits to layout.tsx — none exists at the [swarm] segment)
tech_stack:
  added: []
  patterns:
    - "Peer tab strip (string-literal key union) — alternative to widening the locked numeric stage literal-union (drift #3 resolution)"
    - "Native <details>/<summary> expandable rows — no third-party accordion"
    - "Server-stamped operator_id + user_agent for telemetry (trust boundary lock — never trust client input)"
    - "Best-effort telemetry: useEffect → try/catch on logTabView so the surface still renders if telemetry insert fails"
    - "Client-side 5s debounce on refresh button (defensive double-click protection on top of the 5min server-side debounce from the cron)"
    - "RSC + 'use client' shell split: heavy data load in page.tsx, interaction in client-shell.tsx"
key_files:
  created:
    - web/app/(dashboard)/automations/[swarm]/_shell/discovery-tab-strip.tsx
    - web/app/(dashboard)/automations/[swarm]/_shell/__tests__/discovery-tab-strip.test.tsx
    - web/app/(dashboard)/automations/[swarm]/intent-proposals/page.tsx
    - web/app/(dashboard)/automations/[swarm]/intent-proposals/client-shell.tsx
    - web/app/(dashboard)/automations/[swarm]/intent-proposals/actions.ts
    - web/app/(dashboard)/automations/[swarm]/intent-proposals/__tests__/client-shell.test.tsx
  modified: []
decisions:
  - "Did NOT create [swarm]/layout.tsx — the existing shell pattern is per-page mount of StageTabStrip + DiscoveryTabStrip. Introducing a layout.tsx would require modifying all five stage-X pages to remove their StageTabStrip mounts, which is out-of-scope churn for Wave 3 (Rule 3 deviation)"
  - "DiscoveryTabStrip is mounted only in intent-proposals/page.tsx. Cross-navigation FROM stage-X pages TO the discovery tab is deferred — operators reach Intent Proposals via the route directly today. Adding a strip mount to each stage-X page is a follow-up (single-line mount edit per page)"
  - "actions.ts triggerRefresh sends an empty payload (`data: {}`). The Events schema declares `operator_id?: string` as optional, but TS requires the `data` key be present. The operator's identity is captured via intent_proposal_views, not the Inngest event payload"
  - "cross-swarm dropdown visibility (RESEARCH Q3 default — hide if only one swarm has clusters) is computed in page.tsx via a distinct-swarm SELECT on intent_proposal_clusters, passed as a boolean prop"
  - "T5 test asserts read-only via HTML word-search — locks the no-promote/no-approve/no-dismiss/no-reject contract at the rendered output, NOT just at the source-code level"
metrics:
  duration_minutes: 15
  completed_at: 2026-05-20T17:50:00Z
  tasks_completed: 3
  files_created: 6
  files_modified: 0
  commits: 3
---

# Phase 86 Plan 03: Intent Proposals Bulk Review Surface Summary

Peer-of-StageTabStrip DiscoveryTabStrip + read-only RSC page + client shell
that surface the Plan 02 cluster snapshots to operators. Wave 3 of Phase 86 —
this is the only Phase-86 deliverable the operator can actually see; without
it Waves 1 and 2 die in obscurity.

## Tasks Completed

| # | Task | Commit | Files |
|---|---|---|---|
| 1 | DiscoveryTabStrip peer component + RTL tests | `90218176` | `_shell/discovery-tab-strip.tsx`, `_shell/__tests__/discovery-tab-strip.test.tsx` |
| 2 | RSC page + client shell + server actions | `c2fecf2d` | `intent-proposals/page.tsx`, `intent-proposals/client-shell.tsx`, `intent-proposals/actions.ts` |
| 3 | Client shell RTL coverage | `43fa078d` | `intent-proposals/__tests__/client-shell.test.tsx` |

## Verified Locally

- `npx vitest run discovery-tab-strip client-shell` → **15/15 passing** (~1.2s)
  - 7 DiscoveryTabStrip tests (derive logic + present-condition + render + aria-current)
  - 8 IntentProposalsClientShell tests (empty state, cluster cards, refresh, telemetry, read-only lock, cross-swarm dropdown)
- `npx tsc --noEmit` → **exit 0**, zero errors.
- `grep -nE "const\s+send\s*=\s*inngest\.send"` in actions.ts → **0 matches** (no destructure — Phase 65 this-binding pitfall avoided).
- `grep "No novel intent proposals yet"` in client-shell.tsx → **1 match** (D-06 empty state copy verbatim).
- `git diff --stat HEAD~3 HEAD -- _shell/derive-stage-tabs.ts` → **empty** (locked file untouched per drift #3).

## Architecture Truth

### Drift #3 resolution lands as designed

`derive-stage-tabs.ts` was not touched — its `StageTab.stage` literal-union
(`0|1|2|3|4`) and `FIXED` array remain RFC-architecture-locked. The new
`DiscoveryTab.key` union starts at one literal (`"intent-proposals"`) and is
designed to extend with V9.0 Learning Inbox + V11.0 Handler queue keys
without touching the stage strip.

### Hard separation preserved (docs/agentic-pipeline/README.md)

- `page.tsx` reads from `intent_proposal_clusters` only. It does NOT read
  `swarm_noise_categories` and does NOT read `swarm_intents` (the cluster
  snapshot is sourced from `pipeline_events.decision_details` via the
  Plan 01 `intent_proposals_v1` view).
- `actions.ts` writes to `intent_proposal_views` (telemetry) and fires the
  `intent-proposals.refresh` Inngest event. It does NOT write
  `swarm_intents` and never reaches the Stage 3 coordinator.
- `client-shell.tsx` exposes NO promote / approve / dismiss / reject
  affordance — V9.0 Learning Inbox owns promotion. T5 test locks this at
  the rendered HTML level.

### Trust boundary (actions.ts)

- `operator_id` is server-stamped from `supabase.auth.getUser()` — the client
  argument is ignored entirely (the LogTabViewInput zod schema does not
  even accept it).
- `user_agent` is server-read from `headers()` — also not trusted from the
  client.
- `cluster_id` is the only client-supplied field and is constrained to
  `z.string().uuid().nullable().optional()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Did NOT create `[swarm]/layout.tsx`**
- **Found during:** Task 1 layout-wiring step.
- **Issue:** Plan `files_modified` listed `web/app/(dashboard)/automations/[swarm]/layout.tsx` and the action body says "Edit layout.tsx: render DiscoveryTabStrip after StageTabStrip". That file does not exist at the `[swarm]` segment — every stage-X page mounts `StageTabStrip` itself (verified in `stage-3/page.tsx:211`). Creating a layout.tsx that wraps `{children}` would either (a) double-mount the StageTabStrip on stage-X pages, or (b) require gutting the StageTabStrip mounts from each of the five stage-X page.tsx files, which is out of Wave 3 scope.
- **Fix:** Mount `DiscoveryTabStrip` directly in `intent-proposals/page.tsx` immediately after `PageHeader`. This satisfies the Wave 3 spec for the Intent Proposals page itself. Cross-navigation from stage-X pages → Intent Proposals is deferred to a follow-up (single-line mount per stage-X page).
- **Files modified:** None outside the intent-proposals route.
- **Commit:** `c2fecf2d`

**2. [Rule 1 — Bug / type honesty] `inngest.send` requires `data` key even when payload schema allows it to be empty**
- **Found during:** Task 2 GREEN tsc check.
- **Issue:** First `tsc` after writing `actions.ts` errored:
  `Property 'data' is missing in type '{ name: "intent-proposals.refresh"; }'`. The Events schema declares `data: { operator_id?: string }` — all fields optional, but the `data` key itself is required by Inngest's `SendEventPayload`.
- **Fix:** Pass `data: {}` explicitly. Operator identity is captured via `intent_proposal_views`, not the event payload.
- **Files modified:** `actions.ts:65`
- **Commit:** `c2fecf2d`

**3. [Rule 2 — Critical correctness] Server-stamped `operator_id` + `user_agent` in `logTabView`**
- **Found during:** Task 2 design (trust boundary review).
- **Issue:** Plan's `LogTabViewInput` interface allowed the client to supply `operator_id` and `user_agent`. Trusting client-supplied operator_id breaks the R-03 mitigation (telemetry needs a trustworthy operator identity).
- **Fix:** `LogTabViewInput` zod schema accepts only `swarm_type` and `cluster_id`. `operator_id` is read server-side from `supabase.auth.getUser()`; `user_agent` is read from the `headers()` API. The plan's draft input shape that included these as client fields was tightened.
- **Files modified:** `actions.ts:34-58`
- **Commit:** `c2fecf2d`

### Architectural Changes

None.

## File-Level Layout

```
web/app/(dashboard)/automations/[swarm]/
  _shell/
    discovery-tab-strip.tsx           ← new peer component (drift #3)
    __tests__/
      discovery-tab-strip.test.tsx    ← 7 RTL tests
  intent-proposals/                   ← new route segment
    page.tsx                          ← RSC entry (loadSwarm + cluster SELECT)
    client-shell.tsx                  ← 'use client' UI (read-only)
    actions.ts                        ← logTabView + triggerRefresh
    __tests__/
      client-shell.test.tsx           ← 8 RTL tests
```

## Tab Placement (actual)

The DiscoveryTabStrip is mounted in `intent-proposals/page.tsx` immediately
after `PageHeader`. The page does NOT also mount `StageTabStrip` — operators
reach the intent-proposals route from the address bar or from a follow-up
cross-link, not from the stage tab strip. Adding the StageTabStrip back into
the discovery page is a one-line follow-up if cross-strip navigation is
desired; it was omitted here because:

1. The plan's contract is "DiscoveryTabStrip rendered BELOW StageTabStrip" —
   on the intent-proposals page the StageTabStrip would not have a meaningful
   `currentStage` value (none of the 5 stages is active here).
2. The DiscoveryTabStrip's own `current="intent-proposals"` prop carries the
   active-state information for this surface.

If product preference is to render both strips on discovery pages with the
stage strip showing no active tab, that is a single-line change.

## Cross-Swarm Dropdown Visibility

`page.tsx` runs a second SELECT against `intent_proposal_clusters` to
discover the distinct swarm count. If `>1` distinct swarm has at least one
cluster row, `crossSwarmDropdownVisible=true` is passed to the client shell;
otherwise the dropdown is hidden (RESEARCH Q3 default). Until Phase 85 V3
emit has ramped up across multiple swarms, the dropdown will stay hidden
naturally — no operator-confusing empty dropdown.

## Empty State Copy (D-06 verbatim)

```
Title: "No novel intent proposals yet"
Body:  "The classifier flags emails that don't fit existing intents. Wait
        for the first week of live traffic."
```

Locked at the source level (`client-shell.tsx:30-33`) and verified at the
rendered-HTML level (`client-shell.test.tsx` T1).

## Refresh Flow

1. Operator clicks the "Refresh" button.
2. Client immediately disables the button + shows "Refreshing…" + sets a
   5-second `setTimeout` to re-enable.
3. `triggerRefresh()` server action fires `inngest.send({ name:
   "intent-proposals.refresh", data: {} })`.
4. The Plan 02 cron handler receives the event, applies its 5-minute
   server-side debounce, and (if it proceeds) re-clusters the last 30 days
   of proposals.
5. Result message shows under the header: either "Refresh queued. New
   clusters appear after the next cron tick." or "Refresh failed: …".

The 5-second client debounce is purely defensive against double-clicks; the
real protection against refresh storms is the 5-minute server-side debounce
inside the cron handler.

## Telemetry Flow

`useEffect(() => { logTabView({ swarm_type, cluster_id: null }) }, [])` —
fires exactly once on mount. `swarm_type` is `null` when `filter === "all"`
(admin overview) and the current swarm otherwise. T4 + T4b tests lock both
branches.

The insert is wrapped in `try/catch` with a `console.warn` — failed
telemetry does NOT crash the surface. This satisfies R-03 (telemetry is
best-effort signal, not load-bearing infrastructure).

## Known Stubs

None. The surface is complete:

- Cluster cards expand to show `member_labels` + `sample_email_ids` +
  the cluster window range.
- Empty state renders verbatim when no clusters exist.
- Cross-swarm dropdown auto-hides when only one swarm has clusters.

The `intent_proposal_clusters` table is currently empty (Plan 02 cron is
registered but not yet observed in production; Phase 85 V3 emit is ramping).
This is the documented post-deploy steady state, not a stub — the empty
state copy is exactly what operators see today.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-route | `intent-proposals/page.tsx` | New authenticated route. notFound() when swarm unknown or `stage3_coordinator_agent_key` is null. Uses `admin` client for cluster SELECTs (RLS on the table is service-role-only per Plan 01) — caller auth is enforced upstream by the `(dashboard)` layout. |
| threat_flag: new-server-action | `actions.ts logTabView` | INSERT into `intent_proposal_views`. operator_id + user_agent server-stamped; cluster_id zod-validated as nullable uuid. Telemetry table is service-role-only per Plan 01. |
| threat_flag: new-server-action | `actions.ts triggerRefresh` | Fires Inngest event `intent-proposals.refresh`. The event handler itself debounces 5min server-side, so worst-case storm = 1 unnecessary refresh per 5 minutes. No new HTTP egress; Inngest send is internal. |

All three surfaces are read-only/telemetry-only — no privileged side effects.

## TDD Gate Compliance

Plan declares `type: execute` (not `type: tdd`), so the plan-level
RED/GREEN/REFACTOR gate does not apply.

Per-task `tdd="true"` was honoured at the file-pair level:

| Task | Test Commit | Implementation Commit |
|---|---|---|
| 1 | Tests + impl shipped together (`90218176`) — RED was verified locally before the impl write (vitest reported `MODULE_NOT_FOUND` for `../discovery-tab-strip`) | Same commit |
| 2 | n/a (no per-task tests for page/actions; integration is exercised via Task 3) | `c2fecf2d` |
| 3 | `43fa078d` (test commit follows impl from Task 2 — covers the Task 3 client-shell behavior locked in `c2fecf2d`) | Implementation lived in `c2fecf2d` |

Task 3 ships a `test(...)` commit AFTER the implementation rather than
before because the impl was committed under Task 2's umbrella to keep the
3-file page/actions/client-shell triplet atomic. The tests still pin the
behavior — any regression on empty-state copy, refresh wiring, telemetry
mount, or read-only contract will fail the suite.

## Self-Check: PASSED

**File-level (FOUND):**
- `web/app/(dashboard)/automations/[swarm]/_shell/discovery-tab-strip.tsx`
- `web/app/(dashboard)/automations/[swarm]/_shell/__tests__/discovery-tab-strip.test.tsx`
- `web/app/(dashboard)/automations/[swarm]/intent-proposals/page.tsx`
- `web/app/(dashboard)/automations/[swarm]/intent-proposals/client-shell.tsx`
- `web/app/(dashboard)/automations/[swarm]/intent-proposals/actions.ts`
- `web/app/(dashboard)/automations/[swarm]/intent-proposals/__tests__/client-shell.test.tsx`

**Commits (FOUND via `git log --oneline`):**
- `90218176` feat(86-03): DiscoveryTabStrip peer component
- `c2fecf2d` feat(86-03): Intent Proposals RSC page + server actions + client shell
- `43fa078d` test(86-03): IntentProposalsClientShell RTL coverage

**Verification gates (FOUND):**
- vitest: 15/15 passing (7 DiscoveryTabStrip + 8 IntentProposalsClientShell)
- tsc --noEmit: exit 0
- derive-stage-tabs.ts unchanged: `git diff` empty against HEAD~3
- D-06 empty-state copy verbatim in client-shell.tsx: 1 match
- `inngest.send` not destructured: 0 matches
- No promote/approve/dismiss/reject in rendered HTML: T5 test green

**Success criteria from plan:**
- [x] DiscoveryTabStrip is a separate component (peer to StageTabStrip), NOT a widening of derive-stage-tabs.ts
- [x] RSC page reads from `intent_proposal_clusters` snapshot table
- [x] Empty state copy matches D-06
- [x] Refresh button sends `intent-proposals.refresh` event via server action
- [x] Telemetry INSERT to `intent_proposal_views` fires on tab mount; operator_id server-stamped
- [x] Hard separation: no swarm_intents writes, no swarm_noise_categories reads
- [x] tsc --noEmit clean
- [x] Tests GREEN (component + page+actions exercised via client-shell)
- [x] No new npm dependencies
- [x] Cross-swarm dropdown auto-hidden when only one swarm has clusters (RESEARCH Q3)
- [x] Read-only — no promote/approve/dismiss/reject affordance (D-04)

**Post-deploy verification (NOT yet run — requires Vercel deploy + Supabase MCP):**
- [ ] Navigate to `/automations/debtor-email/intent-proposals` in production → 200 + empty state OR cluster cards
- [ ] First operator tab open writes one row to `intent_proposal_views`
- [ ] Refresh click within 5 min of last cron tick yields `{ skipped: "debounced" }` server-side (UI shows "Refresh queued" regardless — best-effort surface per design)
- [ ] Visual smoke vs sketch-findings-agent-workforce aesthetic

Deferred to the orchestrator's deploy + smoke phase.
