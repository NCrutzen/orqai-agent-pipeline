# Phase 133: NL routing-config + verkoop→order - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-18
**Phase:** 133-nl-routing-config-verkoop-order-v9-7-p3
**Areas discussed:** NL-rule grammar/target, Approval & ownership, NL-config surface (UX), verkoop→order mapping

---

## NL-rule grammar/target

| Option | Description | Selected |
|--------|-------------|----------|
| Prompt steering (hint/few-shot) | Approved rules become NL hints injected into the Stage-3 router prompt; LLM still classifies | ✓ |
| Registry rows only | NL config only grows/toggles routing_destinations; classification stays pure LLM | |
| Predicate rule layer | New table of sender/subject/content predicates, evaluated deterministically | |

**User's choice:** Prompt steering.
**Notes:** Reframed into a dynamic candidate-list router (the NL text = the destination's description, injected at invoke). Two follow-ups: (1) does NL config also add destinations? → **Steering + destinations**; (2) what can change live without a developer? → **Fully new types too**. Then (3) day-one behavior of a new destination → **Starts dry-run/held**, with the user's refinement: *"Waarbij dan dus auto-labeling in outlook start"* — Outlook bucket-label applies immediately during observe, forward stays held. Consequence flagged: this revises 131's just-shipped closed-list router and drops the routing_destinations codegen literal-union (scoped exception to the migration+codegen constraint).

## Approval & ownership

| Option | Description | Selected |
|--------|-------------|----------|
| Staff propose, operator approves | Centralized single approval gate | |
| Operator only (propose + approve) | No staff-facing propose UI | |
| Department self-approve | Staff propose + approve own rules, no central gate | ✓ |

**User's choice:** Department self-approve.
**Notes:** Backstop → **See-all dashboard + global kill-switch + audit trail**. Enforcement → **Soft / honor-system** (no per-department RBAC; UI groups by department; audit + kill-switch cover misuse). Dependency flagged: authenticated multi-user staff dashboard access (O365 SSO still deferred).

## NL-config surface (UX)

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated rules page | Dashboard page: type → preview → confirm | |
| Inline in Bulk Review | Add/edit rules from the review surface | |
| Email/Teams a sentence | Send a plain message, ingested + parsed | ✓ |

**User's choice:** Email/Teams a sentence → channel narrowed to **Microsoft Teams**.
**Notes:** Teams is net-new (no existing integration); lazy path = Zapier Teams trigger → Vercel. Trust boundary = Teams channel membership = internal whitelist (mandatory input validation). Confirm model → **Confirm-first** (bot posts parsed rule, staffer reacts ✅/❌).

## verkoop→order mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Intent→destination map (deterministic) | Reuse already-computed Stage-3 intent → order@{brand} | ✓ |
| Re-run the dynamic-list router | Feed verkoop@ mail through the info@ LLM router | |

**User's choice:** Intent→destination map.
**Notes:** Scope → **service_request OUT** (only the two named intents quote_acceptance/order_status). Brand resolved from source verkoop@ mailbox; forward reuses Phase 132 wholesale.

## Claude's Discretion

- Rule store + audit table shape; runtime read mechanics for routing_destinations description/active.
- Dynamic-list router prompt + invoke-variable injection + Zod-against-active-set validation.
- Teams transport specifics (Zapier vs Graph subscription) + bot reply/reaction-capture mechanics.
- Intent→destination map storage; held-with-bucket Outlook category string within 132's scheme.

## Deferred Ideas

- service_request → order@ handoff (needs sub-classification) — later sales-routing iteration.
- Ambient-loop coupling → Phase 134.
- Mis-forward recipient feedback loop → V10 (todo 2026-06-17).
- Cross-swarm routing generalization spike → when router #2 lands (todo 2026-06-17).
- Rename legacy debtor-email-coordinator → todo 2026-06-17.
- Hard per-department RBAC (rejected for go-live).
- Auto-activate + undo confirm model (rejected in favor of confirm-first).
