# Stage 3 Triage Layout + Actions (Phase 76)

Origin: sketches 006 (stage-3-triage-shape) + 007 (row-action-affordances). Locks the layout and interaction model inside the Stage 3 · Intent tab. Stage 4 · Handler tab inherits the same shape with reason='handler_error' substituted.

## Design Decisions

### Filtered table + persistent detail pane (sketch 006 → B)

Inside the Stage 3 tab: chip filter strip on top, dense rows below on the left, persistent detail pane on the right. Reuses the Bulk Review row-strip pattern verbatim — operators learn one row pattern across the entire stage-keyed shell.

**Layout:**
- Chip strip: `All` (default) · `No handler` · `Low confidence` · spacer · sort dropdown
- Row list: dense rows with reason pill + intent pill + subject + (for low-conf) confidence bar + recipient + age
- Detail pane: 460px wide, sticky on the right; populated when a row is selected; carries Stage 3 ranked output + email body preview + action stack at the bottom

**Rejected alternatives:**
- Column-board (literal Kanban) — drag-and-drop is dead weight here (operators don't move rows between reasons; the system already classified them). Two columns wasted horizontal space.
- Chip filter + grouped collapsible sections — section chrome ate viewport for daily use; the chip strip already surfaces reason counts without the chrome.

### Inline-expand action editor in the detail pane (sketch 007 → B)

Replay / Reclassify-as-noise buttons expand inline within the pane (replacing the action button area; other buttons dim). Confirm with ⏎, cancel with Esc. Email body + Stage 3 ranked output stay visible while operator picks intent — no blocked context.

**Action set:**
- **Replay through Stage 4** (primary) — opens an inline intent dropdown pre-selected to Stage 3's top pick. Same intent → re-fires handler_event directly. Different intent → writes axis-3 override + fires the new handler_event (CONTEXT.md D-01).
- **Reclassify as noise** — opens an inline noise-key dropdown (4 active noise keys from `swarm_noise_categories`). Writes axis-1 override + fires `categorize_archive` (CONTEXT.md D-03). Stage 1 LLM precision signal for Phase 79 learning loop.
- **Close (manual)** — fires immediately. No confirm modal. (Mitigation for misclicks deferred — brief undo toast within 5s, out of scope for v1.)

**Rejected alternatives:**
- Modal-driven actions — heavyweight for a one-tap operation; backdrop blocks reading email body while picking intent.
- Split-button (dropdown-on-button) — discoverability cost (chevron is invisible to first-time operators); compact but adds a learning curve unsuitable for a triage queue with rotating staff.

### Confidence bar — per-row, only when applicable

Low-confidence rows render a 40px confidence bar (amber → blue → green by value) to the right of the subject. No-handler rows have no meaningful confidence value, so the bar is omitted to avoid visual noise.

### Same-pattern reuse in Stage 4 · Handler tab

Stage 4 · Handler reuses the entire shape: same chip strip (single chip "Handler errors"), same row pattern, same detail pane, same inline-expand action stack. Differences:
- Reason set is just `handler_error` (no chip variants).
- Detail pane carries an `error_detail` expanding section showing the Inngest function failure stack/message.
- Action set: Replay (re-fire same handler_event), Reclassify-as-noise, Close — no axis-3 intent edit since the intent was correct; Stage 4 was the failure point.

## CSS Patterns

### Chip filter strip

```css
.chip-strip {
  display: flex; gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  background: var(--bg); border-bottom: 1px solid var(--border);
  font-size: var(--fs-sm);
}
.chip-strip .chip {
  padding: 4px 12px; border-radius: 999px;
  background: var(--bg-2); border: 1px solid var(--border);
  color: var(--text-muted); cursor: pointer;
  font-family: var(--font-mono); font-size: var(--fs-xs);
}
.chip-strip .chip:hover { background: var(--bg-hover); color: var(--text); }
.chip-strip .chip.active {
  background: var(--brand-primary-soft);
  color: var(--brand-primary);
  border-color: var(--brand-primary);
}
.chip-strip .chip .count { color: var(--text-dim); margin-left: 6px; }
.chip-strip .chip.active .count { color: var(--brand-primary); }
```

### Pane shell — list + detail pane grid

```css
.pane-shell {
  display: grid;
  grid-template-columns: 1fr 460px;
  flex: 1;
  overflow: hidden;
}
.pane-shell > .left { overflow: auto; background: var(--bg); }
.pane {
  border-left: 1px solid var(--border);
  background: var(--bg-2);
  overflow: auto;
  padding: var(--space-4);
  font-size: var(--fs-sm);
  display: flex; flex-direction: column;
  gap: var(--space-3);
}
```

### Triage row with reason pill + intent pill + confidence bar

```css
.row {
  display: flex; align-items: center; gap: var(--space-3);
  padding: 10px 16px; border-bottom: 1px solid var(--border);
  font-size: var(--fs-sm); color: var(--text-muted);
}
.row.selected {
  background: var(--bg-selected);
  color: var(--text);
  border-left: 2px solid var(--brand-primary);
  padding-left: 14px;
}
.pill { font-size: var(--fs-xs); padding: 2px 8px; border-radius: 999px; font-family: var(--font-mono); white-space: nowrap; }
.pill.no-handler { background: var(--blue-soft); color: var(--blue); }
.pill.low-conf { background: var(--amber-soft); color: var(--amber); }
.pill.error { background: var(--red-soft); color: var(--red); }
.pill.intent { background: rgba(255,255,255,0.06); color: var(--text-muted); }

.conf-bar {
  width: 40px; height: 4px; background: var(--bg);
  border-radius: 2px; overflow: hidden;
}
.conf-bar > span { display: block; height: 100%; }
.conf-low { background: var(--amber); }
.conf-med { background: var(--blue); }
.conf-high { background: var(--success); }
```

### Inline-expand action editor

```css
.inline-editor {
  background: var(--bg);
  border: 1px solid var(--brand-primary);
  border-radius: 6px;
  padding: var(--space-3);
  display: flex; flex-direction: column;
  gap: var(--space-2);
}
.inline-editor label {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.inline-editor .row-actions {
  display: flex; gap: var(--space-2);
  justify-content: flex-end;
  margin-top: var(--space-2);
}
.inline-editor .row-actions .btn { padding: 6px 12px; }

/* Action stack — dimmed siblings during inline edit */
.action-stack { display: flex; flex-direction: column; gap: var(--space-2); margin-top: auto; }
.action-stack.editing > .btn:not(.editing) { opacity: 0.45; pointer-events: none; }
```

### Action button shape

```css
.btn {
  padding: 9px 14px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--bg);
  color: var(--text); font-size: var(--fs-sm);
  text-align: left; cursor: pointer;
  display: flex; justify-content: space-between; align-items: center;
}
.btn:hover { background: var(--bg-hover); border-color: var(--border-strong); }
.btn.primary {
  background: var(--brand-primary);
  color: var(--text-inverse);
  border-color: var(--brand-primary);
  font-weight: 600;
}
.btn .kbd {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  opacity: 0.7;
  padding: 2px 6px;
  background: rgba(255,255,255,0.10);
  border-radius: 4px;
}
.btn.primary .kbd { background: rgba(0,0,0,0.18); }
```

## HTML Structures

### Triage row

```html
<div class="row selected">
  <span class="pill no-handler">no_handler</span>
  <span class="pill intent">peppol_request</span>
  <span class="subject">Peppol activatie aanvraag</span>
  <span class="meta">smeba-fire · 2h</span>
</div>

<!-- Low-confidence variant adds a confidence bar -->
<div class="row">
  <span class="pill low-conf">low_conf</span>
  <span class="pill intent">general_inquiry</span>
  <span class="subject">Vraag over openstaande factuur</span>
  <span class="conf-bar"><span class="conf-low" style="width:42%"></span></span>
  <span class="meta">berki · 38m</span>
</div>
```

### Detail pane shell

```html
<div class="pane">
  <h3>Peppol activatie aanvraag</h3>
  <div class="meta">no_handler · smeba-fire · 2h ago</div>

  <div class="ranked-output">
    <div class="label">Stage 3 ranked output</div>
    <div class="row1">1. <strong>peppol_request</strong> · 0.91 ✓ picked</div>
    <div class="rest">2. general_inquiry · 0.06</div>
    <div class="rest">3. other · 0.03</div>
  </div>

  <div class="body-preview">…email body preview…</div>

  <div class="action-stack">
    <button class="btn primary">✓ Replay through Stage 4 <span class="kbd">⏎</span></button>
    <button class="btn">↶ Reclassify as noise <span class="kbd">N</span></button>
    <button class="btn">✕ Close (manual) <span class="kbd">Space</span></button>
  </div>
</div>
```

### Inline editor (Replay expanded)

```html
<div class="action-stack editing">
  <div class="inline-editor editing">
    <label>Replay through Stage 4 — confirm intent</label>
    <select>
      <option>peppol_request (current — same as Stage 3 pick)</option>
      <option>credit_request</option>
      <option>payment_dispute</option>
      <!-- … other intents from swarm_intents registry … -->
    </select>
    <div style="font-size: var(--fs-xs); color: var(--text-muted);">
      Same intent → re-fires handler. Different intent → writes axis-3 override + fires new handler.
    </div>
    <div class="row-actions">
      <button class="btn">Cancel <span class="kbd">Esc</span></button>
      <button class="btn primary">Confirm replay <span class="kbd">⏎</span></button>
    </div>
  </div>
  <button class="btn">↶ Reclassify as noise <span class="kbd">N</span></button>
  <button class="btn">✕ Close (manual) <span class="kbd">Space</span></button>
</div>
```

## Keyboard ergonomics

| Key | Default action |
|---|---|
| ⏎ | Confirm primary action (Replay same-intent) — when no editor is open |
| ⏎ | Confirm inline-editor selection — when editor is open |
| Esc | Cancel inline editor |
| N | Open Reclassify-as-noise inline editor |
| Space | Close (manual) — fires immediately |
| ↑ ↓ | Navigate row list |

These match the Bulk Review keyboard cheat-sheet (`web/app/(dashboard)/automations/[swarm]/review/keyboard-shortcuts.tsx`) so operators learn one shortcut set across all stage tabs.

## What to Avoid

- **Drag-and-drop kanban columns** — operators don't move rows between reasons; the system already classified them. Tested in sketch 006 Variant A; rejected.
- **Modal-driven actions** — backdrop blocks reading the email while picking intent; kills the "context stays visible" property. Tested in sketch 007 Variant A; rejected.
- **Split-button discoverability** — chevron is invisible to rotating operators. Tested in sketch 007 Variant C; rejected.
- **Hidden-by-default detail pane** (drawer-on-click) — context-switching cost is high in a triage workflow; persistent pane is correct.
- **Confidence bar on no-handler rows** — confidence is meaningful only for low_confidence rows; rendering a bar everywhere is visual noise.
- **Confirm modals on Close** — friction on a high-frequency action; v1 ships unconfirmed close + accept the misclick risk. Future undo-toast can mitigate if needed.

## Origin

Sketches 006 + 007.
- 006 (3 variants) → B (filtered table + detail pane) wins.
- 007 (3 variants) → B (inline-expand within pane) wins.

Source files: `sources/006-stage-3-triage-shape/`, `sources/007-row-action-affordances/`.

CONTEXT.md (decisions D-01 axis-3 override + D-03 reclassify-as-noise) is the spec these sketches implement.
