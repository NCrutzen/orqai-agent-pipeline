# Per-Stage Detail-Pane Content

**Purpose:** what each stage's inline-expand detail pane shows. Read alongside `canonical-patterns.md` (which defines the shared container) and `MISSING-IN-CODEBASE.md` (which lists what needs building).

The shared container shape is identical across stages (inline-expand row · 2-col body · Read left · Decide right · audit-block · footer). What differs is the CONTENT in each column.

---

## Stage 0 · Safety (sketch 002 Variant C)

### Inline-expand header
- Stage pill: red-tinted `⚠ Stage 0 · Injection suspected` (when non-safe; never opens when safe — those rows don't surface)
- Right side: timestamp · `0.024¢ · 412 tok · model_key` · collapse affordance

### LEFT column (Read · how the system decided)
- Section **Regex screen** — `Pattern matched: <code>{regex}</code>` or "No regex pattern matched"
- Section **LLM verdict** — `<code>{model_key}</code> → <pill>injection_suspected</pill>` + nested **Why** sub-section with the LLM's reasoning text
- Section **Email body · matched span highlighted** — quoted-span block with `<MatchedSpanHighlight>` rendering the injection content highlighted in amber + body toolbar (View thread + Translate + lang hint)

### RIGHT column (Decide · your verdict)
- `Stage0Widget` — 2-state radio: "Confirm: Injection suspected" / "Override → mark as Safe (will re-enter Stage 1)"
- AuditBlock — optional "Why this verdict?" — feeds the promotion-recommender for safety-rule tuning
- Selected label tints to match (green-tinted for confirm, amber-tinted for override)

### Footer
- `⏎` keyhint · "Submit verdict to close row · Esc collapse · J/K next-prev"
- Skip · N (secondary)
- `ConfirmOverrideButton` — green "Confirm injection ⏎" by default; amber "Submit override ⏎" when flipped to Safe

### Data sources (verify per MISSING-IN-CODEBASE.md)
- `pipeline_events.decision_details.regex_matched: string | null`
- `pipeline_events.decision_details.llm_reason: string`
- `pipeline_events.decision_details.matched_span: string | null`
- `pipeline_events.decision_details.model_key: string`
- `pipeline_events.cost_cents: number`
- `pipeline_events.token_count: number` (from `decision_details` or top-level — check Phase 70 contract)
- Override: `overrideStage0Safety` action ✓ shipped

---

## Stage 1 · Noise (sketch 003 — supports both regex-match AND LLM-rescue cases)

### Inline-expand header
- Stage pill: amber `Stage 1 · Noise verdict`
- Right side timestamp · cost. Regex-only case: `0.00¢ · regex only`. LLM-rescue: `0.018¢ · 286 tok · stage-1-category-classifier`

### LEFT column — Variant A (Regex Pass 1 matched)
- Section **Regex · Pass 1** with verdict pill (noise key like `payment_admittance`)
  - `Rule: <code>payment_admittance_v3</code> · first-match-wins`
  - `Confidence: 0.92`
  - `Action: <code>categorize_archive</code> · label + archive + iController cleanup`
- Section **LLM · Pass 2** — body just says "Not fired — Pass 1 returned a noise key, no LLM call needed." in dim color
- Section **Email body · matched keywords highlighted** — quoted-span with regex match keywords highlighted in amber + body toolbar

### LEFT column — Variant B (Regex Pass 1 = unknown, LLM Pass 2 rescued)
- Section **Regex · Pass 1** with `<pill>unknown</pill>` — body just says "No rule matched — handed off to LLM 2nd-pass." in dim
- Section **LLM · Pass 2** with verdict pill (e.g. `<pill class="llm">ooo_temporary</pill>`)
  - `Model: <code>stage-1-category-classifier</code>`
  - `Confidence: 0.81`
  - Nested **Why** reasoning text
- Section **Email body · matched span highlighted** — quoted-span with LLM-cited matched_span highlighted in amber + body toolbar

### RIGHT column (Decide · your verdict)
- `Stage1Widget` — category dropdown (synthetic Noise / Archive at top + registry noise categories below). Pre-selected to current verdict.
- AuditBlock with question "Why this verdict?" (optional but encouraged), 160px min-height, sub-line "Rule feedback — describe the rule's behavior on this email and any context that helps the promotion-recommender refine it"
- Small ★ note below: server-default `eval_type=regression`

### Footer
- Same shared footer
- `ConfirmOverrideButton` — green "Confirm rule ⏎" / "Confirm rescue ⏎" by default; amber "Submit override ⏎" when dropdown changed

### Data sources (verify per MISSING-IN-CODEBASE.md)
- `pipeline_events.decision_details.passes: { pass_1: {...}, pass_2?: {...} }` (or however the per-pass shape is structured — VERIFY)
- `pass_1.rule_key`, `pass_1.confidence`, `pass_1.action`, `pass_1.matched_span` (matched body text)
- `pass_2.model_key`, `pass_2.verdict`, `pass_2.confidence`, `pass_2.reasoning`, `pass_2.matched_span`
- `email_feedback.prose_notes` (reuse Stage 0 column) for notes
- Override: existing `recordVerdict` action — VERIFY accepts `prose_notes`

---

## Stage 2 · Customer (sketch 004 — two presentations: clean match A, LLM tiebreaker B)

### Inline-expand header
- Stage pill: amber `Stage 2 · Customer match` (clean case) or `Stage 2 · Customer match · LLM tiebreaker` (B case)
- Right side: timestamp · cost. A: `0.00¢ · deterministic only`. B: `0.012¢ · 198 tok · stage-2-tiebreaker`

### LEFT column (Read · how the customer was matched)
- Section **Resolver chain · 4 deterministic-first steps** with verdict pill (`sender-map` blue or `LLM tiebreaker` purple)
- Vertical resolver chain — 4 steps, each with state marker + step name + sub-line + status
  - Step 1: Thread lookup — `no thread match` (miss) or matched detail
  - Step 2: Sender map — matched/miss
  - Step 3: Identifier extraction — matched/conflict/not-run
  - Step 4: LLM tiebreaker — picked/not-run/no-conflict
- WINNER step shows expanded detail inline (sender→customer mapping, backend, promotion lineage; OR LLM model + candidates considered + reasoning)
- Section **Email body · identifiers highlighted** — quoted-span with invoice IDs / refs highlighted in amber + body toolbar

### RIGHT column (Decide · your verdict)
**Default state** (confirm-by-default):
- `.pick-card` — labeled "The system matched", big customer name, account number + NXT in mono, source pill + promotion lineage line
- Variant A: ONE `.big-action` (green Confirm) + or-divider + override disclosure
- Variant B: TWO `.big-action` buttons (green Confirm LLM pick · amber Flip to alternative-customer) + or-divider + override disclosure

**Override-open state** (operator clicked the disclosure):
- Pick-card + big-action buttons + or-divider all COLLAPSED (`.col-decide.overriding` toggle)
- Override form visible:
  - Customer account number field with `inputmode="numeric"` + live validation feedback (`✓ {name} · acct {0000} · NXT db {db}` OR `✗ No customer with that number`)
  - AuditBlock — REQUIRED "How did you find this customer?" with worked-example placeholder
  - Re-run switch — default ON ("Re-run Stage 3 + 4 with corrected customer")
  - Small ★ server-default eval_type note

### Footer
- Submit button color follows action state — green Confirm / amber Submit-override / amber Flip-to-{name}
- Submit disabled until required override fields filled — label updates dynamically ("Submit override ⏎ — pick a customer" / "— add audit note")

### Data sources (verify per MISSING-IN-CODEBASE.md)
- `pipeline_events.decision_details.steps[]: { step: 'thread'|'sender_map'|'identifier'|'llm_tiebreaker', status, confidence, detail }`
- `pipeline_events.decision_details.candidates_considered[]` (only when LLM tiebreaker fired)
- `pipeline_events.decision_details.sender_map_lineage` (promotion history when sender_map step won)
- `resolveCustomerByAccountId` server action — NEW, returns `{name, nxt_database, brand}`
- `overrideStage2Customer` server action — NEW, requires `prose_notes` ≥ 8 chars + emits re-run event if top-1 changed

---

## Stage 3 · Topic (sketch 005 — same UI for confident A vs uncertain B classifiers)

### Inline-expand header
- Stage pill: amber `Stage 3 · Topic · ranked intents` (clear case) or `⚠ Stage 3 · Topic · low-confidence ranking` (low-conf case)
- Right side: timestamp · `0.041¢ · 612 tok · stage-3-intent-classifier`

### LEFT column (Read · how the classifier ranked)
- Section **Classifier output** with verdict pill (`confident · 94%` match OR `low confidence · 41%` warn)
- Row lines: Model · Top intent · Runner-up · Gap to #2
- Reasoning paragraph
- Section **Email body** — quoted-span with key signals highlighted in amber + body toolbar

### RIGHT column (Decide · pick the right intent)
- Editor head: title "Ranked intents" + sub-line. Sub-line for low-confidence: "⚠ Top 2 within 3 pts — read the body carefully before confirming"
- **`RankedIntentEditor`** — vertical list, one row per intent
  - 18px drag-handle + 24px rank# + 1fr intent-name (intent_key + handler_key sub-line) + 90px confidence (bar + %) + 36px move-buttons (▲▼ stacked)
  - Position 1 = green-tinted background + lime confidence bar + `DISPATCH WINNER` tag
  - On reorder dirty → position 1 turns amber + `YOUR PICK` tag
- Editor foot: `Each move emits its own pipeline_events row · eval_type=intent-correction` + Reset order button (when dirty)
- **`EscalateToHumanCard`** below editor — red-bordered card "⚠ None of these — escalate to human queue"
- AuditBlock — optional "Why this verdict?" (becomes REQUIRED when escalate mode active, rewrites to "What intent is missing from the registry?")

### Footer
- Submit button — green "Confirm ranking ⏎" / amber "Submit reorder → {new_top_intent} ⏎" / red "Escalate to Human ⏎"
- Disabled with reason-needed label when dismiss/escalate-required state without audit note

### Data sources (verify per MISSING-IN-CODEBASE.md)
- `coordinator_runs.ranked_intents JSONB` — array of `{intent_key, confidence, handler_key}` ordered desc
- `loadSwarmIntents(swarm_type)` registry helper for handler_key lookup (already exists)
- `reorderStage3Intents` server action — NEW
- `escalateStage3ToHuman` server action — NEW

---

## Stage 4 · Action / handler output (existing Phase 71/82 work — verify against canon)

Stage 4 wasn't deeply sketched in this milestone (covered as part of REQ-01 Axis 4 via existing Phase 71 work — `Stage4Widget` and `human_verdict` rejected_*/edited_minor values).

**To verify against canon:**
- Existing `Stage4Widget` wires into the new inline-expand container shape
- LEFT column shows: handler input (PipelineStageContext summary), handler output (draft email body), and reasoning
- RIGHT column shows: handler output diff/editor + AuditBlock + `human_verdict` selector
- Footer uses same `ConfirmOverrideButton` triad
- Body toolbar + thread modal reuse shared components

If Stage 4 doesn't yet have an inline-expand detail pane, build per the same shared shape. See `IMPLEMENTATION-SEQUENCE.md` Phase 3.3.

---

## Pattern discovery + handoff (sketches 006-007)

These don't share the inline-expand container — they're full-page surfaces under the Patterns top-level mode. See `canonical-patterns.md` §12-13 for the layout contracts and `MISSING-IN-CODEBASE.md` for the backend dependencies.
