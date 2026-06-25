# Phase 135: Gating model + storage + migration + 4-swarm normalization (V9.8 P1a) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-25
**Phase:** 135-gating-model-storage-migration-4-swarm-normalization-v9-8-p1
**Areas discussed:** Derive rule (L1), Shadow scope, Invariant strictness, Normalize targets

---

## Derive rule (L1) — mixed-handler badge

| Option | Description | Selected |
|--------|-------------|----------|
| Highest-wins → Live | If ANY enabled side-effect acts autonomously, the badge reads Live. Honest about risk; simplest derive fn. | ✓ |
| Highest-wins + 'mixed' tag | Live-if-any, plus a 'partial/mixed' qualifier when not uniform. More informative; adds 136 renderer work. | |
| Lowest-wins → stays Dry | Badge stays Dry until ALL side-effects live. Can read 'Dry' while iController is really deleting. | |

**User's choice:** Highest-wins → Live
**Notes:** Ladder locked: Shadow = no operator-visible label yet (internal-only); Dry = label written, nothing acts; Live = ≥1 real side-effect.

---

## Shadow scope — runtime now or store-only

| Option | Description | Selected |
|--------|-------------|----------|
| Wire the gate now | 135 actually suppresses the Outlook label-write when mode=Shadow; new mailboxes safe-by-default end-to-end. | ✓ |
| Store-only, wire in 136 | 135 only represents Shadow; suppression lands with renderers. 'Defaults to Shadow' unenforced until 136. | |

**User's choice:** Wire the gate now
**Notes:** Makes MODEL-05 real. No mailbox flips to Shadow at cutover (all are dry/live), so no behavior change today; governs the next newly-added mailbox.

---

## Invariant strictness — trigger-stage invariant enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| DB-enforced (can't persist) | Constraint/trigger rejects handler=live on a non-live stage; illegal state unrepresentable. Plus a violation view. | ✓ |
| App-validate + flag only | Shared validate-fn + violations view; illegal state technically possible but surfaced. | |

**User's choice:** DB-enforced (can't persist)
**Notes:** Trust-ramp before NXT mutation — make the bad state unrepresentable. Exact mechanism (constraint vs trigger) deferred to research per chosen storage shape; the posture is locked.

---

## Normalize targets — intended per-swarm state

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm as stated | sales=clean dry-run; debtor=archive+noise-delete LIVE (explicit), labeling/invoice-copy held; info-routing=archive+routing live, verkoop/opleidingen forwards released; support-tickets=dormant/Shadow. | ✓ |
| Adjust one or more | Deliberately differ from today's effective state (flagged as a behavior change). | |

**User's choice:** Confirm as stated
**Notes:** Targets = today's effective behavior made explicit, zero behavior change at cutover. Debtor iController noise-delete stays LIVE — governed via the tri-state, not turned off.

---

## Claude's Discretion

- Storage shape (jsonb-on-`swarms` vs normalized tables) — explicitly handed to research by the brief.
- Exact invariant mechanism (CHECK constraint vs trigger vs generated column) — research, gated by storage shape.
- Precise per-swarm handler taxonomy enumeration — research/planning.
- Whether the forward-bucket map folds under the forward handler as a sub-map (recommended) — research.

## Deferred Ideas

- Mixed/partial visual qualifier on the mode badge → 136 renderer hint, not the model.
- Full per-mailbox stage/handler config → deferred past V9.8 (only lifecycle is per-mailbox).
- Reviewed-not-folded todos (draft-idempotency→137, provenance→136, override-note/stage-1-semantics→review surfaces, rename-label-resolver→unrelated).
