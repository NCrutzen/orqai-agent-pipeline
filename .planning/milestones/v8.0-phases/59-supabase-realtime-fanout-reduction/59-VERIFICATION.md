---
phase: 59-supabase-realtime-fanout-reduction
verified: 2026-04-26T13:17:00Z
status: human_needed
score: 10/10 must-haves verified (automated)
overrides_applied: 0
human_verification:
  - test: "Trigger a bridge tick and observe the swarm dashboard"
    expected: "agent_events list refreshes within 2s; no postgres_changes subscription for agent_events visible in browser devtools WS frames; 15s poll SELECT fires every 15s"
    why_human: "Cannot start the Vercel dev server or Inngest worker in this verification environment"
  - test: "Trigger an automation_runs write (e.g. approve one item in debtor-email-review) and observe the automation board on two tabs"
    expected: "Exactly ONE broadcast on automations:debtor-email-review:stale visible in Supabase Realtime inspector or Vercel logs; both tabs refetch within ~2s; a tab subscribed to a different automation does NOT refetch"
    why_human: "Requires live Supabase connection + authenticated browser session"
  - test: "Trigger a pipeline run and observe run-detail page staleness"
    expected: "Step status updates appear within 500ms perceived (debounce window); chat messages appear immediately without coalescing; no regressions on run-detail UX"
    why_human: "Requires running pipeline infra"
  - test: "Record Supabase realtime metric 24h post-merge (D-04)"
    expected: "Extrapolated monthly message volume < 2M (50% margin under the 5.5M cap)"
    why_human: "Requires reading Supabase dashboard at a future timestamp"
---

# Phase 59 — Supabase Realtime Fan-out Reduction: Verification Report

**Phase Goal:** Eliminate realtime fan-out hot paths by replacing high-volume postgres_changes subscriptions with broadcast-driven refetch and adding a debounce on broadcast emits.

**Verified:** 2026-04-26T13:17:00Z
**Status:** human_needed (all automated checks PASS; 4 behavioral/metric checks require live infra)
**Re-verification:** No — initial verification

---

## Pre-execution answers (carried from skeleton)

**automation_runs external-writer check (Plan 59-02 Task 1, W1)**

User confirmed 2026-04-26: "No. Zapier only triggers webhooks on Vercel when a new email is received; all writes to `automation_runs` go through Vercel API routes / Inngest functions in this repo."

Decision: App-layer emission is sufficient. Postgres trigger NOT required. Plan 59-02 proceeded as written.

---

## Realtime metric snapshots (D-04)

### Pre-merge baseline

_To be filled at start of execution._

- Date/time:
- Realtime messages (last 24h):
- Extrapolated monthly:
- Source: Supabase dashboard / Management API

### Post-merge (24h after Phase 59 ships)

_To be filled 24h after merge._

- Date/time:
- Realtime messages (last 24h):
- Extrapolated monthly:
- Margin under 5.5M cap:
- Pass criterion: extrapolated monthly < 2M (50% margin)

---

## Commits

| Commit | Message |
|--------|---------|
| `56efd97` | docs(59): record no-external-writers answer for plan 59-02 Task 1 |
| `8e6759d` | perf(realtime): swap agent_events postgres_changes for batched broadcast (Phase 59 D-01) |
| `52f77ba` | perf(59-02): replace automation_runs postgres_changes with single-channel broadcast |
| `e6fc407` | perf(realtime): add 500ms debounce to step/run broadcasts (Phase 59 D-03) |

All 4 commits are on `main`.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Bridge sync ticks emit exactly 1 broadcast per swarm at end-of-tick instead of postgres_changes msgs | VERIFIED | `sync.ts:773-779` — `admin.channel('swarm:${swarmId}').send({event: 'events-stale'})` after all row writes, wrapped in try/catch |
| 2 | Swarm dashboard listens for events-stale broadcast and calls fetchSnapshot() | VERIFIED | `swarm-realtime-provider.tsx:139` — `.on("broadcast", { event: "events-stale" }, () => { fetchSnapshot(); })` |
| 3 | 15s setInterval poll retained as safety net | VERIFIED | `swarm-realtime-provider.tsx` — `setInterval(fetchSnapshot, 15_000)` retained per summary; postgres_changes listener replaced, poll untouched |
| 4 | agent_events postgres_changes subscription is GONE from swarm-realtime-provider | VERIFIED | grep for "agent_events" in provider returns only the SELECT inside fetchSnapshot (line 95) and a comment (lines 125-131) — no `.on("postgres_changes", ... table: "agent_events" ...)` block |
| 5 | orqai-trace-sync emits events-stale broadcast | VERIFIED | `orqai-trace-sync.ts:280-296` — `.send({event: "events-stale"})` gated on `insertedThisSwarm > 0`, try/catch |
| 6 | automation_runs unfiltered postgres_changes subscription is replaced with broadcast-driven refetch | VERIFIED | `automation-realtime-provider.tsx` — no `postgres_changes` string present; `.channel('automations:${name}:stale').on("broadcast", { event: "stale" }, () => { refetch(); })` per automation name |
| 7 | AutomationRealtimeProvider contract is `automations: string[]` with `.in("automation", automations)` SELECT — no `prefix` prop, no LIKE filter | VERIFIED | `automation-realtime-provider.tsx:37` — `automations: string[]`; line 66 — `.in("automation", automations)`; no `prefix` prop, no LIKE |
| 8 | All 9 app-layer automation_runs writers call emitAutomationRunStale exactly once per write | VERIFIED | grep across `web/` returns 10 files (1 export + 9 writers): all 9 plan-inventory files confirmed — debtor-email/ingest (6 calls), debtor/create-draft (1), debtor/fetch-document (1), debtor-email-cleanup (2), debtor-email-review/actions (8), prolius-report (2), uren-controle (2), heeren-oefeningen (3), debtor-email-icontroller-cleanup-worker (3) |
| 9 | broadcastStepUpdate and broadcastRunUpdate route through 500ms debounce; chat paths bypass | VERIFIED | `broadcast.ts:74-130` — `debouncedSend()` called from both; `broadcastChatMessage`, `createChatBroadcaster.send`, `broadcastHealthUpdate` use direct `.send()` with bypass comments |
| 10 | Public API of broadcast.ts is unchanged; zero diff in pipeline.ts and pipeline/*-action.ts | VERIFIED | `git diff 56efd97..HEAD -- web/lib/inngest/functions/pipeline.ts web/lib/pipeline/conversation-action.ts web/lib/pipeline/discussion-action.ts` produces empty output (drift gate passes) |

**Score:** 10/10 truths verified (automated)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `web/lib/automations/swarm-bridge/sync.ts` | events-stale broadcast emission at end of syncSwarmBridge | VERIFIED | Lines 767-786 — try/catch broadcast on `swarm:${swarmId}` |
| `web/lib/inngest/functions/orqai-trace-sync.ts` | events-stale broadcast emission at end of trace-sync run | VERIFIED | Lines 280-296 — gated on `insertedThisSwarm > 0` |
| `web/components/v7/swarm-realtime-provider.tsx` | broadcast listener replaces agent_events postgres_changes block | VERIFIED | Line 139 — `.on("broadcast", { event: "events-stale" }, ...)` |
| `web/lib/automations/runs/emit.ts` | emitAutomationRunStale(admin, automation) helper | VERIFIED | File exists; exports `emitAutomationRunStale`; single broadcast on `automations:${automation}:stale`, errors swallowed |
| `web/components/automations/automation-realtime-provider.tsx` | broadcast-driven refetch; N channels; `.in()` SELECT | VERIFIED | Lines 37, 53-84, 66 — `automations: string[]`, `.in("automation", automations)`, N channels |
| `web/components/automations/agent-run-board.tsx` | passes automations list; derives commonPrefix internally for card/drawer compat | VERIFIED | Line 93 — `<AutomationRealtimeProvider automations={props.automations}>`; `commonPrefix()` helper lines 74-91 |
| `web/lib/automations/swarm-registry.ts` | AutomationBackedSwarm.automations: string[] field | VERIFIED | Lines 28-56 — `automations: string[]` field; debtor-email swarm carries 4 names |
| `web/lib/supabase/broadcast.ts` | in-module debounce; chat path bypasses | VERIFIED | Lines 54-108 — `debounceMap`, `debouncedSend`, `flushDebounced`; chat functions untouched |
| `web/lib/supabase/__tests__/broadcast.test.ts` | vitest unit test for debounce behavior | VERIFIED | 17/17 tests pass |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `sync.ts` → swarmId | `swarm:${swarmId}` channel | `admin.channel().send({event: 'events-stale'})` | WIRED | Line 773 matches client listener channel name |
| `swarm-realtime-provider.tsx` | `fetchSnapshot()` | `.on('broadcast', { event: 'events-stale' })` | WIRED | Line 139 |
| 9 writer files | `automations:${automation}:stale` channel | `emitAutomationRunStale(admin, automation)` | WIRED | All 9 files import and call the helper |
| `automation-realtime-provider.tsx` | N Supabase channels (one per name) | `.channel('automations:${name}:stale').on("broadcast", { event: "stale" }, refetch)` | WIRED | Lines 81-87 |
| `automation-realtime-provider.tsx` SELECT | `automation_runs` | `.in('automation', automations)` | WIRED | Line 66 |
| `broadcastStepUpdate` / `broadcastRunUpdate` | `debouncedSend()` | `Map<key, {timer, payload}>` | WIRED | Lines 128-129, 142-144 |
| `broadcastChatMessage` / `createChatBroadcaster.send` | direct `admin.channel().send()` | untouched code path | WIRED (bypass) | Lines 180-215 — no debouncedSend() |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Vitest debounce suite | `pnpm vitest run lib/supabase/__tests__/broadcast.test.ts` | 17/17 passed | PASS |
| tsc clean (no new errors) | `pnpm tsc --noEmit` | 9 errors, all pre-existing (@dnd-kit/*, @orq-ai/node, .next/dev/types) — zero new errors from Phase 59 | PASS |
| Drift gate: pipeline.ts and pipeline/*-action.ts unchanged | `git diff 56efd97..HEAD -- web/lib/inngest/functions/pipeline.ts web/lib/pipeline/conversation-action.ts web/lib/pipeline/discussion-action.ts` | Empty output | PASS |
| emitAutomationRunStale in 10 files (1 export + 9 writers) | grep across web/ | 10 files confirmed | PASS |

---

### Anti-Patterns Found

| File | Pattern | Severity | Assessment |
|------|---------|----------|------------|
| None | — | — | No stubs, no placeholder returns, no hardcoded empty data found in Phase 59 files |

The `try/catch` blocks in sync.ts, orqai-trace-sync.ts, and emit.ts swallow broadcast failures intentionally — they log and do not throw. This is the specified behavior (D-01/D-02 trade-off: broadcast failure must not break the write path; the 15s poll and manual refresh are the safety nets). Not a stub.

---

### Human Verification Required

#### 1. Swarm dashboard live update via broadcast

**Test:** Deploy to staging/production. Open `/swarm/{swarmId}` for a swarm with an active bridge cron. Wait for or manually trigger a bridge tick. Watch the agent_events list.
**Expected:** List refreshes within 2s. In browser devtools WS frames, confirm no `postgres_changes` messages arrive for `agent_events`. Confirm a SELECT on `agent_events` fires every 15s (safety-net poll).
**Why human:** Requires live Vercel + Supabase Realtime + Inngest bridge worker.

#### 2. Automation review board broadcast isolation

**Test:** Open two browser tabs on the same project page (debtor-email swarm). Trigger one automation_runs write (e.g. approve one item in the review board). Open a third tab on a different automation's page.
**Expected:** Exactly ONE broadcast on `automations:debtor-email-review:stale` per write visible in Vercel logs. Both debtor-email tabs refetch within ~2s. The third tab does NOT trigger a refetch.
**Why human:** Requires authenticated browser session + live Supabase Realtime.

#### 3. Pipeline run broadcast debounce UX check

**Test:** Trigger a pipeline run from the web UI. Watch the run-detail page.
**Expected:** Step status updates appear within ≤500ms perceived latency (debounce is not user-visible). Chat messages appear immediately, each message distinct (no coalescing). No regressions on run-detail page.
**Why human:** Requires running pipeline infra + live browser session.

#### 4. Realtime metric snapshot (D-04)

**Test:** Read Supabase dashboard realtime metrics at 24h post-merge.
**Expected:** Observed daily rate × 30 < 2M messages/month (50% margin under 5.5M cap). Fill in the "Post-merge (24h after Phase 59 ships)" section above.
**Why human:** Requires Supabase dashboard access at a future timestamp; cannot be polled in advance.

---

### Gaps Summary

No automated gaps found. All 10 must-have truths are VERIFIED by code inspection, grep, vitest (17/17), tsc (zero new errors), and the drift gate.

The 4 human verification items are behavioral/observability checks that require live infrastructure — they are not evidence of missing implementation. The code delivering each behavior is present and wired.

---

_Verified: 2026-04-26T13:17:00Z_
_Verifier: Claude (gsd-verifier)_
