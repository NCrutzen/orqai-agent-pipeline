---
status: resolved
depth: standard
files_reviewed: 4
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
resolution:
  fixed: [CR-01, CR-02]   # applied via /gsd:code-review 119 --fix (commit "fix(119): apply code-review Info findings")
  accepted: [CR-03]       # intentional (two telemetry rows per failure) — monitoring note only
reviewed: 2026-06-17
note: Inline review + fix by orchestrator (background reviewer/fixer subagents blocked by permission policy this session).
---

# Phase 119 Code Review — Behavior-sync per-mailbox isolation

**Verdict: PASS (advisory).** No correctness, security, or replay-safety bugs
found. The orchestrator/worker split preserves every invariant (replay-safe id
minting, mailbox-suffixed step ids, `TRACKED_INGEST_SOURCES`, 23505 idempotent
no-ops) and is well covered by the 18-test suite. Three non-blocking Info notes
below — none require a fix before merge.

## Files reviewed
- `web/lib/inngest/functions/swarm-behavior-sync.ts` (orchestrator + worker)
- `web/lib/inngest/events.ts` (typed fan-out event)
- `web/app/api/inngest/route.ts` (worker registration)
- `web/lib/email-behavior/__tests__/behavior-sync.test.ts` (retarget + regression suite)

(`docs/swarm-behavior-tracking.md` is a runbook — read for accuracy, not code-reviewed.)

## Findings

### CR-01 [Info · RESOLVED] Fan-out sends events one-by-one inside a single step.run
`swarm-behavior-sync.ts:273-285` — `fan-out-mailboxes` loops and `await`s
`inngest.send` per mailbox. Inngest memoizes a *completed* step, so the only
re-run path is a throw partway through the loop (after sending some, before
others); a retry then re-sends the already-sent events.
- **Impact:** Benign. Duplicate `swarm/behavior-sync.mailbox` events are
  absorbed by the worker: per-mailbox `concurrency` key `limit:1` serializes
  them and the delta poll is idempotent (token already advanced → empty page →
  no duplicate rows; 23505 no-op on any insert).
- **Suggestion (optional):** Send once with a batched array —
  `await (inngest.send as SendFn)(enabledSwarms.map(sw => ({ name: MAILBOX_EVENT, data: {...} })))`
  — for atomic all-or-nothing delivery and a single round-trip. Not required.
- **Resolution:** Applied — fan-out now batches into one `inngest.send([...])`;
  the test capture helper flattens the array arg. (commit `fix(119): apply code-review Info findings`)

### CR-02 [Info · RESOLVED] Worker tolerates a malformed event with empty swarm_type/mailbox
`swarm-behavior-sync.ts:371-374` — `event.data` defaults to
`{ swarm_type: "", mailbox: "" }`. A malformed event (missing mailbox) would
drive `resolveFolders("")` → a Graph 400 → throw → `onFailure` records the
failure (mailbox `null`). So it self-surfaces rather than silently no-oping.
- **Impact:** Negligible — the orchestrator always emits both fields, and the
  failure is visible if one is ever missing.
- **Suggestion (optional):** Throw an explicit
  `if (!mailbox) throw new Error("behavior-sync.mailbox: missing mailbox")`
  at the top of the worker for a clearer failure message than a Graph 400.
- **Resolution:** Applied — worker throws an explicit "missing swarm_type/mailbox"
  error before any Graph call; onFailure still records it. (same commit as CR-01)

### CR-03 [Info] Two pipeline_events rows per terminal failure
`swarm-behavior-sync.ts:325-358` — `onFailure` writes both the shared
`recordWorkerFailure` row (`decision='worker_failed'`, `stage_label=
"behavior-sync-mailbox"`) and the attributable `behavior_sync_mailbox_failed`
row. This is intentional (plan 119-01 Task 2A: generic sink for consistency +
mailbox-queryable row), and both use `email_id=NULL` so neither collides with
the partial unique index.
- **Impact:** None functionally. Just note for monitoring: a single mailbox
  failure produces two telemetry rows; query on `decision='behavior_sync_mailbox_failed'`
  for the mailbox-attributable one.

## Invariants spot-checked (all OK)
- Replay-safety: `runId`/`tickIso` minted inside `step.run` in the worker; each
  worker invocation memoizes its own — no cross-mailbox bleed (was shared before;
  now per-invocation, which is correct for the fan-out model).
- Step-id uniqueness: four mailbox-suffixed ids per invocation; guarded by the
  STEP-ID-UNIQUENESS test (heavy 12-folder case).
- `inngest.send` never aliased/destructured — inline `SendFn` cast (CLAUDE.md /
  Phase 65 this-binding rule). ✓
- Cron string on the trigger arg, not in a block comment (CLAUDE.md rule). ✓
- `concurrency:[{key:"event.data.mailbox",limit:1},{limit:4}]` — valid Inngest
  multi-constraint shape; per-mailbox isolation + global Graph ceiling. ✓
- `TRACKED_INGEST_SOURCES` and the 23505 no-op insert paths preserved verbatim. ✓
- No `SECURITY DEFINER` / RLS / migration surface touched; no new secrets. ✓

---
*Phase: 119-behavior-sync-per-mailbox-isolation · standard depth · 2026-06-17*
