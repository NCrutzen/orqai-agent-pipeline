# Phase 82: Unified stage shell — Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Source:** Live smoke after Phase 81 + 81.1 revealed inconsistent stage UX across `/stage-0` through `/stage-4`. User locked decisions inline via AskUserQuestion.

<domain>
## Phase Boundary

Converge all five stage surfaces (`/stage-0` Safety, `/stage-1` Noise, `/stage-2` Customer, `/stage-3` Intent, `/stage-4` Handler) onto a single shared UX: condensed Outlook-style row list on the left + arrow-key navigation + per-stage chip strip + mailbox filter + unified detail pane on the right. Today each stage diverges:

| Stage | Row list today | Detail pane today |
|-------|----------------|-------------------|
| 0     | None (info paragraph only)        | None |
| 1     | Phase 71 row strip (rich metadata, multi-line) | 4-axis override pane (Stages 1/2/3/4 editable) |
| 2     | None (count placeholder)          | None |
| 3     | Phase 76 Kanban row (badge + intent code, minimal) | Stage 3-specific (ranked intents, reason pill) |
| 4     | Phase 76 Stage 4 row              | Handler-output-specific |

After Phase 82: all five stages share `RowList`, `DetailPane`, `ChipStrip`, `MailboxFilter`, `SelectionContext`, `KeyboardShortcuts` components — parameterized by stage. Operator UX is identical regardless of which `/stage-N` they're on.

**In scope:**
- Promote Stage 3's condensed rectangular row shape to the canonical row component, **extended** with email metadata: From (sender_name + email) · Subject · Timestamp + stage-specific badge.
- Fix Stage 3 duplicate-label bug (today each row renders intent code twice — once mid-row, once right-aligned).
- Reuse Stage 1's detail-pane shape (email body preview + 5-cell pipeline trace + 4-axis override controls) as the canonical detail pane across all stages. Active stage's cell gets pre-focused + scrolled into view.
- Add a per-mailbox (`mailbox_id` → To-address) filter as a compact dropdown/popover on the right of the primary stage-specific chip strip. Visible on all 5 stages.
- Wire the unified shell on Stage 0 and Stage 2 even though they have no row data today — render a single empty state ("No rows yet — Stage N awaits backend wiring in a follow-up phase") inside the standard layout. UX consistency wins over hiding the surface.
- Stage-specific chip strips (the primary filter axis) keep their existing data sources:
  - Stage 0: TBD (per Phase 82 — see deferred-items below; for shell-only scope, render the "All" chip with a 0-count placeholder).
  - Stage 1: `swarm_noise_categories` (already wired Phase 81).
  - Stage 2: TBD (placeholder All chip until Phase 77 fills the data).
  - Stage 3: `swarm_intents` (already wired Phase 76).
  - Stage 4: handler keys (already wired Phase 76).
- Row badges show **only the current stage's signal** (no cross-stage pipeline strip on rows — kept clean).
- Arrow-key navigation (↑↓ to move through rows) wired uniformly via the shared `SelectionContext` + `KeyboardShortcuts` modules already used by Stages 1/3/4.

**Out of scope:**
- Stage 0 row data (injection_suspected event surface) — deferred. Stage 0 shows empty state.
- Stage 2 row data (tagging-failures / unmapped customers) — deferred to Phase 77 as originally planned.
- Backend pipeline changes — no DDL, no Inngest, no agent rewrites. Pure UI shell convergence.
- Cross-swarm aggregation (Phase 999.2 territory, unchanged).
- Realtime channel rename (`${swarmType}-review` stays per Phase 81 D-19; if Stage 3/4 use different channels today, they keep their existing names — Phase 82 does NOT unify realtime channels).
- Mobile / narrow viewport — desktop operator surface only.

</domain>

<decisions>
## Implementation Decisions

### Shared component library (Q1 — locked)

- **D-01:** Extract shared shell components into `web/app/(dashboard)/automations/[swarm]/_shell/`:
  - `row-list.tsx` — canonical condensed row list (from Stage 3's shape, extended with email metadata columns)
  - `detail-pane.tsx` — canonical detail pane (from Stage 1's 4-axis pane + email body preview from Stage 3)
  - `chip-strip.tsx` — generic chip strip (already exists as `recipient-chip-strip.tsx` pattern; extract here)
  - `mailbox-filter.tsx` — new compact dropdown/popover on the right of the primary chip strip
  - `selection-context.tsx` — already exists per Stage 1/3/4; move to `_shell/`
  - `keyboard-shortcuts.tsx` — already exists per Stage 1; move to `_shell/`
- **D-02:** Each `stage-N/page.tsx` becomes a thin wrapper: load stage-specific data + chip-strip data source + mailbox list, then render `<UnifiedShell stage={N} rows={…} primaryChipStrip={…} ... />`. No per-stage layout JSX duplicated.
- **D-03:** Row component signature: `{ id, from_name, from_email, subject, timestamp, mailbox_id, stage_badge: { label, variant } }`. Stage-specific badge data is computed at the page level (Stage 1 → noise category, Stage 3 → no_handler/low_conf, Stage 4 → handler key) and passed in.

### Row layout (Q4 — locked)

- **D-04:** Row strip is a single horizontal flex row:
  ```
  [stage_badge]  From <sender@example.com>  ·  Subject  ·  timestamp        [right-edge stage-specific signal if any]
  ```
  Mimics the Outlook "subject + sender + time" mental model. Truncate long subjects with ellipsis; show full subject in detail pane.
- **D-05:** Stage 3's right-edge intent code (which today duplicates the row-text intent code — confirmed bug) is removed. The stage-specific badge on the left replaces it. Bug fix lands in the row component refactor.
- **D-06:** Row badges show ONLY the current stage's signal. No multi-stage pipeline strip on the row (cleaner; pipeline detail lives in the detail pane).
- **D-07:** Selection styling, hover styling, focus ring — copy verbatim from Stage 3's current row component (it's the closest to the target shape).

### Detail pane (Q2 — locked)

- **D-08:** Single `<UnifiedDetailPane>` component renders everywhere. Layout (top → bottom):
  1. Header: From + Subject + Timestamp + Mailbox
  2. Email body preview (collapsible — default open if email_body present; show "Hide email" toggle like Stage 1 today)
  3. Pipeline trace: 5 stage cells (Stage 0 → Stage 4), each showing the decision + confidence + override controls. Active stage cell (matching the current `/stage-N` route) is pre-expanded + scrolled into view; the rest are collapsed by default but expandable.
  4. Action footer: Approve / Reject / Skip (Stage 1's existing keyboard shortcuts ↩ / space / n)
- **D-09:** Override semantics per stage:
  - Stage 0: override = mark injection_suspected verdict (true/false)
  - Stage 1: override = pick a different `swarm_noise_categories` key
  - Stage 2: override = pick a different customer / mark as unmappable (when Phase 77 wires data)
  - Stage 3: override = pick the top-ranked intent OR mark as `no_handler`/`low_conf` (existing Phase 76 affordance)
  - Stage 4: override = re-route to a different handler key
  These are the existing Phase 71 4-axis override controls, generalized to 5 axes.
- **D-10:** Detail pane reads the same `pipeline_events` history that Stage 1's detail pane already reads (no new query). The 5-cell layout is a re-render of the same data, just structured.

### Mailbox filter (Q3 — locked)

- **D-11:** Compact dropdown/popover button on the right of the primary chip strip, labeled `Mailbox: <name>` (or `All mailboxes` when no filter applied). Clicking opens a popover with a checkbox list of all `mailboxes` known for the swarm (sourced from `swarm.mailboxes` array — already loaded by every stage page).
- **D-12:** URL state: `?mailbox=<id>` (re-use the existing param Stage 1 already reads). Multi-select uses repeated params `?mailbox=12&mailbox=5`. Loader merges into the existing per-stage `WHERE mailbox_id IN (...)` predicate.
- **D-13:** Default = no filter (all mailboxes). The dropdown's filter state persists per URL only — no localStorage, no cookies.
- **D-14:** Visible on all 5 stages. On Stage 0/2 with no row data, the dropdown still renders (consistent shell) but filtering is a no-op until those stages get data.

### Stage 0 / Stage 2 empty state (Q1 — locked: shell-only)

- **D-15:** Stage 0 and Stage 2 render the unified shell with all components present (chip strip, mailbox filter, row list, detail pane). Row list shows a single empty-state block: "No rows yet — Stage N data wiring lands in a follow-up phase." Detail pane shows "Select a row to inspect" (same copy as Stages 1/3/4 when nothing is selected).
- **D-16:** Existing Stage 0 info paragraph (current `/stage-0/page.tsx`) is preserved as a small banner above the row list: "Stage 0 (Safety) — prompt-injection filter. Injection-suspected rows surface here once Phase 999.4 wires the data."
- **D-17:** Existing Stage 2 placeholder count + ↗ link from Phase 81 D-12 is preserved as a small banner above the row list (or folded into the empty-state copy).

### Stage 3 duplicate label bug

- **D-18:** Stage 3 row today renders `[no_handler] intent_code … intent_code` — both the middle text and the right-aligned column show the same intent code. This is a `row-list.tsx` rendering bug. The new unified row strip eliminates this by design (D-04: only one place renders the intent code, and only as a badge). No separate bug-fix commit needed — the refactor subsumes the fix.

### Migration strategy

- **D-19:** Migrate stage by stage in a single phase (5 plans, one per stage), each plan switching its page.tsx + supporting files to consume `_shell/` components. Pattern matches Phase 81's wave structure.
- **D-20:** Existing `stage-N/row-list.tsx`, `stage-N/detail-pane.tsx`, `stage-N/filter-chips.tsx`, `stage-N/selection-context.tsx` files in each stage directory are deleted after their stage's page.tsx switches to `_shell/` imports. (Selection-context + keyboard-shortcuts may keep stage-scoped state where needed but the *component* lives in `_shell/`.)

### Claude's Discretion

- Whether `_shell/row-list.tsx` and `_shell/detail-pane.tsx` are server components or `"use client"` boundary points — planner's call based on the realtime + selection-state mix. (Today Stage 3 is "use client" for the client composite.)
- Where the keyboard-shortcut listener is mounted in the unified shell — one mount in the shell layout vs. per-stage page. Planner's call.
- Whether mailbox filter is implemented as a native `<select>` vs. headless popover. Lean toward popover for visual parity with chip strip; native select if a11y is at risk.

</decisions>

<specifics>
## Specific Ideas

- **Stage 3's row component is the closest to the target shape.** Start there — copy `row-list.tsx`, add From/Subject/Timestamp columns, drop the duplicate right-column intent code.
- **Stage 1's detail pane is the closest to the target detail pane.** Start there — generalize the 4-axis grid to 5 axes (add Stage 0 cell), add the active-stage scroll-into-view hook.
- **The mailbox filter doesn't need new data.** `swarm.mailboxes` is already in scope on every page. The popover is purely a UI affordance over an existing URL param Stage 1 already reads.
- **The duplicate `general_inquiry` bug** (visible in user screenshot) is `web/app/(dashboard)/automations/[swarm]/stage-3/row-list.tsx` — both the row text and the right-aligned cell render `row.intent_code` or equivalent. The unified row component removes the redundancy by construction.
- **Empty state copy consistency** — match Stage 1's "Select a row from the list to review it" tone. No marketing copy, no excessive whitespace.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked design
- This CONTEXT.md (4 forks answered inline via AskUserQuestion 2026-05-11)
- `.claude/skills/sketch-findings-agent-workforce/references/stage-keyed-shell-phase-76.md` — Sketch 005 visual + interaction language
- `.claude/skills/sketch-findings-agent-workforce/references/bulk-review-phase-71.md` — Phase 71 row strip + 4-axis override (the detail pane lineage)
- `.planning/phases/81-fold-stage-1-bulk-review-into-the-stage-keyed-shell-close-th/81-CONTEXT.md` — Phase 81 D-01 through D-19 (Stage 1 shell-wrap, chip strip pattern, sub-view discipline)
- `.planning/phases/76-stage-3-kanban-human-lane-wiring/76-CONTEXT.md` — Phase 76 Stage 3/4 shell decisions

### Pipeline architecture
- `docs/agentic-pipeline/README.md` — 5-stage funnel; hard-separation rule (Stage 1 reads `swarm_noise_categories`, Stage 3 reads `swarm_intents`)
- `docs/agentic-pipeline/stage-1-regex.md`
- `docs/agentic-pipeline/stage-3-coordinator.md`

### Existing surfaces this phase converges
- `web/app/(dashboard)/automations/[swarm]/_shell/page-header.tsx` — keep as-is, shared
- `web/app/(dashboard)/automations/[swarm]/_shell/stage-tab-strip.tsx` — keep as-is, shared
- `web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx` — convert to use unified shell, render empty-state row list
- `web/app/(dashboard)/automations/[swarm]/stage-1/*` — convert to use `_shell/row-list.tsx` + `_shell/detail-pane.tsx` + `_shell/mailbox-filter.tsx`; keep existing chip strip (noise-category) as primary
- `web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx` — convert to use unified shell, render empty-state row list; preserve count banner
- `web/app/(dashboard)/automations/[swarm]/stage-3/*` — convert to use unified shell; this is where the duplicate-label bug gets removed
- `web/app/(dashboard)/automations/[swarm]/stage-4/*` — convert to use unified shell

### Loaders this phase reuses
- Per-stage row loaders (one per `stage-N/page.tsx` today) — unchanged; their output shape is normalized at the page boundary into the unified `Row` type.
- `pipeline_events` query (Stage 1's detail pane uses it) — reused for the 5-cell pipeline trace in the unified detail pane.
- `swarm.mailboxes` — sourced from the existing `loadSwarm()` call on every page.

</canonical_refs>

<verification>
## Verification Strategy

**Goal-backward checks (planner builds these into PLAN.md must_haves):**

1. `/automations/debtor-email/stage-0` renders the unified shell with chip strip + mailbox filter + empty row list ("No rows yet — Stage 0 awaits backend wiring") + empty detail pane ("Select a row to inspect"). Existing Stage 0 info banner preserved above the row list.
2. `/automations/debtor-email/stage-1` renders the unified shell with row list (From + Subject + Timestamp + noise-category badge), arrow-key nav, mailbox filter dropdown, unified detail pane with Stage 1 cell pre-expanded.
3. `/automations/debtor-email/stage-2` renders the unified shell with chip strip + mailbox filter + empty row list + tagging-failures count banner preserved.
4. `/automations/debtor-email/stage-3` renders the unified shell. Each row shows `[no_handler] From · Subject · Timestamp` (single-column intent badge, no duplicate label). Selecting a row opens the unified detail pane with Stage 3 cell pre-expanded.
5. `/automations/debtor-email/stage-4` renders the unified shell with the handler-output row + detail pane (Stage 4 cell pre-expanded).
6. The mailbox filter dropdown is visible on all 5 stages, lists every mailbox in `swarm.mailboxes`, and writes `?mailbox=<id>` to the URL when selected. Selected state survives navigation.
7. Arrow-key navigation (↑↓) works identically on all 5 stages: moves selection through the row list, scrolls the selected row into view, updates the detail pane.
8. The unified detail pane shows the email body (collapsible) + 5-stage pipeline trace + 4-axis (now 5-axis) override controls. The active stage's cell is pre-expanded + scrolled into view.
9. Stage 3's duplicate `general_inquiry` (or any duplicate intent-code label per row) is gone — verified by RTL test on the new row component.
10. No `stage-1/row-list.tsx`, `stage-2/row-list.tsx`, `stage-3/row-list.tsx`, `stage-4/row-list.tsx` files remain — all rows render through `_shell/row-list.tsx`. Same for `detail-pane.tsx`.

</verification>

<deferred>
## Deferred Ideas

- Stage 0 row data (injection_suspected event surface) — needs its own loader + telemetry source. Not in Phase 82 scope.
- Stage 2 row data (tagging-failures / unmapped customers) — Phase 77 territory.
- Cross-stage pipeline strip on each row (badges showing every stage a row has been through) — explicitly rejected per Q4 (clean rows preferred).
- Mobile / narrow-viewport layout for the unified shell.
- Realtime channel unification across stages.

</deferred>
