# Canonical Patterns — Anti-drift contract

**Purpose:** the locked design decisions from sketches 001–007 that coding agents MUST preserve verbatim. Every entry here is non-negotiable unless this file is updated through a new sketch or explicit user direction.

This file is the authoritative reference. If `MISSING-IN-CODEBASE.md` says "build X per canonical-patterns.md", look here for the exact contract.

---

## 1. Three top-level modes (sketch 001)

| Mode | Color token | Glyph | URL | When |
|---|---|---|---|---|
| **Queue** (Live) | `--brand-primary` (orange #ff6a34) | ▶ | `/automations/[swarm]/queue` | Rows blocked at some stage, waiting for human verdict |
| **History** (Review) | `--brand-secondary` (slate-blue #69a8ff) | ◷ | `/automations/[swarm]/history` | Rows already handled, retrospective audit / correction |
| **Patterns** (Learn) | `#b886ff` (purple) | ☆ | `/automations/[swarm]/patterns` | Cross-row clusters surfaced for promotion |

**Chrome treatment** (CSS variables):
```css
.mode-third[data-mode="queue"].active {
  background: linear-gradient(180deg, rgba(255,106,52,0.18), rgba(255,106,52,0.04));
  box-shadow: inset 0 -3px 0 0 var(--brand-primary);
}
.mode-third[data-mode="history"].active {
  background: linear-gradient(180deg, rgba(105,168,255,0.18), rgba(105,168,255,0.04));
  box-shadow: inset 0 -3px 0 0 var(--brand-secondary);
}
.mode-third[data-mode="patterns"].active {
  background: linear-gradient(180deg, rgba(184,134,255,0.18), rgba(184,134,255,0.04));
  box-shadow: inset 0 -3px 0 0 #b886ff;
}
```

The mode-bar is **56px tall**, flex with 3 equal-width thirds. Glyph badge `32×32px` rounded `8px`. Mode-name 11px uppercase letterspaced. Mode-count 18px mono.

**Severity classification (sketch 001 lock):** mode confusion is **catastrophic**. Wrong-mode action poisons recommender data. The chrome must make mode misidentification impossible at a glance — every chrome element (bar color, header pill, primary action button color, row treatment) flips together with the mode.

---

## 2. Five stage names (sketch 001)

| Stage # | Operator-facing name | Internal | What it answers |
|---|---|---|---|
| 0 | **Safety** | `stage=0` · safety_review | Safe to process? |
| 1 | **Noise** | `stage=1` · `swarm_noise_categories` | Real customer message, or auto-archive? |
| 2 | **Customer** | `stage=2` · entity resolver | Which customer is this from? |
| 3 | **Topic** | `stage=3` · coordinator · `swarm_intents` | What's the intent? |
| 4 | **Action** | `stage=4` · handler | What did the handler do? |

**Operator-facing copy never uses the internal column names** (`swarm_noise_categories`, `swarm_intents`, `coordinator_runs`, `pipeline_events`). See `operator-language.md` for the full translation table.

---

## 3. Row strip — 5 stage cells (sketch 001)

```
grid-template-columns: 200px 1fr 540px 100px
```

The 540px stages region splits into 5 equal cells (`repeat(5, 1fr)` with 4px gap). Each cell:

```html
<span class="stage-cell {class}">
  <span class="outcome">{operator-readable outcome}</span>
  <span class="hint">{optional dim sub-line: mechanism / customer name / confidence}</span>
</span>
```

**Cell states (CSS class):**

| Class | Use | Color |
|---|---|---|
| `.safe` | system passed this stage cleanly | lime border + lime outcome |
| `.match` | system matched a known answer | blue border + blue outcome |
| `.warn` | low confidence / ambiguous | amber border + amber outcome |
| `.llm-rescue` | Stage 1 Pass-2 LLM rescued (was `unknown` in regex) | purple border + purple outcome |
| `.idle` | stage hasn't run yet (row blocked upstream) | dashed border + dim text "waiting" |
| `.blocked` | THIS is the cell waiting on operator | amber background tint + amber ring + bold outcome |

Cell rules:
- `min-height: 36px`, `padding: 6px 8px`, `font-size: 11px`
- `.outcome` is `font-weight: 500`, single-line ellipsed
- `.hint` is `font-size: 9.5px`, color `--text-dim`
- A row blocked at Stage N has `.blocked` on cell N and `.idle` on cells N+1..4 (downstream stages didn't run)

---

## 4. Inline-expand detail container (sketches 002–005)

**THE canonical detail surface.** Replaces the side-pane direction from earlier Phase 71/82 work. Coding agents who revert to side-pane "for consistency with `OptionZDetailPane`" are drifting — block.

```html
<div class="row-wrap" data-row="...">
  <div class="row expanded">… 5-stage strip row …</div>
  <div class="inline">
    <div class="inline-head">{stage-pill} {timestamp · cost · model} {▲ collapse}</div>
    <div class="inline-body">
      <div class="col-read">…</div>
      <div class="col-decide">…</div>
    </div>
    <div class="inline-foot">{⏎ submit · keyhints · primary button}</div>
  </div>
</div>
```

**Structural locks:**
- `.inline-body` = `display: grid; grid-template-columns: 1fr 1fr; min-height: 380px` (480px for Stage 3 ranked-intent editor)
- `.col-read` has `border-right: 1px solid var(--border)` and `background: var(--bg-2)`
- `.col-decide` has `background: var(--bg)` (slightly darker for contrast)
- Each column has a `.col-label` uppercase header: "Read · how the system decided" / "Decide · your verdict" / "Decide · pick the right intent"
- The expanded row's borders curve only at the top corners (`border-radius: var(--radius) var(--radius) 0 0`) with the inline panel butting against the bottom
- **One row open at a time.** Opening another row collapses the previous.
- Keyboard: `⏎` submit · `Esc` collapse · `J` / `K` next-prev row · `N` skip

---

## 5. Section pattern inside Read column (sketches 002–005)

NO bordered colored cards (rejected in sketch 003 retro-apply). Use plain section structure:

```html
<div class="section">
  <div class="section-head">
    SECTION LABEL UPPERCASE
    <span class="verdict-pill {class}">{verdict}</span>  <!-- optional, right-aligned -->
  </div>
  <div class="section-body">
    <div class="row-line"><span class="key">Field:</span><code>value</code></div>
    …
  </div>
</div>
```

**Verdict-pill classes:**
| Class | Use | Color |
|---|---|---|
| `.match` | clean deterministic match (sender-map, regex) | blue |
| `.noise` | noise category matched | lime |
| `.llm` | LLM rescue / tiebreaker / classifier | purple |
| `.warn` | low-confidence / ambiguous | amber |
| `.danger` | injection_suspected | red |

`.section-head` is 10px uppercase letterspaced muted. `.section-body` is 13px line-height 1.55.

---

## 6. Email body block (sketches 002–005)

```html
<div class="section">
  <div class="section-head">Email body · matched span highlighted</div>
  <div class="quoted-span">{body text with <span class="highlight">highlights</span>}</div>
  <div class="body-toolbar">
    <button>↗ View full thread (N msgs)</button>
    <select>⇄ Translate ▾ (Original / English / Nederlands / Français)</select>
    <span class="grow"></span>
    <span class="lang-hint">detected: nl</span>
  </div>
</div>
```

**Locks:**
- `.quoted-span` is `font-size: 14px`, `line-height: 1.65`, `white-space: pre-wrap` (preserves real newlines), **NOT italic**, blue left-border for normal context, red left-border for Stage 0 injection context
- `.highlight` is amber background (`rgba(255,181,71,0.20)`) + amber text + bold + `padding: 1px 4px; border-radius: 3px`. **Amber regardless of stage** — coding agents must NOT recolor the highlight per stage.
- `.body-toolbar` is below the quoted span, 12px font. Toolbar buttons use `--bg-panel` background with `--border` border, hover → `--bg-hover` + `--text` foreground.
- `.lang-hint` is a dashed-border chip displaying the detected language (e.g. `detected: nl`). Right-aligned via grow spacer.
- Translate dropdown is a `<select>` — UI placeholder for now, wires to a future translate server action.

---

## 7. Thread modal (sketches 002–005)

Modal `width: min(820px, 92vw)`, `max-height: 86vh`. Header has back button, title, message count, Translate dropdown (whole-thread), and Close button (`Esc` closes).

Messages are listed `conversation_id`-ordered. Current message under review:
- `border-left: 3px solid {stage-themed color}` (orange for Queue rows, slate-blue for History, red for Stage 0 injection)
- Subject line gets a `★ under review` tag in stage-themed color
- Body uses the same `.highlight` amber treatment for matched spans

Modal foot: small grey line noting the data source — `Thread sourced from email_pipeline.emails ordered by conversation_id, received_at`. **Keep this line** — it's the audit transparency that lets operators trust the surface.

---

## 8. Verdict button color triad (sketches 002–007)

THE most important anti-drift lock. Every operator decision button across every surface follows this color contract:

| Intent | Color | CSS | Where |
|---|---|---|---|
| **Confirm** (operator agrees with system verdict) | green / lime | `background: var(--lime); color: #0a1a04` | Stage 0/1/2/3 footer buttons when no change; Apply in sketch 007 |
| **Override** (operator changes a single value) | amber | `background: var(--amber); color: #1a1206` | Stage 0/1/2/3 footer when dropdown/radio changed; Refine in sketch 007 |
| **Escalate** (route to human queue) · **Dismiss** (reject a suggestion) | red | `background: var(--red, #ff5050); color: #1a0606` | Stage 3 escalate-to-Human; sketch 007 Dismiss |

**Dynamic switching:**
- Stage 0: radio toggles confirm ↔ override → button color follows
- Stage 1/2: dropdown change → button flips amber
- Stage 3: ranked-list reorder dirty state → button flips amber
- Stage 7: clicking action buttons → footer follows

**Selected label tinting:** the radio/button labels themselves tint to match (lime background tint when confirm-selected, amber tint when override-selected, red tint when dismiss-selected). See `.confirm-state` / `.override-state` / `.escalate` CSS.

---

## 9. Audit-block textarea (sketches 003–005, 007)

```html
<div class="audit-block">
  <div class="audit-q">
    {Question — semibold 14px} <span class="req-asterisk">*</span>  <!-- if required -->
    <span class="audit-optional">optional but encouraged</span>     <!-- or this -->
  </div>
  <div class="audit-sub">{Subtitle — 12px dim, explains why this matters}</div>
  <textarea placeholder="{worked example showing the kind of detail expected}"></textarea>
</div>
```

**Locks:**
- Container: brand-orange `border-left: 3px solid var(--brand-primary)`, tinted background `rgba(255,106,52,0.04)`
- Textarea `min-height: 110px` standard. **Stage 1 uses 160px** (rule feedback runs longer). **Sketch 007 dismiss audit uses 90px** (shorter reason).
- Required marker: `*` in amber/red. When required and empty → Submit button disabled and label updates to indicate what's missing
- When in escalate/dismiss mode: container `border-left-color` flips to `--red`, background to `rgba(255,80,80,0.04)`
- Placeholder ALWAYS shows a concrete worked example, not generic "Why this verdict?" hints

---

## 10. Override-disclosure pattern (sketch 004)

For overrides that need more than a single-control change (Stage 2 customer override is the canonical case):

```html
<details class="override-disclosure">
  <summary>{Operator-facing question} <span class="amber-tag">amber path</span></summary>
  <div class="disc-body">
    {required inputs}
    {audit-block}
    {re-run switch}
  </div>
</details>
```

**Lock:** when the disclosure opens, the entire upper region of `col-decide` collapses (pick-card, 2-button candidates, "or" divider). Only the override form is visible. Closing the disclosure restores the original confirm-by-default state.

**Customer override input** (Stage 2 specific):
- Number ONLY — no fuzzy name search in the operator UI
- `inputmode="numeric"`, strip non-digits client-side
- Live feedback: `✓ {Customer Name} · acct {0000} · NXT db {database_name}` (green) or `✗ No customer with account number {0000} · double-check the number in NXT` (red)
- Helper text: *"Look up the customer's account number in NXT first. The number is the canonical truth — Stage 3 + 4 will re-run against it. Digits only · zero-padded to 4 characters."*

---

## 11. Ranked-list editor (sketch 005)

Stage 3 specific. The full ranked intent list with reorder controls.

```html
<div class="ranked-list">
  <div class="ranked-item" data-position="1">
    <span class="drag-handle">⠿</span>
    <span class="rank">1</span>
    <div class="intent-name">
      <span class="intent-key">{intent_key}<span class="winner-tag">DISPATCH WINNER</span></span>
      <span class="handler-key">→ {handler_agent_key}</span>
    </div>
    <div class="confidence">
      <div class="conf-bar"><div class="conf-bar-fill" style="width:{N}%"></div></div>
      <div class="conf-pct">{N}%</div>
    </div>
    <div class="move-buttons">
      <button class="move-btn">▲</button>
      <button class="move-btn">▼</button>
    </div>
  </div>
  …
</div>
```

**Locks:**
- Grid: `18px 24px 1fr 90px 36px` (drag handle · rank · intent · confidence · move buttons)
- Move buttons: stacked vertically, `30×22px`, filled chevron glyphs `▲▼` (NOT line arrows `↑↓`), `border-color: var(--border-strong)`, hover fills brand-orange + 1.05 scale, active 0.96 scale, disabled at list edges at 25% opacity
- Position #1 styling: **green-tinted background** + 3px green left-bar + `DISPATCH WINNER` tag (lime bg, black text, 9.5px mono uppercase) when matches classifier order; **amber-tinted + amber bar + `YOUR PICK` tag** when operator-reordered
- Confidence bar: 4px tall, fills by `width: {conf_pct}%`. Color follows position-1 state (lime when matching, amber when dirty)
- Drag handle (`⠿`) is visual-only in v1 — actual reordering uses the ▲▼ buttons. HTML5 DnD or `@dnd-kit/sortable` can be a v2 enhancement.
- Reset order button appears when dirty (right side of editor-foot, mono 11px amber with tinted background)

**Each reorder = one `pipeline_events` row** with `stage='3-coordinator'`, `eval_type='intent-correction'`, `decision_details={from_position, to_position, intent_key}`. **Position-1 changes trigger re-dispatch** (`inngest.send({name: '<swarm>/predicted', …})`); sub-position reorders are pure eval signal.

**Escalate-to-Human card** below the editor:
```html
<div class="escalate-row">
  <span class="glyph">⚠</span>
  <div class="body">
    <div class="title">None of these — escalate to human queue</div>
    <div class="sub">Routes the row to the human queue (routed_human_queue) for manual handling. Use when no listed intent fits — the audit note should describe what intent is missing from the registry.</div>
  </div>
  <span class="keyhint">E</span>
</div>
```

Click → editor dims to 40% opacity + pointer-events off, audit-block turns red-tinted + rewrites prompt to *"What intent is missing from the registry?"* + becomes required, footer flips to red `Escalate to Human ⏎`. Click again to exit. **Operator-facing copy uses "human queue" / "human" — never "Kanban".**

---

## 12. Patterns surface (sketch 006)

Cluster card grid layout:
```
grid-template-columns: auto 1fr 140px 120px 100px
```
columns: kind-badge cluster · signature (with sub-line) · volume (big mono + small dim label) · savings (big lime mono) · status pill + Review CTA

**Kind badges** (operator-facing names, 11px mono uppercase):

| Internal kind | Operator badge | Color |
|---|---|---|
| `regex_rule` | **Filter rule** | blue |
| `sender_mapping` | **Known sender** | lime |
| `prompt_tune` (Stage 3) | **AI tuning** | purple |
| `new_intent` | **New topic** | purple |
| `prompt_tune` (Stage 4) | **Draft style** | amber |

**Status pills:**
| Internal status | Operator pill | Color |
|---|---|---|
| `open` | **needs review** | purple |
| `in_review` | **being reviewed** | amber |
| `approved` | **applied** | lime |
| `rejected` / `rolled_back` | **dismissed** | grey |

**Winner is Variant A (stage-grouped).** Sections per stage with subtotals: "5 suggestions · est. €42/mo". Variant B (impact-ranked) can ship as a sort-toggle option but stage-grouped is the default view.

---

## 13. Promotion-recommender candidate detail (sketch 007)

Full-page surface at `/automations/[swarm]/patterns/[candidate_id]`. Breadcrumb back to Patterns.

**Header**: kind badge · signature (the plain-English description) · status pill · headline stats line ("Seen 23 times this month · est. saves €18 / month").

**Body**: 2-column grid (`1.4fr 1fr`):
- **Left column**: proposed-change card (label "What would change", H2 plain-English title, summary paragraph, before/after step-flow) + evidence card (recent emails affected with operator-friendly chips + 3-stat impact grid)
- **Right column**: action card with the Apply/Refine/Dismiss triad + inline reveal panels

**Before/After flow** (proposed-change card):
- 2 columns + center arrow column
- Each side: small head label ("Today" / "After applying"), numbered step list, footer cost line with `€N.NNN` per email
- The "After" column shows the savings delta: `€0.000 saves ~€0.022` with the savings text in lime bold

**Action triad** (right column):
- Three `.big-action` buttons stacked. Default state: **Apply selected** (purple ring), reveal-apply visible
- **Refine** reveals an inline form with kind-specific fields (subject pattern + sender filter for Filter rule; sender pattern + account number with live validation for Known sender; intent_key + handler for New topic; etc.)
- **Dismiss** reveals required reason textarea — Submit disabled until ≥ 8 chars

**Footer:** Submit button + `Skip · keep open · N` secondary + undo note: *"all actions are logged · an engineer can reverse Apply if it misbehaves"*. This line is MANDATORY on every action surface — sets reversibility expectation without overselling.

---

## 14. Animation + interaction timing

- Row expand/collapse: 0.12s
- Stage cell hover state: 0.12s background transition
- Reorder pulse on moved row: 0.6s amber pulse (`@keyframes pulseHighlight`)
- Mode tab hover (3-mode bar): 0.12s opacity
- Detail row selection: 0.15s background fade
- Override-disclosure expand: native `<details>` (no custom animation)

**Do not add new animations.** If a coding agent introduces 200ms easings, scaling effects on row hover, or extra transitions, that's drift.

---

## 15. Theme tokens — single source

The locked theme is `themes/default.css` (mirrored from `Agent Workforce/.planning/sketches/themes/v7.css` — V7 production tokens). Coding agents MUST consume tokens via `var(--...)` and NEVER hardcode color hex values. Exceptions: the three `#0a1a04` / `#1a1206` / `#1a0606` button-foreground colors used on lime/amber/red backgrounds (no token because they're never used elsewhere).

Token vocabulary used in these sketches (non-exhaustive — see `default.css` for the full set):

| Token | Hex | Use |
|---|---|---|
| `--brand-primary` | `#ff6a34` | Queue mode, primary chrome accents |
| `--brand-secondary` | `#69a8ff` | History mode, blue evidence |
| `--lime` | `#8fc867` | Confirm verdicts, savings, "applied" state |
| `--amber` | `#ffb547` | Override, dirty state, warnings, "being reviewed" |
| `--red` | `#ff5050` | Stage 0 injection, escalate, dismiss |
| `--blue` | `#69a8ff` | Match / deterministic / known |
| `--patterns` (new in this milestone) | `#b886ff` | Patterns mode + LLM-accent reuse |
| `--bg` | dark | Outer background |
| `--bg-2` | slightly lighter | Read-column background, mode-bar |
| `--bg-panel` | slightly lighter | Card / button backgrounds |
| `--bg-hover` | lighter | Hover states |
| `--border` | subtle | Default borders |
| `--border-strong` | more visible | Active / focused borders |
| `--text` | bright | Default text |
| `--text-muted` | mid | Secondary text |
| `--text-dim` | dim | Labels, hints |
| `--font-mono` | mono stack | Code, account numbers, timestamps |
| `--radius` | 8px | Cards, modals |
| `--radius-pill` | 999px | Pills, badges |
| `--space-N` | 4/8/12/16/20/24 | Vertical/horizontal padding |
