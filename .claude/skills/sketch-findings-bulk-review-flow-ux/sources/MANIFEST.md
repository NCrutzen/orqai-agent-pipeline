# Sketch Manifest — Bulk Review Flow UX

## Design Direction
Extend the Phase 71/76/82.5 Bulk Review surface into a single coherent operator workflow that spans all 5 pipeline stages (Stage 0 safety → Stage 1 noise/regex → Stage 2 entity → Stage 3 coordinator → Stage 4 handler) plus the pattern-discovery + promotion-recommender handoff into Phase 72. The Phase 71 sketches (002/003/004) lock the row + 4-axis override panel; this milestone resolves what's *inside* the detail pane for each stage, how cross-stage context renders, and what the new patterns + handoff surfaces look like.

Visual baseline: V7 production tokens (`themes/default.css` mirrors `Agent Workforce/.planning/sketches/themes/v7.css`). Brand-primary orange `#ff6a34` for chrome / primary actions; amber `#ffb547` for override / dirty state. Dark-first, dense-but-breathing, registry-driven (no hardcoded enums).

## Reference Points
- **Existing sketches 001-011** in `Agent Workforce/.planning/sketches/` — locked Phase 71/76/82.5 patterns. Do not re-invent the row strip, override panel, tab shell, or save/confirm treatment.
- **Phase 71 CONTEXT** (`Agent Workforce/.planning/phases/71-.../71-CONTEXT.md`) — ground truth for `pipeline_events_email_summary`, 4-axis write contract, `eval_type` tagging.
- **agentic-pipeline docs** — `docs/agentic-pipeline/{README,stage-0-safety,stage-1-regex,stage-2-entity,stage-3-coordinator,stage-4-handler,context-shape-contract,override-model,promotion-recommender,graduated-automation}.md` — locked stage contracts.
- **sketch-findings-agent-workforce skill** — curated design decisions from prior wrap-ups (auto-loaded).

## Pipeline Stage → REQ → Sketch Map

| Stage / Cross-cut | REQ(s) | Sketches |
|---|---|---|
| Mode chrome (live vs replay) | REQ-06 | 001 ★ A locked |
| Stage 0 — Safety | REQ-07 | 002 |
| Stage 1 — Noise (regex + LLM 2nd pass) | REQ-02 | 003 |
| Stage 2 — Customer (entity resolver) | REQ-05 | 004 |
| Stage 3 — Topic (coordinator ranked intents) | REQ-01 (Axis 3 facet) | 005 |
| Pattern discovery (cross-row clustering) | REQ-03 | 006 |
| Promotion-recommender handoff | REQ-04 | 007 |

**Canonical stage names** (locked in sketch 001): Safety · Noise · Customer · Topic · Action.
**Canonical mode colors** (locked in sketch 001): orange `--brand-primary` = live queue · slate-blue `--brand-secondary` = history.
**Canonical detail shape** (locked in sketch 002): inline-expand row, 2-col horizontal body (`Read` evidence left · `Decide` widget right), one row open at a time, J/K next-prev, ⏎ submit, Esc collapse. Replaces the legacy side-pane direction from sketches 004/008.
**Canonical verdict button colors** (locked in sketch 002): confirm = green `--lime`, override = amber `--amber`. Swap dynamically as radio/dropdown toggles; selected label tints to match.
**Canonical evidence layout** (locked in sketch 003): plain section pattern (uppercase label + `verdict-pill` on the right + key/value body) — NO bordered evidence-cards. Same idiom across Stage 0/1/2/3 — only the labels and verdict-pill colors differ per stage.
**Canonical email body block** (locked in sketch 003): `font-size: 14px`, `line-height: 1.65`, `white-space: pre-wrap` (preserves real newlines), NOT italic, blue left-border for normal context, red for Stage 0 injection context. Highlight token = amber background by default.
**Canonical body toolbar** (locked in sketch 003): below the email-body section — `↗ View full thread` button + `⇄ Translate ▾` dropdown + detected-language hint chip on the right.
**Canonical thread modal** (locked in sketch 003): `<dialog>`-style modal, 820px max, lists all messages in `conversation_id` order, current message highlighted with stage-colored left-border + "★ under review" tag. Esc closes. Modal has its own Translate dropdown (translates the whole thread).
**Canonical eval-type behavior** (revised in sketch 004): **REMOVED from operator-facing override UI.** Server-side default is `eval_type=regression`. The `EvalTypeRadio` component is repurposed to a QA admin surface (engineers retag overrides retroactively when investigating model regressions). Rationale: asking operators "regression vs new case" requires remembering historical model behavior for similar emails — unreasonable cognitive load for someone clearing a queue.

**Canonical override-mode focus** (locked in sketch 004): when the operator opens the Override disclosure, the **pick-card + Confirm button + Flip button + "or" divider all collapse**. Override form becomes the sole focus of the right column. Closing the disclosure restores the original confirm-by-default state.

**Canonical override input** (locked in sketch 004): **customer account number ONLY** for entity overrides — no fuzzy name search. The number is the canonical truth for downstream re-runs. Live validation: type number → resolved name appears as feedback (✓ green) or "no match · check the number" (✗ red).

**Canonical audit-trail block** (locked in sketch 004): every override requires a "How did you find this?" textarea — visually promoted (brand-accent left-border, tinted background, semibold question heading, 110px min-height, worked-example placeholder). Required. Submit disabled until filled. Feeds the promotion-recommender as ground-truth evidence.

**Canonical reorderable-list pattern** (locked in sketch 005): vertical list with stacked ▲▼ buttons per row (30×22px, filled chevron glyphs, hover = brand-orange fill + slight scale-up, disabled at edges). Position 1 highlighted with stage-themed color: green/lime when matching the system's pick ("DISPATCH WINNER"), amber when operator-reordered ("YOUR PICK"). Moved row pulses amber 600ms. "Reset order" button appears when dirty. Footer eval-contract note: *"Each move emits its own `pipeline_events` row · `eval_type=…`"*.

**Canonical escalate-to-human path** (locked in sketch 005): every stage's detail pane includes a red-bordered "⚠ None of these — escalate to human queue" action card below the primary editor. Maps to `agent_runs.status='routed_human_queue'` (existing terminal state). On click: the primary editor dims (40% opacity, pointer-events off), audit-block turns red-tinted with rewritten prompt ("What's missing from the registry?"), audit becomes REQUIRED, footer button flips to red "Escalate to Human ⏎". Click again to exit escalate mode. Operator-facing copy uses "human queue" / "human" — never the internal "Kanban" jargon.

**Canonical third-mode chrome** (locked in sketch 006): mode-bar extends from 2 halves to 3 thirds — Queue (orange) · History (slate-blue) · **Patterns (purple `#b886ff`)**. Same gradient + box-shadow chrome treatment, third color slot. Purple matches the LLM accent — signals "learning loop, system improving over time."

**Canonical operator-facing terminology** (locked in sketch 006): NO regex syntax, NO internal field names, NO statistical jargon ever visible to operators. Full translation lock-table lives in `006-pattern-discovery-cluster/README.md`. Highlights: `regex_rule`→"Filter rule" · `sender_mapping`→"Known sender" · `prompt_tune`→"AI tuning" / "Draft style" · `new_intent`→"New topic" · `confirm rate` / `tiebreaker` / `Wilson-CI gate` → never shown. Status pills use "needs review · being reviewed · applied · dismissed" (not "open · in_review · approved · rejected"). All raw regex / sender-domain patterns get plain-English descriptions ("Out-of-office replies with a return date in the subject" — not the regex itself).

**Canonical savings-estimation formula** (locked in sketch 006, spec in `006-pattern-discovery-cluster/README.md`): `expected_savings_cents_per_month = (matched_event_count_30d / 30) × 30 × (avg_replaced_path_cost − avg_promoted_path_cost) × clip(confirm_rate, floor=0.5, ceil=1.0)`. Round to whole €. Show "—" if `matched_event_count_30d < 3`. Cap at €99/mo per candidate; larger triggers engineering review. v1 = only deterministic promotions (full LLM cost saved); v2 = AI-tune resampling. Stored in `promotion_candidates.expected_savings NUMERIC(10,4)` with `savings_calculation_version` for forward compat.

**Canonical candidate-detail surface** (locked in sketch 007): full-page detail at `/automations/[swarm]/patterns/[candidate_id]`. Breadcrumb · header (kind badge + signature + status pill + headline stats: N times this month · est. €N/mo) · 2-column body (left = proposed-change card with before/after step-flow + evidence card with sample affected emails + impact stats grid · right = action card with Apply/Refine/Dismiss action triad + reveal panels) · footer with Submit + undo note.

**Canonical Apply/Refine/Dismiss action triad** (locked in sketch 007): three big-action buttons in the right-column action card. Colors mirror the verdict-button locks: **Apply** = lime green (default selected) · **Refine** = amber (reveals inline edit form with kind-specific fields) · **Dismiss** = red (reveals required audit textarea, Submit disabled until reason ≥ 8 chars). Footer Submit button color and label follow the selected action. Same color semantics as sketches 002/004/005 — green confirm, amber alter, red destructive/escape. The Refine reveal carries operator-facing kind-specific form fields (subject pattern for Filter rules, sender pattern + customer account number with live registry validation for Known senders, intent_key + handler binding for New topic, prompt-diff editor for AI tuning v2, tone-example pairs for Draft style v2).

**Canonical before/after change preview** (locked in sketch 007): two-column step-flow inside the proposed-change card. Each side a numbered list of operational steps + a footer cost-per-email line. The "after" side shows the cost delta (`saves ~€0.022`) in lime. Reusable for any operator-facing change-preview need beyond promotion candidates.

**Canonical reversibility framing** (locked in sketch 007): operator-facing copy never says "this is irreversible". Every action surface includes the line *"all actions are logged · an engineer can reverse Apply if it misbehaves"* in the footer. Rollback itself is an engineer surface (out of scope for the operator UI per LERN-05).

## Sketches

| # | Name | Design Question | Winner | Tags |
|---|------|----------------|--------|------|
| 001 | live-vs-replay-mode | How does the surface signal "live audit" vs "replay/sandbox" without hijacking the chrome? | **A — Mode-keyed shell** | mode, chrome, p5, req-06 |
| 002 | stage-0-safety-detail-convergence | Side-pane vs inline-expand for Stage 0 detail surface, + section order | **C — Inline-expand** | stage-0, safety, detail-pane, p5, req-07, inline-expand |
| 003 | stage-1-noise-feedback | Detail-pane shape for regex Pass-1 + LLM Pass-2 rescue + rule feedback | **Section pattern (A+B layouts equivalent)** | stage-1, noise, regex, llm, feedback, p2, req-02 |
| 004 | stage-2-resolver-attribution | Show "sender-map vs identifier vs LLM tiebreaker" attribution glanceably + override flow (number-only + audit trail) | **A+B layouts equivalent** | stage-2, attribution, override, p2, req-05 |
| 005 | stage-3-ranked-intent-reorder | Re-pick top intent + reorder ranked list + escalate-to-human escape hatch | **vertical reorderable list w/ ▲▼ + escalate path** | stage-3, intents, escalate, p3, req-01 |
| 006 | pattern-discovery-cluster | "5 similar overrides this week" — cross-stage clustering listing | **A — Stage-grouped** | patterns, clustering, third-mode, p4, req-03 |
| 007 | promotion-recommender-handoff | Candidate detail · proposed-change preview · Apply / Refine / Dismiss | **A+B layouts equivalent (kind-data differs)** | promotion, handoff, apply-refine-dismiss, p4, req-04 |

## Workflow Note
This is a frontier-mode sketch session running **per-stage discussions** before each build. Each sketch starts with a short Socratic exchange on (a) what the operator should achieve at this stage and (b) the UX/UI tradeoffs, then proceeds to 2-3 variants. All sketches use shared theme + share toolbar / interactivity patterns from `sketch-tooling.md` and `sketch-interactivity.md`.
