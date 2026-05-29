# Implementation Sequence — Anti-drift build order

**Purpose:** the recommended order to build the 5-phase milestone (Foundation → Single-row context → 4-axis capture → Pattern discovery + handoff → Live-mode audit + Stage 0 lane). Designed so each phase produces something operators can use AND prevents the most common drift pattern: agents building leaf UI before shared backend data is locked.

The 5 phases map to ROADMAP.md and REQ-01..REQ-07. This sequence is **stricter** than the roadmap — it dictates within each phase WHAT to build first so dependencies land in the right order.

---

## Phase 1 · Foundation (substrate)

**Goal:** lock the data shapes and shared components every later phase consumes.

### 1.1 Backend data shapes (block on this)

Before any UI work, lock these schema shapes:

| What | Why | Where |
|---|---|---|
| `pipeline_events.decision_details` JSONB shape per stage | Every detail-pane reads from this; drift here cascades everywhere | Document in `web/lib/agentic-pipeline/types.ts` or a co-located `.d.ts`. Per-stage TypeScript discriminated union. Field-by-field. |
| Add `decision_details.matched_span` to Stage 1 `classifier-screen-worker.ts` | Stage 1 LLM evidence needs the quoted span | extend worker + DB write |
| Add `decision_details.steps[]` (4-step trace) to Stage 2 resolver writes | Stage 2 resolver-attribution UI depends on this | extend `resolve-debtor.ts` |
| Add `decision_details.candidates_considered[]` for Stage 2 LLM tiebreaker | Sketch 004 Variant B shows the runner-up | extend `resolve-debtor.ts` |
| Add `email_pipeline.emails.detected_language` column + populate at ingest | Body toolbar shows `detected: nl` chip | migration + ingest hook |
| Verify `email_pipeline.emails` has `conversation_id` (or equivalent) | Thread modal depends on this | grep / migration check |
| Confirm `email_feedback.prose_notes` shape (already exists for Stage 0) | Reused by Stages 1/2/3 audit textareas | grep `overrideStage0Safety` action for current contract |

**Acceptance gate before moving past 1.1:** every detail-pane component must have a known data source. If a sketch element has no backend wiring, EITHER add backend now OR explicitly mark it deferred (with a comment in code AND in this milestone's STATE.md).

### 1.2 Shared UI primitives

Build these in `web/app/(dashboard)/automations/[swarm]/_shell/components/`:

| Component | Used by | Notes |
|---|---|---|
| `MatchedSpanHighlight` (already exists, MOVE from stage-1/components) | Stages 0/1/2/5; thread modal | refactor — preserve API |
| `EmailBodyBlock` | Stages 0/1/2/3 detail panes | wraps `.quoted-span` + body toolbar (View thread + Translate + lang hint) |
| `ThreadModal` | Stages 0/1/2/3 detail panes via the body toolbar | reads `email_pipeline.emails` filtered by conversation_id |
| `AuditBlock` | Stages 0/1/2/3 + sketch 007 | brand-orange left-border container with question + sub + textarea. Variants: required vs optional, audit vs dismiss color |
| `ConfirmOverrideButton` | Stages 0/1/2/3 + sketch 007 | the green/amber/red switching submit button. Takes `mode: 'confirm' | 'override' | 'escalate' | 'dismiss' | 'apply' | 'refine'` |
| `ModeBar` (3-third extension) | Top-level shell | Queue · History · Patterns |

These are SHARED components — building them in `_shell/components/` (not under any stage-specific dir) is the anti-drift guard. If a coding agent builds a per-stage `AuditBlock` "for now and we'll consolidate later", that's how drift starts. Block.

### 1.3 Inline-expand row container

`_shell/row-list.tsx` today renders flat rows + uses `OptionZDetailPane` as a side-pane. The biggest refactor:

1. Replace side-pane with inline-expand container
2. Selected row expands downward to full-row-width
3. Inline body grid `1fr 1fr` for Read · Decide
4. Header band with stage pill + cost summary + collapse affordance
5. Footer band with keyhints + Skip + primary submit button
6. Keyboard: ⏎ Esc J K N (per canonical-patterns.md §4)

**This is the single biggest implementation effort in Phase 1.** Once it lands, Stages 0/1/2/3 detail panes plug in as content slots.

### 1.4 ModeBar 3-third

Extend the current shell with the 3-mode top bar. Routes:
- `/automations/[swarm]/queue` (existing, may need URL rename)
- `/automations/[swarm]/history` (new)
- `/automations/[swarm]/patterns` (new — Phase 4 fills the content)

Phase 1 doesn't fill History or Patterns — they're stub pages. The bar exists so later phases plug in.

### Phase 1 acceptance

- Operator can open the unified shell, see the 3-mode bar (Queue active by default).
- Inline-expand container works on any stage tab — expanding a row reveals an empty 2-col body (Read · Decide placeholders).
- Shared primitives (`MatchedSpanHighlight`, `EmailBodyBlock`, `ThreadModal`, `AuditBlock`, `ConfirmOverrideButton`) exist and are usable.
- Backend data shapes locked + documented.

---

## Phase 2 · Single-row context (Stage 0/1 evidence) — REQ-02, REQ-05

**Build Stage 0 first, then Stage 1.** Stage 0 has the simplest evidence shape and the least gnarly override semantics.

### 2.1 Stage 0 detail content (sketch 002 Variant C)

1. Stage 0 page (`/automations/[swarm]/stage-0/page.tsx`) wires the inline-expand container with Stage 0 content
2. Left column: Section pattern with Regex screen · LLM verdict (model + verdict pill + Why + quoted span) · cost moved to header
3. Right column: `Stage0Widget` 2-state radio (Injection suspected / Clean) + AuditBlock optional notes
4. Footer: `ConfirmOverrideButton` switching green/amber based on radio
5. Body toolbar with View thread modal + Translate placeholder + language hint
6. Cost + tokens + model in the inline-expand header

**Migrate the legacy `SafetyDetailPane`** (the side-pane in `stage-1/components/safety-detail-pane.tsx`) into the new shape. Keep the action-bar semantics; binary Confirm/Override replaces the 3-button (Mark safe & reprocess / Correct & Dismiss / Escalate to human review). Per sketch 002 deferred-decision: `dismissSafetyReview` and `escalateToKanban` actions can move to a `…` secondary menu for the rare cases — not visible by default.

### 2.2 Stage 1 detail content (sketch 003)

1. Stage 1 page wires the inline-expand container with Stage 1 content
2. Left column: Section pattern with Regex Pass-1 (rule key + confidence + action) + LLM Pass-2 (model + verdict pill + Why) — single-card style (no bordered evidence-card containers)
3. Right column: `Stage1Widget` dropdown + AuditBlock notes (160px min-height, "Why this verdict?" framing)
4. Eval-type radio REMOVED — server default `eval_type=regression`
5. Footer: `ConfirmOverrideButton` switching green/amber based on dropdown change
6. Body toolbar (same shared component)
7. Add purple `.llm-rescue` stage-cell color when Pass 2 fired (read `decision_details.passes` to know)

### Phase 2 acceptance

- Operator can expand a Stage 0 row, see all evidence (Regex/LLM/Quoted span), confirm or override, submit.
- Operator can expand a Stage 1 row (regex-matched or LLM-rescued), see the right evidence shape, optionally add notes, confirm or override.
- View-thread modal opens with the correct conversation. Translate dropdown shows the 3 options (Original / English / Nederlands / Français) — no-op for now.
- Stage cell strip renders the new purple `.llm-rescue` color when Pass 2 fired.

---

## Phase 3 · Consolidated 4-axis capture (Stages 2 + 3) — REQ-01

The biggest interaction work. Stage 2 (Customer override with resolver chain + number-only input) and Stage 3 (ranked-intent reorder + escalate-to-human) ship together.

### 3.1 Stage 2 detail content (sketch 004)

1. Backend first: `decision_details.steps[]` 4-step trace must be persisted by `resolve-debtor.ts` BEFORE building the UI. (Phase 1.1 lock — verify.)
2. Build `ResolverChain` component — vertical 4-step list with state markers (`matched` / `miss` / `conflict` / `llm-picked` / `not-run` / `winner`). Winner expanded with detail; others compact.
3. Right column: pick-card showing system's match + source-pill (sender-map / LLM tiebreaker) + 2 big-action buttons (Confirm + Flip-to-alternative-when-LLM-fired) + Override-disclosure
4. Override-disclosure body: number-only customer input with live validation + audit-block (required) + Re-run switch (default ON) + server-default eval_type note
5. New server action: `resolveCustomerByAccountId(account_id: string, swarm_type: string)` returning `{name, nxt_database, brand}` for the live validation feedback
6. New server action: `overrideStage2Customer({email_id, swarm_type, corrected_account_id, prose_notes, rerun})` — extends existing `recordVerdict` if compatible. Must require `prose_notes` (≥ 8 chars) when overriding.
7. Re-run logic: when `rerun=true` AND `corrected_account_id != current`, emit `<swarm>/predicted` event to re-run Stages 3+4

### 3.2 Stage 3 detail content (sketch 005)

1. Build `RankedIntentEditor` component — vertical list with stacked ▲▼ buttons (30×22px, filled chevrons, 1.05/0.96 scale hover/active). Position 1 highlight green→amber on dirty.
2. Confidence bars per row, mono percentage. Width follows `conf_pct`.
3. Move buttons: top row ▲ disabled, bottom row ▼ disabled.
4. Reset-order button when dirty.
5. New server action: `reorderStage3Intents({email_id, swarm_type, new_order: string[], prose_notes?})`. Writes ONE `pipeline_events` row per moved position (`stage=3`, `eval_type='intent-correction'`, `decision_details={from_position, to_position, intent_key}`). Position-1 change emits `<swarm>/predicted` to re-run dispatcher; sub-position reorders skip re-dispatch.
6. Build `EscalateToHumanCard` — red-tinted card below the editor. Click toggles "escalating" mode on `col-decide`: editor dims to 40% opacity + pointer-events off, audit-block turns red + question rewrites to "What intent is missing from the registry?" + becomes required, footer flips to red.
7. New server action: `escalateStage3ToHuman({email_id, swarm_type, audit_note})` — flips `agent_runs.status='routed_human_queue'` + creates Kanban (legacy term — the backend keeps the existing internal "Kanban" naming; UI calls it "human queue"). Audit note REQUIRED.

### 3.3 Stage 4 — Action / handler output

REQ-01 includes Axis 4 (handler output correction). Already covered by existing Phase 71/82 work for the most part. Verify:
- Handler-output detail pane wires into the new inline-expand container shape
- `Stage4Widget` (existing) + AuditBlock notes
- `human_verdict` accepts `edited_minor` and `rejected_*` values

### Phase 3 acceptance

- Operator can resolve Stage 2 customer mismatches: see the 4-step resolver chain, override with a numeric account ID + audit note, see the re-run switch behave correctly
- Operator can reorder Stage 3 intents: ▲▼ buttons work, position-1 highlight flips green→amber, Reset works, Submit emits the right pipeline_events rows
- Operator can escalate Stage 3 rows: clicking Escalate dims the editor, requires the audit note, dispatches to human queue
- All four axes (Stage 1 category · Stage 2 customer · Stage 3 intent · Stage 4 handler output) are capturable inside the unified detail pane — REQ-01 satisfied

---

## Phase 4 · Pattern discovery + Promotion handoff — REQ-03, REQ-04

Net-new surfaces, depends on Phase 72 backend table.

### 4.1 Phase 72 backend (out of scope for THIS milestone — but document the contract)

Per `docs/agentic-pipeline/promotion-recommender.md` stub + this sketch's additions:

```sql
CREATE TABLE public.promotion_candidates (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  kind                        text NOT NULL, -- 'regex_rule' | 'sender_mapping' | 'new_intent' | 'prompt_tune' | 'draft_style'
  swarm_type                  text NOT NULL,
  stage                       smallint NOT NULL,
  expected_volume             integer NOT NULL,
  expected_savings            numeric(10,4) NULL,
  evidence_event_ids          uuid[] NOT NULL,
  proposed_change             jsonb NOT NULL,
  display_signature           text NOT NULL,
  before_after_payload        jsonb NOT NULL,
  savings_calculation_version integer NOT NULL DEFAULT 1,
  status                      text NOT NULL DEFAULT 'open',
  approved_by                 uuid NULL,
  approved_at                 timestamptz NULL,
  dismissed_by                uuid NULL,
  dismissed_at                timestamptz NULL,
  dismissal_reason            text NULL
);
```

If Phase 72 hasn't shipped when this milestone hits Phase 4, the patterns surfaces become **stub pages with empty states** until the table exists. Document this in STATE.md.

### 4.2 Patterns listing surface (sketch 006 Variant A)

1. Route `/automations/[swarm]/patterns` — Patterns mode active on the 3-third bar
2. Header band with title + summary line ("18 suggestions · could save €127/mo") + filter chips (all / needs review / being reviewed / applied)
3. Stage-grouped body: sections per stage with subtotals
4. Cluster cards: kind badge + signature + sub-line + volume + savings + status pill + "Review →" CTA
5. Click any card → navigates to sketch 007 detail at `/automations/[swarm]/patterns/[candidate_id]`

### 4.3 Candidate detail surface (sketch 007)

1. Route `/automations/[swarm]/patterns/[candidate_id]`
2. Breadcrumb back to Patterns list
3. Header with kind badge + signature + status pill + headline stats
4. 2-col body: proposed-change card (with before/after step-flow) + evidence card (sample rows + 3-stat grid) on left; action card (Apply/Refine/Dismiss triad + reveals) on right
5. Footer with Submit + undo note
6. Three server actions: `applyCandidate` / `refineCandidate` / `dismissCandidate` per canonical-patterns.md §13
7. v1 ships deterministic kinds only: regex_rule, sender_mapping, new_intent. Defer prompt_tune + draft_style to v2.

### 4.4 Savings estimation cron (Phase 72)

If shipping in this milestone, implement per the formula in `006-pattern-discovery-cluster/README.md` and canonical-patterns.md. Otherwise, defer with a stub that returns 0 / null and surfaces "—" in the UI.

### Phase 4 acceptance

- Operator can navigate to Patterns mode, see clusters grouped by stage, filter by status
- Operator can drill into a cluster, see the proposed change before/after, the evidence rows, and choose Apply / Refine / Dismiss
- Apply generates the right migration/config change per kind
- Dismiss requires + persists a reason

---

## Phase 5 · Live-mode audit + Stage 0 safety lane — REQ-06, REQ-07

The mode-bar (sketch 001 chrome) was built in Phase 1.4 as a stub. Phase 5 completes:

1. History mode page fills in: date range filter + browse handled rows (read-only with inspect rather than action)
2. Confirm the Queue/History severity-distinct chrome is wired correctly (different accent colors flow through all chrome elements, sketch 001 lock)
3. Stage 0 verdict cell is correctly rendered on EVERY row's strip via REQ-07 — `decision_details.verdict` for stage=0 surfaces in the Safety cell

Phase 5 is the smallest phase by surface-area. Most of its scope is verifying the locks from Phases 1–4 hold together.

### Phase 5 acceptance

- Mode switch between Queue and History is visually undeniable (no confusion possible per sketch 001 catastrophic severity lock)
- Every row's Safety cell shows the Stage 0 verdict correctly
- History date-range browse works

---

## Anti-drift gates between phases

Before merging each phase's PR, check:

1. **No new colors introduced.** Grep for `#` hex values in changed files. Every color must trace to a token in `default.css`. Exceptions = the 3 known button-foreground colors (`#0a1a04`, `#1a1206`, `#1a0606`) on lime/amber/red backgrounds.

2. **No new animation timings.** Grep for `transition:`. Every value must be 0.12s / 0.15s / 0.6s (the locked timings per canonical-patterns.md §14).

3. **No internal jargon in operator-facing copy.** Grep for `regex`, `Kanban`, `coordinator_runs`, `swarm_intents`, `swarm_noise_categories`, `Wilson`, `pipeline_events`, `eval_type`, `confidence interval`, `LLM` (capitalized — "AI" is OK), `tiebreaker`, `confirm rate`. Match → reword per operator-language.md.

4. **No side-pane reverts.** Grep `OptionZDetailPane` / `SafetyDetailPane` / `detail-pane` in NEW code (not legacy callers being migrated). If found, block — direct to sketch 002 lock.

5. **No standalone 👍/👎 controls.** Per sketch 003 lock, rule feedback is implicit via Confirm/Override footer color triad. Adding thumbs widgets is drift.

6. **No required eval-type radio in operator UI.** Per sketch 003 retro-apply + sketch 004 lock. Server defaults to `regression`.

7. **No fuzzy name search on Stage 2 customer override.** Per sketch 004 final lock. Account number ONLY.

8. **No drag-and-drop on Stage 3 reorder in v1.** ▲▼ buttons only. Drag handle is visual-only. Adding HTML5 DnD is a v2 enhancement — explicitly out of scope for v1.

9. **Audit notes required on overrides + escalates + dismisses.** Submit button disabled until met. Per sketches 004/005/007.

10. **Undo line in footer for every action surface.** "all actions are logged · an engineer can reverse Apply if it misbehaves" — operator never sees "irreversible."

If any of these grep checks fail, the PR is drifting. Reference this file in the PR review.
