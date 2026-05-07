# Bulk Review (Phase 71)

Origin: synthesised from sketches 002 (per-email row strip), 003 (4-axis override panel), and 004 (Phase 71 synthesis — the production-aligned reskin).

## Design Decisions

### Predicted-row list — column strip pattern (sketch 002 → 004)

The predicted-row list aggregates one row per email (driven by `pipeline_events_email_summary` view). Each row carries a deterministic 4-stage decision strip — Stage 1, 2, 3, 4 — with a coloured chip per stage showing what that stage decided. **Winning pattern:** column strip. Stage chips are inline, equal-width, left-to-right. Override-flag indicators are amber dots in the chip's corner. Recipient inbox shown as a per-row chip on the left, brand-coloured.

**Rejected alternatives:**
- Pyramid stack (each stage a vertical block) — wastes vertical room; rows became 80px tall, killed list density.
- Hidden-by-default with on-hover reveal — bad operator ergonomics; reviewers were toggling visibility constantly.

### 4-axis override panel — vertical pipeline with per-axis cards (sketch 003 → 004)

The detail-pane override surface lays out one card per pipeline stage (Stages 1-4), stacked vertically. Each card has: stage label, current decision (read-only), a "dirty" indicator when the operator changes the value, and an inline editor that expands within the card when entering override mode. Common-case workflow (no override) sees only "Approve / Reject / Skip" buttons at the bottom; override entry expands one card at a time without burying the common case behind a modal.

**Rejected alternatives:**
- Big collapsible panel toggling all 4 axes at once — added a click before any override could be set; common case paid the tax.
- Tabs per axis — mutually exclusive; operator couldn't see other stages' decisions while editing one.

### N-stage scaling (sketch 004)

The detail pane's pipeline renders from a data array. Swarms with 5/6 stages (or fewer) work without redesign — the toolbar in sketch 004 toggles `4 stages ↔ 6 stages` to prove it. Pattern: `stagesData: StageData[]` mapped into PipelineFlow component, no hardcoded stage count anywhere.

### Recipient chip strip (sketch 004)

When the swarm hosts multiple recipient inboxes (e.g. `debiteuren@smeba.nl`, `debiteuren@berki.com`, `debiteuren@smeba-fire.be`), a chip strip above the list filters by inbox. Active chip carries the brand-coloured dot (deterministic per `entity_brand`). "All" chip is the default.

## CSS Patterns (key snippets)

### Stage chip with override flag

```css
.stage-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 999px;
  background: var(--bg-2); border: 1px solid var(--border);
  font-family: var(--font-mono); font-size: var(--fs-xs);
  white-space: nowrap;
  position: relative;
}
.stage-chip.override::after {
  content: ""; position: absolute; top: -2px; right: -2px;
  width: 6px; height: 6px; border-radius: 999px;
  background: var(--override);
  box-shadow: 0 0 0 2px var(--bg);
}
```

### Override card with dirty state

```css
.axis-card {
  background: var(--bg-panel); border: 1px solid var(--border);
  border-radius: 8px; padding: var(--space-3);
}
.axis-card.dirty {
  border-color: var(--override);
  background: linear-gradient(135deg, var(--bg-panel) 0%, var(--override-soft) 100%);
}
.axis-card .stage-label {
  font-size: var(--fs-xs); color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.05em;
  margin-bottom: 4px;
}
```

### Recipient chip strip

```css
.recipient-strip {
  display: flex; gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--bg); border-bottom: 1px solid var(--border);
}
.recipient-chip {
  padding: 4px 12px; border-radius: 999px;
  background: var(--bg-2); border: 1px solid var(--border);
  display: flex; align-items: center; gap: 6px;
  font-size: var(--fs-xs); cursor: pointer;
}
.recipient-chip .brand-dot {
  width: 8px; height: 8px; border-radius: 999px;
  background: var(--brand-color, var(--text-muted));
}
.recipient-chip.active { border-color: var(--brand-primary); color: var(--brand-primary); }
```

## HTML Structures (key patterns)

### Predicted-row strip

```html
<div class="predicted-row">
  <span class="recipient-chip"><span class="brand-dot"></span>smeba</span>
  <div class="stage-strip">
    <span class="stage-chip">S1: auto_reply</span>
    <span class="stage-chip">S2: customer-1234</span>
    <span class="stage-chip override">S3: payment_dispute</span>
    <span class="stage-chip">S4: draft_created</span>
  </div>
  <span class="subject">Re: Factuur 17341388</span>
  <span class="meta">smeba · 12m</span>
</div>
```

### 4-axis override panel — vertical stack

```html
<aside class="override-panel">
  <div class="axis-card" data-axis="1">
    <div class="stage-label">Stage 1 — Category</div>
    <div class="current">auto_reply</div>
    <button class="override-trigger">Override…</button>
  </div>
  <div class="axis-card dirty" data-axis="2">…</div>
  <div class="axis-card" data-axis="3">…</div>
  <div class="axis-card" data-axis="4">…</div>
  <div class="action-stack">
    <button class="primary">Approve</button>
    <button>Reject</button>
    <button>Skip</button>
  </div>
</aside>
```

## What to Avoid

- Hidden inbox + drawer reveals on click — operators reported wanting all per-row context simultaneously visible.
- Mixing override controls with the row strip itself — override entry belongs in the detail pane, not the list. Keeps the list scannable.
- Hardcoded stage count in component props — N-stage scaling requires data-driven layout, otherwise sales-email's hypothetical N-stage variant breaks.
- Dropdown editors that span more than the card's height — use inline expansion that pushes content down, not absolute-positioned popovers (those clipped on the smaller pane widths).

## Origin

Synthesised from sketches: 002, 003, 004.
- 002 explored the row-strip layout (3 variants → A: column strip won).
- 003 explored the override panel (3 variants → C: vertical pipeline won).
- 004 reskinned 002A + 003C to V7 production tokens, added N-stage scaling + recipient filter.

Source files: `sources/002-per-email-strip/`, `sources/003-four-axis-override-panel/`, `sources/004-phase-71-synthesis/`.

Production code that implements these patterns lives at `web/app/(dashboard)/automations/[swarm]/review/`.
