# Phase 119: Behavior-sync per-mailbox isolation — Context

**Gathered:** 2026-06-16
**Status:** Ready for planning
**Source:** Production regression found during debtor intent-label go-live health-check

<domain>
## Phase Boundary

Phase 118 added multi-mailbox iteration to the Phase 112.5 Outlook delta-sync
(`web/lib/inngest/functions/swarm-behavior-sync.ts`): one `EnabledSwarm` per
`(swarm × mailbox)`, processed sequentially inside ONE Inngest run
(`concurrency:{limit:1}`, `retries:1`).

**Regression (confirmed live 2026-06-16):** enabling the debtor swarm's 4 mailboxes
froze the delta-sync. Per tick ONLY the first mailbox processed got delta tokens
(debtor `debiteuren@smeba.nl`, 55 folders, last_tick advancing) while the other 3
debtor mailboxes AND the previously-healthy **sales** mailbox `verkoop@smeba.nl`
were never reached — sales `outlook_delta_tokens` froze at 12:25. Disabling debtor
`behavior_tracking` immediately restored sales (verkoop@ ticked again at 13:23),
which CONFIRMS the causation: one swarm's mailboxes starved everything after them in
the shared single-run loop.

**Two failure modes (both must be fixed; confirm which is active via Inngest run logs):**
- **Abort-on-throw:** a `step.run` for one mailbox (e.g. `resolveFolders` Graph call,
  or a per-folder delta) throws → the whole function run fails (`retries:1` → retries
  → fails) → every mailbox AFTER it in the loop (and other swarms) is never processed.
- **Budget starvation:** one heavy mailbox (smeba.nl = 55 tracked folders → 55 delta
  step.runs) consumes the run's wall-clock / step budget before the loop reaches the
  rest.

This phase makes the delta-sync **fault-isolate and fairly budget per mailbox** so no
single mailbox can starve or abort the others. Re-enabling debtor `behavior_tracking`
on its 4 mailboxes is a SEPARATE post-merge operator step (out of scope here).

WRITE side (Phase 117 intent-label worker) is unaffected and stays live — this phase
only touches the observe/delta-sync side.
</domain>

<decisions>
## Implementation Decisions

### Both properties are MANDATORY (LOCKED)
1. **Fault isolation:** a failure (throw) processing one `(swarm × mailbox)` MUST NOT
   abort the others or other swarms. Each mailbox's outcome is independent; a failure
   is caught, recorded as telemetry, and the loop/fan-out continues.
2. **Fair budgeting:** one mailbox with many folders MUST NOT consume the whole tick
   such that other mailboxes never run. Every enabled mailbox must make progress
   across a bounded number of ticks.

### Preferred mechanism (planner may refine via research)
- **Preferred: fan-out** — the cron becomes an orchestrator that emits one event per
  enabled `(swarm × mailbox)` (e.g. `swarm/behavior-sync.mailbox`), and a per-mailbox
  worker processes exactly one mailbox per invocation. This gives true isolation
  (independent retries/failures), removes the shared wall-clock budget, and lets
  Inngest `concurrency` throttle Graph load (e.g. a per-mailbox or global concurrency
  key) instead of `{limit:1}` serial. The existing single-mailbox processing body
  (folder-map refresh → tracked folders → per-folder delta → derive-and-write) moves
  into the per-mailbox worker largely unchanged.
- **Acceptable fallback (if fan-out is too large):** keep the single function but (a)
  wrap each mailbox iteration in try/catch so one failure is logged + skipped (never
  fatal), and (b) add a per-tick fairness guard so a high-folder mailbox cannot starve
  the rest (e.g. round-robin / per-mailbox folder cap per tick).

### Replay-safety + invariants to preserve (LOCKED — see CLAUDE.md Inngest block)
- All non-deterministic ids (`runId`, `tickIso`) stay minted inside `step.run`.
- `step.run` ids must stay UNIQUE and DETERMINISTIC across swarms+mailboxes (Phase 118
  already mailbox-suffixed them; keep that, extend for fan-out event/step naming).
- Lean payloads over step / event boundaries (ids + folder/category/read only).
- Idempotent inserts (23505 no-op) on `swarm_email_transitions` / `swarm_review_signals`.
- Token persistence stays INSIDE the per-folder step.
- Hard-separation: do NOT touch `swarm_noise_categories` / `swarm_intents`.
- The Phase 118 `TRACKED_INGEST_SOURCES = ['outlook','zapier-debtor-ingest']` widening
  (PR #107) must be preserved.

### Telemetry (LOCKED)
- A per-mailbox failure must be VISIBLE, not silent (the regression was invisible until
  a manual token-freshness check). Emit a structured log and/or a `pipeline_events`
  row (e.g. decision `behavior_sync_mailbox_failed`) per failed mailbox so Bulk Review /
  monitoring surfaces it. Mirror the visible-failure pattern from the handoff-drops fix
  ([[sales-funnel-stall-retries-zero]] PR #105 `on-worker-failure.ts`) if applicable.

### Claude's Discretion
- Exact event name + worker id for fan-out; concurrency key/limit value.
- Whether to keep a thin cron orchestrator + per-mailbox worker, or two functions.
- Folder-cap number / round-robin details if the fallback path is chosen.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `web/lib/inngest/functions/swarm-behavior-sync.ts` — the function being refactored:
  `load-enabled-swarms` (flatten), the per-`sw` loop body (folder-map refresh →
  tracked-folders → per-folder delta → derive-and-write), step-id scheme, the
  `TRACKED_INGEST_SOURCES` filter, `concurrency:{limit:1}`, `retries:1`.
- `web/lib/email-behavior/__tests__/behavior-sync.test.ts` — existing vitest harness +
  the in-memory Supabase/Graph mocks; tests 11–14 (Phase 118 multi-mailbox + the
  zapier-source case). New tests extend this harness.
- CLAUDE.md "Inngest" block — replay-safety, step.run boundaries, cron `TZ=` rule,
  fan-out/multiple-triggers guidance; and the `inngest.send` this-binding pitfall.
- `docs/agentic-pipeline/stage-3-coordinator.md` — the wildcard fan-in dispatcher is a
  working precedent for cron→event fan-out within this codebase.
- `docs/swarm-behavior-tracking.md` — the 112.5 runbook; update if the cron/worker
  topology changes.
- `web/lib/inngest/on-worker-failure.ts` *(if present from PR #105)* — the visible
  terminal-failure sink pattern to mirror for per-mailbox failures.

### Out of scope (orientation only)
- Re-enabling debtor `behavior_tracking_config={enabled:true, mailboxes:[4]}` +
  re-verifying — a post-merge operator step. The 4: debiteuren@smeba.nl,
  administratie@fire-control.nl, debiteuren@smeba-fire.be, debiteuren@berki.nl.
</canonical_refs>

<specifics>
## Specific Ideas

- Regression evidence to encode as the must-not-regress test: a swarm enabled with a
  LARGE-folder mailbox (≈ many tracked folders) + ≥1 additional mailbox, PLUS a second
  enabled swarm. Assert: every mailbox is processed (gets a delta token / results entry)
  in a single orchestration, AND a forced throw on ONE mailbox does NOT prevent the
  others (same tick or bounded ticks) from being processed.
- Diagnosis task: confirm via the Inngest dashboard whether `swarm/behavior-sync` runs
  since ~12:25 failed (throw) or timed out (budget) — informs which mode dominated, but
  the fix must cover both regardless.
</specifics>

<deferred>
## Deferred Ideas
- Re-enable debtor observe on the 4 mailboxes (post-merge operator step).
- Sicli re-add (separate; addresses unresolved — see [[debtor-intent-labeling-rollout]]).
- Per-mailbox weights / parallelism tuning beyond what's needed to stop starvation.
</deferred>

---

*Phase: 119-behavior-sync-per-mailbox-isolation*
*Context gathered: 2026-06-16 via production regression analysis*
