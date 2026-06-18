# Brief: Run-mode / gating model redesign (pre-orders foundation)

**Status:** Design captured 2026-06-18 (discuss-phase, operator). Pre-milestone seed for `/gsd:new-milestone`.
**Proposed slot:** own milestone (working name **V9.8 — Run-mode / gating model**), sequenced after V9.5 + V9.7 (both in flight), **before the orders swarm**. Orders only starts once V9.5/V9.7 work through Stage 3. Largely orthogonal to V9.5 (resolver engine) — parallel-able.

---

## Why this exists (the pivot)

Operator verdicts moved **into Outlook**: the `AI:` category label *is* the verdict surface now — the operator removes/edits a label to correct, and that delta is the correction signal (Graph delta-sync, P112.5/P117). Originally the Bulk Review UX was meant to be the verdict surface. That pivot makes "labels in Outlook" a **functional requirement** of the observe phase, not cosmetic — without the label the operator has nothing to correct on.

Today's gating is residue of that pivot and does not model the real intent:

- `public.swarms.dry_run_config` (jsonb) — per-stage booleans, `true` = BLOCKED, `false` = LIVE, missing = fail-closed. Per **swarm**, not per mailbox. Handlers are binary (blocked/live), no dry-capture.
- Scattered per-mailbox kill-switches: `debtor.labeling_settings.dry_run`, `public.info_routing_mailbox_settings.dry_run`.
- Per-row audit: `debtor.email_labels.status` (`pending|dry_run|labeled|skipped|failed`).
- No named modes, no lifecycle, no per-handler tri-state.

Live state (queried 2026-06-18) — only **sales** maps cleanly; the rest are mixed/custom:

| Swarm | Outlook label | Routing→review | External actions | Effective |
|-------|---------------|----------------|------------------|-----------|
| sales-email | live | live | none (handlers empty) | **Dry-run** (clean) |
| debtor-email | live | live | iController noise-**delete LIVE**, archive live; iController-label + invoice-copy blocked | Custom (partly live) |
| info-routing | off | **blocked** | archive live | Custom — archives but routes nowhere |
| support-tickets | off | off | all blocked | Dormant (`enabled=true`, fully gated) |

---

## The model — three orthogonal layers (operator vision, 2026-06-18)

**Layer 1 — Mailbox lifecycle (visibility), per email address.**
`Shadow → Dry-run → Live`, a **derived** state (not a stored enum knob).
- New swarm / new mailbox added to a swarm → **auto-starts Shadow**. System collects data first; mail visible **only in Bulk Review UX** (internal), not yet to operator/end-user.
- **Dry-run** → also visible to the operator (in practice: the Outlook label, the correction surface).
- **Live** → acts autonomously.

**Layer 2 — Per-stage enablement (per swarm).**
Each of the 5 pipeline stages independently on/off. In practice Stage 0 always on, Stage 1 almost always on, Stage 2 swarm-dependent, etc.

**Layer 3 — Per-handler state: `off | dry | live` (per handler).**
Handlers (iController-delete, Outlook-archive, reply-agent, …) each independently toggleable AND with their own **dry** mode that *simulates + captures evidence* instead of the real side-effect:
- iController-delete in dry → does not delete, takes **screenshots** so the operator can verify it would have picked the right email.
- reply-agent in dry → response lands in **draft**, not sent.
- **Constraint:** a handler can never be `live` if the stage that triggers it is on `dry`/`shadow`. Live handler requires a live trigger-stage.

The swarm/mailbox "mode" label is therefore **derived** from these layers — there is no single source-of-truth enum, and "custom/mixed" stops being a problem because the granular per-stage + per-handler state *is* the model.

---

## Decisions locked

- **Granularity:** stage/handler config = **per-swarm**; the Shadow→Dry→Live **lifecycle = per-mailbox** (every new mailbox onboards through shadow). Full per-mailbox *config* deferred.
- **Storage principle:** derive the mode; do not add a parallel `mode` enum that drifts from the flag truth (registry-as-source-of-truth). The storage *shape itself* gets a ground-up rethink (per-mailbox lifecycle + per-stage + per-handler tri-state; reconcile the two stray per-mailbox `dry_run` booleans + `email_labels.status`).
- **All 4 swarms** normalized in this milestone (sales, debtor, info-routing, support-tickets).
- **debtor noise-delete:** wanted production behavior — but governed by the per-handler off/dry/live model, not an implicit live flag.
- **Terminology:** "observe mode" alias dropped; **dry-run** is canonical.
- **Eventual UI:** a control/visibility surface showing, **per email address**, the exact per-stage + per-handler state.

## Open / for research + planning

- Storage shape (ground-up): per-mailbox lifecycle table; how per-stage + per-handler tri-state is represented; migration off `dry_run_config` + the two per-mailbox `dry_run` booleans + `email_labels.status` without breaking the workers that read `dry_run_config` today.
- Per-handler dry-capture mechanics per handler (iController screenshot, reply draft) — incremental, likely its own phase.
- The two renderers — `row-strip.tsx` "Auto-applied" badge + `filter-chip-strip.tsx` mode selector — add **Shadow** + derive mode from layers.
- Canonical matrix doc in `docs/agentic-pipeline/` (none exists today; the mapping lives only in `web/lib/pipeline-gating/dry-run-gate/index.ts` comments).

## Proposed phasing

1. **P1 — Model + storage + migration + renderers + matrix doc.** The gating model, normalize all 4 swarms to intended state, update both renderers (add Shadow + derive), write the canonical matrix doc. Shippable before orders.
2. **P2 — Per-handler dry-capture.** iController screenshot-instead-of-delete, reply-agent draft-instead-of-send, evidence surfaced for operator verification.
3. **P3 — Per-email-address control/visibility UI.** Operator surface to see/set per-stage + per-handler state per mailbox.

## Key code/refs

- `web/lib/pipeline-gating/dry-run-gate/index.ts` — current gate (`isStageBlocked`, `isHandlerBlocked`, `isStage3RoutingGated`).
- `supabase/migrations/20260603b_swarms_dry_run_config.sql` — `dry_run_config` shape + seed (seed is stale vs live).
- `web/app/(dashboard)/automations/[swarm]/_shell/components/row-strip.tsx` — "Auto-applied" badge renderer.
- `web/app/(dashboard)/automations/[swarm]/_shell/filter-chip-strip.tsx` — mode-filter renderer.
- `debtor.labeling_settings.dry_run`, `public.info_routing_mailbox_settings.dry_run`, `debtor.email_labels.status` — the scattered per-mailbox/per-row state to reconcile.
- Canonical pipeline: `docs/agentic-pipeline/README.md` (5-stage funnel); SWARM-02 invariant (no `if swarm===` branches — variance lives in registry data).
</content>
</invoke>
