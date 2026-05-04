# Phase 66: Pipeline consolidation (retire triage path) — Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Mode:** `--auto` (Claude selected recommended option for each gray area; user can revise before plan-phase)

<domain>
## Phase Boundary

Make `regex → label-resolver → coordinator → handler` the **single canonical inbound flow** for the debtor-email swarm and remove every artefact of the parallel triage path that pre-dated the Phase 63 RFC.

In scope (CONS-01..03):

1. **CONS-01:** Inbound debtor-email automatically and exclusively traverses `regex (classifier-verdict-worker) → label-resolver (classifier-label-resolver) → coordinator (renamed from debtor-email-triage) → handler (per-intent Inngest fns)`. No second pipeline executes for the same email.
2. **CONS-02:** The `debtor-email-triage` Inngest function is retired. Phase 65 already rewrote it in-place as the coordinator (per Phase 65 D-10) — Phase 66 renames the function id, file, and the `web/lib/automations/debtor-email/triage/` directory to coordinator-aligned naming, and removes any legacy single-label code paths still under the old name.
3. **CONS-03:** Every Stage 4 handler (today: `classifier-invoice-copy-handler`, copy-document body agent path, plus future handlers) is invoked **only** via canonical `debtor-email/<intent>.requested` Inngest events. No handler invokes another handler directly (no in-process function calls, no RPC, no Supabase trigger fan-out). The orchestrator (`coordinator-orchestrator`) is the only emitter of `<intent>.requested` events.

Out of scope (explicitly deferred):

- **`swarm_intents` registry** — Phase 68 (SWRM-*). Phase 66 keeps the existing per-handler Inngest function wiring; it just enforces the event-only invocation rule and renames.
- **iController DOM tagging side effect** on the canonical flow — Phase 67 (TAG-*).
- **Canonical handler input shape across swarms** — Phase 69 (CANO-*). Phase 66 only consolidates flow shape; data contracts stay as Phase 65 left them.
- **`pipeline_events` telemetry table / formal "no parallel execution" assertion at runtime** — Phase 70 (TELE-*). Phase 66 verifies via codebase audit + live smoke, not via a runtime metric.
- **Numeric confidence thresholds, Bulk Review override UX, learning loop** — Phase 71 (LERN-*).
- **New intent handlers** (dispute, address-change, etc.). The phase ships canonical wiring; new handlers ride on it later.

</domain>

<decisions>
## Implementation Decisions

### Rename strategy (CONS-02)

- **D-01: Big-bang rename in a single PR — no deprecation marker, no parallel-name period.** [auto: recommended]
  - File: `web/lib/inngest/functions/debtor-email-triage.ts` → `web/lib/inngest/functions/debtor-email-coordinator.ts`.
  - Inngest function id: `"automations/debtor-email-triage"` → `"automations/debtor-email-coordinator"`.
  - Exported name: `debtorEmailTriage` → `debtorEmailCoordinator`.
  - Audit `updated_by` strings: `"inngest:debtor-email-triage"` → `"inngest:debtor-email-coordinator"` in `web/lib/automations/debtor-email/triage/circuit-breaker.ts` (and any other write site found in research).
  - Reason: Phase 65 verified the canonical coordinator live (CORD-01..04 complete, commits `dd2583a`, `dae6276`, `62e9415`). A deprecation marker is justified when downstream consumers exist outside the repo; here every caller is in-repo and visible to grep, so a clean rename is cheaper than a marker that someone has to remember to remove.
  - Inngest will treat the renamed function as a new function (different id) — that's the desired behaviour: the old id stops accepting events and the new id takes over. Coordinate the deploy + cutover in the plan.

- **D-02: Move the colocated helper directory `web/lib/automations/debtor-email/triage/` → `web/lib/automations/debtor-email/coordinator/`** in the same PR.
  - Files affected (Phase 65 inventory): `agent-runs.ts`, `invoke-intent.ts`, `invoke-body.ts`, `circuit-breaker.ts`, `detect-emotion.ts`, `types.ts`, plus the `__tests__/` siblings.
  - Update all imports from `@/lib/automations/debtor-email/triage/*` → `@/lib/automations/debtor-email/coordinator/*`.
  - Note: `web/lib/automations/debtor-email/coordinator/` already exists with Phase 65 additions (`coordinator-complete.ts`, `escalation-gate.ts`, `synthesis-types.ts`, `orchestrator-types.ts`). The helpers move INTO this directory; the directory is not new. No file collisions expected — verify in research.

- **D-03: Trigger event for the coordinator stays where Phase 65 put it** until research proves otherwise.
  - The current trigger is `debtor/email.received` (line 57 of `debtor-email-triage.ts`). Research must answer: in the canonical `regex → label-resolver → coordinator → handler` flow, is the coordinator triggered by (a) `debtor/email.received` directly — meaning Stage 1 verdict-worker and Stage 3 coordinator both subscribe to the same inbound event in parallel, OR (b) by an event emitted from `classifier-label-resolver` after Stage 2 resolves the customer?
  - **If (a):** that IS the parallel-path problem CONS-01 calls out. Fix in this phase: the coordinator must subscribe to a Stage-2-output event (e.g. `debtor-email/coordinator.requested` emitted by `classifier-label-resolver`), and `debtor/email.received` is consumed only by Stage 1 / verdict-worker.
  - **If (b):** parallelism is already gone post-Phase 65 and CONS-01 reduces to a verification + documentation task.
  - Default plan-time assumption: **case (a) is true** based on the file evidence (`{ event: "debtor/email.received" }` in the coordinator). Plan a wiring change unless research disproves it.
  - Reason: cannot make this call without reading `classifier-label-resolver.ts` end-to-end and tracing what events it emits — that's research's job.

### Event taxonomy (CONS-03)

- **D-04: Lock the event naming convention as `debtor-email/<intent>.requested`** for every Stage 4 handler invocation.
  - Already in use: `debtor-email/invoice-copy.requested` (classifier-invoice-copy-handler), `debtor-email/synthesis.requested`, `debtor-email/orchestrator.requested`, `debtor-email/label-resolve.requested`. Coordinator-orchestrator fans out via `debtor-email/${intent}.requested` template literal (line 94 of coordinator-orchestrator.ts).
  - **No event renames in this phase.** The convention is already consistent — Phase 66 just makes it the *only* invocation path.
  - Reason: renaming events is replay-unsafe (Inngest in-flight events keyed by name) and gains nothing functional. Convention enforcement ≠ convention change.

- **D-05: Ban direct cross-handler invocation**. Audit task in the plan: grep for any handler in `web/lib/inngest/functions/classifier-*-handler.ts` (and any future per-intent handler) that imports another handler module, calls a handler step function directly, or writes to a Supabase table that triggers a second handler. The only legal way to start a handler is `inngest.send({ name: "debtor-email/<intent>.requested", ... })` from `coordinator-orchestrator.ts` (escalation path) or from the coordinator's single-shot fast path.

### Code deletion scope

- **D-06: Delete legacy single-label code paths only after confirming dead-by-grep, conservative on shared utilities.**
  - Phase 65 commit dd2583a's coordinator rewrite removed the Phase-1 single-label flow's body inside `debtor-email-triage.ts` — but Phase 65 left the surrounding helper directory intact because plans 04/05 still imported from `triage/`.
  - Phase 66 plan must enumerate every export of the `triage/` directory, grep for every import, and either:
    - **Move** the file to `coordinator/` (D-02) if anything still imports it (the default — `agent-runs.ts`, `invoke-intent.ts`, `circuit-breaker.ts`, `types.ts` are confirmed live).
    - **Delete** the file if zero imports remain after the canonical flow is the only path.
  - No `// deprecated`, no re-export shims, no commented-out blocks. If it's gone, it's gone — the git history is the audit trail.

- **D-07: `web/app/api/inngest/route.ts` registers the renamed function** (`debtorEmailCoordinator`) and removes the old export. Confirm by reading the file and counting registrations before/after.

### Verification approach

- **D-08: "No parallel triage execution observed" is verified two ways**, both required:
  1. **Static (codebase audit):** plan task that greps the post-rename codebase for any remaining `debtor-email-triage` literal — must return 0 hits in `web/`. Plus: confirm no two Inngest functions subscribe to the same Stage-1-input event with overlapping behaviour.
  2. **Dynamic (live smoke):** after deploy, send one email through each of the four Phase-65-validated regression paths (auto_reply, ooo_*, payment_admittance, unknown→coordinator) and verify exactly one coordinator run row per email in `automation_runs` / `coordinator_runs`. Reuse Phase 65's regression report scaffolding (`.planning/phases/65-*/65-regression-report.md`).
  - Reason: a runtime "exactly one path executed" assertion belongs in Phase 70's `pipeline_events` telemetry. For Phase 66, audit + smoke is sufficient to prove CONS-01.

### Cutover sequencing

- **D-09: Single PR, single deploy, no flag.** [auto: recommended]
  - Reason: the rename is mechanical, the canonical flow is already live and verified, and the audit-and-delete is small enough to review in one diff. A flag adds branching to a code path that's about to be deleted.
  - Risk mitigation: rely on Vercel's instant rollback if live smoke fails post-deploy. The old function id stops receiving events the moment the deploy lands, so there's no "two pipelines running" window — there's a sub-second window where neither is live, which Inngest handles via its retry queue.

### Naming consistency follow-up (recommended scope addition)

- **D-10: Update `docs/debtor-email-pipeline-architecture.md` and `docs/agentic-pipeline/stage-3-coordinator.md`** to remove every "triage" reference, replace with "coordinator". Same PR. Docs that say "Stage 2 handlers" but describe what's actually Stage 3 in the v8.0 lexicon get fixed too — the architecture doc still uses pre-RFC stage numbering in places. Plan should grep both docs for `triage` and reconcile.

### Claude's Discretion

- Exact import-path search-and-replace mechanics (codemod vs. manual sed): planner picks.
- Whether to keep `circuit-breaker.ts`'s `"inngest:debtor-email-triage"` audit string in historical rows or migrate them. Default: leave historical `automation_runs` rows untouched (they reflect history); only new writes use the new string.
- Test file rename ordering relative to source file rename: planner picks; both must land in the same PR to keep the suite green.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 66 architecture / RFC inputs
- `docs/agentic-pipeline/README.md` — v8.0 5-stage funnel architecture (Stage 0 → 1 → 2 → 3 → 4). Defines the "single canonical flow" CONS-01 enforces.
- `docs/agentic-pipeline/stage-3-coordinator.md` — Stage 3 coordinator role, ranked-intent contract, escalation gate.
- `docs/agentic-pipeline/stage-1-regex.md` — what verdict-worker / regex classifier owns (so the coordinator does NOT duplicate this).
- `docs/agentic-pipeline/stage-2-entity.md` — what label-resolver owns; relevant for D-03 (whether label-resolver emits the coordinator trigger event).
- `docs/agentic-pipeline/stage-4-handler.md` — Stage 4 handler invocation contract; CONS-03 enforces the event-only invocation it specifies.
- `docs/agentic-pipeline/context-shape-contract.md` — Stage 2 → 3 context shape; coordinator input must comply.
- `docs/debtor-email-pipeline-architecture.md` — debtor-email-specific implementation map. Plan must update this doc per D-10.

### Phase 65 outputs (immediate predecessor — Phase 66 builds on these)
- `.planning/phases/65-stage-3-ranked-multi-intent-coordinator/65-CONTEXT.md` — Phase 65 decisions (D-10 specifically promises Phase 66 does the rename).
- `.planning/phases/65-stage-3-ranked-multi-intent-coordinator/65-PATTERNS.md` — patterns Phase 65 introduced (HandlerOutput, RPC fan-in, escalation gate).
- `.planning/phases/65-stage-3-ranked-multi-intent-coordinator/65-VERIFICATION.md` — what Phase 65 verified live (CORD-01..04 complete 2026-05-04). Phase 66 inherits this baseline.
- `.planning/phases/65-stage-3-ranked-multi-intent-coordinator/65-regression-report.md` — regression scaffolding to reuse for D-08 dynamic verification.

### Phase 65 commits with Inngest-replay learnings (operational gotchas)
- Commit `dd2583a` — wrap `run_id` generation in `step.run` for replay-safety. The renamed coordinator must preserve this pattern.
- Commit `dae6276` — preserve `this`-binding on `inngest.send` in orchestrator fan-out. Search-and-replace during the rename must NOT introduce `const send = inngest.send` destructuring.
- Commit `62e9415` — Inngest replay-safety learnings doc.

### Project-level invariants
- `CLAUDE.md` — stack non-negotiables, Inngest patterns (`step.run`, `inngest.send` binding, replay-safe id generation), Orq.ai routing. Phase 66 touches Inngest only — no Orq.ai agent changes.
- `.planning/REQUIREMENTS.md` §CONS-01..03 — the three acceptance bullets.
- `.planning/ROADMAP.md` Phase 66 entry (line 731) — goal + success criteria + dependency on Phase 65.

### Files Phase 66 will rename / delete / audit (research input)
- `web/lib/inngest/functions/debtor-email-triage.ts` — renames to `debtor-email-coordinator.ts`.
- `web/app/api/inngest/route.ts` — registration site for the renamed function.
- `web/lib/automations/debtor-email/triage/` (entire directory) — moves to `coordinator/`.
- `web/lib/inngest/functions/coordinator-orchestrator.ts` — emitter of `debtor-email/<intent>.requested`. CONS-03 reference implementation; must remain the only emitter.
- `web/lib/inngest/functions/coordinator-synthesis.ts` — fan-in synthesis listener.
- `web/lib/inngest/functions/classifier-label-resolver.ts` — Stage 2; research must determine whether this emits the coordinator's trigger event (D-03).
- `web/lib/inngest/functions/classifier-verdict-worker.ts` — Stage 1 + dispatch via `swarm_categories.swarm_dispatch`. Coordinator wiring (D-03) likely terminates here or in label-resolver.
- `web/lib/inngest/functions/classifier-invoice-copy-handler.ts` — Stage 4 handler, CONS-03 invocation contract reference.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 65 regression scaffolding** (`65-regression-report.md` template) — reuse for D-08 dynamic verification, just swap the focus from "ranked multi-intent" to "single canonical flow".
- **`inngest.send` typed-cast pattern** (`coordinator-orchestrator.ts:93-94`) — `(inngest.send as unknown as SendFn)({ name: \`debtor-email/${intent}.requested\`, ... })`. Any new send sites in this phase reuse this exact shape so the `this`-binding learning (commit `dae6276`) doesn't regress.
- **`step.run`-wrapped non-deterministic ids** (Phase 65 dd2583a pattern) — must survive the rename verbatim.

### Established Patterns
- **Inngest function naming convention**: file `<name>.ts` ↔ Inngest id `automations/<name>` ↔ exported const `<camelName>`. The rename respects this triple.
- **`swarm_categories.swarm_dispatch` registry-driven dispatch** (verdict-worker line 149-166). Adding/changing a coordinator trigger event likely means an INSERT/UPDATE on this table — research must confirm.
- **No `mkdir` of `coordinator/`** — directory already exists with Phase 65 files; the move is "files into existing dir", not "create dir".

### Integration Points
- `web/app/api/inngest/route.ts` is the single registration site — every Inngest function rename touches exactly this one file.
- `web/lib/inngest/events.ts` (referenced via `keyof Events` type cast in coordinator-orchestrator.ts:34) — typed event catalogue. Research must confirm whether the coordinator's trigger-event change (if D-03 case (a)) needs an entry here.
- `automation_runs` and `coordinator_runs` Supabase tables — observability surfaces; live smoke verification reads these.

</code_context>

<specifics>
## Specific Ideas

- **No telemetry table in this phase.** Tempting to add a "pipeline_event" insert at each stage transition to assert "exactly one path", but that's Phase 70's TELE-* scope. Phase 66 stays mechanical.
- **No new Orq.ai agents, no agent updates.** This phase is pure Inngest/code-shape consolidation. Nothing in `orq_agents` changes. (Verify: zero `update_agent` / `create_agent` calls in the plan.)
- **No Supabase migrations expected** — confirm in research. Possible exception: a `swarm_categories` row update if D-03 case (a) requires changing the coordinator's trigger event name.
- **Naming**: "coordinator" wins over "triage" everywhere because the v8.0 lexicon (RFC, stage docs, Phase 65 PATTERNS.md) already uses "coordinator". Don't bikeshed alternative names.

</specifics>

<deferred>
## Deferred Ideas

- **Runtime "single-pipeline" assertion / pipeline_events telemetry table** → Phase 70 (TELE-*).
- **`swarm_intents` registry to replace per-handler Inngest function wiring** → Phase 68 (SWRM-*). Phase 66 keeps the existing handler-per-Inngest-function wiring; Phase 68 generalises it.
- **iController auto-tagging side effect on the canonical flow** → Phase 67 (TAG-*).
- **Cross-swarm canonical handler input shape** → Phase 69 (CANO-*).
- **Bulk Review override UI for ranked output** + **numeric confidence thresholds** + **learning loop** → Phase 71 (LERN-*).
- **Backfill historical `automation_runs.updated_by` strings** ("inngest:debtor-email-triage" → "...coordinator"). Default: leave history alone — not deferred to a phase, just intentionally not done.

</deferred>

---

*Phase: 66-pipeline-consolidation-retire-triage-path*
*Context gathered: 2026-05-04 (auto mode)*
