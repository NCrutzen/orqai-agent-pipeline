# Phase 82: Unified stage shell — Research

**Researched:** 2026-05-11
**Domain:** Next.js 15 RSC + client component composition, React Testing Library, V7 design tokens
**Confidence:** HIGH (existing codebase pattern extraction; minimal external research needed)

## Summary

Phase 82 is pure UI convergence — extract a shared `_shell/` component library and switch all five `stage-N/page.tsx` files to consume it. No backend changes, no DDL, no Inngest. The hard-separation rule (Stage 1 reads `swarm_noise_categories`; Stage 3 reads `swarm_intents`; never blurred) is preserved because the unified detail pane's per-stage override widgets are stage-scoped — Stage 1 cell only writes category overrides, Stage 3 cell only writes intent overrides. Per-stage chip-strip data sources stay separate too.

The canonical row shape is Stage 3's condensed strip extended with Outlook-style metadata (From + Subject + Timestamp). The canonical detail pane is Stage 1's `PipelineFlow`-based 4-axis override pane, generalized to 5 axes (Stage 0 cell added) with email body preview prepended. The duplicate-label bug in Stage 3's row is a real bug at `web/app/(dashboard)/automations/[swarm]/stage-3/row-list.tsx` lines 117 and 126 — `r.topic` (intent label) and `r.result.intent` (intent code) both render on the same row.

**Primary recommendation:** Migrate in dependency order — extract `_shell/row-list.tsx` from Stage 3's row first (closest to target), then `_shell/detail-pane.tsx` from Stage 1's detail pane (the richest source), then switch stages in reverse-complexity order: Stage 0 → Stage 2 → Stage 4 → Stage 3 → Stage 1. This lets each successive plan refine the shared component and lands the highest-risk Stage 1 surgery last when the contract is stable.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01 through D-20)

**Shared component library (Q1):**
- D-01: Extract shared shell components into `web/app/(dashboard)/automations/[swarm]/_shell/`: `row-list.tsx`, `detail-pane.tsx`, `chip-strip.tsx`, `mailbox-filter.tsx`, `selection-context.tsx`, `keyboard-shortcuts.tsx`.
- D-02: Each `stage-N/page.tsx` becomes thin wrapper: load stage-specific data + chip-strip data + mailbox list → render `<UnifiedShell stage={N} ...>`. No per-stage layout JSX duplicated.
- D-03: Row signature: `{ id, from_name, from_email, subject, timestamp, mailbox_id, stage_badge: { label, variant } }`. Stage-specific badge data computed at page level.

**Row layout (Q4):**
- D-04: Single horizontal flex row: `[stage_badge] From <sender@example.com> · Subject · timestamp [right-edge stage-specific signal if any]`.
- D-05: Stage 3's duplicate right-edge intent code is removed; stage_badge on left replaces it. Bug fix subsumed by refactor.
- D-06: Row badges show ONLY current stage's signal. No multi-stage pipeline strip on rows.
- D-07: Selection styling, hover, focus ring — copy verbatim from Stage 3's current row.

**Detail pane (Q2):**
- D-08: Single `<UnifiedDetailPane>`. Layout: header (From+Subject+Time+Mailbox) → body preview (collapsible, default open) → 5-cell pipeline trace (Stage 0→4 cells; active cell pre-expanded + scrolled into view; others collapsed) → action footer (Approve/Reject/Skip with Stage 1's existing ↩/space/n shortcuts).
- D-09: Override semantics per stage: Stage 0 = mark injection_suspected; Stage 1 = pick different `swarm_noise_categories` key; Stage 2 = pick different customer / mark unmappable (when Phase 77 wires data); Stage 3 = pick top-ranked intent OR `no_handler`/`low_conf`; Stage 4 = re-route handler key.
- D-10: Detail pane reads same `pipeline_events` history Stage 1's pane already reads. 5-cell layout is re-render of same data.

**Mailbox filter (Q3):**
- D-11: Compact dropdown/popover right of primary chip strip, labeled `Mailbox: <name>` or `All mailboxes`. Sources from `swarm.mailboxes` (already loaded per CONTEXT — see Assumption A1 below).
- D-12: URL state `?mailbox=<id>`; multi-select uses repeated params (`?mailbox=12&mailbox=5`). Loader merges into existing `WHERE mailbox_id IN (...)`.
- D-13: Default no filter. State persists via URL only — no localStorage/cookies.
- D-14: Visible on all 5 stages. Stage 0/2 with no data → dropdown renders but filtering is no-op.

**Stage 0/2 empty state (Q1):**
- D-15: Stage 0/2 render unified shell with all components; row list shows single empty-state block "No rows yet — Stage N data wiring lands in a follow-up phase." Detail pane: "Select a row to inspect".
- D-16: Existing Stage 0 info paragraph preserved as banner above row list.
- D-17: Existing Stage 2 placeholder count + ↗ link preserved as banner above row list (or folded into empty-state copy).

**Stage 3 duplicate label bug:**
- D-18: New unified row strip eliminates by design; no separate bug-fix commit.

**Migration strategy:**
- D-19: Migrate stage by stage in single phase — 5 plans, one per stage. Pattern matches Phase 81.
- D-20: Existing `stage-N/row-list.tsx`, `stage-N/detail-pane.tsx`, `stage-N/filter-chips.tsx`, `stage-N/selection-context.tsx` files deleted after stage's page.tsx switches to `_shell/` imports.

### Claude's Discretion
- `_shell/row-list.tsx` and `_shell/detail-pane.tsx` server vs `"use client"` — planner's call.
- Keyboard-shortcut listener mount point — one mount in shell vs per-stage page — planner's call.
- Mailbox filter as native `<select>` vs headless popover — lean popover for visual parity, native if a11y at risk.

### Deferred Ideas (OUT OF SCOPE)
- Stage 0 row data (injection_suspected event surface).
- Stage 2 row data (tagging-failures/unmapped customers) — Phase 77 territory.
- Cross-stage pipeline strip on each row — explicitly rejected.
- Mobile/narrow-viewport layout.
- Realtime channel unification across stages — channels stay per-stage.
</user_constraints>

<phase_requirements>
## Phase Requirements

Phase 82 is not mapped to v1 REQ-IDs in `.planning/REQUIREMENTS.md` (the file covers Phases 63-73). It's UX-driven follow-on work surfaced by post-Phase-81 smoke. Its goal-backward checks live in CONTEXT.md `<verification>` (10 items) — these are the de-facto requirements for this phase.

| Check | Description | Research Support |
|-------|-------------|------------------|
| V1 | `/stage-0` renders unified shell + empty row list + info banner | Stage 0 page.tsx today renders only info paragraph (see §Component Inventory) |
| V2 | `/stage-1` renders unified shell with noise-cat badge + arrow nav + mailbox filter + 5-cell trace with Stage 1 cell pre-expanded | Stage 1 detail-pane.tsx already implements `PipelineFlow` for stages 1-4 |
| V3 | `/stage-2` renders unified shell + tagging-failures count banner preserved | Stage 2 already loads `loadStage2WeeklyCount`; trivial banner merge |
| V4 | `/stage-3` row shows `[no_handler] From · Subject · Timestamp` (single intent badge — no duplicate) | Bug confirmed at stage-3/row-list.tsx:117 + :126 (see §Common Pitfalls) |
| V5 | `/stage-4` renders unified shell + Stage 4 cell pre-expanded | Stage 4 uses Stage3 ReasonPill + ActionStack already |
| V6 | Mailbox filter visible all 5 stages, writes `?mailbox=<id>` | Stage 1 already reads `params.mailbox`; no SwarmRow.mailboxes field today (A1) |
| V7 | ↑↓ arrow nav works identically all 5 stages | Stage 1 has full `KeyboardShortcuts` component; Stage 3/4 do NOT have one — they rely on click-only today |
| V8 | Detail pane shows body (collapsible) + 5-stage trace + 5-axis overrides; active cell pre-expanded + scrolled in | Stage 1 detail-pane.tsx already has body cache + `PipelineFlow`; needs Stage 0 cell addition |
| V9 | Stage 3 duplicate `general_inquiry` gone — verified by RTL | Trivial RTL assertion against new unified row component |
| V10 | No `stage-N/row-list.tsx`, `stage-N/detail-pane.tsx` files remain | File deletion verification — grep in CI |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Row data loading per stage | Frontend Server (RSC) | API/Database (Supabase) | Each `stage-N/page.tsx` is async RSC that loads from Supabase directly via admin client |
| Row data normalization to `Row` shape | Frontend Server (RSC) | — | Mapping happens at page boundary before passing to client `_shell/row-list.tsx` |
| Selection state (selectedId) | Browser/Client | — | `SelectionProvider` uses React state + `history.replaceState` — no server roundtrip |
| Keyboard navigation | Browser/Client | — | `useEffect` window listener; mounts in `"use client"` boundary |
| Mailbox filter URL state | Browser/Client + Frontend Server | — | URL param read server-side in loader; popover write client-side via `router.replace` |
| Override write (per axis) | Browser/Client → API | API/Backend (Inngest emit) | Existing POST to `/api/automations/debtor-email/override` — unchanged |
| Pipeline trace data | Database (Supabase) | Frontend Server (RSC) | Reads `pipeline_events_email_summary` view + `pipeline_events` rows |
| Realtime channel subscription | Browser/Client | — | `AutomationRealtimeProvider` per stage (channels NOT unified) |

## Component Extraction Inventory

| Target (`_shell/`) | Source (closest analog) | Props needed (union of consumers) | Files to delete after migration |
|-------------------|------------------------|------------------------------------|--------------------------------|
| `row-list.tsx` | `stage-3/row-list.tsx` (lines 78-135 the `<ul>` block — closest to target row shape) | `rows: Row[]`, `emptyState: { title, body }`, `rightEdgeSlot?: (row) => ReactNode` | `stage-1/row-list.tsx`, `stage-1/row-strip.tsx`, `stage-3/row-list.tsx` (the `<ul>` part — keep `Stage3Client` shell or fold into page), `stage-4/row-list.tsx` |
| `detail-pane.tsx` | `stage-1/detail-pane.tsx` (1253 lines — the canonical 4-axis pane) | `row: Row \| null`, `swarmType`, `categories: SwarmNoiseCategoryRow[]`, `intents: SwarmIntentRow[]`, `timeline: PipelineTimelineEvent[]`, `bodyText: string \| null`, `activeStage: 0\|1\|2\|3\|4` | `stage-1/detail-pane.tsx`, `stage-3/detail-pane.tsx`, `stage-4/detail-pane.tsx`, `stage-4/error-detail-section.tsx` (folded into Stage 4 cell widget) |
| `chip-strip.tsx` | `stage-1/noise-category-chip-strip.tsx` + `stage-3/filter-chips.tsx` (both ~70 lines) | `chips: { key, label, count }[]`, `active: string`, `onChange: (k) => void` | Generic strip stays; `stage-1/noise-category-chip-strip.tsx` becomes wrapper passing noise-categories data; `stage-3/filter-chips.tsx` becomes wrapper; `stage-4/filter-chips.tsx` becomes wrapper. Note: Phase 81-03 D-rejected a generic ChipStrip abstraction (see STATE.md). Phase 82 D-01 reopens it. Resolve by extracting and migrating Phase 81's `noise-category-chip-strip` as a CONSUMER of the new shared `chip-strip` — not deleting it. |
| `mailbox-filter.tsx` | NEW (no analog) | `mailboxes: { id, name }[]`, `selected: number[]`, `onChange: (ids) => void` | — (net new) |
| `selection-context.tsx` | `stage-3/selection-context.tsx` (113 lines — the most generic; already supports `pendingRemovalIds`) | `initialSelectedId?`, `rowIds: string[]` | `stage-1/selection-context.tsx`, `stage-3/selection-context.tsx`, `stage-4/selection-context.tsx` (these are near-identical clones) |
| `keyboard-shortcuts.tsx` | `stage-1/keyboard-shortcuts.tsx` (247 lines — only stage with it today) | `rowIds: string[]`, `enabledShortcuts?: Set<string>` | `stage-1/keyboard-shortcuts.tsx` (moves to `_shell/`) |

### Keep as-is (per CONTEXT D-15-area / Phase 76)
- `_shell/page-header.tsx`
- `_shell/stage-tab-strip.tsx`
- `_shell/derive-stage-tabs.ts`

## Row Data Normalization

Each stage's loader returns a different shape today. Normalization must happen at the **page boundary** (server side) before passing to the unified client `<RowList>`.

### Source row shapes today

**Stage 1 (`PredictedRow` from `stage-1/page.tsx` line 99-184):**
```ts
{ id, automation_run_id?, automation, status, swarm_type, topic, entity,
  mailbox_id, result: { email_id, subject, from, fromName, source_mailbox,
  predicted: { category } }, created_at, stage_decisions, stage_overridden,
  total_cost_cents, tool_call_count, ... }
```
Email metadata is nested inside `result` (subject, from, fromName, source_mailbox).

**Stage 3 / 4 (`KanbanRow` from `_lib/kanban-loader.ts:26-49`):**
```ts
{ id, swarm_type, topic, entity, created_at,
  result: { kanban_reason, intent?, confidence?, email_id?, ranked?, ... },
  stage_1_event_id, stage_3_event_id }
```
**No email metadata** today — no subject, no from, no timestamp beyond `created_at` (automation_runs row timestamp, not email-received timestamp).

### Target normalized shape (CONTEXT D-03)

```ts
interface Row {
  id: string;
  from_name: string | null;
  from_email: string | null;
  subject: string | null;
  timestamp: string;          // ISO; email received time preferred
  mailbox_id: number | null;
  stage_badge: { label: string; variant: 'noise' | 'intent' | 'handler' | 'safety' | 'placeholder' };
}
```

### Mapping per stage (page-boundary)

| Stage | Source | Mapping notes |
|-------|--------|---------------|
| 0 | none today | Return `[]`. Empty state renders. |
| 1 | `PredictedRow` | `from_name = result.fromName ?? null`; `from_email = result.from ?? null`; `subject = result.subject ?? null`; `timestamp = created_at` (the view's `email_received_at` fallback already wires this — see `mapSummaryToPredictedRow` line 528); `stage_badge = { label: result.predicted.category, variant: 'noise' }`. |
| 2 | none today | Return `[]`. Empty state renders. Preserve tagging-failures count banner. |
| 3 | `KanbanRow` (filtered `kanban_reason ∈ {no_handler, low_confidence}`) | **Email metadata is missing today.** `KanbanRow` doesn't carry subject/sender. **GAP** — Stage 3 loader needs to JOIN to `email_pipeline.emails` by `result.email_id` to get subject + sender + email received_at. This is a real data-layer enrichment, not pure UI. See Open Question OQ-2. `stage_badge = { label: result.kanban_reason, variant: 'intent' }`. |
| 4 | `KanbanRow` (filtered `kanban_reason='handler_error'`) | Same JOIN gap as Stage 3. `stage_badge = { label: 'handler_error', variant: 'handler' }`. |

**Implication:** Phase 82 needs a Stage 3/4 loader enrichment (JOIN `automation_runs.result.email_id` → `email_pipeline.emails`) to pull subject + sender + received_at. This is small (one query, mirrors Stage 1's existing JOIN in `loadPageData` lines 696-700) but non-trivial — it's not "pure UI shell convergence" the way CONTEXT framed Phase 82. Flagged as an open question for the planner (OQ-2).

## 5-Cell Pipeline Trace Data Source

Stage 1's current 4-axis override is implemented via `PipelineFlow` (web/app/(dashboard)/automations/[swarm]/stage-1/components/pipeline-flow.tsx — referenced but not read in this research; existence confirmed from imports at detail-pane.tsx:41-54) over four `StageData` objects built in detail-pane.tsx:453-554. Today: `for (const n of [1, 2, 3, 4])`.

### Generalization to 5 cells

Change the loop to `for (const n of [0, 1, 2, 3, 4])` and add a Stage 0 case. Stage 0 widget per D-09 is: "mark injection_suspected (true/false)" — a 2-state toggle. The `pipeline_events` row at `stage=0` already exists per Phase 64 — see stage-1/page.tsx:387-433 (the `tab === 'safety'` branch). The data is there; the unified pane just needs a new `Stage0Widget` component.

### Active-cell pre-expand + scroll-into-view

The unified pane needs an `activeStage: 0|1|2|3|4` prop derived from the page route. The cell matching `activeStage` mounts pre-expanded; other cells render collapsed. Scroll-into-view: `useEffect` + `ref.current?.scrollIntoView({ block: 'nearest' })` after mount.

### Per-axis override write — hard-separation map

| Stage cell | Writes to | API route | Hard-separation note |
|-----------|-----------|-----------|----------------------|
| 0 | `pipeline_events.override` jsonb (axis=`stage_0_safety`) | `/api/automations/debtor-email/override` (existing — extend axis enum) | Safety filter is upstream of noise/intent split — neither registry touched. |
| 1 | `pipeline_events.override` (axis=`stage_1_category`) → references `swarm_noise_categories.category_key` | existing override route | **Reads ONLY `swarm_noise_categories`. Never blurs with intents.** |
| 2 | `pipeline_events.override` (axis=`stage_2_customer`) | existing override route | Customer registry (separate from noise/intent). |
| 3 | `pipeline_events.override` (axis=`stage_3_intent`) → references `swarm_intents.intent_key` | existing override route | **Reads ONLY `swarm_intents`. Never blurs with noise categories.** |
| 4 | `pipeline_events.override` (axis=`stage_4_handler_output`) | existing override route | Handler key (mapped via `swarm_intents.handler_agent_key`). |

All five widgets already exist as `Stage1Widget`/`Stage2Widget`/`Stage3Widget`/`Stage4Widget` (detail-pane.tsx:45-54). Stage 0 widget is net new.

## Mailbox Filter

### Current shape — IMPORTANT GAP

**`SwarmRow` has NO `mailboxes` field today.** Verified by reading `web/lib/swarms/types.ts` lines 40-64. CONTEXT D-11 says "sourced from `swarm.mailboxes` array — already loaded by every stage page" — this is incorrect. What exists today:

- `stage-1/detail-pane.tsx` lines 109-116: hardcoded `MAILBOX_LABELS: Record<number, string>` map (6 entries, debtor-email only).
- `stage-1/page.tsx:494-496`: reads `params.mailbox` URL param → applies `q.eq("decision_details->>mailbox_id", String(mb))`.
- No central mailbox registry exists.

### Two options for the planner

**Option A (lean, no schema change):** Derive mailbox list from row data at load time. The page loader already pulls rows with `decision_details.mailbox_id`; aggregate the distinct set + use the hardcoded `MAILBOX_LABELS` map for `debtor-email`. Other swarms get `mailbox <id>` raw. Trade-off: dropdown empty when row list is empty (Stage 0/2). Mitigation: fall back to a per-swarm static list (e.g., for debtor-email, the 6 known mailbox IDs).

**Option B (proper):** Add `swarms.mailboxes` jsonb column with shape `[{ id, name, brand? }]`. Migration + registry update. Real `swarm.mailboxes` field on `SwarmRow`. Out-of-scope per CONTEXT's "no DDL" stance.

**Recommendation:** Option A. Encapsulate the per-swarm fallback in a single helper `getSwarmMailboxes(swarm: SwarmRow): { id: number; name: string }[]` so a future Option B migration is a one-line swap.

### Multi-mailbox loader

Stage 1's loader (line 494) does single `eq` today. Multi-mailbox `?mailbox=12&mailbox=5` needs `.in("decision_details->>mailbox_id", [12, 5].map(String))`. URL parsing: Next.js 15 `searchParams.mailbox` is `string | string[] | undefined` — handle both shapes.

## Keyboard Shortcuts Mounting

### Current state per stage

| Stage | Has `KeyboardShortcuts`? | Has `SelectionProvider`? | Arrow nav works? |
|-------|--------------------------|---------------------------|------------------|
| 0 | no | no | no |
| 1 | **yes** (`stage-1/keyboard-shortcuts.tsx`, 247 lines) | yes | yes |
| 2 | no | no | no |
| 3 | no (click-only) | yes | **no** |
| 4 | no (click-only) | yes | **no** |

CONTEXT verification V7 says "Arrow-key navigation (↑↓) works identically on all 5 stages." This means Stages 3/4 *gain* keyboard nav as a side effect of the migration — and Stages 0/2 gain it on the empty list (no-op but mounted).

### Recommendation

Mount `KeyboardShortcuts` **once per stage page**, inside the page's `<SelectionProvider>` (so it can read `selectedId`). Reason: shortcut keys differ per stage (Stage 1 has `1`/`2`/`3`/`4` for stage-cell focus + `c`/`g` for eval-type; Stage 3/4 don't need those). A single shell-level mount with stage-dispatched event handlers couples the shell to per-stage semantics. Per-page mount with an `enabledShortcuts: Set<string>` prop keeps the registry pluggable.

Alternative: shell-level mount with no-op handlers for unbound keys. Simpler but every shortcut becomes a global event-bus channel — observed downside in Phase 71 (a lot of `bulk-review:*` window events; hard to trace).

**Discretion locked recommendation:** Per-page mount with shared `_shell/keyboard-shortcuts.tsx` component + per-stage `enabledShortcuts` Set prop.

## Selection Context Migration

`stage-1/selection-context.tsx`, `stage-3/selection-context.tsx`, `stage-4/selection-context.tsx` — last two are near-identical to each other; Stage 1's is similar but possibly has different cache fields. Read `stage-3/selection-context.tsx` (full content in earlier read): supports `selectedId`, `setSelected` (writes URL via `history.replaceState`), `pendingRemovalIds: Set<string>`, `markPendingRemoval`.

Stage 1's `selection-context.tsx` is also `pendingRemovalIds`-style per Phase 71 (referenced via "RESEARCH §Pattern 5 — pendingRemovalIds + history.replaceState" in Stage 3's header comment). Treating them as functionally equivalent.

### Recommendation

Move `stage-3/selection-context.tsx` verbatim to `_shell/selection-context.tsx`. Delete the three per-stage copies after migration. Stage 0/2 also mount the provider with `rowIds=[]` — the context handles empty arrays cleanly.

## Realtime Channels Per Stage

Confirmed by reading each `page.tsx`:

| Stage | Channel name | Source |
|-------|--------------|--------|
| 0 | none | page.tsx renders no `AutomationRealtimeProvider` |
| 1 | `${swarmType}-review` | stage-1/page.tsx:849 |
| 2 | none | page.tsx renders no `AutomationRealtimeProvider` |
| 3 | `${swarmType}-kanban` | stage-3/page.tsx:79 |
| 4 | `${swarmType}-kanban` | stage-4/page.tsx:73 |

Per CONTEXT (out-of-scope §): channels are NOT unified in Phase 82. Each stage page keeps its own `AutomationRealtimeProvider` wrapper around the `_shell/` components.

## Empty State Shape

| Surface | Today's copy | Unified pattern |
|---------|--------------|-----------------|
| Stage 1 list end | "End of queue" / "Nothing to review" | Keep this for Stage 1 when populated |
| Stage 1 with selection filter | "Queue clear" | Keep per stage 1 |
| Stage 3 no rows | "No rows in Stage 3 — Pipeline is fully resolving intents…" | Keep per Stage 3 |
| Stage 4 no rows | "No handler errors — Stage 4 handlers ran cleanly" | Keep per Stage 4 |
| Detail pane no selection | "Select a row from the list to review it." (Stage 1) / "Select a row to inspect. Use ↑ ↓ to move…" (Stage 3/4) | **Unify on Stage 3/4 wording** (includes nav hint) |

Stage 0/2 empty-state copy per CONTEXT D-15: "No rows yet — Stage N data wiring lands in a follow-up phase." Detail pane: "Select a row to inspect."

## Duplicate-Label Bug — Exact Location

**File:** `web/app/(dashboard)/automations/[swarm]/stage-3/row-list.tsx`
**Lines:**
- **Line 117:** `{r.topic ?? "(no topic)"}` — `r.topic` is the intent label (e.g. `general_inquiry`), copied from `automation_runs.topic`.
- **Line 126:** `{r.result.intent ?? "—"}` — `r.result.intent` is the intent_code, often the SAME string.

When the Stage 3 coordinator's picked intent equals the row's `topic` field (which is common because `topic` is set by Stage 1 regex match and `intent` is set by Stage 3 coordinator, but for `general_inquiry`-bucket rows they coincide), both columns render the same string side by side.

**D-18 fix:** The unified row has ONE place for the intent badge (`stage_badge` per D-03/D-04). The middle column shows email subject (not topic/intent), so the duplication is eliminated structurally.

## Test Surface

### Existing tests (relevant to this phase)

| File | Survives? | Action |
|------|-----------|--------|
| `[swarm]/_shell/__tests__/derive-stage-tabs.test.ts` | yes | No change — covers tab-strip derivation |
| `[swarm]/stage-1/__tests__/page-shell.test.tsx` | partial | Re-target assertions at `_shell/` components |
| `[swarm]/stage-1/__tests__/safety-review-loader.test.ts` | yes | Loader test — no UI change |
| `[swarm]/stage-1/__tests__/noise-category-chip-strip.test.tsx` | yes | Chip strip stays (becomes wrapper of `_shell/chip-strip`) |
| `[swarm]/stage-1/__tests__/load-page-data.test.ts` | yes | Loader test — minor: mailbox multi-select assertion added |
| `[swarm]/stage-2/__tests__/page.test.tsx` | partial | Update: shell now wraps the placeholder; banner preserved |
| `[swarm]/stage-2/_lib/__tests__/load-stage-2-weekly-count.test.ts` | yes | Loader test — no change |
| `[swarm]/_lib/__tests__/kanban-loader.test.ts` | needs update | If we add email-metadata JOIN per Open Question OQ-2, this test grows |
| `[swarm]/_actions/__tests__/{close,replay,reclassify-noise}.test.ts` | yes | Server actions unchanged |

### New tests to add (per CONTEXT verification 1-10)

| Test file | Assertion |
|-----------|-----------|
| `_shell/__tests__/row-list.test.tsx` | (a) renders rows with From + Subject + Timestamp; (b) renders single stage_badge — NO duplicate intent code (V9); (c) selection styling matches Stage 3 verbatim; (d) empty state renders when rows=[] |
| `_shell/__tests__/detail-pane.test.tsx` | (a) 5 stage cells rendered (V8); (b) cell matching `activeStage` prop is pre-expanded; (c) body preview collapsible; (d) override widget per cell writes correct axis; (e) "Select a row to inspect" when row=null |
| `_shell/__tests__/mailbox-filter.test.tsx` | (a) renders all mailboxes; (b) selecting writes `?mailbox=<id>` (V6); (c) multi-select writes repeated params; (d) "All mailboxes" default state |
| `_shell/__tests__/keyboard-shortcuts.test.tsx` | (a) ↑↓ moves selection (V7); (b) skipped when typing in input; (c) ⌘⏎ dispatches override-submit |
| `stage-0/__tests__/page.test.tsx` | Renders unified shell + info banner + "No rows yet" empty state (V1) |
| `stage-1/__tests__/page-shell.test.tsx` (update) | Mailbox filter visible; row strip renders From + Subject (V2); Stage 1 cell pre-expanded |
| `stage-2/__tests__/page.test.tsx` (update) | Unified shell + count banner preserved (V3) |
| `stage-3/__tests__/page.test.tsx` (new) | Row renders single intent code, no duplicate (V4 + V9); Stage 3 cell pre-expanded |
| `stage-4/__tests__/page.test.tsx` (new) | Stage 4 cell pre-expanded (V5) |
| `ci/__tests__/no-stage-row-list.test.ts` (or scripted lint) | `[swarm]/stage-N/row-list.tsx` files don't exist (V10) |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest + @testing-library/react (React Testing Library) |
| Config file | `web/vitest.config.ts` (existing) |
| Quick run command | `cd web && npx vitest run --no-coverage` |
| Full suite command | `cd web && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| V1 | `/stage-0` renders unified shell + empty list + info banner | RTL component | `npx vitest run app/.../stage-0/__tests__/page.test.tsx` | ❌ Wave 0 |
| V2 | `/stage-1` renders shell + arrow-nav + mailbox dropdown + Stage 1 cell pre-expanded | RTL component | `npx vitest run app/.../stage-1/__tests__/page-shell.test.tsx` | ✅ (update) |
| V3 | `/stage-2` renders shell + count banner preserved | RTL component | `npx vitest run app/.../stage-2/__tests__/page.test.tsx` | ✅ (update) |
| V4 | `/stage-3` row shows `[no_handler] From · Subject · Timestamp` — no dup | RTL component | `npx vitest run app/.../stage-3/__tests__/page.test.tsx` | ❌ Wave 0 |
| V5 | `/stage-4` renders shell + Stage 4 cell pre-expanded | RTL component | `npx vitest run app/.../stage-4/__tests__/page.test.tsx` | ❌ Wave 0 |
| V6 | Mailbox filter visible 5 stages, writes `?mailbox=` | RTL component | `npx vitest run app/.../_shell/__tests__/mailbox-filter.test.tsx` | ❌ Wave 0 |
| V7 | ↑↓ arrow nav works identically | RTL component | `npx vitest run app/.../_shell/__tests__/keyboard-shortcuts.test.tsx` | ❌ Wave 0 |
| V8 | Detail pane shows body + 5-cell trace + 5-axis overrides; active cell pre-expanded | RTL component | `npx vitest run app/.../_shell/__tests__/detail-pane.test.tsx` | ❌ Wave 0 |
| V9 | Stage 3 duplicate label gone | RTL component | `npx vitest run app/.../_shell/__tests__/row-list.test.tsx` | ❌ Wave 0 |
| V10 | No `stage-N/row-list.tsx` files remain | Static / file-existence | Scripted check via grep in CI | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run --no-coverage app/\(dashboard\)/automations/\[swarm\]`
- **Per wave merge:** `cd web && npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `_shell/__tests__/row-list.test.tsx` — covers V4 + V9
- [ ] `_shell/__tests__/detail-pane.test.tsx` — covers V8
- [ ] `_shell/__tests__/mailbox-filter.test.tsx` — covers V6
- [ ] `_shell/__tests__/keyboard-shortcuts.test.tsx` — covers V7
- [ ] `stage-0/__tests__/page.test.tsx` — covers V1
- [ ] `stage-3/__tests__/page.test.tsx` — covers V4 + V9
- [ ] `stage-4/__tests__/page.test.tsx` — covers V5
- [ ] CI check for V10 (no per-stage row-list/detail-pane files) — bash one-liner in test or husky

## Migration Sequencing

CONTEXT D-19: "5 plans, one per stage." Recommended order based on complexity + risk:

1. **Plan 82-01 — Wave 0: Extract `_shell/` components + tests.** Build `_shell/row-list.tsx`, `_shell/detail-pane.tsx`, `_shell/mailbox-filter.tsx`, `_shell/selection-context.tsx`, `_shell/keyboard-shortcuts.tsx`, `_shell/chip-strip.tsx`. NO page wiring yet. Write component-level RTL tests. This makes the shared contract concrete before any stage migrates.
2. **Plan 82-02 — Stage 0.** Simplest consumer (empty list, info banner preserved). Establishes the page-boundary wiring pattern.
3. **Plan 82-03 — Stage 2.** Same pattern as Stage 0 + preserves tagging-failures count banner.
4. **Plan 82-04 — Stage 4.** Single-filter stage (handler_error only); preserves Stage4 cell focus. Smallest of the data-bearing stages.
5. **Plan 82-05 — Stage 3.** Two-filter (no_handler/low_confidence); duplicate-label bug fix; needs email-metadata JOIN if OQ-2 confirmed in-scope. Higher risk than Stage 4 due to ranked-intent override widget reuse.
6. **Plan 82-06 — Stage 1.** Highest risk: existing 4-axis pane is 1253 lines; selection cache + history.replaceState semantics; bodyMap/timelineMap pre-fetch; tagging-failures sub-loader. Last so contract is fully stable.

**Alternative ordering (if planner prefers):** Stage 3 first (closest to target → fastest validation that the contract works), then 4, 1, 0, 2. Trade-off: lands the trickiest data-shape gap (OQ-2) on day 1.

## Architecture Patterns

### Pattern 1: Server Component + Client Composite

Stages 1, 3, 4 today use the pattern: `page.tsx` (async RSC) loads data → wraps `SelectionProvider` + `AutomationRealtimeProvider` → renders a `"use client"` composite (`<Stage3Client>` / `<DetailPane>`). This stays as-is for unified shell.

```tsx
// _shell/row-list.tsx — "use client"
"use client";
export function RowList({ rows, emptyState, rightEdgeSlot }: Props) { ... }
```

### Pattern 2: Per-Page Boundary Mapping

Loader returns stage-specific shape → page maps to unified `Row` at the boundary:

```tsx
// stage-3/page.tsx
const rows: Row[] = kanbanRows.map((k) => ({
  id: k.id,
  from_name: k.email_metadata?.sender_name ?? null,    // requires OQ-2 join
  from_email: k.email_metadata?.sender_email ?? null,
  subject: k.email_metadata?.subject ?? null,
  timestamp: k.email_metadata?.received_at ?? k.created_at,
  mailbox_id: k.result.mailbox_id ?? null,
  stage_badge: { label: k.result.kanban_reason, variant: 'intent' },
}));
return <UnifiedShell stage={3} rows={rows} ... />;
```

### Pattern 3: Active-Stage Scroll-Into-View

```tsx
const activeCellRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  activeCellRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
}, [activeStage]);
```

### Anti-Patterns to Avoid

- **Generic ChipStrip abstraction that erases data-source distinction.** Phase 81-03 explicitly rejected this pattern (STATE.md: "noise-category chip strip mirrors recipient-chip-strip styling; no generic ChipStrip abstraction (RFC Anti-Pattern)"). The shared `_shell/chip-strip.tsx` MUST be a presentation primitive only — it accepts `chips: { key, label, count }[]` and never reads from `swarm_noise_categories` or `swarm_intents` directly. Per-stage wrappers stay (they know which registry to read).
- **Shell-level keyboard listener with global event bus.** Easier to reason about per-page mount with `enabledShortcuts` filter.
- **Blurring noise + intent in unified detail pane.** Stage 1 cell widget reads `swarm_noise_categories`; Stage 3 cell widget reads `swarm_intents`. The hard-separation rule means these are separate inputs to the unified pane — never a single "category" widget.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mailbox filter popover | Custom popover with click-outside, focus trap, keyboard nav | shadcn `<Popover>` (already in deps — see Stage 1 `<Sheet>` usage) | A11y is hard; popover state machine has 4 edge cases (Esc, click-outside, focus return, scroll lock) |
| Multi-select checkbox in popover | Custom checkbox group | shadcn `<Checkbox>` | Same a11y argument |
| Keyboard shortcut event bus | Re-invent CustomEvent dispatching for stage-cell focus | Reuse Stage 1's existing `bulk-review:*` event names | They already work; renaming them breaks Stage 1 detail-pane code path |
| Body cache invalidation | Build cache eviction policy | Reuse Stage 1's module-level `bodyCache` Map | Already handles row remount cleanly; eviction not needed at our scale (≤25 rows visible) |

**Key insight:** Phase 81 explicitly preserved `${swarmType}-review` channel naming as "backend identifier, not user-visible" (D-19). Phase 82 should preserve that posture: rename UI labels freely (Sketch 005 visual language), but never rename event names, channel names, or window-dispatched custom events. Doing so would break Stage 1's existing 247-line keyboard-shortcuts wiring without functional gain.

## Common Pitfalls

### Pitfall 1: Stage 3/4 missing email metadata
**What goes wrong:** Migrating Stage 3 to the unified row strip and discovering `KanbanRow.result` has no `subject` / `from` / `email_received_at`.
**Why it happens:** Stage 3/4 loaders read `automation_runs` directly; they never JOIN to `email_pipeline.emails`.
**How to avoid:** Plan a Stage 3/4 loader enrichment task (small Supabase JOIN) BEFORE the Stage 3 migration plan. Or fall back to rendering `(no subject)` placeholders on Stage 3/4 and accept the visual gap.
**Warning signs:** Mock fixtures in tests don't include subject/from fields; production rows render with `result.intent` only.

### Pitfall 2: SwarmRow.mailboxes doesn't exist
**What goes wrong:** Mailbox filter dropdown shows empty list.
**Why it happens:** CONTEXT D-11 assumes `swarm.mailboxes` is loaded; in fact `SwarmRow` has no `mailboxes` field.
**How to avoid:** Derive from row data + hardcoded per-swarm fallback list (Option A above). Encapsulate in `getSwarmMailboxes()` helper for future migration.
**Warning signs:** Empty dropdown on Stage 0/2 (where rows=[]).

### Pitfall 3: history.replaceState selection cache + RSC re-render
**What goes wrong:** Selecting a row updates URL via `history.replaceState` (no server roundtrip). When the operator then navigates Approve/Reject, server re-render reads URL and may render a stale selection.
**Why it happens:** Stage 1 already handles this via `bodyMap`/`timelineMap` pre-fetch + selection-context. The unified shell must preserve this pattern.
**How to avoid:** Pre-fetch bodies and timelines for ALL visible rows server-side. Don't try to lazy-fetch on selection change.
**Warning signs:** "Stage didn't run" placeholders in detail pane when clicking non-initial rows.

### Pitfall 4: Keyboard shortcuts firing during text input
**What goes wrong:** Operator typing in notes textarea hits "n" and the row is skipped.
**Why it happens:** Window-level keydown listener.
**How to avoid:** Reuse Stage 1's existing `isTypingTarget()` guard (keyboard-shortcuts.tsx:46-57). Don't reinvent.
**Warning signs:** Skipped rows when operator was just typing.

### Pitfall 5: Realtime channel mismatch
**What goes wrong:** Stage 3 reorganized to use unified shell but `AutomationRealtimeProvider` still subscribes to `${swarmType}-kanban`. Bulk Review (Stage 1) subscribes to `${swarmType}-review`. If the unified row-list assumes one channel, Stages 3/4 won't get realtime updates.
**Why it happens:** CONTEXT explicitly out-of-scopes channel unification, but the planner might forget.
**How to avoid:** Each `stage-N/page.tsx` keeps its own `<AutomationRealtimeProvider>` wrapper. `_shell/row-list.tsx` does NOT mount the provider.
**Warning signs:** Stage 3 rows don't update live when new Kanban rows arrive.

### Pitfall 6: Phase 81-03 chip-strip lock
**What goes wrong:** Building a generic `_shell/chip-strip.tsx` that reads either registry conditionally — drifts back to the RFC anti-pattern.
**Why it happens:** Phase 82 CONTEXT D-01 says "chip-strip.tsx — generic chip strip", which sounds like the abstraction Phase 81 rejected.
**How to avoid:** Keep `_shell/chip-strip.tsx` as a pure presentation primitive (props: `chips`, `active`, `onChange`). Per-stage wrappers (`noise-category-chip-strip.tsx`, Stage 3 `filter-chips.tsx`) stay and pass already-resolved data.
**Warning signs:** `_shell/chip-strip.tsx` imports `loadSwarmNoiseCategories` or `loadSwarmIntents`.

### Pitfall 7: Stage 1 detail-pane regressions
**What goes wrong:** The Stage 1 detail-pane is 1253 lines with 247 lines of keyboard wiring, body cache, tagging-failure section, iController banner, eval-type radio, confirm dialog. Generalizing it risks regression in any of these.
**Why it happens:** It's the most feature-rich surface.
**How to avoid:** Migrate Stage 1 LAST (Plan 82-06). By then the `_shell/detail-pane.tsx` contract is tested against four other stages. Plus: leave Stage 1's specific behaviors (tagging-failures section, iController banner) as Stage-1-only slot props.
**Warning signs:** Detail-pane width drift, sticky action stack misalignment, keyboard shortcuts firing twice.

## Code Examples

### Unified Row component (target)

```tsx
// _shell/row-list.tsx
"use client";
import { useSelection } from "./selection-context";

export interface Row {
  id: string;
  from_name: string | null;
  from_email: string | null;
  subject: string | null;
  timestamp: string;
  mailbox_id: number | null;
  stage_badge: { label: string; variant: 'noise' | 'intent' | 'handler' | 'safety' | 'placeholder' };
}

export function RowList({ rows, emptyState }: { rows: Row[]; emptyState: { title: string; body: string } }) {
  const { selectedId, setSelected, pendingRemovalIds } = useSelection();
  const visible = pendingRemovalIds.size === 0
    ? rows : rows.filter(r => !pendingRemovalIds.has(r.id));
  if (visible.length === 0) return <EmptyState {...emptyState} />;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {visible.map(r => {
        const isSelected = r.id === selectedId;
        return (
          <li key={r.id} onClick={() => setSelected(r.id)} role="button" tabIndex={0}
              style={{
                padding: isSelected
                  ? "var(--space-2) var(--space-4) var(--space-2) calc(var(--space-4) - 2px)"
                  : "var(--space-2) var(--space-4)",
                borderBottom: "1px solid var(--v7-border)",
                borderLeft: isSelected ? "2px solid var(--v7-brand-primary)" : "2px solid transparent",
                background: isSelected ? "var(--v7-bg-2)" : "transparent",
                cursor: "pointer", display: "flex", alignItems: "center", gap: "var(--space-3)",
              }}>
            <StageBadge {...r.stage_badge} />
            <span style={{ fontSize: 13, color: "var(--v7-text)", minWidth: 160, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.from_name ?? r.from_email ?? "(unknown sender)"}
            </span>
            <span style={{ fontSize: 13, color: "var(--v7-text)", flex: 1, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.subject ?? "(no subject)"}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--v7-text-muted)" }}>
              {new Date(r.timestamp).toLocaleString("en-GB")}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
```
Source: adapted from `stage-3/row-list.tsx:82-135` + CONTEXT D-04.

### Stage page boundary mapping (target — Stage 3)

```tsx
// stage-3/page.tsx (target after migration)
const rows: Row[] = stage3Rows.map(k => ({
  id: k.id,
  from_name: (k.result.email_metadata?.sender_name ?? null) as string | null,
  from_email: (k.result.email_metadata?.sender_email ?? null) as string | null,
  subject: (k.result.email_metadata?.subject ?? null) as string | null,
  timestamp: k.result.email_metadata?.received_at ?? k.created_at,
  mailbox_id: (k.result.mailbox_id as number | null) ?? null,
  stage_badge: { label: k.result.kanban_reason, variant: 'intent' },
}));
return (
  <UnifiedShell stage={3} rows={rows}
                primaryChipStrip={<IntentFilterChips intents={replayIntents} />}
                mailboxes={getSwarmMailboxes(swarm)}
                detailPaneProps={{ intents: replayIntents, noiseCategories: reclassifyNoiseCategories }}
  />
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-stage row-list duplication (Phase 71 Stage 1, Phase 76 Stage 3/4) | Unified `_shell/row-list.tsx` | Phase 82 (this phase) | 4 row-list files → 1; visual parity |
| Stage 1 4-axis override pane | Unified 5-axis pane (adds Stage 0 cell) | Phase 82 | Operators see same UX on all stages |
| Hardcoded `MAILBOX_LABELS` in detail-pane | Per-swarm helper `getSwarmMailboxes(swarm)` | Phase 82 (interim, Option A) | Bridges to future `swarms.mailboxes` migration |
| Click-only navigation on Stage 3/4 | Arrow-key nav via shared `_shell/keyboard-shortcuts.tsx` | Phase 82 | Improved operator throughput on Stage 3/4 |

**Deprecated/outdated after this phase:**
- `stage-1/row-list.tsx`, `stage-1/row-strip.tsx`, `stage-1/detail-pane.tsx`, `stage-1/selection-context.tsx`, `stage-1/keyboard-shortcuts.tsx` (move to `_shell/`)
- `stage-3/row-list.tsx` (the `<ul>` block), `stage-3/detail-pane.tsx`, `stage-3/selection-context.tsx`, `stage-3/filter-chips.tsx` (move to wrappers)
- `stage-4/row-list.tsx`, `stage-4/detail-pane.tsx`, `stage-4/selection-context.tsx`, `stage-4/filter-chips.tsx`

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `swarm.mailboxes` is NOT a field on `SwarmRow` today (CONTEXT D-11 was incorrect on this point) | Mailbox Filter | If a `mailboxes` field actually exists somewhere I missed, the Option A fallback is unnecessary work; planner should grep once before committing. **Verified via Read of `web/lib/swarms/types.ts:40-64`** — claim is VERIFIED, not assumed. Recording here so planner notices the CONTEXT mismatch. |
| A2 | Stage 3/4 `KanbanRow` carries no email metadata (subject/sender/received_at) | Row Data Normalization | Verified via Read of `_lib/kanban-loader.ts:26-49`. If the planner finds the data elsewhere (e.g., a coordinator-runs join), the loader-enrichment task is unnecessary. |
| A3 | `_shell/detail-pane.tsx` should be `"use client"` (not RSC) | Discretion | If RSC works, smaller bundle. But existing Stage 1 detail-pane is client (selection state + body cache + window events require it) — migrating to RSC would require splitting state out. Recommend stay client. |
| A4 | `Stage0Widget` needs to be built net new (Stage 0 cell didn't exist in the 4-axis pane) | 5-Cell Pipeline Trace | If a Stage 0 widget already exists somewhere (e.g., in `stage-1/components/`), this is wasted work. Quick grep before building. |
| A5 | Stage 3 row's `r.topic` and `r.result.intent` actually render the same string in production for `general_inquiry` rows | Duplicate Bug | Inferred from user-reported screenshot in CONTEXT §specifics. Could be that `topic` is set to a different value (e.g., regex match category) and the duplicate appearance is intent rendering twice via different paths. Either way the unified row resolves it. |
| A6 | The detail pane's `PipelineFlow` component (`stage-1/components/pipeline-flow.tsx`) is generalizable from 4 cells to 5 with minor changes | 5-Cell Pipeline Trace | NOT verified — file not read in this session. Could have hardcoded `[1,2,3,4]` arrays or 4-column grid CSS that needs more invasive surgery. Planner should read this file in Wave 0. |
| A7 | `swarm_intents`/`swarm_noise_categories` registry data is already loaded by every consuming page (CONTEXT lock) | Per-stage chip strips | Verified for Stage 1 (loadSwarmNoiseCategories + loadSwarmIntents), Stage 3 (both), Stage 4 (noise only). Stage 0/2 don't load these today; if unified shell requires them for chip-strip rendering, those page loaders need extending. |

## Open Questions

1. **OQ-1: Stage 3/4 email-metadata enrichment** — Is the loader-JOIN to `email_pipeline.emails` in scope for Phase 82, or do we ship Stage 3/4 with `(no subject)` placeholders and add the JOIN in a follow-up?
   - What we know: `KanbanRow` has no subject/sender today; Stage 1 loader already does this JOIN.
   - What's unclear: CONTEXT calls Phase 82 "pure UI shell convergence" — a loader change technically falls outside that scope.
   - Recommendation: Include the JOIN as part of Plan 82-05 (Stage 3 migration). It's one Supabase call; classifying it as "UI plumbing" is fair.

2. **OQ-2: Mailbox-filter source** — Option A (derive + per-swarm hardcoded fallback) or Option B (add `swarms.mailboxes` column)?
   - What we know: CONTEXT says "no DDL"; Option A fits.
   - What's unclear: Operator expectations for empty-list stages (Stage 0/2) — does an empty dropdown read as "broken UI" or as "consistent placeholder"?
   - Recommendation: Option A with per-swarm hardcoded fallback. Document the fallback as Phase 82 debt; migrate to `swarms.mailboxes` column in a v8.2 cleanup.

3. **OQ-3: Stage 2 dual banner** — CONTEXT D-17 says "Existing Stage 2 placeholder count + ↗ link is preserved as a small banner above the row list (or folded into the empty-state copy)." Which? Both have UX implications.
   - What we know: Stage 2 today renders the count + link as the entire page content. Folding into empty-state copy keeps the surface compact; banner-above keeps it visible when (future) data arrives.
   - Recommendation: Banner-above. Future-proofs for Phase 77 when real Stage 2 rows arrive.

4. **OQ-4: Wave 0 _shell/ tests vs. lockstep test-as-you-go** — Should Plan 82-01 build all `_shell/` components + tests upfront, or build each component immediately before the stage that consumes it?
   - Trade-off: upfront = clearer contract; lockstep = faster initial commits.
   - Recommendation: Upfront. Five stages consume the same contract; build it once.

## Environment Availability

> SKIPPED — Phase 82 is pure code/config changes inside the Next.js app. No new external tools, runtimes, or services required. Existing stack (Next.js 15, React 19, Supabase, vitest, RTL) is already verified by Phase 81.

## Security Domain

> Not applicable — phase is UI extraction with no new auth, data, or input surfaces. Existing override API route (`/api/automations/debtor-email/override`) is unchanged. Existing admin-client server-side reads are unchanged. ASVS categories from Phase 71/76 (V5 input validation on override payload, V4 access control on review pages) remain in force and untouched.

## Sources

### Primary (HIGH confidence — Read in session)
- `web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx` (62 lines) — Stage 0 info paragraph
- `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx` (911 lines) — loader signature, page structure, `PredictedRow` shape, `loadPageData`
- `web/app/(dashboard)/automations/[swarm]/stage-1/row-list.tsx` (267 lines)
- `web/app/(dashboard)/automations/[swarm]/stage-1/detail-pane.tsx` (1253 lines) — 4-axis override flow, `PipelineFlow` consumption
- `web/app/(dashboard)/automations/[swarm]/stage-1/keyboard-shortcuts.tsx` (247 lines)
- `web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx` (90 lines)
- `web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx` (94 lines)
- `web/app/(dashboard)/automations/[swarm]/stage-3/row-list.tsx` (174 lines) — duplicate-label bug at L117 + L126
- `web/app/(dashboard)/automations/[swarm]/stage-3/detail-pane.tsx` (147 lines)
- `web/app/(dashboard)/automations/[swarm]/stage-3/filter-chips.tsx` (69 lines)
- `web/app/(dashboard)/automations/[swarm]/stage-3/selection-context.tsx` (113 lines)
- `web/app/(dashboard)/automations/[swarm]/stage-4/page.tsx` (88 lines)
- `web/app/(dashboard)/automations/[swarm]/stage-4/row-list.tsx` (137 lines)
- `web/app/(dashboard)/automations/[swarm]/stage-4/detail-pane.tsx` (135 lines)
- `web/app/(dashboard)/automations/[swarm]/_lib/kanban-loader.ts` (122 lines) — `KanbanRow` shape
- `web/lib/swarms/types.ts` (lines 1-102) — `SwarmRow`, `SwarmIntentRow`, `SwarmNoiseCategoryRow`
- `.planning/phases/82-.../82-CONTEXT.md` — locked decisions D-01 through D-20

### Secondary (HIGH confidence — referenced, not fully re-read in this session)
- `docs/agentic-pipeline/README.md` — 5-stage funnel + hard-separation rule (relied on throughout)
- `docs/agentic-pipeline/stage-1-regex.md` — Stage 1 noise filter contract
- `docs/agentic-pipeline/stage-3-coordinator.md` — Stage 3 intent classifier contract
- `.planning/STATE.md` — Phase 81 decisions, especially `noise-category chip strip mirrors recipient-chip-strip styling; no generic ChipStrip abstraction (RFC Anti-Pattern)`
- `.planning/phases/81-.../81-CONTEXT.md` — D-19 channel-name posture
- `.claude/skills/sketch-findings-agent-workforce/references/stage-keyed-shell-phase-76.md` — Sketch 005 visual language
- `.claude/skills/sketch-findings-agent-workforce/references/bulk-review-phase-71.md` — Phase 71 row strip + 4-axis override

### Tertiary (LOW confidence — not read; planner should verify)
- `web/app/(dashboard)/automations/[swarm]/stage-1/components/pipeline-flow.tsx` — exact 4-cell vs 5-cell adaptability (A6)
- `web/app/(dashboard)/automations/[swarm]/stage-1/components/stage-1-widget.tsx` (and stage-2/3/4-widget.tsx) — widget contract for embedding in unified pane
- `web/app/(dashboard)/automations/[swarm]/stage-1/selection-context.tsx` — confirm interface parity with stage-3's selection-context

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pure in-codebase pattern extraction, no external libs
- Architecture: HIGH — every source file read in-session; data flow mapped
- Pitfalls: HIGH — derived from Phase 71/76/81 STATE.md decisions and direct file reads
- Mailbox field assumption (A1): VERIFIED (Read confirmed `SwarmRow` has no `mailboxes` field)
- Email-metadata gap on Stage 3/4 (A2): VERIFIED (Read confirmed `KanbanRow` has no subject/sender)
- PipelineFlow generalizability (A6): LOW — file not read, generalization claim is structural inference

**Research date:** 2026-05-11
**Valid until:** 2026-06-10 (30 days — code likely to drift after that)
