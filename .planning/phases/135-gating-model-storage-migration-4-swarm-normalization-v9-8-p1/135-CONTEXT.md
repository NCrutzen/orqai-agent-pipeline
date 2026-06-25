# Phase 135: Gating model + storage + migration + 4-swarm normalization (V9.8 P1a) - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

The spine of V9.8. Land the **3-layer gating model** as the single source of gating
truth and cut the live pipeline gate over to it with **zero behavior change**:

- **L1 — Mailbox lifecycle** (per email address): `Shadow → Dry-run → Live`, a *derived*
  state (no stored enum that can drift).
- **L2 — Per-stage enablement** (per swarm): each of the 5 stages independently on/off.
- **L3 — Per-handler `off | dry | live`** (per swarm), with the cardinal invariant:
  a handler is never `live` unless its trigger-stage is live.

Plus: enforce the invariant at write time, migrate off the 3 scattered state holders
(`swarms.dry_run_config`, the two per-mailbox `dry_run` booleans, `debtor.email_labels.status`),
and normalize all 4 swarms (sales, debtor, info-routing, support-tickets) to their intended state.

Covers MODEL-01..05, MIGRATE-01..03.

**In scope:** storage shape + derive function + write-time invariant enforcement + gate cutover
(workers read the new shape) + 4-swarm normalization seed + the runtime Shadow-suppression gate.

**Out of scope (later V9.8 phases):** review-row renderers + mode-filter Shadow option + provenance
chip + canonical matrix doc (136); per-handler dry-capture mechanics — iController screenshot,
reply draft (137); the operator control/visibility UI (138). Auto-promotion/auto-flip (V10.0).
Full per-mailbox *config* (only the lifecycle is per-mailbox; stage/handler config stays per-swarm).

</domain>

<decisions>
## Implementation Decisions

### Derived mode (L1)
- **D-01 — Derive ladder:** mode is derived from the layers, never stored as an enum.
  `Shadow` = no operator-visible Outlook `AI:`-label written yet (row exists only in the internal
  Bulk Review surface). `Dry` = the label is written (operator can see + correct) but **nothing acts**.
  `Live` = at least one real side-effect fires.
- **D-02 — Mixed handlers resolve highest-wins → Live.** When a mailbox's handlers are mixed
  (e.g. Outlook-archive acts live but iController-delete is in `dry`), the single badge reads the
  **highest** autonomy level reached by any enabled side-effect. Rationale: be honest about risk —
  if *anything* touches a real system, the operator sees `Live`. No "mixed/partial" qualifier in
  the derive fn (a partial/mixed visual hint, if wanted, is a 136 renderer concern, not the model).

### Shadow runtime behavior
- **D-03 — Wire the Shadow gate in 135 (not store-only).** Shadow is brand-new behavior: today
  dry-run already writes the operator-visible label, so there is no internal-only mode. 135 ships
  the **runtime suppression** — when derived mode = `Shadow`, the gate holds the `stage_3_intent_label`
  Outlook-label write (and any other operator-visible surface) while still classifying + persisting
  the verdict internally. This makes MODEL-05 real: a mailbox onboarded after 135 is genuinely
  safe-by-default end-to-end, not a half-built promise. (No mailbox flips to Shadow *at cutover* —
  all existing mailboxes are dry/live — so this changes nothing for today's traffic; it only governs
  the next newly-added mailbox. Consistent with MIGRATE-02 "no behavior change at migration time.")

### Invariant enforcement (MODEL-04)
- **D-04 — DB-enforced: an illegal state can never be persisted.** A constraint/trigger at the DB
  layer rejects `handler=live` on a non-live trigger-stage, so the store physically cannot hold an
  illegal combo (no UI exists yet in 135 — writes come via migration/seed/SQL, so "write-time" = the
  DB layer). **Plus** a cheap violation view for the eventual overview. Rationale: this is the
  trust-ramp before handlers mutate NXT — "errors are reputational," so make the bad state
  unrepresentable, not merely flagged.
  - **For research/planning:** the exact mechanism (CHECK constraint vs trigger vs generated column)
    depends on the chosen storage shape (jsonb-on-`swarms` vs normalized tables). Pick the mechanism
    that gives a hard reject under whatever shape research selects; the *posture* (unrepresentable,
    not just flagged) is locked.

### Normalization targets (MIGRATE-03) — confirmed = today's effective behavior made explicit
- **D-05 — sales-email → clean Dry-run.** Stage 0/1 live (read-only classify), Stage 2 resolve live
  (resolve-only), Stage 3 labeling + routing held, intent-label write held. Handlers: none. Derives `Dry`.
- **D-06 — debtor-email → partly Live (explicit).** Outlook-archive **LIVE**; iController noise-delete
  (`stage_1_cleanup`, the 867-delete path) **LIVE** — now an explicit per-handler `live` entry, **not**
  an implicit always-live flag (this is the core of MIGRATE-03). iController intent-labeling + invoice-copy
  held. Derives `Live` (per D-02 highest-wins, because archive + delete act).
- **D-07 — info-routing → Live.** Outlook-archive LIVE + Stage-3 routing live; forward buckets
  `verkoop` + `opleidingen` **released**, other buckets held (per V9.7 134's graduated 0.7 gate — do
  **not** re-litigate). Derives `Live`.
- **D-08 — support-tickets → dormant.** Everything off/gated → derives `Shadow`.
- **D-09 — No deliberate behavior change at cutover.** Every target above = the live effective state
  on 2026-06-18 (brief table) + the V9.7 forward releases. Anything that would differ from today's
  effective behavior is explicitly NOT wanted here.

### Folded Todos
- **`2026-05-18-granular-dry-run-gating-per-stage-and-handler.md`** (tagged `resolves_phase: 135`).
  Original problem: `debtor.labeling_settings.dry_run` only gated intent-labeling; the iController
  cleanup-worker ran live regardless (867 real deletes while "officially in dry-run"), contradicting
  the operator's mental model of "dry-run = nothing real happens." This phase's per-stage + per-handler
  tri-state IS the fix for the gating half. **The review-pane half** of that todo (per-row dry-run chip
  computed from `decision_details` at emit time) belongs to **Phase 136** (REVIEW-01/02) — not folded here.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The locked model (read FIRST)
- `.planning/briefs/run-mode-gating-redesign.md` — **the locked brief.** 3-layer model, the
  live-state table (2026-06-18), decisions-locked list, and the "Open / for research + planning"
  list (storage shape, dry-capture mechanics, renderers, matrix doc). The RFC wins over code shape.
- `.planning/REQUIREMENTS.md` §"Gating Model (P1)" + §"Migration & Normalization (P1)" — MODEL-01..05,
  MIGRATE-01..03 (the requirements this phase satisfies).
- `.planning/ROADMAP.md` §"V9.8 Run-Mode & Gating Redesign" (≈ lines 811–907) — milestone framing,
  Phase 135 goal + 5 success criteria, dependency graph.

### The gate being migrated (the thing to preserve)
- `web/lib/pipeline-gating/dry-run-gate/index.ts` — the current gate. Helper signatures + the
  TRUE=blocked / FALSE=live / MISSING=fail-closed convention + the **inverse-polarity** forward-bucket
  map (`isForwardBucketReleased`, TRUE=released). The new shape must keep these (or equivalents)
  gating identically (MIGRATE-02).
- `supabase/migrations/20260603b_swarms_dry_run_config.sql` — current `dry_run_config` jsonb shape +
  seed (⚠ seed is stale vs live — normalize to the D-05..D-08 targets, not the old seed).
- `web/lib/pipeline-gating/dry-run-gate/__tests__/dry-run-gate.test.ts` + `forward-bucket-release.test.ts`
  + `intent-label-gate.test.ts` — the effective-behavior contract + polarity pins. Extend/keep green
  across the cutover; they are the "no behavior change" proof.

### Architecture invariants
- `docs/agentic-pipeline/README.md` — canonical 5-stage funnel + **SWARM-02** (no `if swarm===`
  branches; variance lives in registry data — the storage shape must hold per-swarm config as data).
- `docs/agentic-pipeline/stage-1-regex.md`, `stage-3-coordinator.md`, `stage-4-handler.md` — stage +
  handler semantics, needed to enumerate the precise per-stage / per-handler taxonomy per swarm.

### Scattered state holders to reconcile (DB, not files)
- `swarms.dry_run_config` (jsonb, public) · `debtor.labeling_settings.dry_run` (bool) ·
  `public.info_routing_mailbox_settings.dry_run` (bool) · `debtor.email_labels.status`
  (`pending|dry_run|labeled|skipped|failed`). MIGRATE-01 supersedes all four as the gating source.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Gate helpers** (`dry-run-gate/index.ts`): `isStageBlocked`, `isHandlerBlocked`,
  `isStage3RoutingGated`, `isForwardBucketReleased`, `resolveStageDryRun`. Cleanest seam: keep these
  signatures, swap their *internals* to read the new shape — workers don't change, only the gate's
  source does (smallest-diff cutover, satisfies MIGRATE-02).
- **Codegen pattern** (Phase 69 D-03): registry → `*.generated.ts` via `npm run codegen`, CI drift gate.
  If the new shape adds enum-ish columns/keys, follow it — never hand-edit `*.generated.ts`.
- **RLS template** (`supabase/migrations/_template.sql`): any new table needs RLS enabled + a
  `service_role` FOR ALL policy (backend) + authenticated SELECT if UI-visible (138 reads it).

### Established Patterns
- **Fail-closed convention:** missing flag → blocked. The new shape + derive fn must preserve
  fail-closed (a half-configured swarm/mailbox stays safe).
- **Forward-bucket inverse polarity is deliberate** (V9.7 graduated per-bucket opt-in). Recommendation
  for research: keep the per-bucket release semantics intact, model it as a sub-map under the
  info-routing forward handler — do **not** flatten it into a single `off|dry|live` and lose the
  graduated release.
- **SWARM-02:** zero `if swarm_type===` branches in shared workers — all per-swarm variance is data.

### Integration Points (gate readers to cut over — must gate identically after)
- `web/lib/inngest/functions/stage-1-icontroller-noise-cleanup.ts` (debtor noise-delete — D-06)
- `web/lib/inngest/functions/classifier-invoice-copy-handler.ts`
- `web/lib/inngest/functions/classifier-verdict-worker.ts`
- `web/lib/inngest/functions/stage-3-intent-label-worker.ts` (the Shadow-suppression site — D-03)
- `web/lib/inngest/functions/stage-4-info-routing-forward.ts` (per-bucket release — D-07)
- `web/lib/inngest/functions/stage-2-customer-resolver.ts`
- `web/lib/inngest/functions/debtor-email-coordinator.ts`
- `web/app/(dashboard)/automations/[swarm]/_shell/_lib/load-page-data.ts` (UI reader)

</code_context>

<specifics>
## Specific Ideas

- The operator's stated pain is **"I lost the overview of what's on per swarm/mailbox."** The derived
  L1 badge (D-01/D-02) is the answer to that — keep the rollup honest (highest-wins) so the badge can
  never under-state what's acting on a real system.
- Debtor's iController noise-delete being **wanted production behavior** is explicit (D-06): the goal
  is to *govern it via the tri-state*, not to turn it off. The 867-delete footgun was that it was
  ungoverned, not that deleting is wrong.

</specifics>

<deferred>
## Deferred Ideas

- **Mixed/partial visual qualifier on the mode badge** — considered for the derive (D-02) but kept out
  of the model; if wanted, it's a 136 renderer hint, not a stored/derived value.
- **Full per-mailbox stage/handler config** — only the *lifecycle* is per-mailbox in V9.8; per-mailbox
  *config* (different stage/handler states per address within one swarm) is explicitly deferred (brief).

### Reviewed Todos (not folded)
- `2026-04-23-create-draft-idempotency-and-cleanup.md` — reply-agent draft idempotency → **Phase 137**
  (per-handler dry-capture, the reply-draft path), not the model phase.
- `2026-04-23-debtor-review-pipeline-provenance-and-scoping.md` — review-pipeline provenance/scoping →
  **Phase 136** (REVIEW-02 emit-time provenance).
- `2026-05-18-override-note-flow-unclear.md` / `2026-05-18-stage-1-needs-review-semantics.md` —
  Bulk Review override/semantics → review-surface phases, not 135.
- `2026-05-19-rename-label-resolver-and-tagger-plus-stage-alignment.md` — naming/stage-alignment;
  unrelated to the gating model.

</deferred>

---

*Phase: 135-Gating model + storage + migration + 4-swarm normalization (V9.8 P1a)*
*Context gathered: 2026-06-25*
