---
sketch: 002
name: stage-0-safety-detail-convergence
question: "Inside the Stage 0 detail surface, side-pane or inline-expand — and what's the section order?"
winner: "C"
tags: [stage-0, safety, detail-pane, p5, req-07, convergence, inline-expand]
---

## Locked decisions (carry into 003-007)

- **Inline-expand wins** over side-pane. Row opens downward to full viewport width — no subject/strip squeezing, sibling rows stay visible, one row open at a time.
- **Detail-block layout** = 2-col horizontal: `Read` (system reasoning) on the left | `Decide` (verdict widget · notes · submit) on the right. Replaces the locked sketch-008 side-pane shape for stages that need rich evidence (Stage 0/1/2/3). Sketch 007 row-action affordances (inline-expand for Replay/Reclassify/Close) extend naturally into this same idiom.
- **Confirm vs Override button color**:
  - "Confirm" (operator agrees with system verdict) → **green** (`--lime`)
  - "Override" (operator changes system verdict) → **amber** (`--amber`, signal color)
  - Button switches dynamically as the radio toggles. Label of the selected radio gets the matching tint.
- **Submit footer** = shared across all stages: `Skip · N` (secondary) · primary button with mode-dependent color + label. Keyboard: `⏎` submits, `Esc` collapses, `J/K` next/prev row (sketch 007 lock carried).
- **Detail header** = stage pill (amber/red urgency-tinted) + timestamp + cost summary inline → no separate Cost section needed in the body when summary is in head.

# Sketch 002 — Stage 0 detail-pane convergence

## What's already shipped (verified in code 2026-05-21)
- `/automations/[swarm]/stage-0` page (Phase 82) with unified shell + stage-keyed tab strip ✓
- `overrideStage0Safety` server action — writes `email_feedback` (stage=0) + re-emits `stage-0/email.received` with `safety_overridden=true` ✓
- `Stage0Widget` — 2-state radio (Injection suspected / Clean) wired to bulk-review:override-submit window event ✓
- Legacy `SafetyDetailPane` (Phase 64) — 3-section (Regex · LLM · Cost) with 3 buttons (Mark safe & reprocess / Correct & Dismiss / Escalate). Lives in `stage-1/components/`, surfaces when `topic='safety_review'` ✓

## What's NOT shipped (this sketch resolves)
- A converged Stage 0 detail-pane inside the unified shell. Today there are two surfaces (legacy 3-section in Stage 1 + bare radio in unified Stage 0) and the stage-0 page banner says: *"The dedicated safety-review surface is out of scope for Phase 76 and will be built in a follow-up phase."*
- This sketch defines that converged shape: legacy Phase 64 sections (Regex · LLM verdict + quoted span · Cost) at the top, plus the Phase 82 Stage0Widget radio + shared Submit-override footer.

## Decisions confirmed before sketching
- **Stay 2-state** (`safe` / `injection_suspected`) — `over_budget` deferred (not in DB enum or UI today).
- **Row strip Safety cell** is settled by sketch 001: blocked-stage treatment + Queue/History mode chrome already communicate Safety urgency. No new row-cell language needed.
- **Override exists** (contrary to stale `override-model.md` claim that "Stage 0 has no override axis"). Doc to update post-milestone.

## Design Question
Section order inside the unified pane:
- **Context-first** — Phase 64's read-then-decide rhythm. Risk: front-loads cognitive cost on rows where the verdict is obviously correct.
- **Decision-first** — Verdict + one-line summary at top, "Why" reasoning collapsed. Risk: encourages thoughtless confirmations on the dangerous edge cases.

## How to View
```
open .planning/sketches/002-stage-0-safety-detail-convergence/index.html
```
Tab between **A | B** at the top.

## Variants
- **A — Context-first:** Regex → LLM verdict (+ quoted span) → Cost → Your verdict (Stage0Widget) → Submit footer. Matches Phase 64's SafetyDetailPane rhythm.
- **B — Decision-first:** Stage0Widget at top with one-line summary → email body with highlighted span for sanity → full Regex/LLM/Cost collapsed behind "Why this verdict ▸".

## What to Look For
1. **Variant C (winner):** click the orange-bordered row to collapse, then any other row to expand. Toggle the radio to watch the submit button swap green ↔ amber and the label tint follow.
2. **A and B (legacy comparison):** the side-pane variants are kept for reference. The visible failure mode is the cramped subject + stage strip on a typical viewport — exactly why we moved to inline-expand.
3. **Reused vocabulary:** confirm-green / override-amber semantics + the inline-expand `Read` | `Decide` 2-column shape become canonical for sketches 003 (Stage 1), 004 (Stage 2), 005 (Stage 3).

## Implementation dependencies (for plan-phase)

Verified shipped today (no work needed):
- ✓ `result.regex_matched` populates from `stage-0-safety-worker.ts` → surfaces as "Regex screen · Pattern matched"
- ✓ `result.llm_reason` populates → "Why" subsection
- ✓ `result.matched_span` populates → "Quoted from email body" subsection with `<MatchedSpanHighlight>`
- ✓ `result.cost_cents` + `result.token_count` populate → moved into detail-block header inline summary
- ✓ `overrideStage0Safety` server action wired to `bulk-review:override-submit` window event (Phase 82, 2026-05-19)
- ✓ Optimistic removal via `markPendingRemoval(emailId)` already in `Stage0Widget`

To wire for this sketch's shape:
- **New: inline-expand container** in the `_shell/row-list.tsx` — currently renders flat rows; needs an expanded-row slot. Pattern reference: sketch 007 row-action inline-expand.
- **New: 2-column body component** that conditionally renders by `activeStage`: Stage 0 = Regex/LLM/Span (left) + Widget (right). Other stages get their own left-column content but share the right-column widget shape.
- **Move: existing `SafetyDetailPane` content** (in `stage-1/components/safety-detail-pane.tsx`) into the new component — same evidence sections, repositioned. Retire `OptionZDetailPane` side-pane usage for Stage 0 (and progressively for other stages as 003-005 convert).
- **Update: stale doc `docs/agentic-pipeline/override-model.md`** which still claims "Stage 0 has no override axis." Add a note that operator-override-to-safe ships via `overrideStage0Safety` server action.
- **Cost summary** moves from its own section into the inline-expand header → small refactor of where `cost_cents` / `token_count` get rendered (still same source).
- **Optional cleanup**: the legacy `dismissSafetyReview` and `escalateToKanban` actions (3-button pattern from Phase 64) need a decision — keep as secondary actions in the footer? Drop entirely? This sketch shows the simplified Confirm/Override binary; the 3-button pattern can revisit in a follow-up if escalation-to-human-review still needs an explicit affordance.
