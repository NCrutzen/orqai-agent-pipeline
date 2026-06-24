# Phase 133: NL routing-config + verkoop→order - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Two routing extensions on top of the 131/132 routing layer:

1. **NL routing-config** — staff describe in natural language which mail goes where; an LLM
   turns the sentence into a *proposed* routing rule; a human confirms; the rule becomes
   **registry data, not code**. An approved rule = a destination's **description**, injected
   at invoke-time into a **dynamic candidate-list Stage-3 router** (the router classifies
   against the live set of active destinations + descriptions, not a baked enum). Staff can
   create **fully new destination types live**, with no per-destination developer deploy.

2. **verkoop@→order@** — the `sales-email` swarm's already-classified Stage-3 intents
   `quote_acceptance` + `order_status` forward to `order@{brand}` via a **deterministic
   intent→destination map**. The first cross-mailbox *sales* routing; composes Stage 2 +
   intents + the 131 routing capability (131 D-03), zero `swarm_type` branch.

**Out of scope:** ambient-loop coupling / `correction_event` (Phase 134); customer-facing
reply generation (draft-reply track); `service_request` order-handoff (deferred — only the
two named intents this phase).
</domain>

<decisions>
## Implementation Decisions

### NL-rule grammar & target
- **D-01: Approved rule = prompt-steering, not a deterministic predicate engine and not
  registry-rows-only.** The NL text becomes a destination's natural-language **description**.
  The Stage-3 router no longer emits a baked closed-list enum — at invoke time the coordinator
  injects the **current active destinations + their descriptions** into the prompt and the LLM
  picks from that injected list. Output validated (Zod) against the live active set; below
  confidence → `unrouted`.
- **D-02: Steering and "new destination" are the SAME write.** Adding a destination =
  `INSERT {key, brand, target_mailbox, description, active, status, …}` into
  `routing_destinations`; it appears in the next classification. No separate "add destination"
  flow.
- **D-03: Staff can create fully NEW destination types live** (categories the router was never
  prompted on) — feasible *because* the router is dynamic-list (D-01), so a never-seen bucket
  is just another candidate+description in the injected list.
- **D-04: ⚠ This REVISES Phase 131's just-shipped router.** 131 built `info-routing-coordinator`
  with **closed-list, codegen literal-union** bucket enforcement (131 D-01/D-03). Phase 133
  reworks it to **dynamic-list** mode and **drops the `routing_destinations` codegen
  literal-union**. `routing_destinations` becomes **runtime read + runtime write**. This is an
  **explicit, justified exception** to the milestone hard constraint
  (*registry changes ship as migration + codegen, never live writes*) — scoped to
  `routing_destinations` only, justified in the migration + PR. Researcher/planner: treat the
  router as **rework, not greenfield**; the closed-list enum/output-schema enforcement is removed.
- **D-05: New-destination day-one behavior = classification + Outlook label live, forward held.**
  A newly-approved destination immediately (a) produces persisted verdicts (visible in Bulk
  Review) and (b) **auto-labels the source mail in Outlook with the predicted bucket** (e.g.
  `AI: storingen`) so staff see + correct the routing *in Outlook itself*. The **forward stays
  held** until an operator releases that bucket via 132's per-bucket graduated release
  (132 D-03/04). This extends 132's stamp vocabulary so **held outcomes carry the predicted
  bucket**, not a generic `AI: held`. (The Outlook-label-during-observe is also the signal
  Phase 134's ambient loop reads.)

### Approval & ownership (governance)
- **D-06: Department self-approve — no central approval gate.** Department staff both propose
  and confirm their own rules. (Composes safely with D-05: a self-approved rule changes
  classification + Outlook labeling immediately, but cannot auto-forward to a *new* department —
  forward release stays operator-gated. For buckets already released, a self-approved rule
  changes live routing instantly.)
- **D-07: Operator backstop = see-all + global kill-switch + audit trail.** Every rule is logged
  with proposer + timestamp + before/after text. The operator has a surface listing ALL rules
  across departments and can disable/override any one instantly. This replaces the missing
  central gate.
- **D-08: Soft (honor-system) department scoping.** Any authenticated staffer may edit any rule;
  the UI groups rules by department for clarity but does NOT hard-block cross-department edits.
  No per-department RBAC. Audit (D-07) + kill-switch cover misuse — fits a small trusted internal team.

### NL-config surface (UX)
- **D-09: Channel = Microsoft Teams.** Staff send the rule-sentence to a Teams channel. ⚠ The
  codebase has **zero Teams integration today** — net-new ingest path + research item. The lazy,
  MR-consistent route is **Zapier's Teams trigger → Vercel API route** (Zapier-first, mirrors the
  `zapier_tools` registry pattern), NOT a bot/Graph-subscription registration unless research
  shows it's needed.
- **D-10: Trust boundary = Teams channel membership.** Only members of the designated internal
  channel can submit rules — membership *is* the internal-sender whitelist. (Mandatory input
  validation at the trust boundary: no rule from outside the channel/tenant is honored.)
- **D-11: Confirm-first activation.** After the LLM parses the message, the bot replies in-thread
  with the parsed rule (e.g. "I read this as: route X → verkoop@, brand smeba"); the staffer
  reacts ✅ to activate / ❌ to discard. Catches LLM **mis-parses** before they mislabel mail.

### verkoop→order mapping
- **D-12: Deterministic intent→destination map.** A registry mapping
  `quote_acceptance | order_status → destination 'order' → order@{brand}`, keyed on the
  **already-computed Stage-3 intent** — no second LLM classification. Composes with 131 D-03
  (sales-email runs Stage 2 + intents *and* a routing verdict). Distinct from info@'s
  content-classified dynamic-list router: verkoop→order is an **intent handoff**, deterministic.
- **D-13: Brand resolved from the source verkoop@ mailbox** (verkoop@smeba → order@smeba, etc.;
  3 brands smeba/fire-control/berki). `env_id='BX'` filter respected.
- **D-14: `service_request` is OUT of scope** (only "a part" is order-related; routing all of it
  risks mis-forwarding service tickets). Phase 133 maps only the two named intents.
- **D-15: Forward reuses Phase 132 wholesale** — reply-to original sender (132 D-01), idempotent +
  two-layer dedup (132 D-02 / 131 D-04), per-bucket graduated release default *held* (132 D-03/04),
  category stamp-back (132 D-05). No new forward mechanism.

### Claude's Discretion
- Exact shape/columns of the rule store + audit trail (proposed/approved status, proposer,
  timestamps, before/after) and how `routing_destinations.description` + `active` are read at
  runtime (cache vs direct DB read per invoke).
- The dynamic-list router prompt + invoke-variable shape (how active destinations+descriptions
  are injected) and the Zod-against-active-set validation; follow CLAUDE.md Orq conventions
  (`list_models` first, `anyOf` nullable, strict json_schema where a schema still applies).
- Teams transport specifics (Zapier trigger config vs Graph subscription) and the bot reply /
  reaction-capture mechanics — research dependency.
- The intent→destination map storage (new small table vs a column on `routing_destinations` /
  `swarm_intents`) and the held-with-bucket Outlook category string within 132's stable scheme.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone + phase scope (locked)
- `docs/routing-swarm-milestone-charter.md` — V9.7 charter. §scope (5) **NL-config UI** (line 85:
  "medewerker typt … LLM zet om naar registry-routing-rules … mens keurt goed") and (6)
  **verkoop@→order@** (line 86); §verified-mailboxes (lines 53-54, order@/verkoop@ × 3 brands);
  line 47 (verkoop→order intent volumes); line 115 (the **open NL-config ownership** question this
  phase resolves: D-06/07/08).
- `.planning/MILESTONES.md` (V9.7 section) — milestone goal, hard constraints, P0→…→**P3** sequencing.
- `.planning/ROADMAP.md` (V9.7 section, Phase 133 line) + `.planning/REQUIREMENTS.md` (P3 / `NLCFG-xx`).

### Inputs this phase consumes / revises (from 131 + 132)
- `.planning/phases/131-destination-taxonomy-stage-3-router-v9-7-p1/131-CONTEXT.md` + `131-SPEC.md` —
  the destination registry, the verdict shape, and the **closed-list router this phase reworks to
  dynamic-list** (see D-04). Read 131 D-01 (registry) + D-03 (composable Stage-3 seam) before planning.
- `.planning/phases/132-forward-side-effect-bulk-review-v9-7-p2/132-CONTEXT.md` — the forward
  side-effect, per-bucket graduated release, category stamp-back, Bulk Review surface this phase reuses (D-05/D-15).
- `web/lib/automations/info-routing/verdict.ts` — persisted verdict shape (`UNROUTED_BUCKET`, matched-null = no-forward).
- `web/lib/automations/info-routing/dedup.ts` — two-layer dedup guard the forward honors.
- `web/lib/swarms/registry.ts` + `web/lib/swarms/routing-destinations.generated.ts` —
  `resolveRoutingDestination`; **the generated literal-union this phase drops** (D-04).

### Pipeline architecture (locked RFCs — read before touching the coordinator)
- `docs/agentic-pipeline/README.md` — 5-stage funnel, Swarm Shapes (Router/Hybrid), Stage 2→3 contract, 4-axis override.
- `docs/agentic-pipeline/stage-3-coordinator.md` — coordinator + held path (`isStage3RoutingGated`); hard-separation rule.
- `web/lib/inngest/functions/coordinator-orchestrator.ts` + `web/lib/inngest/functions/debtor-email-coordinator.ts`
  (legacy-named generic Stage-3 coordinator) — the composable Stage-3 orchestrator + verdict persistence to extend.

### Sales swarm (verkoop→order)
- `web/lib/automations/debtor-email/coordinator/intent.generated.ts` — `sales-email` intent list
  (incl. `quote_acceptance`, `order_status`) the map keys on.
- `supabase/migrations/20260609b_phase113_sales_swarm_intents.sql` +
  `supabase/migrations/20260611_phase113_agent_runs_intent_check_sales.sql` — registered sales intents (V9.0 / Phase 113).

### Project conventions
- `CLAUDE.md` — Inngest (`step.run` side-effects + replay-safe ids), Supabase RLS/migration + codegen,
  registry-as-source-of-truth + zero `swarm_type` literal (note the **scoped exception** D-04), Orq + Zapier conventions.
- `.claude/skills/spike-findings-agent-workforce/SKILL.md` — Phase 88 info-routing blueprint (registry-driven, cross-swarm rules).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `coordinator-orchestrator.ts` / generic Stage-3 coordinator — extend the routing capability from
  closed-list (131) to **dynamic candidate-list** (D-01/D-04); add the intent→destination map step (D-12).
- `routing_destinations` table + `resolveRoutingDestination` — gains `description` + becomes
  runtime read/write; the `.generated.ts` literal-union is dropped (D-04).
- Phase 132 forward + per-bucket release + category stamp-back — reused for both info@ new-destinations
  (held + bucket-label, D-05) and verkoop→order (D-15).
- `web/app/(dashboard)/automations/[swarm]/review` Bulk Review — the operator see-all + kill-switch +
  rule list (D-07) likely lives here or in a sibling routing-rules surface.

### Established Patterns
- Composable Stage-3 (131 D-03): a swarm runs whichever capabilities the registry declares
  (Stage 2 / intents / routing). verkoop→order = intents + routing composed, no branch.
- Zapier-first transport (`zapier_tools` registry, Zapier→Vercel) — the likely Teams ingest path (D-09).
- Dry-run gating via `swarms.dry_run_config` + granular per-bucket release — the held gate for new destinations (D-05).
- Orq dynamic-candidate routing: inject candidate list + descriptions at invoke; validate output against the live set (D-01).

### Integration Points
- **Teams → rule ingest**: NO existing Teams integration — research dependency (D-09); confirmation
  reply / reaction-capture round-trip (D-11).
- **Authenticated staff dashboard access**: D-06/07/08 assume multi-user staff auth exists; O365 SSO
  is a deferred phase — researcher MUST confirm the auth substrate (or the surface degrades to operator-only).
- Rule store + audit trail (D-07) → feeds the dynamic-list router's injected descriptions (D-01) and
  the operator kill-switch.
- Intent→destination map (D-12) reads the already-computed Stage-3 sales intent → 132 forward.

</code_context>

<specifics>
## Specific Ideas

- The NL rule text literally **becomes the LLM's description of the destination** — there is no
  separate "rule language"; staff prose is the steering signal (D-01).
- Held/observe destinations are still **visible AND correctable in Outlook** (the bucket category is
  applied even before forward release) — operator watches real verdicts in the inbox, then releases
  the forward (D-05). This is the operator's confidence-building loop on staff-authored, unproven categories.
- verkoop→order is deliberately the **simple, deterministic** routing case (intent map) — a foil to
  the info@ content-classified dynamic-list router — and the proof that the composable seam (131 D-03)
  carries a second swarm with zero per-swarm code.

</specifics>

<deferred>
## Deferred Ideas

- **`service_request` → order@ handoff** (~23/mo, only "a part" is order-related) — needs a
  sub-classification to split; defer to a later sales-routing iteration (D-14).
- **Ambient-loop coupling** — clicked-away / moved / re-labeled mail → `correction_event` → V10 loop
  tunes routing rules → **Phase 134 (P4)**. (The D-05 Outlook-label-during-observe is the signal it reads.)
- **Mis-forward recipient feedback loop** (recipient flags a wrong route → labeled training pair) → V10
  (`.planning/todos/pending/2026-06-17-routing-misforward-feedback-loop-v10.md`).
- **Cross-swarm routing generalization** spike when router #2 lands
  (`.planning/todos/pending/2026-06-17-cross-swarm-routing-generalization-spike.md`).
- **Rename the legacy `debtor-email-coordinator`** generic Stage-3 coordinator
  (`.planning/todos/pending/2026-06-17-rename-generic-stage3-coordinator.md`).
- **Hard per-department RBAC** (rejected as honor-system for go-live, D-08) — revisit only if cross-department tampering becomes real.
- **Auto-activate + undo** confirm model (rejected in favor of confirm-first, D-11) — reconsider if ✅-friction proves too high.

</deferred>

---

*Phase: 133-nl-routing-config-verkoop-order-v9-7-p3*
*Context gathered: 2026-06-18*
