# Phase 82: Unified stage shell — Pattern Map

**Mapped:** 2026-05-11
**Files analyzed:** 16 (6 new `_shell/` components, 1 new `_lib/` helper, 5 modified `stage-N/page.tsx`, 2 loader extensions, ~4 new test files — counted as families)
**Analogs found:** 14 / 16 (mailbox-filter.tsx and `_lib/get-swarm-mailboxes.ts` have no direct analog; closest helpers noted)

> **Hard-separation reminder (RFC `docs/agentic-pipeline/README.md`):** a row exists in EXACTLY ONE of `swarm_noise_categories` (Stage 1) or `swarm_intents` (Stage 3). `_shell/` components are PRESENTATION primitives — they MUST NOT import `loadSwarmNoiseCategories`, `loadSwarmIntents`, or any registry loader. Per-stage page wrappers resolve registry data and pass it down (RESEARCH §Anti-Patterns; Phase 81-03 STATE.md lock).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `_shell/row-list.tsx` | component (client composite) | event-driven (selection + filter) | `stage-3/row-list.tsx` (the `<ul>` block L82-134) | exact (row shape); needs subject/from/timestamp slots added |
| `_shell/detail-pane.tsx` | component (client composite) | event-driven (override flow + ⌘⏎) | `stage-1/detail-pane.tsx` L453-554 (PipelineFlow build) | exact (4-axis pane lineage); add Stage0 cell + scroll-into-view |
| `_shell/chip-strip.tsx` | component (presentation primitive) | URL-driven request-response | `stage-1/recipient-chip-strip.tsx` | role-match (URL state); strip data sources — pure props |
| `_shell/mailbox-filter.tsx` | component (presentation primitive) | URL-driven request-response | none exact — closest is `recipient-chip-strip.tsx` (URL nav idiom) | partial (URL idiom only); popover shape is net new |
| `_shell/selection-context.tsx` | provider (client context) | event-driven | `stage-3/selection-context.tsx` (113 lines, generic) | exact — verbatim move; preserves `pendingRemovalIds` |
| `_shell/keyboard-shortcuts.tsx` | utility (window-listener client component) | event-driven | `stage-1/keyboard-shortcuts.tsx` (247 lines) | exact — verbatim move; adds `enabledShortcuts?: Set<string>` prop |
| `_shell/_lib/get-swarm-mailboxes.ts` | utility (server function) | transform | none (CONTEXT D-11 mismatch; `SwarmRow.mailboxes` doesn't exist) | net new — derive from row data + per-swarm `MAILBOX_LABELS` fallback |
| `_shell/__tests__/row-list.test.tsx` | test (RTL) | n/a | `stage-1/__tests__/noise-category-chip-strip.test.tsx` | role-match (RTL chip pattern) |
| `_shell/__tests__/detail-pane.test.tsx` | test (RTL) | n/a | `stage-1/__tests__/page-shell.test.tsx` | role-match (RTL pane pattern) |
| `_shell/__tests__/mailbox-filter.test.tsx` | test (RTL) | n/a | `stage-1/__tests__/noise-category-chip-strip.test.tsx` | role-match (URL-write assertion) |
| `_shell/__tests__/keyboard-shortcuts.test.tsx` | test (RTL) | n/a | none direct (Stage 1 has no isolated keyboard test today) | partial — RTL fire.keyDown idiom |
| `stage-0/page.tsx` (modified) | page (RSC) | request-response | `stage-2/page.tsx` (simplest placeholder shape) | exact — already a `<PageHeader> + <StageTabStrip> + <main>` |
| `stage-1/page.tsx` (modified) | page (RSC) | request-response | itself | self-refactor; preserves `loadPageData` + view JOIN |
| `stage-2/page.tsx` (modified) | page (RSC) | request-response | itself | self-refactor; preserves count banner |
| `stage-3/page.tsx` (modified) | page (RSC) | request-response | itself | self-refactor; consumes extended `KanbanRow` |
| `stage-4/page.tsx` (modified) | page (RSC) | request-response | itself | self-refactor; consumes extended `KanbanRow` |
| `_lib/kanban-loader.ts` (extended) | loader (server) | CRUD (read+JOIN) | `stage-1/page.tsx` L561-573 (`pipeline_events_email_summary` SELECT) | role-match (email-metadata JOIN idiom) |

## Pattern Assignments

### `_shell/row-list.tsx` (component, event-driven)

**Analog:** `web/app/(dashboard)/automations/[swarm]/stage-3/row-list.tsx`

**Prop signature (new):**
```ts
export interface Row {
  id: string;
  from_name: string | null;
  from_email: string | null;
  subject: string | null;
  timestamp: string;          // ISO; email received time preferred, falls back to created_at
  mailbox_id: number | null;
  stage_badge: { label: string; variant: 'noise' | 'intent' | 'handler' | 'safety' | 'placeholder' };
}

export interface RowListProps {
  rows: Row[];
  emptyState: { title: string; body: string };
  rightEdgeSlot?: (row: Row) => React.ReactNode;  // e.g. ConfBar on low_confidence
}
```

**Selection-styling pattern — COPY VERBATIM from analog L84-104:**
```tsx
const isSelected = r.id === selectedId;
<li
  key={r.id}
  onClick={() => setSelected(r.id)}
  role="button"
  tabIndex={0}
  style={{
    padding: isSelected
      ? "var(--space-2) var(--space-4) var(--space-2) calc(var(--space-4) - 2px)"
      : "var(--space-2) var(--space-4)",
    borderBottom: "1px solid var(--v7-border)",
    borderLeft: isSelected
      ? "2px solid var(--v7-brand-primary)"
      : "2px solid transparent",
    background: isSelected ? "var(--v7-bg-2)" : "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "var(--space-3)",
  }}
>
```

**Row content pattern — REPLACES the analog L106-130 with Outlook-style columns:**
```tsx
<StageBadge {...r.stage_badge} />
<span style={{ fontSize: 13, minWidth: 160, overflow: "hidden",
               textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
  {r.from_name ?? r.from_email ?? "(unknown sender)"}
</span>
<span style={{ fontSize: 13, flex: 1, overflow: "hidden",
               textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
  {r.subject ?? "(no subject)"}
</span>
<span style={{ fontFamily: "var(--font-mono)", fontSize: 11,
               color: "var(--v7-text-muted)" }}>
  {new Date(r.timestamp).toLocaleString("en-GB")}
</span>
{rightEdgeSlot?.(r)}
```

**LANDMINE (D-05, D-18, V9):** Analog renders the intent code TWICE — once at L117 (`{r.topic ?? "(no topic)"}`) and again at L126 (`{r.result.intent ?? "—"}`). The duplication is the bug fix subsumed by this refactor. The unified row has ONE badge slot (`stage_badge` at the left). DO NOT carry over the right-aligned `<span>` from analog L119-127. The optional `rightEdgeSlot` is for a different signal (e.g. `ConfBar` on `low_confidence`), NOT a repeat of the badge label.

**Empty state — adapt analog L149-172** (`No rows in Stage X` heading + muted body line, padding `var(--space-6) var(--space-4)`).

---

### `_shell/detail-pane.tsx` (component, event-driven)

**Analog:** `web/app/(dashboard)/automations/[swarm]/stage-1/detail-pane.tsx` (1253 lines — read L1-120 + L440-570 for shape)

**Imports pattern (L14-62 of analog):**
```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MailOpen, SkipForward, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PipelineFlow, type StageData, type StageState } from "./components/pipeline-flow";
import { Stage1Widget } from "./components/stage-1-widget";
import { Stage2Widget } from "./components/stage-2-widget";
import { Stage3Widget } from "./components/stage-3-widget";
import { Stage4Widget } from "./components/stage-4-widget";
// NEW: import { Stage0Widget } from "./components/stage-0-widget";
import type { OverrideAxis } from "@/lib/pipeline-events/types";
```

**Core 4→5 axis generalization pattern — analog L453-554:**
```tsx
// BEFORE (analog L461):  for (const n of [1, 2, 3, 4] as const) { ... }
// AFTER (this phase):    for (const n of [0, 1, 2, 3, 4] as const) { ... }

const stagesData: StageData[] = useMemo(() => {
  if (!row) return [];
  const byStage = new Map<number, PipelineTimelineEvent>();
  for (const ev of effectiveTimeline) byStage.set(ev.stage, ev);
  const out: StageData[] = [];
  for (const n of [0, 1, 2, 3, 4] as const) {
    const ev = byStage.get(n);
    const dirtyKey = `stage_${n}` as keyof DirtyState;
    const isDirty = dirty[dirtyKey] !== undefined;
    let state: StageState = isDirty ? "dirty" : !ev ? "skipped" : "ok";
    const currentValue = ev?.decision ?? undefined;
    let widget: React.ReactNode = null;
    if (isDirty) {
      if (n === 0) widget = <Stage0Widget ... />;       // NEW
      else if (n === 1) widget = <Stage1Widget categories={categories} ... />;
      else if (n === 2) widget = <Stage2Widget ... />;
      else if (n === 3) widget = <Stage3Widget intents={intents ?? []} ... />;
      else if (n === 4) widget = <Stage4Widget ... />;
    }
    out.push({ n, title: STAGE_TITLES[n], axis: STAGE_AXES[n], state, currentValue, widget });
  }
  return out;
}, [row, effectiveTimeline, dirty, categories, intents]);
```

**Active-stage scroll-into-view (NEW per CONTEXT D-08):**
```tsx
const activeCellRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  activeCellRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
}, [activeStage]);
```

**Override-axis enum extension — analog L556-563:**
```tsx
// BEFORE:
const dirtyAxes = useMemo<OverrideAxis[]>(() => {
  const axes: OverrideAxis[] = [];
  if (dirty.stage_1) axes.push("stage_1_category");
  if (dirty.stage_2) axes.push("stage_2_customer");
  if (dirty.stage_3) axes.push("stage_3_intent");
  if (dirty.stage_4) axes.push("stage_4_handler_output");
  return axes;
}, [dirty]);
// AFTER: add stage_0_safety axis as the first push (RESEARCH §Per-axis override write).
```

**Body cache — KEEP module-level (analog L63-89):** Don't reinvent. `bodyCache: Map<string, CachedBody>` + `prefetchReviewEmailBody(id)` survive remount cleanly at ≤25 visible rows.

**LANDMINES:**
- A6 (RESEARCH): `components/pipeline-flow.tsx` may hardcode `[1,2,3,4]` arrays or 4-column grid CSS. Read first; if hardcoded, fix at the source or fork a 5-col version inside `_shell/`.
- Per-stage widgets MUST stay stage-scoped (hard-separation): `Stage1Widget` reads ONLY `swarm_noise_categories`; `Stage3Widget` reads ONLY `swarm_intents`. Never a single "category" widget.
- Stage 1's `tagging-failures` section + `IControllerInfoBanner` are Stage-1-specific — leave as Stage-1 slot props, not in shared pane (RESEARCH Pitfall 7).

**Empty state copy (CONTEXT D-15 + RESEARCH §Empty State):** When `row === null`, render `"Select a row to inspect. Use ↑ ↓ to move."` (Stage 3/4 wording, includes nav hint).

---

### `_shell/chip-strip.tsx` (component, presentation primitive)

**Analog:** `web/app/(dashboard)/automations/[swarm]/stage-1/recipient-chip-strip.tsx`

**Prop signature (NEW — pure props, no registry reads):**
```ts
export interface ChipStripProps {
  chips: { key: string; label: string; count: number; brandToken?: string | null }[];
  activeKey: string;        // "all" or a chip key
  paramName: string;        // URL param to write (e.g. "inbox", "noise", "intent", "filter")
  ariaLabel: string;
}
```

**URL-state navigation pattern (analog L42-51 — COPY VERBATIM):**
```tsx
const router = useRouter();
const pathname = usePathname();
const search = useSearchParams();

const navigate = useCallback(
  (next: string) => {
    const qs = new URLSearchParams(search?.toString() ?? "");
    if (next === "all") qs.delete(paramName);
    else qs.set(paramName, next);
    const q = qs.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  },
  [router, pathname, search, paramName],
);
```

**Chip rendering (analog L56-141):** Copy verbatim including the `role="tablist"` + `role="tab"` + `aria-selected` accessibility wiring, the 8px brand dot, the 11px mono row-count badge, and the `var(--v7-brand-secondary-*)` color tokens.

**HARD-SEPARATION RULE (RESEARCH Pitfall 6 + Anti-Patterns):**
This component MUST NOT import `loadSwarmNoiseCategories`, `loadSwarmIntents`, `loadSwarm*`, or any DB client. It accepts already-resolved `chips[]` and writes a URL param. Per-stage wrappers (`stage-1/noise-category-chip-strip.tsx`, `stage-3/filter-chips.tsx`) stay and pass already-resolved data into this primitive. Phase 81-03 explicitly rejected a generic ChipStrip that drifts back into registry coupling; Phase 82 re-opens by keeping the primitive pure.

---

### `_shell/mailbox-filter.tsx` (component, presentation primitive — net new)

**Analog:** none exact. URL-nav idiom borrowed from `recipient-chip-strip.tsx` L42-51 (see above). Popover shape — use shadcn `<Popover>` + `<Checkbox>` per RESEARCH §Don't Hand-Roll.

**Prop signature:**
```ts
export interface MailboxFilterProps {
  mailboxes: { id: number; label: string }[];
  selected: number[];        // empty array = "All mailboxes"
}
```

**Multi-param URL-write pattern (NEW, per CONTEXT D-12):**
```tsx
const navigate = useCallback((ids: number[]) => {
  const qs = new URLSearchParams(search?.toString() ?? "");
  qs.delete("mailbox");
  for (const id of ids) qs.append("mailbox", String(id));
  const q = qs.toString();
  router.push(q ? `${pathname}?${q}` : pathname);
}, [router, pathname, search]);
```

**LANDMINES:**
- CONTEXT D-11 says "sourced from `swarm.mailboxes`" — **this field doesn't exist on `SwarmRow`** (RESEARCH A1, verified). Source from the new `_lib/get-swarm-mailboxes.ts` helper instead.
- Stage 1's existing loader reads `params.mailbox` as single `eq` (page.tsx L494). Multi-mailbox needs `.in("decision_details->>mailbox_id", ids.map(String))`. Loader changes are in Plan 82-06 (Stage 1) scope.
- Next.js 15 `searchParams.mailbox` is `string | string[] | undefined`. Always coerce to array at the page boundary.

**Trigger label:** `Mailbox: <name>` when one selected, `All mailboxes` when zero, `N mailboxes` when >1.

---

### `_shell/selection-context.tsx` (provider)

**Analog:** `web/app/(dashboard)/automations/[swarm]/stage-3/selection-context.tsx` (113 lines — the generic one)

**Move:** verbatim. The Stage 3 implementation already supports `selectedId`, `setSelected` (URL via `history.replaceState`), `pendingRemovalIds: ReadonlySet<string>`, `markPendingRemoval` — covering all consumers.

**Public API (L31-43, COPY AS-IS):**
```tsx
interface SelectionContextValue {
  selectedId: string | null;
  setSelected: (id: string | null) => void;
  pendingRemovalIds: ReadonlySet<string>;
  markPendingRemoval: (id: string) => void;
}

export function SelectionProvider({
  initialSelectedId = null,
  rowIds,
  children,
}: { initialSelectedId?: string | null; rowIds: string[]; children: ReactNode }) { ... }
```

**`history.replaceState` write pattern (L76-83, COPY AS-IS):**
```tsx
const setSelected = useCallback((id: string | null) => {
  setSelectedId(id);
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("selected", id);
  else url.searchParams.delete("selected");
  window.history.replaceState({}, "", url.toString());
}, []);
```

**LANDMINE:** Stage 0 / Stage 2 will mount the provider with `rowIds=[]`. The `useEffect` at L61-74 handles empty arrays cleanly (set stays empty). Do not gate the provider on row count.

---

### `_shell/keyboard-shortcuts.tsx` (utility)

**Analog:** `web/app/(dashboard)/automations/[swarm]/stage-1/keyboard-shortcuts.tsx` (247 lines)

**Move:** verbatim + extend with `enabledShortcuts?: Set<string>` prop (RESEARCH §Keyboard Shortcuts Mounting recommendation).

**Action-event registry (L25-44 — KEEP names, don't rename):**
```tsx
const ACTION_EVENTS = {
  approve: "bulk-review:approve",
  reject: "bulk-review:reject",
  skip: "bulk-review:skip",
  // ... Phase 71-05 4-axis hooks ...
  stage1Focus: "bulk-review:stage-1-focus",
  stage2Focus: "bulk-review:stage-2-focus",
  stage3Focus: "bulk-review:stage-3-focus",
  stage4Focus: "bulk-review:stage-4-focus",
  overrideSubmit: "bulk-review:override-submit",
  overrideDiscard: "bulk-review:override-discard",
} as const;
// ADD: stage0Focus: "bulk-review:stage-0-focus",
```

**Input-focus guard (L46-57, COPY AS-IS — RESEARCH Pitfall 4):**
```tsx
function isTypingTarget(el: EventTarget | null): boolean {
  const active = typeof document !== "undefined" ? document.activeElement : null;
  const candidate = active instanceof HTMLElement ? active : el;
  if (!(candidate instanceof HTMLElement)) return false;
  const tag = candidate.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (candidate.isContentEditable) return true;
  const ce = candidate.getAttribute("contenteditable");
  if (ce === "" || ce === "true" || ce === "plaintext-only") return true;
  return false;
}
```

**LANDMINE (RESEARCH §Don't Hand-Roll):** Do NOT rename window-dispatched `bulk-review:*` event names. Stage 1's existing detail-pane wires into these — renaming silently breaks 247 lines of correlation. The event names are backend identifiers (Phase 81 D-19 posture).

**Mount pattern:** per-page (not shell-level) inside the page's `<SelectionProvider>`. Stage 0/2 mount with empty `rowIds` + restricted `enabledShortcuts={new Set(["nav"])}`; Stage 1 keeps the full set; Stage 3/4 enable nav + approve/reject/skip.

---

### `_shell/_lib/get-swarm-mailboxes.ts` (utility — net new)

**Analog:** none. Closest reference: `stage-1/detail-pane.tsx` L109-116 (hardcoded `MAILBOX_LABELS` map).

**Signature:**
```ts
export interface MailboxOption { id: number; label: string }

export function getSwarmMailboxes(
  swarmType: string,
  rowMailboxIds: number[],   // distinct mailbox_ids observed across loaded rows
): MailboxOption[];
```

**Implementation pattern (RESEARCH §Mailbox Filter Option A):**
- For `debtor-email`, return the hardcoded 6-entry list (Sicli Noord / Sud / Berki / Smeba / Smeba Fire / FireControl) — copy the same numeric IDs from `stage-1/detail-pane.tsx:109-116`.
- For other swarms, derive `{ id, label: "Mailbox <id>" }` from `rowMailboxIds`.
- Encapsulate the per-swarm fallback so a future `swarms.mailboxes` jsonb migration is a one-line swap (RESEARCH §Don't Hand-Roll).

**LANDMINE:** Empty `rowMailboxIds` on Stage 0/2 — return the static debtor list anyway (consistency); the filter is a no-op on empty row lists.

---

### `stage-3/_lib/kanban-loader.ts` (loader — extended) AND Stage 4's loader

**Analog:** `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx` L561-573 (`pipeline_events_email_summary` view SELECT)

**Current loader (`_lib/kanban-loader.ts` L57-65) returns:**
```ts
{ id, swarm_type, topic, entity, created_at, result: {...} }
// no subject, no sender_name, no sender_email, no email_received_at, no mailbox_id
```

**Extension pattern — JOIN to `email_pipeline.emails` by `result.email_id`:**

Mirror Stage 1's pattern but read directly from `email_pipeline.emails` (Stage 3/4 has no pre-built view aggregation):
```ts
// After the existing automation_runs SELECT (L57-64), collect distinct email_ids
// already used at L70-72 — reuse the same set. Then add a second SELECT:
const { data: emails } = await admin
  .from("emails")                                  // schema: email_pipeline
  .select("id, subject, sender_email, sender_name, recipient_mailbox, email_received_at, mailbox_id")
  .in("id", emailIds);

const emailMeta = new Map<string, EmailMeta>();
for (const e of (emails ?? []) as EmailMeta[]) {
  emailMeta.set(e.id, e);
}

return rows.map((r) => {
  const meta = r.result?.email_id ? emailMeta.get(r.result.email_id) : undefined;
  return {
    ...r,
    stage_1_event_id: r.result?.email_id ? stage1Map.get(r.result.email_id) ?? null : null,
    stage_3_event_id: r.result?.email_id ? stage3Map.get(r.result.email_id) ?? null : null,
    email_metadata: meta ? {
      subject: meta.subject ?? null,
      sender_email: meta.sender_email ?? null,
      sender_name: meta.sender_name ?? null,
      received_at: meta.email_received_at ?? null,
      mailbox_id: meta.mailbox_id ?? null,
    } : null,
  };
});
```

**Type extension on `KanbanRow` (L26-49):** add `email_metadata: { subject, sender_email, sender_name, received_at, mailbox_id } | null`.

**LANDMINES:**
- MEMORY (`feedback_email_pipeline_lookup_keys.md`): `email_pipeline.emails` writes Outlook id to `source_id`, NOT `internet_message_id`; the column is `sender_name`, NOT `sender_first_name`. Don't invent column names.
- W4 determinism comment block (L13-20, L82-91) is load-bearing for replay safety — preserve it; don't rip it out while editing nearby code.
- Hard-separation lock at L15-20 is the canonical comment for this file — keep it intact and extend the doc-block to note the new email-metadata JOIN scope.

---

### `stage-N/page.tsx` (modified — all five)

**Stage 0 — Analog `stage-2/page.tsx`:** The Stage 2 placeholder is the cleanest minimal page (90 lines). Mirror its `<PageHeader> + <StageTabStrip> + <main>` shell, then swap `<main>` content for `<SelectionProvider><UnifiedShell stage={0} rows={[]} ... /></SelectionProvider>`. Preserve the existing Stage 0 info banner above the row list (CONTEXT D-16).

**Stage 1 — refactor self:** Highest risk (RESEARCH §Migration Sequencing Plan 82-06). Preserve `loadPageData` + `pipeline_events_email_summary` view JOIN + `bodyMap/timelineMap` pre-fetch + tagging-failures sub-loader + `<AutomationRealtimeProvider channel={`${swarmType}-review`}>`. Switch row strip + 4-axis pane to `_shell/` imports; pass Stage-1-specific slots (TaggingFailureSection, IControllerInfoBanner) as detail-pane slot props.

**Stage 2 — refactor self:** Keep `loadStage2WeeklyCount` + count banner. Render unified shell with empty rows (CONTEXT D-17 — banner ABOVE per OQ-3 resolution).

**Stage 3 — refactor self:** Wire extended `KanbanRow.email_metadata` into the unified `Row` shape at the page boundary:
```tsx
const rows: Row[] = stage3Rows.map(k => ({
  id: k.id,
  from_name: k.email_metadata?.sender_name ?? null,
  from_email: k.email_metadata?.sender_email ?? null,
  subject: k.email_metadata?.subject ?? null,
  timestamp: k.email_metadata?.received_at ?? k.created_at,
  mailbox_id: k.email_metadata?.mailbox_id ?? null,
  stage_badge: { label: k.result.kanban_reason, variant: 'intent' },
}));
```
Preserve `<AutomationRealtimeProvider channel={`${swarmType}-kanban`}>` (CONTEXT out-of-scope: no channel unification).

**Stage 4 — refactor self:** Same page-boundary mapping as Stage 3, but filter `kanban_reason === 'handler_error'` and set `stage_badge.variant: 'handler'`. Preserve `${swarmType}-kanban` realtime channel.

---

### Test files (`_shell/__tests__/*.tsx`)

**Analog for RTL idioms:** `stage-1/__tests__/noise-category-chip-strip.test.tsx` + `stage-1/__tests__/page-shell.test.tsx`.

**Per-test assertions (RESEARCH §New tests to add):**
- `row-list.test.tsx`: V9 explicit — assert ONE element with intent code text per row; assert From + Subject + Timestamp render; empty-state when `rows=[]`.
- `detail-pane.test.tsx`: V8 — 5 stage cells rendered, `activeStage` cell is pre-expanded (others collapsed); body preview collapsible; "Select a row to inspect" when `row=null`.
- `mailbox-filter.test.tsx`: V6 — selecting writes `?mailbox=<id>`; multi-select writes repeated params; "All mailboxes" when `selected=[]`.
- `keyboard-shortcuts.test.tsx`: V7 — ↑↓ moves selection; guard skips when typing target focused; `enabledShortcuts` filter excludes disabled keys.

---

## Shared Patterns

### Hard-Separation Discipline (cross-cutting, RFC-locked)

**Source:** `docs/agentic-pipeline/README.md` + Phase 81-03 STATE.md + RESEARCH §Anti-Patterns
**Apply to:** All `_shell/` components AND per-stage page boundaries

- `_shell/chip-strip.tsx` and `_shell/mailbox-filter.tsx` are PRESENTATION primitives. No registry imports. No `loadSwarm*` calls.
- `Stage1Widget` reads ONLY `swarm_noise_categories`. `Stage3Widget` reads ONLY `swarm_intents`. Never a unified "category" widget.
- Per-stage chip-strip wrappers (`noise-category-chip-strip.tsx`, `filter-chips.tsx`) STAY — they're the registry-coupling boundary. They consume the new shared primitive, not replace it.

### URL-state Navigation (cross-cutting)

**Source:** `stage-1/recipient-chip-strip.tsx:42-51`
**Apply to:** `_shell/chip-strip.tsx`, `_shell/mailbox-filter.tsx`
**Pattern:** `useRouter()` + `usePathname()` + `useSearchParams()` → `router.push()` with mutated `URLSearchParams`. Selection state (rowId) uses `history.replaceState` instead (analog `stage-3/selection-context.tsx:76-83`) because it must NOT trigger an RSC re-render.

### Realtime Channels — Per-Stage, NOT Unified (cross-cutting, CONTEXT out-of-scope)

**Source:** RESEARCH §Realtime Channels Per Stage + Pitfall 5
**Apply to:** Stage 1 / 3 / 4 page.tsx
- Stage 1 keeps `${swarmType}-review` (page.tsx:849).
- Stage 3 / 4 keep `${swarmType}-kanban` (page.tsx:79 / page.tsx:73).
- `_shell/row-list.tsx` does NOT mount `AutomationRealtimeProvider`. Each page wraps its own.

### V7 design tokens (cross-cutting)

**Source:** `stage-3/row-list.tsx:91-104` + `stage-1/recipient-chip-strip.tsx:102-141`
**Apply to:** All `_shell/` components
- Spacing: `var(--space-2)` through `var(--space-6)`.
- Borders: `var(--v7-border)`, `var(--v7-line)`.
- Brand: `var(--v7-brand-primary)`, `var(--v7-brand-secondary)`, `var(--v7-brand-secondary-soft)`.
- Backgrounds: `var(--v7-bg)`, `var(--v7-bg-2)`, `var(--v7-panel-2)`.
- Text: `var(--v7-text)`, `var(--v7-text-muted)`.
- Mono badge: `font-mono`, 11px, `font-variant-numeric: tabular-nums`.

### Body-cache + prefetch (Stage 1 lineage)

**Source:** `stage-1/detail-pane.tsx:63-89`
**Apply to:** `_shell/detail-pane.tsx`
**Pattern:** module-level `bodyCache: Map<string, CachedBody>` + `inFlight: Map<string, Promise<...>>`. Page-boundary pre-fetches bodies for ALL visible rows on initial render; detail pane reads from cache on selection change. Don't lazy-fetch (RESEARCH Pitfall 3).

---

## No Analog Found

| File | Role | Data Flow | Reason | Mitigation |
|------|------|-----------|--------|-----------|
| `_shell/mailbox-filter.tsx` | component | URL-driven | No existing popover-multi-select in codebase | Use shadcn `<Popover>` + `<Checkbox>` (RESEARCH §Don't Hand-Roll); borrow URL-write idiom from `recipient-chip-strip.tsx` |
| `_shell/_lib/get-swarm-mailboxes.ts` | utility | transform | `SwarmRow.mailboxes` doesn't exist (RESEARCH A1) | Copy `MAILBOX_LABELS` map from `stage-1/detail-pane.tsx:109-116`; derive from `rowMailboxIds` for non-debtor swarms |
| `_shell/keyboard-shortcuts.test.tsx` | test | n/a | Stage 1 has no isolated keyboard test today | Use vitest `fireEvent.keyDown(window, ...)` per RTL convention |
| `_shell/components/stage-0-widget.tsx` | component | event-driven | No Stage 0 cell exists in current 4-axis pane (A4) | Net-new 2-state toggle (true/false `injection_suspected`); minimal — mirror `Stage4Widget` quality-radio shape |

## Metadata

**Analog search scope:**
- `web/app/(dashboard)/automations/[swarm]/_shell/`
- `web/app/(dashboard)/automations/[swarm]/stage-0/` through `stage-4/` (full tree)
- `web/app/(dashboard)/automations/[swarm]/_lib/`
- `web/lib/swarms/types.ts`

**Files scanned:** 16 source files read in this pass (key analog excerpts only); ~35 candidate files surfaced via `find`/glob.

**Pattern extraction date:** 2026-05-11

**RFC consultation log:** Per PreToolUse hook reminders, the hard-separation rule from `docs/agentic-pipeline/README.md` was the active constraint when proposing `_shell/chip-strip.tsx` as a generic primitive. Resolution: keep `_shell/chip-strip.tsx` as pure presentation; per-stage wrappers retain the registry-coupling boundary. Phase 81-03 STATE.md lock (no generic ChipStrip that erases data-source distinction) is preserved by this approach.
