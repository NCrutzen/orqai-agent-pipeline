---
sketch: 007
name: promotion-recommender-handoff
question: "What does the candidate detail surface look like — proposed-change preview, evidence, and the Apply / Refine / Dismiss action triad?"
winner: "A and B equivalent (same shape, different kind data)"
tags: [patterns, promotion, recommender, apply, refine, dismiss, p4, req-04, handoff]
---

# Sketch 007 — Promotion-recommender handoff (Apply / Refine / Dismiss)

## What's already shipped (verified in code 2026-05-21)

- **`candidate-rule-list.tsx`** (Stage 1 only, partial — sketched as the listing-side precedent in sketch 006).
- **`promotion-recommender.md`** STUB (Phase 72 design memo) — defines `promotion_candidates` schema, cron contract, non-goals (never blocks pipeline, never auto-applies, no cross-swarm in v1).
- **Inline-expand / audit-block / mode-bar / section-pattern** — all reusable patterns locked through sketches 002-006.

## What's NOT shipped (this sketch + Phase 72 plan)

- The actual `promotion_candidates` table.
- The Inngest cron writing candidates.
- The detail/approve surface (this sketch defines it).
- Migration-generation when Apply is clicked (turning a candidate into a real config change).

## Locked decisions

- **Full-page detail surface** at `/automations/[swarm]/patterns/[candidate_id]`. Opens when operator clicks "Review →" on a cluster card in sketch 006.
- **Three actions** (mirroring sketch 005's escalate-path color semantics): **Apply** (green/lime, default) · **Refine** (amber, reveals an edit form) · **Dismiss** (red, requires audit reason).
- **Surface structure**: header (breadcrumb · kind + signature + status + headline stats) → 2-column body (left = proposed change + evidence · right = action card with the three buttons + reveal panels) → footer with Submit button + undo note.
- **Before/After in the proposed-change card** = the operator-friendly equivalent of a migration diff. Numbered step-flow on each side + per-email cost line + savings delta in the after column.
- **Evidence section** shows real recent emails the suggestion would have affected. For sender-link candidates includes the 1-of-N reviewer-corrected examples in the cluster — operator can see the failure mode the suggestion is correcting.
- **Refine flow** is inline (not a separate route): clicking Refine reveals form fields with the candidate's parsed payload (regex pattern + optional sender filter for Filter rules; sender pattern + customer account number with live validation for Known sender). Submit becomes "Apply refined rule ⏎".
- **Dismiss requires a reason** (audit textarea ≥ 8 chars). Submit button stays disabled until satisfied. Mirrors the audit-required pattern from Stage 2 overrides (sketch 004).
- **Undo note in footer** for EVERY action: *"all actions are logged · an engineer can reverse Apply if it misbehaves"* — sets the right expectation about reversibility without overselling.

## How to View
```
open .planning/sketches/007-promotion-recommender-handoff/index.html
```

Tab between **A | B**. Inside each variant, click each of the three buttons (Apply · Refine · Dismiss) to see the reveal panel + how the footer Submit button label changes.

## Variants

- **A — Filter rule** (Stage 1 OoO subject pattern): the most-concrete change shape. Proposed-change before/after shows the 5-step flow today (regex miss → AI 2nd-pass → archive · €0.022/email) vs after (regex match → archive · €0.000/email · saves €0.022). Refine reveals subject-pattern textbox + optional sender narrow.
- **B — Known sender** (Stage 2 `@partner-co.nl` → Partner Co BV #0203): the entity-link change shape. Before/after shows AI tiebreaker vs deterministic sender-map. Refine reveals sender-pattern + customer-account-number input with live registry validation (✓ name match feedback).

Same surface shape applies to the other kinds:
- **AI tuning** (Stage 3 prompt-tune): Refine reveals a structured prompt-diff editor (out of scope to fully sketch but the layout slot exists).
- **New topic** (Stage 3 new_intent): Refine reveals intent-key + handler binding form.
- **Draft style** (Stage 4): Refine reveals tone-config knobs or prompt example pairs.

## What to Look For

1. **Apply is selected by default + footer button is green.** Operator can hit ⏎ immediately. The dominant action takes one keystroke.

2. **Click Refine.** The amber-bordered reveal appears with form fields. Submit flips amber and re-labels to "Apply refined rule ⏎". In Variant B the customer account number field shows live resolved-name feedback below it (`✓ Partner Co BV · NXT db moyne_smeba`) — same canonical pattern from sketch 004.

3. **Click Dismiss.** Red-bordered reveal with the required reason textarea. Submit goes RED + disabled. Type 8+ chars in the textarea → enables with label "Dismiss suggestion ⏎".

4. **Evidence rows tell the cluster's story.** Variant A shows 5 of 23 emails the rule would catch, with the operator-friendly `→ would auto-archive` chip. Variant B shows 5 of 7 with `→ Partner Co` chips, including a row marked `→ AI picked wrong` (the 1-of-7 reviewer correction case) — surfaces the failure pattern the candidate is correcting.

5. **Impact stats are repeated in the evidence card** for end-of-page visual recap (emails affected · confirmation rate · est. monthly savings).

6. **Undo note is consistent** for all three actions. Operator never sees "this is irreversible" — Phase 72 ships with engineer-led rollback (per the recommender stub's LERN-04 + LERN-05).

## Implementation dependencies (for plan-phase)

### Server actions
- **`applyCandidate(candidate_id, refinement?: object, note?: string)`** — flips `promotion_candidates.status='approved'`, stamps `approved_by` + `approved_at`, **generates a deployable change**: a SQL migration for Filter rules (INSERT into `classifier_rules`) and Known senders (INSERT into the sender-map table). For AI tuning / new topic / draft style — writes to the relevant config registry. Returns a confirmation + migration file path for engineer review.
- **`refineCandidate(candidate_id, refinement: object, note: string)`** — same as Apply but with operator-edited payload. Refinement schema differs per kind:
  - Filter rule: `{subject_pattern: string, sender_filter?: string[]}`
  - Known sender: `{sender_pattern: string, customer_account_id: string}`
  - AI tuning: `{prompt_diff: string}` (deferred to v2 — out of scope for this milestone)
  - New topic: `{intent_key: string, handler_event: string, handler_status: 'placeholder' | 'registered'}` (handler defaults to placeholder = routes to human queue until engineer wires it)
  - Draft style: `{tone_examples: Array<{before: string, after: string}>}` (v2)
- **`dismissCandidate(candidate_id, reason: string)`** — flips `promotion_candidates.status='rejected'`, stores reason in `proposed_change.dismissal_reason`. Reason ≥ 8 chars required (matches audit-block minimum in sketches 003-006).

### Schema additions on `promotion_candidates`
- `dismissed_by uuid NULL` · `dismissed_at timestamptz NULL` · alongside the existing `approved_by` / `approved_at` columns (per the recommender stub).
- `display_signature text NOT NULL` — the rendered plain-English string from sketch 006 (so the detail header doesn't need to re-render).
- `before_after_payload jsonb NOT NULL` — the 5-step flow text + cost numbers shown in the change-card. Server-side rendered at cron time so format changes don't break historical candidates.
- `evidence_email_ids uuid[] NOT NULL` — already in the stub as `evidence_event_ids`; UI joins to `email_pipeline.emails` for the sender / subject / received_at columns shown in the evidence rows.

### Reversibility (engineer-led)
Per the recommender stub LERN-05 (rollback traceability). Out of scope for the operator UI — engineer's QA admin surface gets a "rolled_back" status transition + audit log. The operator-facing surface says "an engineer can reverse" and doesn't expose the rollback button itself.

### Test simulator (out of scope, mention for future)
The proposed-change card could grow a "Test this change against last 30 days of emails" button that runs the candidate against historical `pipeline_events` and shows the exact set of emails it would have caught (with TP / FP / FN counts). Defer to a v2 enhancement after Phase 72 ships.

## Carries into MANIFEST canon

- **Apply / Refine / Dismiss action triad** as the canonical pattern for any operator-facing "system suggestion approval" surface (any decision point that flips `status` on a backend candidate record).
- **Refine = inline reveal** with kind-specific form fields, not a separate route. Cleaner than disclosure-via-navigation; the operator stays in context.
- **Dismiss requires a reason** ≥ 8 chars. Same audit-block treatment as Stage 2 customer overrides (sketch 004) but red instead of amber.
- **Before/After flow** = numbered step list, side-by-side, with cost line + savings delta. Reusable for any operator-facing change-preview need.
