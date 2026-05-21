---
phase: 59-supabase-realtime-fanout-reduction
type: context
status: locked
discussed_on: 2026-04-26
---

# Phase 59 — Supabase Realtime fan-out reduction

<domain>
Reduce Supabase realtime message volume below the 5.5M/mo cap by changing how the v7 dashboard and automation review board subscribe to row changes. The fix attacks the subscription architecture (postgres_changes hot paths, unfiltered subscriptions, un-debounced broadcasts) so volume doesn't grow back into the cap as automation usage scales.
</domain>

<scope>
**In scope:**
1. `agent_events` postgres_changes subscription (hot table — pipeline runs insert hundreds of span rows per run).
2. `automation_runs` unfiltered subscription (every row change broadcasts to every connected dashboard tab).
3. `pipeline.ts` broadcast call sites (22 sites; rapid status flips emit one msg per flip with no debouncing).

**Out of scope:**
- Reducing Supabase Storage / Database usage (different metrics, not over cap).
- Replacing Realtime entirely with polling (would regress dashboard UX).
- Refactoring the broadcast.ts API surface — additive changes only, all 22 callers stay backward-compatible.
- Generic `useRealtimeTable` consolidation audit (deferred).
- Low-churn subscriptions (`swarm_agents`, `swarm_briefings`) — keep as-is.

**Sequencing:** **Ship now, full scope.** Don't wait for the post-Phase-58 measurement window. Reasoning: hitting the 2026-05-26 grace deadline with margin matters more than risk of over-engineering. If Phase 58 already closed the gap, Phase 59 leaves headroom and we don't pay it back.
</scope>

<decisions>

### 1. `agent_events` strategy → Batched broadcast + refetch

**Locked:** Replace `agent_events` postgres_changes subscription in `web/components/v7/swarm-realtime-provider.tsx` with a broadcast-driven refetch.

**Mechanism:**
- Server-side: at the end of each bridge sync (in `web/lib/automations/swarm-bridge/sync.ts`) and at the end of orq-trace-sync runs (when re-enabled), emit `supabase.channel("swarm:${swarmId}").send({ type: "broadcast", event: "events-stale" })`.
- Client-side: replace the `agent_events` `.on("postgres_changes", ...)` chain on `swarm:${swarmId}` with a `.on("broadcast", { event: "events-stale" }, ...)` listener that triggers `fetchSnapshot()`.
- Keep the existing 15 s `setInterval` poll as a safety net (already there for dropped messages).

**Trade-offs accepted:**
- 1 batched broadcast per bridge tick replaces 50–200 row-level postgres_changes msgs per tick — ~99% volume cut on this path.
- Latency stays ≤2 s within business hours (broadcast fires immediately on bridge completion; client refetches in <1 s).
- `applyMutation` logic for events deletes — no longer needed for events; SELECT replaces it.

### 2. `automation_runs` strategy → Broadcast-driven refetch

**Locked:** Replace the unfiltered `automation_runs` postgres_changes subscription in `web/components/automations/automation-realtime-provider.tsx` with a broadcast-driven refetch.

**Mechanism:**
- Server-side: install a Postgres trigger on `automation_runs` (INSERT/UPDATE/DELETE) that calls `pg_notify` with `('automations:' || split_part(NEW.automation, '-', 1) || ':stale')`. App-layer alternative: emit the broadcast inside the write helpers (`web/lib/automations/runs/write.ts` or wherever rows are upserted) so we don't depend on Supabase Realtime listening to pg_notify.
- Client-side: subscribe to `automations:${prefix}:stale` broadcast channel; on event, refetch the existing SELECT (`automation_runs WHERE automation LIKE prefix%`).
- The prefix string (`debtor-email`, `uren-controle`, etc.) is computed at the call site, same place the SELECT runs — single source of truth.

**Why broadcast-driven, not a derived `automation_prefix` column:**
A generated column locks the grouping logic into write-time schema. Renames (`debtor-email-triage` → `debtor-email-v2-triage`) or splits (one automation becomes two) silently mis-route rows until you migrate. The refetch pattern keeps filter logic in one query that's easy to update — no migration to change grouping rules. Also consistent with the `agent_events` decision (same pattern; less surface to learn).

**Trade-offs accepted:**
- One broadcast per automation_runs write (~dozens/day per prefix) replaces full table fan-out to every connected dashboard.
- Refetch round-trip on each broadcast (~50 ms p95 against Supabase) instead of using realtime row payload — negligible at this volume.
- Trigger-based emission preferred over app-layer hooks if any external writers exist; otherwise app-layer is simpler and more debuggable. **Researcher to confirm whether automation_runs is written from anywhere besides the app (e.g., direct Zapier inserts).**

### 3. Pipeline broadcast coalescing → Server-side 500 ms debounce

**Locked:** Add a per-`(channel, event-key)` 500 ms debounce inside `web/lib/supabase/broadcast.ts`. All 22 caller sites in `pipeline.ts` (and the 4 sites in `pipeline/conversation-action.ts` / `pipeline/discussion-action.ts`) stay untouched — backward-compatible API.

**Mechanism:**
- In-memory `Map<key, { timer, lastPayload }>` inside the broadcast module. Key: `${channelName}:${eventKey}` where eventKey is `runId + stepName` for step updates, `runId` for run updates, `runId + msgId` for chat messages.
- On call: store `lastPayload`, schedule a 500 ms timer. If another call arrives within the window, replace `lastPayload` and reset the timer. When the timer fires, emit the latest payload.
- Chat messages **must NOT be debounced** (each one is a distinct user/assistant turn — collapsing would lose data). Branch by event type: `chat-message` is direct-emit; `step-update` and `run-update` go through the debounce path.

**Trade-offs accepted:**
- Up to 500 ms of staleness on rapid status flips (`waiting → running → complete` within 100 ms now coalesces to one message). Imperceptible to humans watching a dashboard.
- Module-local state means debounce is per-server-instance. If pipeline runs straddle multiple Vercel functions concurrently emitting the same event-key (rare, since each run is single-threaded), some messages duplicate — acceptable.

### 4. Verification → Snapshot-and-compare

**Locked:** Take the Supabase realtime metric snapshot at phase-execute start and at phase-execute end. Phase ships only when the post-merge metric extrapolates to <2M msgs/mo (50% margin under the 5.5M cap).

**Mechanism:**
- Pre-merge: read current realtime message count from Supabase dashboard (or via Management API if available). Record in `59-VERIFICATION.md`.
- 24 h post-merge: re-read. Compute observed daily rate; multiply ×30. Must be <2M.
- If still over: flag in VERIFICATION.md as a partial-ship and open Phase 60 to attack the next-largest contributor (likely `useRealtimeTable` audits, deferred from this phase).

</decisions>

<deferred>
Captured during discussion, not part of Phase 59 scope:

- **Generic `useRealtimeTable` consolidation audit** — multiple components on the same page may subscribe to the same table; merging would deduplicate. Defer to Phase 60 if measurement says we're still over budget.
- **Low-churn `swarm_agents` / `swarm_briefings` migration to broadcast** — measurement-dependent; only attack if data shows non-trivial volume.
- **`automation_id` FK + registry table** — schema-level fix for rename resilience. Bigger refactor; defer until automations library grows past ~10 distinct automations.
- **Replacing pipeline broadcasts entirely with row-level CDC** — interesting but invasive; out of scope for the 2026-05-26 deadline.
</deferred>

<canonical_refs>
**Files downstream agents (researcher, planner, executor) MUST read:**

- `web/components/v7/swarm-realtime-provider.tsx` — current 4× postgres_changes subscription; target of decision #1.
- `web/components/automations/automation-realtime-provider.tsx` — current unfiltered subscription; target of decision #2.
- `web/lib/supabase/broadcast.ts` — server-side broadcast helpers; target of decision #3.
- `web/lib/supabase/broadcast-client.ts` — client-side `useBroadcast` hook; reuse for new listeners.
- `web/lib/automations/swarm-bridge/sync.ts` — bridge tick that should emit `events-stale` after sync (decision #1).
- `web/lib/inngest/functions/pipeline.ts` — 22 broadcast call sites that benefit from decision #3 transparently.
- `web/lib/inngest/functions/orqai-trace-sync.ts` — should emit `events-stale` when re-enabled (decision #1, future-proofing).
- `.planning/phases/58-cron-cost-optimization/58-01-PLAN.md` — Phase 58 context (cron writes were the upstream driver of fan-out).
- `CLAUDE.md` (root) — Inngest + Supabase patterns, especially the new Phase 58 cron pattern in the Inngest section.

**External docs:** None. No specs/ADRs apply to this phase beyond the in-repo files above.
</canonical_refs>

<code_context>
**Reusable assets identified:**

- `useBroadcast` in `web/lib/supabase/broadcast-client.ts` — already wraps `.channel().on("broadcast", ...)`. New listeners (decisions #1 + #2) reuse it directly; no new client primitive needed.
- `broadcastStepUpdate` / `broadcastRunUpdate` / `broadcastChatMessage` in `web/lib/supabase/broadcast.ts` — debounce wrap (decision #3) lives next to them; same module.
- `setInterval(fetchSnapshot, 15_000)` in `swarm-realtime-provider.tsx` — the safety-net poll already exists. Decision #1 reuses `fetchSnapshot` as-is, just triggered by broadcast instead of postgres_changes.
- Phase 55's `agent_runs` table (lookback test infra) — irrelevant here; flagged so researcher doesn't conflate.

**Patterns established by prior phases:**
- Server-side filters via `.on("postgres_changes", { filter: "..." }, ...)` (Phase 49 — kept for `swarm_jobs` etc., the low-volume tables we're NOT changing).
- `step.run()` wrapping for Inngest side-effects (Phase 35; bridge sync already follows this — broadcast emission inside `step.run` is correct).
</code_context>

<implementation_signposts>
Three independent edits; no cross-dependencies. Ship as one atomic commit per decision (3 commits total) inside one Wave.

1. **Decision #1** → ~2 server lines (bridge sync end emits broadcast) + ~10 client lines (replace 1 of 4 postgres_changes blocks with broadcast listener; reuse fetchSnapshot).
2. **Decision #2** → either (a) trigger + function in a new migration `20260426_phase59_automation_runs_broadcast.sql` OR (b) ~5 lines in the app-layer write helper. Researcher to pick based on whether external writers exist.
3. **Decision #3** → new `debouncedBroadcast` helper in `broadcast.ts` (~40 lines) + swap internal calls. Public API unchanged. Add unit test exercising rapid-flip → single-emit.
</implementation_signposts>

<success_criteria>
- 3 atomic commits, all on `main` branch.
- Supabase realtime metric, 24 h post-merge, projects to <2M msgs/mo (well under the 5.5M cap before grace expires 2026-05-26).
- No regressions: swarm dashboard still updates within 2 s of new events; automation review board updates within 2 s of new runs; chat messages still appear in real time (debounce excluded).
- All 22 pipeline.ts broadcast call sites unchanged (proves backward-compat of decision #3).
- VERIFICATION.md records before/after metrics.
</success_criteria>
