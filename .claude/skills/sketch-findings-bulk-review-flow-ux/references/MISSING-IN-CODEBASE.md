# MISSING-IN-CODEBASE — Bulk Review Flow UX

**Purpose:** every piece of data the sketches surface that the backend does NOT yet provide, the schema additions needed, and the server actions / cron jobs to be built. **Treat this as the gap manifest — if a sketch shows it but it's listed here, the implementing agent must build it.**

Verified against the `Agent Workforce/` codebase on 2026-05-21. Re-verify before each plan-phase if more than a week has passed.

---

## Stage 0 · Safety — gaps

### What sketch 002 shows but isn't fully wired

| Sketch element | Status today | Gap | Build target |
|---|---|---|---|
| `result.regex_matched` displayed as "Pattern matched" | ✓ shipped — populated by `stage-0-safety-worker.ts` | none | reuse |
| `result.llm_reason` displayed as "Why" | ✓ shipped | none | reuse |
| `result.matched_span` rendered with `<MatchedSpanHighlight>` | ✓ shipped — component exists at `web/app/(dashboard)/automations/[swarm]/stage-1/components/matched-span-highlight.tsx` | **lives under stage-1/ — needs to move to a shared location** when Stage 0 / Stage 2 / Stage 3 share the same highlight pattern | refactor: move `MatchedSpanHighlight` to `web/app/(dashboard)/automations/[swarm]/_shell/components/matched-span-highlight.tsx`, update Stage 1 import |
| `result.cost_cents` + `result.token_count` shown in inline-expand header | ✓ shipped in `SafetyDetailPane` (Phase 64) | **the unified shell at `/stage-0/page.tsx` does NOT render cost/tokens today** | wire: when `activeStage=0`, pull `cost_cents` + `token_count` from `pipeline_events.decision_details` and render in the inline-expand header per sketch 002 spec |
| `model_key` shown next to cost | ✓ populated in `SafetyDetailPane` | same — not in unified pane | wire alongside cost |
| Two-state radio (Injection suspected / Clean) | ✓ shipped — `Stage0Widget` (Phase 82) | none | reuse |
| `overrideStage0Safety` server action | ✓ shipped (2026-05-19) — writes `email_feedback` + re-emits `stage-0/email.received` with `safety_overridden=true` | none | reuse |
| **Confirm-green / Override-amber footer button color swap** | ✗ NOT shipped — current footer uses static button | **NEW behavior**: button color follows radio state (lime when Clean→Confirm, amber when flipped to Override-to-Safe) per sketch 002 lock | implement in unified pane footer |
| **Inline-expand row** (replaces side-pane) | ✗ NOT shipped — `OptionZDetailPane` is currently side-pane | **REPLACE** the side-pane with an inline-expand row container in `_shell/row-list.tsx`. Pattern: when a row is selected, it expands downward to full-row-width with a 2-col body (Read · Decide) | implement (substantial change — see IMPLEMENTATION-SEQUENCE.md Phase 2) |
| **Read column 2-col body** layout | ✗ NOT shipped | new component | implement (see canonical-patterns.md `.inline-body` CSS) |
| Legacy 3-button SafetyDetailPane (Mark safe & reprocess / Correct & Dismiss / Escalate to human review) | ✓ shipped in `stage-1/components/safety-detail-pane.tsx` | **decision deferred**: keep the 3-button as secondary actions OR drop in favor of binary Confirm/Override. Sketch 002 went binary; user has not weighed in. | DECIDE in plan-phase — recommend keeping `dismissSafetyReview` + `escalateToKanban` actions accessible from a secondary `…` menu but NOT visible by default. Binary is the dominant case. |

### Email body + thread (sketch 002 / 003 / 004 / 005 — shared)

| Sketch element | Status today | Gap | Build target |
|---|---|---|---|
| Quoted span block with `white-space: pre-wrap` + 14px / 1.65 line-height | ✗ NOT shipped — current `<blockquote>` uses italic, smaller font | **NEW** — implement per `canonical-patterns.md` `.quoted-span` spec | new component `_shell/components/email-body-block.tsx` |
| Highlight token (amber default) | ✓ partial — `<MatchedSpanHighlight>` does the highlight | **color drift**: today highlights are colored by the calling stage (red for injection, etc.). Lock: highlight = amber regardless of stage. | refactor `MatchedSpanHighlight` to always use amber; stage-color only goes on the cell strip / pill |
| "↗ View full thread (N msgs)" button | ✗ NOT shipped at all | **NEW** — opens a modal showing the conversation thread | implement (see "Thread modal" below) |
| "⇄ Translate ▾" dropdown (Original / English / Dutch / Français) | ✗ NOT shipped | **NEW** — French inbox support coming. Sketch wires the dropdown as a placeholder; the actual translate call ships in a later phase. | implement the dropdown UI now (no-op), wire to a future translate server action |
| Detected-language hint chip (e.g. `detected: nl`) | ✗ NOT shipped — language not detected today | **NEW** — needs a language detector either client-side (compact lib) or server-side (cheap LLM call cached on `emails.detected_language`) | add `email_pipeline.emails.detected_language text NULL` column + populate at ingest |

### Thread modal (sketches 002–005 — shared)

| Sketch element | Status today | Gap | Build target |
|---|---|---|---|
| Modal overlay with `conversation_id`-ordered messages | ✗ NOT shipped — there is NO conversation/thread reconstruction surface today | **NEW** — biggest gap on this list | **Backend**: confirm `email_pipeline.emails` has a `conversation_id` (or `thread_id`) column. Per `Agent Workforce/docs/agentic-pipeline/README.md`, the existing schema does include thread linkage via Outlook conversation_id — **verify the column name and index before implementing the loader**. |
| Per-message body with current-message highlighted (orange border + ★ under review tag) | ✗ NOT shipped | **NEW** | new component `_shell/components/thread-modal.tsx` |
| Translate dropdown inside the modal head | ✗ NOT shipped | **NEW** — same future translate wiring | placeholder UI now |
| `MatchedSpanHighlight` reused in the current message body inside the modal | reusable but not used here yet | wire | reuse |

---

## Stage 1 · Noise — gaps

### What sketch 003 shows but isn't fully wired

| Sketch element | Status today | Gap | Build target |
|---|---|---|---|
| `Stage1Widget` category SELECT dropdown | ✓ shipped (Phase 71-04 REVW-01) | none | reuse |
| Synthetic dropdown items at top (Noise / Archive) + registry categories below | ✓ shipped | none | reuse |
| Eval-type radio (Recent regression / New case) | ✓ shipped (`EvalTypeRadio` Phase 71-04 / Phase 82.7.3) | **EXPLICITLY REMOVED from operator UI** in sketch 003 retro-apply. Server defaults to `eval_type=regression`. The component itself stays in code for a future engineer/QA admin surface. | **REMOVE from operator detail pane**. Default server-side. Engineer admin retag surface = out of scope for this milestone. |
| Regex Pass-1 evidence (rule_key + confidence + action) | ✓ persisted in `pipeline_events.decision_details` | partial — `decision_details` JSONB shape needs to carry `{rule_key, confidence, action}` consistently | **VERIFY** the `decision_details` shape Stage 1 writes today. If `rule_key` isn't there, add to `classifier-screen-worker.ts` and `classifier-verdict-worker.ts` writes. Document the shape in `_shell/_lib/types.ts`. |
| LLM Pass-2 evidence (model_key + verdict + confidence + reasoning + quoted span) | ✓ partial — `classifier-screen-worker.ts` records the LLM verdict + reasoning, but `matched_span` may not be populated for Stage 1 | **GAP**: Stage 1 LLM 2nd-pass needs to write `matched_span` (the body text the LLM cited as evidence for its noise verdict) — analogous to how Stage 0 records it. | update `classifier-screen-worker.ts` to extract + persist `matched_span` to `pipeline_events.decision_details.matched_span` |
| **Purple `llm-rescue` color** on Noise cell when Pass 2 fired | ✗ NOT shipped — today's cell is the same color regardless of pass | **NEW** — stage-cell renderer needs to know whether Pass 2 fired (read `decision_details.passes`) and render purple instead of blue | extend `_shell/row-list.tsx` cell renderer per canonical-patterns.md stage-cell variants |
| Notes textarea (audit-block style, 160px min-height) | ✗ NOT shipped — current widget has no note input | **NEW** — needs a `prose_notes` column on `email_feedback` (already exists for Stage 0 — REUSE) | reuse `email_feedback.prose_notes`. UI: add the audit-block component per sketch 003 lock. |
| **Inline-expand row + 2-col body** | ✗ NOT shipped (same gap as Stage 0) | **NEW** | shared component from Stage 0's work |
| Submit button green/amber swap on dropdown change | ✗ NOT shipped — current footer is static | **NEW** | implement in unified pane footer |
| Server action `overrideStage1Noise` (parallel to `overrideStage0Safety`) | ✓ partial — Phase 71-04 ships `recordVerdict` action. **Verify it accepts** `prose_notes` + writes `email_feedback` with stage=1 | **CHECK** `web/app/(dashboard)/automations/[swarm]/stage-1/actions.ts` — confirm `recordVerdict` matches the contract. If not, add. | likely small extension |

---

## Stage 2 · Customer — gaps

### What sketch 004 shows but isn't fully wired

| Sketch element | Status today | Gap | Build target |
|---|---|---|---|
| `Stage2Widget` customer combobox (debounced 250ms) | ✓ shipped (Phase 71-04 REVW-02) | none — but **sketch 004 explicitly REPLACED** this with a number-only input | the dropdown combobox stays in legacy/admin surfaces; the operator override flow uses the new number-only input |
| `Stage2OverrideWidget` (Phase 88 Plan 02) wrapper | ✓ shipped | reuse the override POST + optimistic removal logic, swap the inner widget | refactor |
| `searchCustomers` server action (`coordinator_runs DISTINCT`) | ✓ shipped | **the new number-only input does NOT search by name** — it validates a typed account number against the customer registry. Need a different lookup: `getCustomerByAccountNumber(account_id)` | **NEW** server action `resolveCustomerByAccountId(account_id: string) → {name, nxt_database}`. Validates against the per-brand NXT database. |
| "Re-run Stage 3 + 4" toggle (default ON when overriding) | ✓ shipped as `reRun` boolean in `Stage2Widget` | wire to the default-ON behavior described in sketch 004 + B's auto-toggle-on-flip | extend `Stage2OverrideWidget` |
| **Resolver chain visualization** (4-step vertical list with status markers) | ✗ NOT shipped at all | **BIGGEST Stage 2 gap** — backend needs to persist the per-step trace | **NEW** persist `decision_details.steps: [{step, status, confidence, detail}]` JSONB on Stage 2 `pipeline_events`. See canonical-patterns.md `.resolver-chain` spec. |
| LLM tiebreaker candidates (the alternative not picked) | ✗ NOT shipped — only the winning customer persists | **GAP**: when Step 4 LLM fires, store the alternatives in `decision_details.candidates_considered: [{account_id, name, supporting_identifier}]` so the UI can show what the LLM chose between | update Stage 2 resolver to record candidates |
| Sender-map "promoted from LLM-aided to deterministic in W18" lineage line | ✗ NOT shipped — promotion history not surfaced | **NEW** — needs `sender_map.promoted_at + promoted_from_event_ids[]` for the lineage display | add columns to sender-map table |
| Number-only input with live `✓ Customer Name · acct 0079 · NXT db moyne_smeba` validation feedback | ✗ NOT shipped — current combobox is name-search-first | **NEW** input pattern | implement per canonical-patterns.md `.customer-input-row` + `.resolved-feedback` |
| Audit-trail textarea required ≥ N chars; Submit disabled until filled | ✗ NOT shipped — current override has no required reasoning | **NEW** — needs `prose_notes` (or equivalent) on the override write path + client-side validation | reuse `email_feedback.prose_notes` column |
| Override-disclosure pattern (Confirm visible by default, Override revealed) | ✗ NOT shipped | **NEW** | implement |
| Collapse upper region (pick-card + Confirm button + flip buttons + divider) when override opens | ✗ NOT shipped | **NEW** | per canonical-patterns.md |
| Variant B: 2 big-action buttons (Confirm LLM pick · Flip to alternative) | ✗ NOT shipped at all | **NEW LLM-tiebreaker-specific UI** — only renders when `decision_details.steps[3].status === 'picked'` AND a runner-up exists | implement |

---

## Stage 3 · Topic — gaps

### What sketch 005 shows but isn't fully wired

| Sketch element | Status today | Gap | Build target |
|---|---|---|---|
| `Stage3Widget` single-select dropdown | ✓ shipped (Phase 71-04 REVW-03) | **sketch 005 REPLACES** this with the ranked-list editor for the operator override flow | dropdown stays in legacy/admin surfaces |
| `coordinator_runs.ranked_intents` JSONB persistence | ✓ shipped (CORD-01) — Stage 3 classifier writes the full ranked list | none | reuse |
| `loadSwarmIntents(swarm_type)` registry helper | ✓ shipped | none | reuse |
| `handler_agent_key` tooltip on each intent | ✓ in dropdown today; **sketch shows handler key inline below the intent_key** instead | layout difference | implement per sketch 005 row layout |
| **Ranked-list editor** with stacked ▲▼ buttons + confidence bar | ✗ NOT shipped at all | **BIGGEST Stage 3 gap** | **NEW** component `_shell/components/ranked-intent-editor.tsx` per canonical-patterns.md spec |
| Position #1 highlighted with green-tinted background + `DISPATCH WINNER` tag | ✗ NOT shipped | part of new component | implement |
| Dirty state: #1 row turns amber + tag becomes `YOUR PICK` + footer flips to amber `Submit reorder → {new_top_intent} ⏎` | ✗ NOT shipped | part of new component | implement |
| Reset order button (shown when dirty) | ✗ NOT shipped | part of new component | implement |
| Server action `reorderStage3Intents` writing **one `pipeline_events` row per moved position** | ✗ NOT shipped at all | **NEW** server action. Each position change emits a `pipeline_events` row with `stage=3`, `eval_type='intent-correction'`, `decision_details={from_position, to_position, intent_key}` | **NEW** server action — see canonical-patterns.md for the exact contract |
| Top-1 change → re-emit `<swarm>/predicted` to re-run Stage 3.5 + 4 | ✗ NOT shipped — the existing `Stage3Widget` only flips `corrected_intent` without re-dispatching | **NEW** — when operator promotes a different intent to position 1, the action must call `inngest.send({name: '<swarm>/predicted', data: {...}})` so the dispatcher re-routes | extend `reorderStage3Intents` action |
| Sub-position reorders (positions 2..N) = pure eval signal, NO re-dispatch | ✗ semantics need to be enforced server-side | **NEW** — distinguish position-1 changes from sub-position reorders. Only top-1 triggers re-dispatch. | enforce in `reorderStage3Intents` |
| **Escalate-to-Human path** (red-tinted card below the editor) | ✗ NOT shipped at all | **NEW** | implement per canonical-patterns.md `.escalate-row` |
| Escalate-mode state: editor dims, audit-block turns red + becomes required + prompt rewrites to "What intent is missing from the registry?" | ✗ NOT shipped | part of new component | implement |
| Escalate action → flips `agent_runs.status='routed_human_queue'` + creates Kanban automation_runs row | ✓ partial — the existing Stage 3.5 dispatcher does this for placeholder intents; operator-triggered escalation needs its own server action | **NEW** server action `escalateStage3ToHuman(email_id, swarm_type, audit_note)` | implement |

---

## Pattern discovery + Promotion handoff — gaps (sketches 006-007)

### What sketches 006 and 007 show but doesn't exist at all yet

| Sketch element | Status today | Gap | Build target |
|---|---|---|---|
| `public.promotion_candidates` table | ✗ NOT shipped — only a stub design memo (`docs/agentic-pipeline/promotion-recommender.md`) | **NEW** | per the stub: id · kind · swarm_type · stage · expected_volume · expected_savings (NUMERIC(10,4)) · evidence_event_ids (uuid[]) · proposed_change (jsonb) · status · approved_by · approved_at · **+ dismissed_by + dismissed_at + display_signature + before_after_payload + savings_calculation_version** (additions from sketches 006-007) |
| Inngest cron writing candidates | ✗ NOT shipped | **NEW** — nightly, business-hours-only per CLAUDE.md cron defaults | **NEW** Inngest function. Reads `pipeline_events` via the partial index. Clusters override-driven rows. Writes `promotion_candidates`. Idempotent. |
| Plain-English `display_signature` rendering per cluster | ✗ NOT shipped | **NEW** — the cron generates the operator-facing string at write time so format changes don't break historical candidates | server-side renderer per kind (regex_rule / sender_mapping / new_intent / prompt_tune / draft_style) |
| `expected_savings` computation per the canonical formula | ✗ NOT shipped | **NEW** — formula is locked in canonical-patterns.md and sketch 006 README | implement in cron per formula |
| `before_after_payload` (the 5-step flow text + cost numbers shown in sketch 007 change-card) | ✗ NOT shipped | **NEW** — also server-side rendered at cron time | per-kind rendering function |
| Patterns top-level mode (third slot in the mode-bar) | ✗ NOT shipped — current mode-bar only knows Queue (and Stage tabs underneath); History + Patterns are both NEW modes per this milestone | **NEW** route `/automations/[swarm]/patterns` + extending the mode-bar component | implement |
| Cluster card listing surface (sketch 006) | ✗ NOT shipped | **NEW** | implement per sketch 006 spec |
| Filter chips (all · needs review · being reviewed · applied) | ✗ NOT shipped | **NEW** | URL query param `?status=…` |
| Per-stage subtotals (Variant A) | ✗ NOT shipped | **NEW** | server-side aggregation |
| Candidate detail surface at `/automations/[swarm]/patterns/[candidate_id]` (sketch 007) | ✗ NOT shipped | **NEW** | new route |
| Server actions: `applyCandidate` · `refineCandidate` · `dismissCandidate` | ✗ NOT shipped | **NEW** | three server actions — see canonical-patterns.md |
| Apply → generates a deployable change (migration for regex rules, INSERT for sender mappings, config write for prompt-tune) | ✗ NOT shipped | **NEW** — migration generation is the highest-stakes piece. v1 ships regex_rule + sender_mapping + new_intent (deterministic kinds only). prompt_tune + draft_style deferred to v2. | **NEW** migration generator per kind |
| Engineer rollback surface (`status='rolled_back'` transition) | ✗ NOT shipped — out of scope for this milestone per LERN-05 | **DEFER** — operator UI ships without a rollback button; engineer admin surface is a follow-up | out of scope |

---

## History mode — gaps (sketch 001)

| Sketch element | Status today | Gap | Build target |
|---|---|---|---|
| Mode-bar 3-thirds (Queue · History · Patterns) | ✗ NOT shipped — current shell has stage-keyed tabs only, no top-level mode selector | **NEW** component | implement per canonical-patterns.md `.modebar` |
| `/automations/[swarm]/queue` vs `/automations/[swarm]/history` URL routes | ✗ NOT shipped | **NEW** | implement |
| History dataset filter (date range, browse handled rows) | partial — `pipeline_events` is queryable but no operator-facing browse exists | **NEW** UI for date filter + sort | implement |

---

## Anti-drift gap notes (read this before building)

1. **The locked sketch 001 chrome colors are non-negotiable.** Orange `--brand-primary` = Queue. Slate-blue `--brand-secondary` = History. Purple `#b886ff` = Patterns. Never reassign.
2. **The 5-stage names are non-negotiable.** Safety · Noise · Customer · Topic · Action. Operator-facing copy never says "Stage 1" without the name; never says the internal table name (`swarm_noise_categories`, `swarm_intents`).
3. **Confirm = green, Override = amber, Escalate/Dismiss = red, Refine = amber.** This color triad applies everywhere a verdict button exists. Sketch 005's escalate, sketch 007's dismiss, sketch 002/004/005 confirms — all use the same colors. **Coding agents must NOT invent new color semantics.**
4. **The inline-expand row pattern is the canonical detail container.** Not a side-pane. Not a modal. Sketch 002 explicitly retired the side-pane direction from earlier work (`sketch 004` in `Agent Workforce/.planning/sketches/` and `sketch 008` from Phase 82.5). If an agent reverts to side-pane "for consistency with the existing OptionZDetailPane", that's drift — block and reference this file.
5. **Operator-facing copy never uses internal jargon.** Full translation lock-table in `operator-language.md`. Coding agents reading this skill must check copy strings against the lock-table before merging.
