# Phase 81: Fold Stage 1 (Bulk Review) into the stage-keyed shell — Pattern Map

**Mapped:** 2026-05-08
**Files analyzed:** ~16 (1 page rewrite, 1 new placeholder page, 2 new components, 11 moved files, ≥3 new/extended tests)
**Analogs found:** all targets have at least a role-match analog in-tree

## File Classification

| New / Modified / Moved File | Role | Data Flow | Closest Analog | Match Quality |
|------------------------------|------|-----------|----------------|---------------|
| `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx` (REWRITE — replace re-export shim) | RSC route page | request-response (server load + render) | `web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx` | exact (canonical shell-wrap) |
| `web/app/(dashboard)/automations/[swarm]/stage-1/noise-category-chip-strip.tsx` (NEW) | client component (filter UI) | URL-state event-driven | `web/app/(dashboard)/automations/[swarm]/review/recipient-chip-strip.tsx` | exact (visual idiom + URL pattern) |
| `web/app/(dashboard)/automations/[swarm]/stage-1/candidate-rule-list.tsx` (NEW — extracted from `row-list.tsx::PendingPromotionPanel` per Pitfall 5) | client component | request-response (renders props) | `web/app/(dashboard)/automations/[swarm]/review/row-list.tsx` (`PendingPromotionPanel` at line ~268) | role-match (split-out) |
| `web/app/(dashboard)/automations/[swarm]/stage-1/pending-promotion-detail-pane.tsx` (NEW) | client component | request-response | `web/app/(dashboard)/automations/[swarm]/review/detail-pane.tsx` | role-match (right-pane shape) |
| `web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx` (NEW) | RSC route page (placeholder) | request-response | `web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx` | exact (placeholder shape) |
| `web/app/(dashboard)/automations/[swarm]/stage-2/_lib/load-stage-2-weekly-count.ts` (NEW, see Assumption A3) | server loader | CRUD-read | `web/app/(dashboard)/automations/debtor-email/_lib/tagging-failures-loader.ts` | role-match |
| `web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/page-shell.test.tsx` (NEW) | RTL render test | unit | none in-tree for this swarm shell yet → use `_shell/__tests__/derive-stage-tabs.test.ts` shape + general RTL idioms | partial |
| `web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/noise-category-chip-strip.test.tsx` (NEW) | RTL + mock-router test | unit | (no recipient-chip-strip RTL test exists — establish pattern) | partial |
| `web/app/(dashboard)/automations/[swarm]/stage-2/__tests__/page.test.tsx` (NEW) | RTL render test | unit | sibling `page-shell.test.tsx` above | partial |
| `web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/load-page-data.test.ts` (MOVED + extend with `?sub=pending` cases) | loader unit test | unit | itself, in-place at `review/__tests__/load-page-data.test.ts` | exact (rename only) |
| `web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/safety-review-loader.test.ts` (MOVED — optional `.schema()` mock fix) | loader unit test | unit | itself | exact (rename only) |
| `web/app/(dashboard)/automations/[swarm]/stage-1/{row-list,detail-pane,selection-context,recipient-chip-strip,keyboard-shortcuts,categories,actions,race-cohort-banner,row-strip,components/*}` (MOVED) | mixed | n/a | itself in `review/` | exact (mechanical move) |
| `web/__tests__/middleware-review-redirect.test.ts` (MAYBE-extend — add `?tab=pending` → `?sub=pending` regression case) | pure-function test | unit | itself | exact |
| `web/middleware.ts` | edge middleware | request-response | unchanged (`resolveReviewRedirect` already preserves query params per commit `5a00de2`) | n/a — no edit |
| `web/app/(dashboard)/automations/[swarm]/review/queue-tree.tsx` (DELETE) | client component | n/a | n/a | n/a — deletion |
| `web/app/(dashboard)/automations/[swarm]/review/page.tsx` (DELETE — content inlined into new `/stage-1/page.tsx`) | RSC | n/a | n/a | n/a — deletion |

## Pattern Assignments

### `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx` (RSC, request-response)

**Analog:** `web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx`
**Why:** Stage 3 is the canonical shell-wrapped surface — same `loadSwarm` 404 gate, same `Promise.all` for parallel server fetches, same `<PageHeader>` + `<StageTabStrip currentStage={N}>` + `<AutomationRealtimeProvider>` + `<SelectionProvider>` envelope. Stage 1 mirrors this verbatim with `currentStage={1}` and the noise-category chip strip + 2-col grid swapped in for the Kanban client.

**Imports pattern** (stage-3/page.tsx:16–28):

```typescript
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadSwarm,
  loadSwarmIntents,
  loadSwarmNoiseCategories,
} from "@/lib/swarms/registry";
import { AutomationRealtimeProvider } from "@/components/automations/automation-realtime-provider";
import { loadKanbanRows } from "../_lib/kanban-loader";
import { PageHeader } from "../_shell/page-header";
import { StageTabStrip } from "../_shell/stage-tab-strip";
import { SelectionProvider } from "./selection-context";
import { Stage3Client } from "./row-list";

export const dynamic = "force-dynamic";
```

For Stage 1: drop `loadSwarmIntents` (not the chip-strip's source — RFC hard-separation), drop `loadKanbanRows`, keep `loadSwarmNoiseCategories`, add `loadPageData` (inlined from `review/page.tsx`), `RowList`, `DetailPane`, `KeyboardShortcuts`, `Cheatsheet`, `NoiseCategoryChipStrip`, `CandidateRuleList`, `PendingPromotionDetailPane`, plus the existing coordinator + tagging side-loader imports already present in `review/page.tsx:36–45`.

**404 gate + parallel fetch pattern** (stage-3/page.tsx:36–49):

```typescript
export default async function Stage3Page({ params }: PageProps) {
  const { swarm: swarmType } = await params;
  const admin = createAdminClient();

  const swarm = await loadSwarm(admin, swarmType);
  if (!swarm) notFound();

  const [allRows, intents, noiseCategories] = await Promise.all([
    loadKanbanRows(admin, swarmType),
    loadSwarmIntents(admin, swarmType),
    loadSwarmNoiseCategories(admin, swarmType),
  ]);
```

Stage 1 shape: `await Promise.all([loadPageData(sp, admin, swarmType), loadSwarmNoiseCategories(admin, swarmType)])`. Note Stage 3 uses `if (!swarm) notFound()`; the existing `review/page.tsx:778–780` uses `if (!swarm || !swarm.enabled) notFound();` — preserve the `enabled` guard since Stage 1 is the daily-driver surface.

**Shell envelope + counts threading** (stage-3/page.tsx:70–92):

```typescript
return (
  <>
    <PageHeader swarm={swarm} />
    <StageTabStrip
      swarm={swarm}
      currentStage={3}
      counts={{ 3: stage3Rows.length, 4: stage4Count }}
    />
    <AutomationRealtimeProvider
      automations={[`${swarmType}-kanban`]}
      initialLimit={500}
    >
      <SelectionProvider rowIds={stage3Rows.map((r) => r.id)}>
        <Stage3Client … />
      </SelectionProvider>
    </AutomationRealtimeProvider>
  </>
);
```

For Stage 1:
- `currentStage={1}`
- `counts={{ 1: data.rows.length, 2: stage2Count }}` — Stage 2 count loaded in the same `Promise.all` (see Pitfall 3 / Assumption A3 — gate on `swarmType === 'debtor-email'`, fall back to `0`).
- Realtime channel stays `${swarmType}-review` per **D-19** (NOT `-kanban`).
- Body becomes the 2-col grid + chip-strip per **D-05** (template below).

**`<main>` body** (replaces the 3-col grid in `review/page.tsx:806–837`):

```tsx
<main>
  <NoiseCategoryChipStrip
    categories={noiseCategories}
    counts={data.counts}
    activeTopic={sp.topic ?? "all"}
    candidateCount={data.candidates.length}
    activeSub={sp.sub ?? null}
  />
  <div className="grid grid-cols-[minmax(380px,460px)_1fr] gap-4 min-w-0">
    {sp.sub === "pending" ? (
      <>
        <CandidateRuleList rules={data.candidates} selectedRuleKey={sp.rule} swarmType={swarmType} />
        <PendingPromotionDetailPane rules={data.candidates} selectedRuleKey={sp.rule} swarmType={swarmType} />
      </>
    ) : (
      <>
        <RowList … existing props from review/page.tsx:815–824 />
        <DetailPane … existing props from review/page.tsx:825–836 />
      </>
    )}
  </div>
  <KeyboardShortcuts rowIds={rowIds} />
  <Cheatsheet />
</main>
```

**Anti-patterns to avoid in this file** (per CONTEXT D-16/D-17/D-18 + Pitfall 2):

- DO NOT keep the legacy `<h1>... — Bulk Review</h1>` (review/page.tsx:798–800). PageHeader carries the title.
- DO NOT keep the intro `<p>Review predicted classifications…</p>` (review/page.tsx:801–805) — D-17 removes it.
- DO NOT keep `<QueueTree …>` (review/page.tsx:807–814). D-02 deletes the component entirely.
- DO NOT change the grid to anything except `grid-cols-[minmax(380px,460px)_1fr]` (D-05 explicit).
- DO NOT branch `loadPageData` on `params.tab === "pending"` — the legacy branch is removed (D-10). Branch on `params.sub === "pending"` instead.
- DO NOT rename the realtime channel (D-19).

### `web/app/(dashboard)/automations/[swarm]/stage-1/noise-category-chip-strip.tsx` (client component, URL-state)

**Analog:** `web/app/(dashboard)/automations/[swarm]/review/recipient-chip-strip.tsx`
**Why:** Same `role="tablist"` shell, same `useRouter`/`usePathname`/`useSearchParams` URL-write pattern, same active-state token (`var(--v7-brand-secondary-soft)` / `var(--v7-brand-secondary)`), same 13px label + 11px tabular-nums count badge, same `var(--v7-radius-pill)`. Differences are limited to (a) URL param `?topic=` not `?inbox=`, (b) no brand dot, (c) tail "Pending promotion" pill separated by a 1px `var(--v7-line)` divider.

**Imports + URL-write hook** (recipient-chip-strip.tsx:1–17, 38–51):

```typescript
"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

// ...

const router = useRouter();
const pathname = usePathname();
const search = useSearchParams();

const navigate = useCallback(
  (next: string) => {
    const qs = new URLSearchParams(search?.toString() ?? "");
    if (next === "all") qs.delete("inbox");
    else qs.set("inbox", next);
    const q = qs.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  },
  [router, pathname, search],
);
```

For the noise-category strip: replace `inbox` with `topic`, AND `qs.delete("sub")` after the topic mutation so a chip click also clears the Pending Promotion sub-view (RESEARCH §Code Examples + Assumption A5).

**Tablist shell** (recipient-chip-strip.tsx:56–80):

```tsx
<div
  role="tablist"
  aria-label="Filter predicted rows by recipient inbox"
  className="flex items-center gap-2 overflow-x-auto py-3"
>
  <Chip active={isActive("all")} label="All" rowCount={totalCount} brandToken={null} onClick={() => navigate("all")} />
  {chips.map((c) => (
    <Chip key={c.inbox} active={isActive(c.inbox)} label={c.inbox} rowCount={c.rowCount} brandToken={brandColorToken(c.brand)} onClick={() => navigate(c.inbox)} />
  ))}
</div>
```

For the noise-category strip:
- `aria-label="Filter Stage 1 by noise category"`.
- Drop the `brandToken` prop / brand dot.
- Iterate `categories: SwarmNoiseCategoryRow[]`; key = `cat.category_key`; label = `cat.display_label`; `rowCount = countByTopic.get(cat.category_key) ?? 0` (built from the existing `classifier_queue_counts` RPC `topic` column — Phase 71-08 fix locks `topic ↔ Stage 1 decision`).
- Append after the chip loop: an 8px gap + 1px × 24px divider styled `background: "var(--v7-line)"`, then a `<Link href={\`${pathname}?sub=pending\`} role="tab" aria-selected={activeSub === "pending"}>` rendering `Pending promotion · {candidateCount}`.
- The "All" chip is active when `activeTopic === "all" && !activeSub`. The `unknown` chip is rendered like any other chip — DO NOT special-case it (Anti-Pattern 6 in RESEARCH).

**Chip primitive** (recipient-chip-strip.tsx:92–142):

```tsx
<button
  type="button"
  role="tab"
  aria-selected={active}
  aria-label={`${label} — ${rowCount} predicted rows`}
  onClick={onClick}
  className="inline-flex items-center gap-2 shrink-0 px-3 py-1.5 rounded-[var(--v7-radius-pill)] border transition-colors duration-150 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
  style={{
    background: active ? "var(--v7-brand-secondary-soft)" : "var(--v7-panel-2)",
    borderColor: active ? "var(--v7-brand-secondary)" : "var(--v7-line)",
    color: active ? "var(--v7-brand-secondary)" : "var(--v7-text)",
    outlineColor: "var(--v7-brand-secondary)",
  }}
>
```

Reuse this verbatim minus the brand dot. Keep the 11px tabular-nums count badge.

**Anti-patterns:**
- DO NOT extract a generic `ChipStrip` abstraction (CONTEXT §specifics, RESEARCH §Anti-Patterns explicit). Duplicate the visual styling, keep types per surface.
- DO NOT read `swarm_intents` here (RFC hard-separation; Stage 3 territory).
- DO NOT hide the strip when `categories.length === 0` — render with just the "All" chip + tail pill ("empty chip-strip is signal" — CONTEXT §specifics).

### `web/app/(dashboard)/automations/[swarm]/stage-1/candidate-rule-list.tsx` (client component, NEW — split out from `row-list.tsx`)

**Analog:** `PendingPromotionPanel` at `web/app/(dashboard)/automations/[swarm]/review/row-list.tsx:~268` (referenced in RESEARCH §Pitfall 5; not re-read this session).
**Why:** Today the candidate rule list is rendered inline in `row-list.tsx` gated on `selection.tab === "pending"`. Phase 81 lifts the branch up to `page.tsx` (per Pattern 3 in RESEARCH) and routes data via `?sub=pending` — so `PendingPromotionPanel` becomes a top-level component imported directly from `page.tsx`.

**Action:** Extract `PendingPromotionPanel` from `row-list.tsx` into this new file (Pitfall 5 option A). Keep its existing `classifier_rules` candidate consumer shape; remove the `selection.tab === "pending"` render gate from `row-list.tsx`.

### `web/app/(dashboard)/automations/[swarm]/stage-1/pending-promotion-detail-pane.tsx` (client component, NEW)

**Analog:** `web/app/(dashboard)/automations/[swarm]/review/detail-pane.tsx`
**Why:** Same right-pane visual envelope; consumes `selectedRule` rather than `selectedRow`. Per CONTEXT §specifics, render `rule_key, status, n, ci_lo`, sample matched emails, and Promote / Reject server actions.

**Open question (RESEARCH Open Q4):** before plumbing fresh server actions, grep `web/app/(dashboard)/swarm/[swarmId]/(components)/` for existing `promote` / `ci_lo` / Wilson UI. If found, reuse. If not, add `promoteRule` / `rejectRule` server actions to `actions.ts` (which moves with the rename).

### `web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx` (RSC, request-response — placeholder)

**Analog:** `web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx`
**Why:** Stage 0 is the canonical empty placeholder — same `loadSwarm` 404 gate, same `<PageHeader>` + `<StageTabStrip>` envelope, same `<main style={{ padding: "var(--space-5)" }}>` body with a single muted paragraph. Stage 2 mirrors it 1:1 plus a live count + `↗` link.

**Imports + 404 gate** (stage-0/page.tsx:17–35):

```typescript
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm } from "@/lib/swarms/registry";
import { PageHeader } from "../_shell/page-header";
import { StageTabStrip } from "../_shell/stage-tab-strip";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ swarm: string }>;
}

export default async function Stage0Page({ params }: PageProps) {
  const { swarm: swarmType } = await params;
  const admin = createAdminClient();

  const swarm = await loadSwarm(admin, swarmType);
  if (!swarm) notFound();
```

For Stage 2: identical, plus `const stage2Count = swarmType === "debtor-email" ? await loadStage2WeeklyCount(admin) : null;` (per Assumption A3 + Pitfall 3 — non-debtor swarms render `"—"`).

**Body shape** (stage-0/page.tsx:37–61) — replace Stage 0's copy with Stage 2's:

```tsx
return (
  <>
    <PageHeader swarm={swarm} />
    <StageTabStrip swarm={swarm} currentStage={2} counts={{ 2: stage2Count ?? 0 }} />
    <main style={{ padding: "var(--space-5)" }}>
      <p style={{ fontSize: "13px", lineHeight: 1.5, color: "var(--v7-text-muted)", maxWidth: "640px", margin: 0 }}>
        Stage 2 (Customer mapping) — entity / customer resolution. The dedicated Stage 2 surface is built in Phase 77; this placeholder surfaces the live count + a deep-link to the existing tagging-failures debug surface.
      </p>
      <div style={{ marginTop: "var(--space-4)", fontSize: 14 }}>
        Customer-mapping issues this week:{" "}
        <strong style={{ fontVariantNumeric: "tabular-nums" }}>{stage2Count ?? "—"}</strong>
        {stage2Count !== null && (
          <Link href={`/swarm/${swarmType}/tagging-failures`} style={{ marginLeft: 8 }}>↗ Open</Link>
        )}
      </div>
    </main>
  </>
);
```

### `web/app/(dashboard)/automations/[swarm]/stage-2/_lib/load-stage-2-weekly-count.ts` (server loader, NEW)

**Analog:** `web/app/(dashboard)/automations/debtor-email/_lib/tagging-failures-loader.ts`
**Why:** Per Assumption A3, the existing `loadTaggingFailuresForReview` is row-by-row enrichment-shaped (takes `pairs: Array<{automation_run_id, email_id}>`), not a count helper. A thin sibling that does `select count(*) from debtor.email_labels where icontroller_tag_status='failed' and created_at > now() - 7d` is ~10 LOC and matches the loader's schema-prefixed admin-client idiom.

**Imports + signature pattern** (tagging-failures-loader.ts:15–46):

```typescript
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadStage2WeeklyCount(
  admin: SupabaseClient = createAdminClient(),
): Promise<number> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const { count, error } = await admin
    .schema("debtor")
    .from("email_labels")
    .select("id", { count: "exact", head: true })
    .eq("icontroller_tag_status", "failed")
    .gte("created_at", sevenDaysAgo.toISOString());
  if (error) throw new Error(`loadStage2WeeklyCount: ${error.message}`);
  return count ?? 0;
}
```

**Anti-pattern:** DO NOT call `loadTaggingFailuresForReview(allPairs).size` to derive the count — that pulls every row's joined columns including screenshot URLs. Use the head-count pattern above.

### `web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/load-page-data.test.ts` (loader test, MOVED + EXTEND)

**Analog:** itself, in-place at `review/__tests__/load-page-data.test.ts:1–60`
**Why:** This file moves with the directory rename (D-01). Its existing chainable `MockBuilder` shape (lines 27–60) is the canonical loader-test pattern — the new `?sub=pending` cases ride on top.

**Existing mock shape to mirror for new cases** (load-page-data.test.ts:27–60):

```typescript
type EqCall = { col: string; val: unknown };

interface MockBuilder {
  _eqCalls: EqCall[];
  _orderCalls: Array<{ col: string }>;
  _limit: number | null;
  _lt: { col: string; val: unknown } | null;
  _inCalls: Array<{ col: string; vals: unknown[] }>;
  _selectCols: string | null;
  _resolveValue: { data: unknown; error: unknown };
  select: (cols: string) => MockBuilder;
  eq: (col: string, val: unknown) => MockBuilder;
  order: (col: string, opts?: unknown) => MockBuilder;
  limit: (n: number) => MockBuilder;
  // ...
}
```

**New cases to add (per RESEARCH §Wave 0 Gaps):**
1. `params.sub === "pending"` returns `PageData` with `rows: []` and full `candidates` array (skip the predicted-row + body/timeline/coordinator/tagging waterfall per D-10).
2. `params.sub === "pending"` does NOT call the predicted-row pipeline_events_email_summary query (assert via the recorded `.from()` calls).
3. Default branch (`params.sub === undefined`) is unchanged — regression assertion against existing test cases.

**Required mock fixture refresh** (Pitfall 4, optional): the sibling `safety-review-loader.test.ts` mock is missing `.schema(name)` (Phase 71-08 commit `5ad38e4` introduced `admin.schema("email_pipeline").from("emails")…` and `admin.schema("debtor").from("email_labels")…`). Add `schema(name: string) { return this; }` (or a schema-keyed sub-builder) to the MockBuilder. CONTEXT §Claude's Discretion makes this optional but encouraged.

### `web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/page-shell.test.tsx` (NEW)

**Analog (closest):** `web/app/(dashboard)/automations/[swarm]/_shell/__tests__/derive-stage-tabs.test.ts` (not re-read this session — referenced in CONTEXT verification check 9 and RESEARCH §Phase Requirements TBD-09)
**Why:** No existing RTL test for a route page in this directory tree. Use vitest + React Testing Library; mock `loadSwarm`, `loadPageData`, `loadSwarmNoiseCategories`; assert PageHeader presence, `StageTabStrip currentStage={1}`, no "Bulk Review" string anywhere in rendered output.

**Coverage targets:** TBD-01.

### `web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/noise-category-chip-strip.test.tsx` (NEW)

**Analog:** none in-tree (recipient-chip-strip has no existing RTL test). Establish the pattern.
**Why:** Stage 1 client component with URL writes — needs vitest + RTL + a `next/navigation` mock for `useRouter`/`usePathname`/`useSearchParams`.

**Mock pattern (standard):**

```typescript
import { vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/automations/debtor-email/stage-1",
  useSearchParams: () => new URLSearchParams(""),
}));
```

**Coverage targets:** TBD-02 + TBD-03.

### `web/app/(dashboard)/automations/[swarm]/stage-2/__tests__/page.test.tsx` (NEW)

**Analog:** `page-shell.test.tsx` (sibling, this phase). **Coverage targets:** TBD-06.

### Mechanical moves (D-01)

The following files move from `review/` → `stage-1/` with no logic changes. Self-imports via `@/app/(dashboard)/automations/[swarm]/review/...` aliases (load-page-data.test.ts:234, safety-review-loader.test.ts:174 per RESEARCH Pitfall 1) are rewritten to `./` or to the new alias.

| File | Action |
|------|--------|
| `row-list.tsx` | move; remove `selection.tab === "pending"` branch (D-10); split `PendingPromotionPanel` out (Pitfall 5) |
| `detail-pane.tsx` | move; no logic change |
| `selection-context.tsx` | move; no logic change |
| `recipient-chip-strip.tsx` | move; survives for the optional Filters popover (CONTEXT §discretion) |
| `keyboard-shortcuts.tsx` | move; window event names like `bulk-review:*` stay (D-19 spirit — not user-visible) |
| `categories.ts` | move |
| `actions.ts` | move; possibly extend with `promoteRule` / `rejectRule` (Open Q4) |
| `race-cohort-banner.tsx` | move; verified not tree-coupled (Pitfall 6) |
| `row-strip.tsx` | move |
| `components/*` | move |
| `__tests__/*` | move; rewrite self-aliases; extend `load-page-data.test.ts` for `?sub=pending` |

External importers to fix (RESEARCH §Pitfall 1, 7 hits verified):
- `web/tests/queue/fetch-review-email-body.test.ts:66`
- `web/tests/queue/detail-pane.test.tsx:47–49`
- `web/tests/queue/race-cohort.test.tsx:7`
- `web/tests/queue/keyboard-shortcuts.test.tsx:12–13`
- `web/tests/queue/actions.test.ts:99`
- Self-aliases inside the moved tests
- The current `stage-1/page.tsx` re-export shim (deleted; replaced by the new full RSC)

## Shared Patterns

### Server-side route page envelope (universal across stage-N/page.tsx)

**Source files:** `stage-0/page.tsx`, `stage-3/page.tsx`
**Apply to:** new `stage-1/page.tsx`, new `stage-2/page.tsx`

```typescript
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ swarm: string }>;
  // searchParams only when the page reads ?topic=, ?sub=, ?selected=, etc.
  searchParams?: Promise<{ /* shape per page */ }>;
}

export default async function StageNPage({ params, searchParams }: PageProps) {
  const { swarm: swarmType } = await params;
  const admin = createAdminClient();
  const swarm = await loadSwarm(admin, swarmType);
  if (!swarm) notFound();
  // (For stage-1 keep the Phase 56.7-03 `enabled` guard: if (!swarm || !swarm.enabled) notFound();)

  // Parallel server fetches via Promise.all — never chain awaits.
  // Render <PageHeader>, <StageTabStrip currentStage={N} counts={...}>, then
  // <main> with stage-specific content.
}
```

### URL-driven filter chip (client component)

**Source:** `review/recipient-chip-strip.tsx`
**Apply to:** `stage-1/noise-category-chip-strip.tsx` (and any future filter chips)

- `"use client"` directive at top of file.
- `useRouter` + `usePathname` + `useSearchParams` from `next/navigation`.
- `useCallback` `navigate` that mutates a `URLSearchParams` clone, then `router.push(q ? \`${pathname}?${q}\` : pathname)`.
- `role="tablist"` outer; `role="tab" aria-selected` per chip; `aria-label` per chip with the count; outer `aria-label` describing the filter axis.
- Style with `var(--v7-radius-pill)`, `var(--v7-brand-secondary-soft)`, `var(--v7-brand-secondary)`, `var(--v7-panel-2)`, `var(--v7-line)`, `var(--v7-text)` — never new tokens.

### Realtime channel mount

**Source:** `review/page.tsx:792`, `stage-3/page.tsx:78–81`
**Apply to:** `stage-1/page.tsx`

```tsx
<AutomationRealtimeProvider automations={[`${swarmType}-review`]}>
```

The channel name `${swarmType}-review` is locked per **D-19**. Stage 3 uses `${swarmType}-kanban` — these are separate channels and Phase 81 does not blur them.

### 404 + disabled-swarm gate

**Source:** `review/page.tsx:777–780`, `stage-0/page.tsx:33–35`, `stage-3/page.tsx:41–42`
**Apply to:** `stage-1/page.tsx` (use the `!swarm || !swarm.enabled` form), `stage-2/page.tsx` (use the `!swarm` form to match the placeholder Stage 0 / Stage 3 idiom).

### Loader test mock shape

**Source:** `review/__tests__/load-page-data.test.ts:27–60`
**Apply to:** any new loader test in `stage-1/` or `stage-2/_lib/__tests__/`. Chainable MockBuilder with `_eqCalls`, `_orderCalls`, `_inCalls`, `_resolveValue`. ADD `.schema(name)` to unblock 22 inherited safety-review-loader failures (Pitfall 4).

## No Analog Found

| File | Role | Reason |
|------|------|--------|
| `stage-1/__tests__/page-shell.test.tsx`, `stage-2/__tests__/page.test.tsx` | RTL render test for an RSC route page | No existing RSC RTL test in this tree. Establish the pattern — vitest + RTL + mocked loaders. The `_shell/__tests__/derive-stage-tabs.test.ts` covers a pure function, not a page. RESEARCH §Wave 0 Gaps explicitly flags these as new-pattern files. |
| `stage-1/__tests__/noise-category-chip-strip.test.tsx` | RTL + URL-write test for a client component | No existing RTL test exists for `recipient-chip-strip.tsx`. Establish using `vi.mock("next/navigation")` per the Mock pattern above. |

## Cross-cutting reminders (from CONTEXT / RESEARCH / RFC)

- **RFC hard-separation (`docs/agentic-pipeline/README.md`):** the noise-category chip-strip reads `swarm_noise_categories` ONLY. `swarm_intents` belongs to Stage 3. `stage-3/page.tsx` is the canonical hybrid example (consumes both registries but uses each only for its rightful purpose); `stage-1/page.tsx` is single-registry.
- **Realtime channel name (D-19):** `${swarmType}-review`. Not user-visible. Do not rename.
- **`?sub=pending` (D-09, D-10, D-11):** legacy `?tab=pending` is removed from the loader; only the middleware preserves the old URL via 308. Pending Promotion is a sub-view, not a tab.
- **"Bulk Review" string (D-18):** purge from user-visible copy; JSDoc comments and window event names like `bulk-review:*` survive (audit trail; D-19 spirit).
- **Empty signals (CONTEXT §specifics):** empty chip strip → render with just "All" + tail pill. Stage 2 count = 0 → render `0` muted; non-debtor swarms → render `"—"`.

## Metadata

**Analog search scope:** `web/app/(dashboard)/automations/[swarm]/{_shell,review,stage-0,stage-1,stage-3}/`, `web/app/(dashboard)/automations/debtor-email/_lib/`, `web/middleware.ts`, `web/__tests__/middleware-review-redirect.test.ts`, plus the file inventory verified in RESEARCH §Sources Primary.

**Files read this session:**
- `stage-3/page.tsx` (full)
- `stage-0/page.tsx` (full)
- `review/recipient-chip-strip.tsx` (full)
- `review/page.tsx` (full — 845 lines)
- `_shell/page-header.tsx` (full)
- `_shell/stage-tab-strip.tsx` (full)
- `_shell/derive-stage-tabs.ts` (full)
- `stage-1/page.tsx` (full — current 22-line shim)
- `review/__tests__/load-page-data.test.ts` (lines 1–60 only — mock shape)
- `debtor-email/_lib/tagging-failures-loader.ts` (lines 1–60 only — signature shape)

**Pattern extraction date:** 2026-05-08
