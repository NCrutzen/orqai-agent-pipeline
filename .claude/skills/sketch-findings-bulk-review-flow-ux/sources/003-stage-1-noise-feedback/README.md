---
sketch: 003
name: stage-1-noise-feedback
question: "Inside the locked inline-expand pane at Stage 1, how do the Regex Pass-1 and LLM Pass-2 (rescue) cases present, and where does rule feedback live?"
winner: "section pattern (A+B equivalent layouts; LLM rescue ≡ regex visually)"
tags: [stage-1, noise, regex, llm, feedback, p2, req-02, detail-pane]
---

## Locked decisions (added to MANIFEST canon, carry into 004-007)

- **Evidence layout** = plain section pattern (uppercase label + verdict-pill + key/value body). No bordered colored cards. Same idiom across all stages — only labels and verdict-pill colors differ.
- **Email body block** = 14px / 1.65 line-height / `white-space: pre-wrap` (real newlines preserved) / NOT italic. Stage-themed left border (blue normal, red Stage-0 injection context). Highlight token = amber by default.
- **Body toolbar** = `↗ View full thread (N msgs)` button + `⇄ Translate ▾` dropdown + detected-language hint chip. Sits below the email-body section.
- **Thread modal** = 820px overlay, `conversation_id`-ordered, current message highlighted with stage-color left-border + "★ under review" tag. Esc to close, backdrop click to close. Modal has its own Translate dropdown for the full thread.
- **Eval-type radio REMOVED from operator UI** (revised post-sketch-004): asking operators "regression vs new case" requires remembering historical model behavior — unreasonable cognitive load. Server-side default = `eval_type=regression`. Engineers retag retroactively via a future QA admin surface. The `EvalTypeRadio` component remains in code but moves out of the operator override flow.
- **Notes textarea promoted to "audit-block"**: brand-accent left-border, semibold question heading ("Why this verdict?"), worked-example placeholder, larger min-height (160px for Stage 1 — bigger than Stage 2's 110px because Stage 1 rule-feedback tends to be more descriptive: rule patterns, sender behavior, suggested regex refinements). Optional but encouraged.
- **Rule feedback (REQ-02) affordance**: implicit via the green-Confirm / amber-Override footer. No standalone 👍/👎. Notes textarea is the free-text channel; feeds promotion-recommender.

# Sketch 003 — Stage 1 Noise feedback (regex + LLM rescue)

## What's already shipped (verified in code 2026-05-21)

- `Stage1Widget` (Phase 71-04 REVW-01): single-select dropdown with synthetic Noise/Archive items + registry noise categories ✓
- `EvalTypeRadio` (Phase 71-04 REVW-05, plain-English rewrite Phase 82.7.3): 2-card "Recent regression / New case" ✓
- `swarm_noise_categories` registry-driven category list ✓
- `classifier-screen-worker` Pass-2 LLM ✓ — fires only on Pass-1 `unknown`, closed-list output enforced
- `matched-span-highlight.tsx` ✓ — reusable highlight component for quoted spans
- `predicted-row.tsx` ↻ amber override glyph with operator/date tooltip ✓
- `candidate-rule-list.tsx`, `pending-promotion-detail-pane.tsx` ✓ — graduated-automation rule-promotion surfaces (out of scope for THIS sketch — covered later by sketch 006/007)

## Decisions confirmed before sketching

- **Rule feedback affordance**: implicit via the locked sketch 002 footer pattern. Confirm-button-green = rule fired correctly · Override-button-amber = category change. No separate 👍/👎 control.
- **LLM 2nd-pass shape**: "Treat it as just another rule" — single evidence card in the LEFT/Read column. Same field layout as Regex Pass 1, just different accent color (purple) + model/cost in header.

## What's NEW vs shipped code (this sketch defines)

- **Inline-expand 2-col layout** at activeStage=1 (replaces side-pane direction from sketches 004/008).
- **Notes textarea** wired to a new column on `email_feedback` / `agent_runs` — backend addition needed. Feeds the Phase 72 promotion-recommender.
- **Submit-button color logic** mirroring sketch 002: green on no-change, amber on dropdown change.
- **Evidence card variants**: blue accent for regex, purple accent for LLM rescue. Same skeleton fields (rule/key · confidence · reasoning · quoted span).
- **Cost in header** for LLM rescue rows (`0.018¢ · 286 tok · model_key`); "regex only" pill for pure-regex rows.

## How to View
```
open .planning/sketches/003-stage-1-noise-feedback/index.html
```
Tab between **A | B** at the top.

## Variants
- **A — Regex rule matched**: Pass 1 caught `payment_admittance_v3` at 92% confidence. No LLM call. Quoted span highlights "automatische bevestiging" + "betaling" keywords. Cost = 0.00¢.
- **B — LLM 2nd-pass rescue**: Pass 1 returned `unknown` (no rule matched); Pass 2 `stage-1-category-classifier` rescued to `ooo_temporary` at 81% confidence with reasoning. Quoted span highlights the absence indicator. Cost = 0.018¢, 286 tokens, model_key in header.

## What to Look For
1. **Workflow parity**: try toggling the dropdown in both A and B — same widget, same green/amber button swap. Confirms "treat LLM as just another rule" lock.
2. **Stage strip color**: regex matches use blue (`match`), LLM rescues use purple. Both flagged as `blocked` here because Stage 1 needs human review (sample mode or low confidence). In real auto-archive flow these would auto-flow without surfacing.
3. **Sibling row strip**: B's row 3 shows the failure case — both Pass 1 AND Pass 2 returned `unknown` at 32% confidence. Operator MUST decide. Currently rendered amber (warn) since neither pass succeeded.
4. **Notes textarea**: the placeholder copy differs per variant — for LLM rescues, hints at "would make a good new regex rule" because confirmed rescues are the Phase 72 promotion-recommender's primary input.

## Implementation dependencies (for plan-phase)

Backend additions needed:
- **New column** for free-text notes on Stage 1 feedback. Either `email_feedback.prose_notes` (already exists for Stage 0 per `overrideStage0Safety` action) extended to Stage 1, or a new `rule_note` column on `agent_runs`. Recommend: reuse `email_feedback.prose_notes` per the existing Stage 0 precedent — wider rollout already started.
- **New server action** `overrideStage1Noise` mirroring `overrideStage0Safety`: validates corrected_category against `swarm_noise_categories` registry, writes `email_feedback` (stage=1, verdict=confirm|override, corrected_value, prose_notes, eval_type). Already partially exists via Phase 71-04 — verify it accepts the eval_type + prose_notes inputs.

UI additions:
- **Inline-expand 2-col layout** at activeStage=1 (shared component from sketch 002).
- **LLM-rescue evidence card** — new component variant for when Pass 1 returned unknown and Pass 2 fired. Reads from `pipeline_events.decision_details` to pull the model_key, confidence, reasoning, matched_span.
- **Stage-strip color** for LLM rescues = purple. Add a new variant alongside the existing safe/match/warn/blocked.

Already covered:
- `Stage1Widget` dropdown shape reuses as-is.
- `EvalTypeRadio` 2-card reuses as-is.
- `MatchedSpanHighlight` reuses as-is for both Regex Pass 1 quoted spans and LLM Pass 2 quoted spans.

Out of scope (covered by later sketches):
- Rule promotion / candidate-rule-list surface → sketch 006 (pattern discovery clustering).
- Cross-rule pattern detection → sketch 006.
- Recommender handoff for new candidate rules → sketch 007.
