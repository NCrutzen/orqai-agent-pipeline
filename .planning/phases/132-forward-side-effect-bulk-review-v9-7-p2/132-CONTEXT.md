# Phase 132: Forward side-effect + Bulk Review - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn the persisted Stage-3 destination verdict from Phase 131 into a real Stage-4 side-effect:
**forward** each *routable* info@ email to its resolved departmental mailbox (idempotent, dry-run-gated,
brand-aware), **stamp the routing outcome back as an Outlook category** on the source mail (the V10
ambient-loop signal), and stand up the **info-routing Bulk Review surface** so operators can see/verify
routing decisions before and after release.

`algemeen` (no-forward / stays in info@) and `unrouted` (human triage) verdicts NEVER forward.

**Out of scope (later phases):** NL routing-config UI + `verkoop@→order@` routing (Phase 133);
ambient-loop coupling / correction events (Phase 134); any customer-facing reply generation (draft-reply track).
</domain>

<decisions>
## Implementation Decisions

### Forward mechanism
- **D-01:** Inline Outlook **forward** from info@ to the resolved departmental mailbox, with **reply-to set to the ORIGINAL sender** so the department can reply directly to the customer (not bounce through info@). *Research must validate Graph supports setting reply-to / `replyTo` on a forwarded message; if not feasible, fall back to inline forward that surfaces the original sender's address for one-click reply — capture the original sender either way.*
- **D-02:** Forward is **idempotent** — it MUST honor the Phase-131 two-layer dedup guard (ROUTE-05); re-runs never double-forward (no-op on replay / re-process). Forward only fires for `unrouted=false` verdicts that resolve to a non-null `target_mailbox`.

### Release / dry-run gating
- **D-03:** **Per-bucket graduated release** — forwarding is gated per destination bucket (e.g. release `storingen` first, then `verkoop`, …), NOT a single global switch. Builds on the existing held gate (ROUTE-07 `swarms.dry_run_config.stage_3_routing`) + the `granular-dry-run-gating` pattern. Registry/config-driven — **zero `swarm_type` literal** (SWARM-02).
- **D-04:** **Default = held/observe.** A bucket forwards only once it is explicitly released; until then the verdict is persisted + visible in Bulk Review but no side-effect fires.

### Category stamp-back
- **D-05:** On **successful forward**, stamp the source mail in info@ with a single Outlook category encoding **routed-status + bucket** (e.g. `AI: routed → storingen`). Non-forward outcomes get their own distinct markers (e.g. `AI: held`, `AI: triage` for unrouted, `AI: algemeen` for stays-in-info@). Keep the scheme **stable + machine-parseable** — it is the V10 ambient-loop signal.
- **D-06:** Brand-aware: the category reflects the resolved (bucket × brand) where relevant; `env_id='BX'` hard filter respected.

### Bulk Review surface
- **D-07:** **Reuse** the swarm-generic `[swarm]/review` Stage-3 surface; add a **routing detail pane** showing the 6-field verdict (bucket/brand/target_mailbox/confidence/dedup/unrouted) + **forward status** (held / forwarded / unrouted / dedup-skipped). No dedicated routing-only view.
- **D-08:** Operator **actions**: manual **override / re-route** to a different bucket, plus explicit **"forward now" / "don't forward"** controls. `algemeen` + `unrouted` appear in the queue for human handling (they never auto-forward).

### Claude's Discretion
Idempotency-key shape/storage; the exact Inngest `step.run` structure for the forward side-effect (replay-safe ids per CLAUDE.md); the precise category string format within the stable scheme; UI component reuse for the routing detail pane; how the per-bucket release flag is stored (config vs registry column) — research/planning decide.

### Reviewed Todos (relevant, informing decisions — not separately folded)
- `.planning/todos/pending/2026-05-18-granular-dry-run-gating-per-stage-and-handler.md` — informs D-03 (per-bucket gating mechanism).
- `.planning/todos/pending/2026-05-19-stage-4-layout-parity-and-detail-pane-width.md` — informs D-07 (Stage-4 detail-pane layout).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone + phase scope (locked)
- `docs/routing-swarm-milestone-charter.md` — V9.7 charter; §scope items (3) Stage-4 Outlook-forward + category stamp-back and (6) info-routing Bulk Review surface.
- `.planning/MILESTONES.md` (V9.7 section) — milestone goal, data baseline, hard constraints, sequencing (P0→P1→**P2**→P3→P4).
- `.planning/ROADMAP.md` (### Phase 132 section) — locked P2 scope + provisional success criteria.

### Inputs this phase consumes (from Phase 131)
- `.planning/phases/131-destination-taxonomy-stage-3-router-v9-7-p1/131-SPEC.md` — ROUTE-04/05/06/07 (verdict, dedup, unrouted, no-forward held gate) this phase releases + acts on.
- `web/lib/automations/info-routing/verdict.ts` — the persisted 6-field verdict shape (bucket/brand/target_mailbox/dedup/unrouted) the forward reads; `UNROUTED_BUCKET` sentinel; matched-null-target = no-forward (algemeen).
- `web/lib/automations/info-routing/dedup.ts` — the two-layer dedup guard (ROUTE-05) the forward MUST honor.
- `web/lib/swarms/registry.ts` + `web/lib/swarms/routing-destinations.generated.ts` — `resolveRoutingDestination` ({matched, target_mailbox}) + `routing_destinations.outlook_category` (the category source).

### Architecture (locked RFCs — read before touching pipeline code)
- `docs/agentic-pipeline/README.md` — 5-stage funnel; Stage 4 = handler/side-effect; Swarm Shapes (Router).
- `docs/agentic-pipeline/stage-3-coordinator.md` — the coordinator + held path (`isStage3RoutingGated`) that 132 releases.

### Project conventions
- `CLAUDE.md` — Inngest (`step.run` side-effects + replay-safe ids), Supabase RLS/migration + codegen, registry-as-source-of-truth, swarm-agnostic / zero `swarm_type` literal.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/app/(dashboard)/automations/[swarm]/review` — the swarm-generic Stage-3 Bulk Review surface; extend with a routing detail pane (D-07) rather than building a new view.
- `web/app/api/automations/info-routing/` — existing info-routing API route group; the Bulk Review data/actions endpoints likely live alongside.
- `web/lib/inngest/functions/debtor-email-coordinator.ts` — the generic Stage-3 coordinator + its **held path** (`stage_3_routing=true` currently withholds the predicted emit); 132 releases this per-bucket and wires the actual forward + category write. (Note: file name is legacy — it is the generic cross-swarm coordinator; rename tracked in a todo.)

### Established Patterns
- Inngest `step.run` for all side-effects + replay-safe id generation (CLAUDE.md / Phase 65 learnings) — the forward + category write are side-effects.
- Dry-run gating via `swarms.dry_run_config` (the ROUTE-07 held flag) — extend to per-bucket granularity (D-03).
- Registry-driven dispatch, zero `swarm_type` literal (SWARM-02) — the forward/dispatch path stays swarm-agnostic.

### Integration Points
- **Outlook Graph forward + category-write capability** — the codebase scout found NO existing Graph `forward`/category implementation. This is a **research dependency**: confirm/locate the Graph send/forward + `categories` PATCH capability (and the reply-to feasibility for D-01) before planning.
- The persisted `coordinator_runs.decision_details.routing` verdict + the TELE-01 `pipeline_events` dual-write are the trigger/source the forward consumes.
</code_context>

<specifics>
## Specific Ideas

- Department staff must be able to **reply directly to the customer** from the forwarded mail (D-01) — minimise friction; the forward is a routing step, not a wall between customer and department.
- The stamp-back category scheme (`AI: routed → <bucket>` / `AI: held` / `AI: triage` / `AI: algemeen`) is deliberately a **stable, parseable vocabulary** because Phase 134 / V10 reads it as the ambient-loop correction signal.
</specifics>

<deferred>
## Deferred Ideas

- **NL routing-config UI + `verkoop@→order@` routing** → Phase 133 (P3).
- **Ambient-loop coupling** (clicked-away / moved mail → `correction_event` → V10 loop) → Phase 134 (P4).
- **Mis-forward recipient feedback loop** (recipient flags a wrong route → labeled training/eval pair) → V10 (`.planning/todos/pending/2026-06-17-routing-misforward-feedback-loop-v10.md`).
- **Cross-swarm routing generalization** (routing as a generic capability for sales/debtor/order-entry) → spike when router #2 lands (`.planning/todos/pending/2026-06-17-cross-swarm-routing-generalization-spike.md`).
- **Rename the generic coordinator** off its legacy `debtor-email-coordinator` name → `.planning/todos/pending/2026-06-17-rename-generic-stage3-coordinator.md`.
- `algemeen@smeba.nl` mailbox verification — **resolved** (mailbox does not exist; algemeen is a no-forward outcome). No action needed in 132.
</deferred>

---

*Phase: 132-forward-side-effect-bulk-review-v9-7-p2*
*Context gathered: 2026-06-17*
