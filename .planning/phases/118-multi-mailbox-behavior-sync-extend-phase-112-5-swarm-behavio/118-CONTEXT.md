# Phase 118: Multi-mailbox behavior-sync — Context

**Gathered:** 2026-06-16
**Status:** Ready for planning
**Source:** Operator conversation (debtor intent-labeling rollout, step 1)

<domain>
## Phase Boundary

Phase 112.5's `swarm-behavior-sync.ts` (the Outlook Graph delta-sync that distils operator
mail-behaviour into `swarm_review_signals`) currently observes **exactly one mailbox per swarm
row** — it reads a single `behavior_tracking_config.mailbox` string. The debtor-email swarm spans
**~5 mailboxes** (debiteuren@smeba.nl ≈39.5k, debiteuren@sicli-noord.be, facturations@sicli-sud.be,
debiteuren@smeba-fire.be, debiteuren@berki.nl), so the single-mailbox model cannot give debtor the
correction loop across its real footprint.

**This phase = the code enabler only:** make `swarm-behavior-sync.ts` iterate MULTIPLE mailboxes
per swarm row, driven by a new `behavior_tracking_config.mailboxes: string[]` with a
backward-compatible fallback to the singular `mailbox`. After this merges, **step 2 (a separate,
post-merge change, OUT OF SCOPE here)** flips `swarms.dry_run_config.stage_3_intent_label=false`
for debtor and sets debtor's `behavior_tracking_config` to `{enabled:true, mailboxes:[…5…]}`.

This is step 1 of the debtor intent-labeling rollout. The write side (Phase 117
`stage-3-intent-label-worker.ts`) already resolves mailbox per-email and needs no change.
</domain>

<decisions>
## Implementation Decisions

### Config shape (LOCKED)
- Introduce `behavior_tracking_config.mailboxes: string[]`.
- Read order in the worker: `const mailboxes = cfg.mailboxes ?? (cfg.mailbox ? [cfg.mailbox] : [])`.
  A row with neither is skipped (same as today's "enabled swarm with no mailbox can't be polled").
- **Backward-compat is mandatory:** the singular-`mailbox` fallback MUST keep any unmigrated row
  working byte-unchanged (defensive for future swarms / rollback safety).
- **Sales config IS migrated in this phase (operator decision 2026-06-16):** to live-validate the new
  `mailboxes[]` read-path on the already-enabled sales swarm before debtor enablement, migrate
  sales-email's `behavior_tracking_config` from `{enabled:true, mailbox:"verkoop@smeba.nl"}` to
  `{enabled:true, mailboxes:["verkoop@smeba.nl"]}` (drop the singular key on this row; the code
  fallback still protects other rows). This is a **registry DATA migration** (UPDATE on
  `public.swarms.behavior_tracking_config` — NO DDL, NO new table, NO RLS change). Write it as a
  `supabase/migrations/*.sql` file with an idempotent jsonb update; the prod **apply** is a
  `[BLOCKING]` operator checkpoint (do not apply to prod from the executor).
- Array-in-config, NOT one-`swarms`-row-per-mailbox: `public.swarms` PK is `swarm_type`, so a row
  per mailbox is not natural; the array lives inside the existing jsonb.

### Worker iteration (LOCKED)
- `load-enabled-swarms` flattens to one `EnabledSwarm` per **(swarm × mailbox)** pair (swarm_type +
  mailbox + weights), instead of one per swarm. Weights are shared across a swarm's mailboxes.
- The existing per-`sw` loop body stays structurally the same, but every `step.run` id MUST include
  the mailbox so ids stay unique across mailboxes of the same swarm. Today's ids are
  `refresh-folder-map-${swarmType}`, `tracked-folders-${swarmType}`, `delta-${swarmType}-${folderId}`,
  `derive-and-write-${swarmType}`. New ids must disambiguate by mailbox (e.g.
  `refresh-folder-map-${swarmType}-${mailbox}`). Inngest requires stable, unique step ids — a
  collision silently returns the first step's cached result for the second mailbox (replay/memoization
  footgun). Sanitise mailbox in the id if needed (Inngest step ids are strings; '@'/'.' are fine but
  keep them deterministic — do NOT hash with a non-deterministic source).
- The per-mailbox queries already parametrise on `mailbox` (`.eq("mailbox", mailbox)`,
  `.eq("source","outlook").eq("mailbox",mailbox)`), so the body needs no query rewrites — only the
  loop scope + step-id changes.
- `concurrency: { limit: 1 }` on the function is preserved; mailboxes are processed sequentially
  within one run (no new fan-out). Per-mailbox results already accumulate into the `results[]` array.

### Type changes (LOCKED)
- `BehaviorTrackingConfig` type in `swarm-behavior-sync.ts` gains `mailboxes?: string[]` (keep
  `mailbox?: string`). If a shared/generated type for `behavior_tracking_config` exists elsewhere,
  extend it there too — but do NOT hand-edit any `*.generated.ts` (registry codegen rule).

### Claude's Discretion
- Exact step-id string format (as long as unique per mailbox + deterministic).
- Whether to extract a small `pollMailbox(swarmType, mailbox, weights, …)` helper vs inline nested
  loop — either is fine; favour the smaller diff that keeps replay-safety obvious.
- Test file location/naming alongside the existing behavior-sync tests.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The file being changed
- `web/lib/inngest/functions/swarm-behavior-sync.ts` — the delta-sync worker; the per-swarm loop
  (lines ~167-705), `load-enabled-swarms` step (~186-211), `EnabledSwarm` + `BehaviorTrackingConfig`
  types (~85-97), and every `step.run(\`…-${swarmType}…\`)` id.

### Contracts / patterns it must respect
- `docs/agentic-pipeline/stage-3-coordinator.md` — Stage 3/3.5 + the hard-separation rule (do not
  touch `swarm_noise_categories`/`swarm_intents` here; this is behaviour-tracking, not classification).
- `docs/swarm-behavior-tracking.md` — the 112.5 runbook (folder buckets, signal derivation, the
  Phase 117 written-category baseline join). Update it if the config shape it documents changes.
- CLAUDE.md "Inngest" block — replay-safe id generation (no `Date.now()`/random outside `step.run`),
  `step.run` boundary rules, lean payloads over the boundary. The mailbox loop must not break these.
- `web/lib/pipeline-gating/dry-run-gate/index.ts` — sibling per-swarm registry-config reader; shows
  the fail-closed convention. (Not modified here, but the same `swarms` jsonb-config philosophy.)

### Step 2 (OUT OF SCOPE — for orientation only)
- `web/lib/inngest/functions/stage-3-intent-label-worker.ts` + `swarms.dry_run_config.stage_3_intent_label`
  — the gate flip + debtor `behavior_tracking_config` enablement that happens AFTER this phase merges.
</canonical_refs>

<specifics>
## Specific Ideas

- Debtor mailboxes (for the step-2 config, recorded here so step 2 has the list):
  `debiteuren@smeba.nl`, `debiteuren@sicli-noord.be`, `facturations@sicli-sud.be`,
  `debiteuren@smeba-fire.be`, `debiteuren@berki.nl`.
- Tests to add: (1) multi-mailbox iteration — a swarm row with `mailboxes:[A,B]` polls both and
  produces a `results[]` entry per mailbox; (2) step-id uniqueness — no `step.run` id collision
  across A and B; (3) singular fallback — a row with only `mailbox:"X"` behaves exactly as today.
- Existing tests for the behavior-sync worker / helpers must stay green (regression guard for the
  singular path).
</specifics>

<deferred>
## Deferred Ideas

- **Step 2 — debtor enablement:** flip `stage_3_intent_label=false` + set debtor
  `behavior_tracking_config={enabled:true, mailboxes:[…5…]}`. Production Outlook/Graph writes —
  separate operator-gated change after this merges. NOT in this phase. (Sales config migration IS
  in-scope — see Implementation Decisions; debtor's is not.)
- Per-mailbox weights (different signal weighting per mailbox) — not needed; weights stay per-swarm.
- Parallel per-mailbox fan-out (concurrency >1) — keep sequential; volume is fine on the 5-min cron.
</deferred>

---

*Phase: 118-multi-mailbox-behavior-sync*
*Context gathered: 2026-06-16 via operator conversation*
