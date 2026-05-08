# Phase 81: Fold Stage 1 (Bulk Review) into the stage-keyed shell — Research

**Researched:** 2026-05-08
**Domain:** Next.js 16 App Router · Server Components · pure UI/route reframe (no backend, no schema)
**Confidence:** HIGH

## Summary

Phase 81 is a pure UI/route-shape phase. It rewires `/automations/[swarm]/stage-1` from a 1-line re-export of legacy `/review/page.tsx` into a first-class shell-wrapped surface that mirrors `/stage-0`, `/stage-3`, `/stage-4`. The entire `review/` directory moves to `stage-1/` (D-01), `QueueTree` is deleted in favor of a horizontal noise-category chip strip (D-02, D-05), the `?sub=pending` URL state replaces today's `?tab=pending` (D-09, D-10), a thin Stage 2 placeholder ships (D-12), and "Bulk Review" disappears from operator-visible copy (D-18).

No new libraries, no new schema, no new RPCs. The `_shell` components, `swarm_noise_categories` registry, `classifier_queue_counts` RPC, `loadTaggingFailuresForReview`, and `resolveReviewRedirect` middleware all exist today and require zero changes. The work is mechanical move + 2 new components + 1 loader-branch + 1 placeholder page.

**Primary recommendation:** Plan as four task waves: (W1) shell-wrap + directory rename (mechanical, no behavior change), (W2) chip-strip component + loader sub branch, (W3) Stage 2 placeholder + StageTabStrip count wiring, (W4) cleanup (delete `QueueTree`, "Bulk Review" copy purge, test fixture refresh). Each wave verifiable independently against goal-backward checks 1–10 in CONTEXT §verification.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**URL + directory shape (Q4)**
- **D-01:** Rename `web/app/(dashboard)/automations/[swarm]/review/` → `web/app/(dashboard)/automations/[swarm]/stage-1/`. Inline `loadPageData` and supporting components (`row-list.tsx`, `detail-pane.tsx`, `selection-context.tsx`, `recipient-chip-strip.tsx`, `keyboard-shortcuts.tsx`, `categories.ts`, `actions.ts`, `__tests__/`). Current `/stage-1/page.tsx` re-export shim disappears.
- **D-02:** `QueueTree` deleted (replaced by chip-strip per D-05). `race-cohort-banner.tsx` migrates with the rest unless analysis shows it's tree-coupled.
- **D-03:** Middleware `/review → /stage-1` 308 redirect stays as external-bookmark safety net. Internal links already targeting `/stage-1` (commit `5a00de2`) keep working.
- **D-04:** No backwards-compat re-export at `/review/page.tsx`. Directory is gone; only middleware preserves the legacy URL.

**Stage 1 layout — chip-strip filter (Q1)**
- **D-05:** Replace `QueueTree` (3-col grid `clamp(220px,18vw,280px) | minmax(380px,460px) | 1fr`) with 2-col grid `minmax(380px,460px) | 1fr` (row list + detail pane). Noise-category filter moves into a horizontal chip strip rendered below `StageTabStrip` and above the row list.
- **D-06:** Chip strip data source: `swarm_noise_categories` (registry, swarm-scoped) + an "All" chip + an "unknown" chip. Badge counts come from `classifier_queue_counts` RPC (already exposes `topic`, mapping to Stage 1 decision per Phase 71-08 fix). One chip per noise key — no nesting.
- **D-07:** `entity` and `mailbox_id` filtering survive but move into a compact secondary "Filters" button popover. Power-user filter, not primary axis. Don't pre-build a complicated UI — keep minimal.
- **D-08:** Active chip writes `?topic=<noise_key>` (same param the loader already reads — no loader changes for the primary filter). Entity / mailbox via `?entity=` / `?mailbox=` unchanged.

**Pending Promotion sub-view (Q2)**
- **D-09:** Sub-route shape: `/stage-1?sub=pending`. The `?sub=pending` URL state replaces the row list with the candidate-rule list. Detail pane on the right shows the selected rule's evidence (sample emails, Wilson CI bounds, promote/reject actions).
- **D-10:** Add `sub` to `PageSearchParams` in the loader; branch `loadPageData` on `params.sub === 'pending'` to return candidate-rule rows in place of `predicted` rows. Existing `?tab=pending` legacy code path is removed (middleware already rewrites to `?sub=pending`).
- **D-11:** Entry points: (a) "Pending promotion · N" pill in the chip strip's right edge, (b) middleware redirect for legacy `?tab=pending` bookmarks. No new top-level tab.

**Stage 2 placeholder (Q3)**
- **D-12:** Stage 2 placeholder shows: PageHeader (same as 0/1/3/4), one paragraph explaining Stage 2 (entity / customer mapping), and a live "Customer-mapping issues this week: N" count with `↗` link to the existing tagging-failures debug surface. Count source: `loadTaggingFailuresForReview` (already exists, debtor-email-only today, falls back gracefully to "—" for swarms without tagging telemetry).
- **D-13:** Link target is the existing tagging-failures debug surface as it lives today. Phase 77 will replace this placeholder with the real Stage 2 surface.
- **D-14:** Tab badge for `/stage-2` shows the same count value (or `0` muted when zero, per Sketch 005 "empty tabs are signal").

**Stage tab strip — registry derivation**
- **D-15:** No change to `_shell/StageTabStrip` or its registry-driven derivation logic. Phase 81 only adds Stage 2 as a derivable stage in the tab list. **Verified: Phase 76 already wires Stage 2 via `swarms.stage2_entity_resolver` (see Open Questions §1).**

**Page-header copy**
- **D-16:** PageHeader for Stage 1: same shape as `/stage-0` and `/stage-3` — h2 = `swarm.display_name` ("Debtor Email"), no "Bulk Review". Stage label ("Stage 1 · Noise") carried by active tab in StageTabStrip.
- **D-17:** Existing intro paragraph below the h1 ("Review predicted classifications. Approved rows trigger…") removed.

**"Bulk Review" cleanup**
- **D-18:** Search-and-replace "Bulk Review" in user-visible copy across new `/stage-1/` files. JSDoc comments referencing historical "Bulk Review" name stay (audit trail). README.md / `.planning/` artifacts not in scope.
- **D-19:** Realtime channel name `${swarm_type}-review` stays as-is. Backend identifier, not user-visible.

### Claude's Discretion

- Exact chip-strip CSS (gap, chip border-radius, active-state token) — match `recipient-chip-strip.tsx` + v7.css; ride existing tokens.
- Whether secondary "Filters" popover (entity + mailbox) lands in this phase or as a follow-up — planner's call. If pushed, URL params (`?entity=`, `?mailbox=`) still need to work via direct URL editing.
- Test surface: extend existing `review/__tests__/load-page-data.test.ts` (move with rename) and `safety-review-loader.test.ts`. Pre-existing failures noted in `76/deferred-items.md` (mock admin client missing `.schema()` accessor) are separate; don't have to fix them, but if a small mock fixture refresh unblocks them, do it.

### Deferred Ideas (OUT OF SCOPE)

- Cross-swarm aggregation (Phase 999.2 territory; D-06 from Phase 76).
- Stage 2 real content (Phase 77).
- Operator persona / mailbox-scoped permissions (Phase 76 D-06).
- Backend pipeline behavior (Stage 1 worker, escalation-gate, coordinator-orchestrator, Stage 4 handlers).
- Mobile / narrow-viewport polish.
- Realtime channel rename.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| (TBD-01) | `/automations/[swarm]/stage-1` renders with `<PageHeader>` + `<StageTabStrip currentStage={1}>`. | Stage 0/3 page.tsx demonstrate canonical structure. Drop-in. |
| (TBD-02) | Noise-category chip strip below tab strip, one chip per `swarm_noise_categories` row + "All" + "unknown". | `loadSwarmNoiseCategories` + `classifier_queue_counts` exist; `recipient-chip-strip.tsx` is the visual template. |
| (TBD-03) | Active chip writes `?topic=<noise_key>`; loader filter unchanged. | Loader already reads `params.topic` and maps to `pipeline_events.decision` (Phase 71-08 fix). |
| (TBD-04) | `/stage-1?sub=pending` renders candidate-rule list with detail-pane. | `classifier_rules` candidates already loaded in `loadPageData`. New branch on `params.sub === 'pending'`. |
| (TBD-05) | Legacy `/review` + `?tab=pending` + `?tab=safety` 308-redirect with query params preserved. | `resolveReviewRedirect` already correct (commit `5a00de2`). Existing tests cover. |
| (TBD-06) | `/stage-2` resolves with placeholder + live tagging-failures count + `↗` link. | `loadTaggingFailuresForReview` returns Map, `.size` is the count. |
| (TBD-07) | `review/` directory absent; all imports rewritten. | 7 external imports identified — see §Existing Code Insights. |
| (TBD-08) | No `QueueTree` references in non-test files. | Single import site (`review/page.tsx`); deletion is mechanical. |
| (TBD-09) | `/stage-3` and `/stage-4` unchanged (regression). | No shared code under modification. |
| (TBD-10) | Cross-swarm: `/automations/sales-email/stage-1` populates from sales-email's noise registry. | Loader is already swarm-parameterised; chip strip reads registry. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Route resolution `/stage-1`, `/stage-2` | Frontend Server (RSC) | — | Next.js App Router server component dispatch. |
| `loadPageData` + chip-counts query | Frontend Server (RSC) | Database (Supabase RPC + tables) | Server component fetches via admin client; data lives in `pipeline_events`, `classifier_rules`, `swarm_noise_categories`. |
| Chip strip filter URL writes | Browser/Client | Frontend Server (re-renders with new params) | `useRouter().push()` from client component; server re-renders on navigation. |
| `?sub=pending` branching | Frontend Server (RSC) | — | Single conditional in `loadPageData` chooses candidate vs predicted result set. |
| Legacy URL backwards-compat | Frontend Server (Edge middleware) | — | `resolveReviewRedirect` already correct; preserves query params at 308. |
| Realtime row updates | Browser/Client | Database (Supabase Realtime) | `AutomationRealtimeProvider` listens on `${swarm}-review` channel. Channel stays per D-19. |
| Stage 2 placeholder count | Frontend Server (RSC) | Database (`debtor.email_labels`) | `loadTaggingFailuresForReview` server-side, `.size` rendered into placeholder. |

## Standard Stack

This phase introduces **zero new dependencies**. All work uses:

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.x (App Router, Turbopack) | Routing, RSC, middleware | Stack lock (CLAUDE.md) `[VERIFIED: package.json]` |
| React | 19.x | Component model | Pinned with Next 16 `[VERIFIED: package.json]` |
| TypeScript | 5.x | Type system | Repo standard `[VERIFIED]` |
| @supabase/supabase-js + ssr | latest | Server-side admin client + middleware session | `[VERIFIED: existing usage]` |
| Tailwind | (utility classes only — most styling via inline `style={{ var(--v7-*) }}`) | Layout / spacing | `[VERIFIED: globals.css]` |
| Vitest | (existing) | Unit + loader tests | Repo standard test runner `[VERIFIED: existing tests]` |

### Supporting (already in scope)
| Module | Purpose |
|--------|---------|
| `_shell/PageHeader` | h2 + mailbox subtitle wrapper |
| `_shell/StageTabStrip` | Registry-driven 5-tab nav with badge counts |
| `_shell/derive-stage-tabs` | Pure function: SwarmRow → `StageTab[]` |
| `loadSwarmNoiseCategories` | Cached registry loader (60s TTL, last-known-good) |
| `loadSwarm` | Swarm registry row + 404 gate |
| `classifier_queue_counts` RPC | Per-`topic`/`entity`/`mailbox_id` count GROUP BY |
| `loadTaggingFailuresForReview` | Stage 2 count source (debtor-email only today) |
| `AutomationRealtimeProvider` | Realtime channel subscription |
| `resolveReviewRedirect` | Legacy URL → stage-keyed redirect (already correct) |

### Alternatives Considered
None — every component this phase needs is already locked in the codebase.

## Architecture Patterns

### System Diagram (data flow)

```
                          Browser
                             │
                  HTTP GET /automations/{swarm}/stage-1[?topic=&sub=]
                             │
                             ▼
              ┌────────────────────────────┐
              │   middleware.ts            │
              │ resolveReviewRedirect()    │  legacy /review → 308 → /stage-1
              │ session check (Supabase)   │
              └────────────┬───────────────┘
                           │
                           ▼
              ┌────────────────────────────┐
              │ stage-1/page.tsx (RSC)     │
              │ ───────────────────────────│
              │ ① loadSwarm() → 404 gate   │◀──┐
              │ ② loadSwarmNoiseCategories │   │  swarm_noise_categories
              │ ③ loadPageData(params,…)   │   │  pipeline_events_email_summary
              │    ├ classifier_queue_counts RPC│ classifier_rules (candidates)
              │    ├ if sub==='pending':   │   │  → no row fetch
              │    └ else: predicted feed  │   │
              │ ④ render shell + content   │   │
              └────────────┬───────────────┘   │
                           │                   │
                           ▼                   │
   ┌──────────────┬────────────────┬───────────────┐
   │ PageHeader   │ StageTabStrip  │ <main>        │
   │ (h2 only)    │ counts={2:N,…} │  ChipStrip    │
   └──────────────┴────────────────┤  RowList │ DetailPane│
                                   └───────────────┘
                                          │
                                          ▼
                              <AutomationRealtimeProvider
                                 channel="${swarm}-review">
                                 (Supabase Realtime)
```

### Recommended Project Structure

```
web/app/(dashboard)/automations/[swarm]/
├── _shell/
│   ├── page-header.tsx              # unchanged
│   ├── stage-tab-strip.tsx          # unchanged
│   └── derive-stage-tabs.ts         # unchanged
├── stage-0/page.tsx                 # unchanged
├── stage-1/                         # NEW (was review/)
│   ├── page.tsx                     # rewritten: shell-wrap + chip-strip + sub=pending branch
│   ├── noise-category-chip-strip.tsx  # NEW
│   ├── pending-promotion-detail-pane.tsx  # NEW (rule evidence)
│   ├── row-list.tsx                 # moved (PendingPromotionPanel → split out, see below)
│   ├── detail-pane.tsx              # moved
│   ├── recipient-chip-strip.tsx     # moved (kept for entity/recipient axis if Filters popover lands)
│   ├── selection-context.tsx        # moved
│   ├── keyboard-shortcuts.tsx       # moved
│   ├── categories.ts                # moved
│   ├── actions.ts                   # moved
│   ├── race-cohort-banner.tsx       # moved
│   ├── row-strip.tsx                # moved
│   ├── components/                  # moved
│   └── __tests__/                   # moved
├── stage-2/page.tsx                 # NEW (placeholder, ~80 lines)
├── stage-3/page.tsx                 # unchanged
├── stage-4/page.tsx                 # unchanged
└── review/                          # DELETED
```

### Pattern 1: Shell-wrap shape (mirror Stage 3)

```typescript
// Source: web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx
// VERIFIED — read in full this session.
export default async function Stage1Page({ params, searchParams }: PageProps) {
  const { swarm: swarmType } = await params;
  const sp = await searchParams;
  const admin = createAdminClient();

  const swarm = await loadSwarm(admin, swarmType);
  if (!swarm || !swarm.enabled) notFound();

  const [data, noiseCategories] = await Promise.all([
    loadPageData(sp, admin, swarmType),
    loadSwarmNoiseCategories(admin, swarmType),
  ]);

  // Stage 2 count for tab badge — same pattern Stage 3 uses for stage4Count.
  const stage2Count = swarmType === "debtor-email"
    ? (await loadTaggingFailuresCount(admin)) // see Stage 2 placeholder
    : 0;

  return (
    <>
      <PageHeader swarm={swarm} />
      <StageTabStrip
        swarm={swarm}
        currentStage={1}
        counts={{ 1: data.rows.length, 2: stage2Count }}
      />
      <AutomationRealtimeProvider automations={[`${swarmType}-review`]}>
        <SelectionProvider initialSelectedId={sp.selected ?? null} rowIds={data.rows.map(r => r.id)}>
          <main>
            <NoiseCategoryChipStrip
              categories={noiseCategories}
              counts={data.counts}
              activeTopic={sp.topic ?? "all"}
              candidateCount={data.candidates.length}
              activeSub={sp.sub ?? null}
            />
            <div className="grid grid-cols-[minmax(380px,460px)_1fr] gap-4 min-w-0">
              {sp.sub === "pending"
                ? <><CandidateRuleList … /><PendingPromotionDetailPane … /></>
                : <><RowList … /><DetailPane … /></>}
            </div>
          </main>
        </SelectionProvider>
      </AutomationRealtimeProvider>
    </>
  );
}
```

### Pattern 2: Chip-strip (mirror recipient-chip-strip.tsx)

The chip strip is the recipient-chip-strip's twin. Same `<button role="tab" aria-selected>` pattern, same `var(--v7-radius-pill)`, same `var(--v7-brand-secondary-soft)` active background, same 11px tabular-nums count badge. Differences:
- **Data source:** `SwarmNoiseCategoryRow[]` (props), not `RecipientChip[]`.
- **URL param:** `?topic=<category_key>`, not `?inbox=`.
- **No brand dot:** noise categories aren't entity-coloured.
- **Tail pill:** `Pending promotion · N` separated by an 8px gap + a 1px `var(--v7-line)` divider, links to `?sub=pending` (uses `aria-current="page"` when `sp.sub === 'pending'`).

The "All" chip clears `?topic`. The "unknown" chip is a regular `category_key='unknown'` row that appears in the registry seed (verified — see Existing Code Insights §swarm_noise_categories seed).

### Pattern 3: `?sub=pending` loader branch

Today's `?tab=pending` flow:
1. `QueueTree` pushes `?sub=pending` (line 432: `router.push(\`/automations/${swarmType}/stage-1?sub=pending\`)`)
2. Middleware rewrites legacy `?tab=pending` → `?sub=pending` (line 56-57 of middleware.ts).
3. Loader reads `params.tab === "pending"` — **never matches** because `?sub` is what arrives.
4. `RowList` reads `selection.tab === "pending"` and renders `PendingPromotionPanel` inline.

Phase 81 reframe:
1. Add `sub?: string` to `PageSearchParams` (currently only has `tab`).
2. Branch `loadPageData(params, admin, swarmType)` on `params.sub === 'pending'`:
   - **pending branch:** still load `classifier_rules` candidates (already happens), skip the predicted-row + body/timeline/coordinator/tagging waterfall. Return `PageData` with empty `rows` and full `candidates`.
   - **default branch:** unchanged.
3. Page component: when `sp.sub === 'pending'`, render `<CandidateRuleList rules={data.candidates} selectedRuleKey={sp.rule}>` left + `<PendingPromotionDetailPane rule={selectedRule}>` right. Detail pane shows rule_key, status, n, ci_lo, sample emails, Promote/Reject server actions.
4. Remove `selection.tab === "pending"` branch from `row-list.tsx` (extract `PendingPromotionPanel` if reused, otherwise inline new `CandidateRuleList`).

### Anti-Patterns to Avoid

- **Don't read `swarm_intents` for the chip strip.** That registry is Stage 3's territory (RFC `docs/agentic-pipeline/README.md` hard-separation rule). The chip strip is a Stage 1 surface — only `swarm_noise_categories` belongs there. Stage 3's page already shows the correct hybrid pattern (consume both registries but use each only for its rightful purpose).
- **Don't introduce a parallel `ChipStrip` abstraction.** The recipient strip and the new noise strip share styling but their data shapes diverge enough that a generic prop bag would obscure both. Duplicate the visual styling, keep the data flow type-safe per surface. (CONTEXT §specifics explicitly endorses this.)
- **Don't change the realtime channel name.** D-19 locked. The channel is keyed on `${swarmType}-review` and the verdict-worker emits to that channel; renaming breaks every consumer.
- **Don't gate Stage 2 on `swarm_type === "debtor-email"`.** The placeholder is universal (all swarms with `stage2_entity_resolver` get the tab); the **count** falls back to "—" when `loadTaggingFailuresForReview` has no data. Don't conflate "Stage 2 tab present" with "tagging-failures telemetry exists".
- **Don't drop the `tab=safety` legacy redirect.** Even though Phase 81 doesn't add new safety logic, the middleware redirect chain (`?tab=safety` → `/stage-0`) is still in operator bookmarks. Keep `resolveReviewRedirect` untouched.
- **Don't push `topic=unknown` as a special case.** It's a real `swarm_noise_categories` row (see seed migration). The chip is rendered like any other; no client-side branching needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL state for chip selection | Custom hook | `useSearchParams` + `useRouter().push()` | Recipient chip strip is the proven template (`recipient-chip-strip.tsx:42-51`). |
| Tab nav with badge counts | New nav component | Existing `<StageTabStrip counts={…}>` | Phase 76 already locked the API. |
| Legacy URL redirect | Server-side rewrite in page | `resolveReviewRedirect` middleware | Already exists, query-param-preserving (commit `5a00de2`). |
| Registry caching | Per-page admin queries | `loadSwarm`/`loadSwarmNoiseCategories` (60s TTL, last-known-good) | Established pattern; consistent with Stage 3 page. |
| Realtime channel | Custom subscription | `AutomationRealtimeProvider` | Channel name stays `${swarm}-review` per D-19. |
| Chip CSS tokens | New CSS file | `var(--v7-*)` tokens in `globals.css` (verified lines 147–200) | Phase 81 explicitly rides existing tokens. |
| Stage 2 count query | New SQL | `loadTaggingFailuresForReview(pairs).size` or thinner count helper | Already debtor-email-only-aware; falls back to 0 when `pairs=[]`. |

**Key insight:** This phase is a coordination problem (move + rewire), not an invention problem. Every primitive exists. The risk vectors are mechanical (broken imports, missed `Bulk Review` strings, test mocks needing the `.schema()` accessor) — not architectural.

## Common Pitfalls

### Pitfall 1: External imports targeting `review/`
**What goes wrong:** After `git mv review/ stage-1/`, 7 files outside the directory still resolve `@/app/(dashboard)/automations/[swarm]/review/...` and break compilation.
**Why it happens:** TypeScript path aliases don't fail loudly on missing modules in some IDE configs.
**How to avoid:** Search `git grep "automations/\[swarm\]/review"` after the move. Fix all hits to `stage-1`. Re-export shim is explicitly disallowed (D-04).
**Inventory of external importers (verified this session):**
- `web/middleware.ts:5` — comment only, no code reference.
- `web/__tests__/middleware-review-redirect.test.ts` — comment only.
- `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx:22` — the re-export shim being deleted.
- `web/tests/queue/fetch-review-email-body.test.ts:66` — `from "@/app/(dashboard)/automations/[swarm]/review/actions"`
- `web/tests/queue/detail-pane.test.tsx:47-49` — `detail-pane`, `selection-context`, `page` (PredictedRow type)
- `web/tests/queue/race-cohort.test.tsx:7` — `race-cohort-banner`
- `web/tests/queue/keyboard-shortcuts.test.tsx:12-13` — `keyboard-shortcuts`, `selection-context`
- `web/tests/queue/actions.test.ts:99` — `actions`
- `web/app/(dashboard)/automations/[swarm]/review/__tests__/load-page-data.test.ts:234` — self-import via `@/...` alias (moves with the directory; the alias path needs rewriting)
- `web/app/(dashboard)/automations/[swarm]/review/__tests__/safety-review-loader.test.ts:174` — same self-alias rewrite

### Pitfall 2: `?sub=pending` URL state confusion
**What goes wrong:** Today both `?sub=pending` (from QueueTree) and `?tab=pending` (legacy bookmarks) flow through, but only one branches the loader. After D-10 removes the `?tab=pending` code path, any leftover internal link using `?tab=pending` hits the loader's default branch and shows the predicted-row list instead of the candidate-rule list.
**How to avoid:** After deletion, `git grep "tab=pending\|tab.*['\"]pending"` — must return zero internal hits. Middleware-only legacy support survives.

### Pitfall 3: StageTabStrip badge for Stage 2
**What goes wrong:** `loadTaggingFailuresForReview` is debtor-email-only (queries `debtor.email_labels`). Calling it for `swarm_type='sales-email'` works (returns empty Map) but `.size === 0` shows a "0" badge that operators will read as "no issues" rather than "no telemetry yet".
**How to avoid:** Per Sketch 005 ("empty tabs are signal"), 0 is acceptable visually but the placeholder body should display "—" for non-debtor swarms. Two-tier signal: badge=0 (universal), body="—" or "Customer-mapping issues this week: not yet tracked for {swarm}" (swarm-aware).

### Pitfall 4: Loader-test mocks missing `.schema()` accessor
**What goes wrong:** `web/app/(dashboard)/automations/[swarm]/review/__tests__/safety-review-loader.test.ts` has 22 failing tests — all `TypeError: admin.schema is not a function` introduced by Phase 71-08 commit `5ad38e4`. Documented in `.planning/phases/76-stage-3-kanban-human-lane-wiring/deferred-items.md`. Phase 81 inherits these on the rename.
**How to avoid:** Per CONTEXT Claude's Discretion, this is optional. If the planner wants to unblock: add `schema(name: string) { return chainableMockBuilder; }` to the mock fixture. If left alone: explicitly carry "22 pre-existing failures" forward in deferred-items for Phase 81 too.

### Pitfall 5: PendingPromotionPanel split-out
**What goes wrong:** `row-list.tsx` line 268 defines `PendingPromotionPanel` as a sibling component, rendered inline based on `selection.tab === "pending"`. Phase 81 moves the candidate-rule list **out** of the row-list render path and into a top-level branch in `page.tsx`. The function exists today but is reached via the wrong URL key.
**How to avoid:** Two options — (A) extract `PendingPromotionPanel` to its own file (`candidate-rule-list.tsx`) and import from `page.tsx` directly, or (B) leave it in `row-list.tsx` but stop calling it from there; `page.tsx` decides which list to render. (A) is cleaner because the new `<PendingPromotionDetailPane>` lives next to it.

### Pitfall 6: Race-cohort banner orphan
**What goes wrong:** `race-cohort-banner.tsx` is rendered inside `RowList` based on `selection.rule` and `promotedToday`. CONTEXT D-02 says it migrates "unless analysis shows it's tree-coupled." It is **not** tree-coupled — it's row-list-coupled. Migrate verbatim.
**How to avoid:** Verify by code-reading: `RaceCohortBanner` only consumes `selection.rule`, `promotedToday`, `count`, `rows`, `swarmType` — none of which come from QueueTree. Safe to keep in `row-list.tsx` after the move.

### Pitfall 7: Empty noise-categories registry
**What goes wrong:** A swarm without seeded `swarm_noise_categories` rows (e.g. mid-onboarding sales-email pre-Phase-78) renders an empty chip strip. Looks like a UI bug.
**How to avoid:** Per CONTEXT §specifics ("empty chip strip is signal"), render the strip with just the "All" chip + the "Pending promotion" pill. Don't hide the strip entirely.

## Code Examples

### Noise-Category Chip Strip (sketch)

```typescript
// web/app/(dashboard)/automations/[swarm]/stage-1/noise-category-chip-strip.tsx
// Pattern source: recipient-chip-strip.tsx (verified read this session).
"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { SwarmNoiseCategoryRow } from "@/lib/swarms/types";
import type { QueueCountRow } from "./page";

interface Props {
  categories: SwarmNoiseCategoryRow[];
  counts: QueueCountRow[];          // From classifier_queue_counts RPC.
  activeTopic: string;              // ?topic= or "all"
  candidateCount: number;           // Pending promotion pill badge.
  activeSub: string | null;         // ?sub=
}

export function NoiseCategoryChipStrip({
  categories, counts, activeTopic, candidateCount, activeSub,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const navigate = useCallback((nextTopic: string) => {
    const qs = new URLSearchParams(search?.toString() ?? "");
    if (nextTopic === "all") qs.delete("topic"); else qs.set("topic", nextTopic);
    qs.delete("sub"); // chip selection clears sub-view
    const q = qs.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }, [router, pathname, search]);

  const totalCount = counts.reduce((s, c) => s + c.count, 0);
  const countByTopic = new Map<string, number>();
  for (const c of counts) {
    if (c.topic) countByTopic.set(c.topic, (countByTopic.get(c.topic) ?? 0) + c.count);
  }

  return (
    <div role="tablist" aria-label="Filter Stage 1 by noise category"
         className="flex items-center gap-2 overflow-x-auto py-3">
      <Chip active={activeTopic === "all" && !activeSub}
            label="All" rowCount={totalCount}
            onClick={() => navigate("all")} />
      {categories.map((cat) => (
        <Chip key={cat.category_key}
              active={activeTopic === cat.category_key && !activeSub}
              label={cat.display_label}
              rowCount={countByTopic.get(cat.category_key) ?? 0}
              onClick={() => navigate(cat.category_key)} />
      ))}
      <span aria-hidden style={{
        width: 1, height: 24, background: "var(--v7-line)", margin: "0 8px"
      }} />
      <Link href={`${pathname}?sub=pending`}
            role="tab" aria-selected={activeSub === "pending"}
            className="…pill styling…">
        Pending promotion · {candidateCount}
      </Link>
    </div>
  );
}
// Chip = local helper, same shape as recipient-chip-strip.tsx:Chip but
// without the brand-dot and with primary (not secondary) brand tokens.
```

### Stage 2 Placeholder Page (sketch)

```typescript
// web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm } from "@/lib/swarms/registry";
import { PageHeader } from "../_shell/page-header";
import { StageTabStrip } from "../_shell/stage-tab-strip";

export const dynamic = "force-dynamic";

export default async function Stage2Page({ params }: { params: Promise<{ swarm: string }> }) {
  const { swarm: swarmType } = await params;
  const admin = createAdminClient();
  const swarm = await loadSwarm(admin, swarmType);
  if (!swarm) notFound();

  // Count source: thin query against debtor.email_labels for failed tags
  // in the last 7 days. Debtor-email-only today; gracefully returns null
  // for other swarms.
  const stage2Count = swarmType === "debtor-email"
    ? await loadStage2WeeklyCount(admin)
    : null;

  return (
    <>
      <PageHeader swarm={swarm} />
      <StageTabStrip swarm={swarm} currentStage={2} counts={{ 2: stage2Count ?? 0 }} />
      <main style={{ padding: "var(--space-5)" }}>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--v7-text-muted)", maxWidth: 640 }}>
          Stage 2 (Customer mapping) — entity / customer resolution. The
          dedicated Stage 2 surface is built in Phase 77; this placeholder
          surfaces the live count + a deep-link to the existing
          tagging-failures debug surface.
        </p>
        <div style={{ marginTop: "var(--space-4)", fontSize: 14 }}>
          Customer-mapping issues this week:{" "}
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>
            {stage2Count ?? "—"}
          </strong>{" "}
          {stage2Count !== null && (
            <Link href={`/swarm/${swarmType}/tagging-failures`} style={{ marginLeft: 8 }}>
              ↗ Open
            </Link>
          )}
        </div>
      </main>
    </>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 3-col QueueTree + tree-nested filters | 2-col chip strip + horizontal axis | Sketch 005 (Phase 76 design lock) | Reduced cognitive load; daily-driver surface now optimised for noise-key triage. |
| `?tab=pending` URL state | `?sub=pending` URL state | Phase 76-08 wired the redirect; Phase 81 closes the loop | Pending Promotion is a sub-view of Stage 1, not a sibling tab. |
| `Bulk Review` UI noun | "Stage 1 · Noise" + verb-only "Bulk Review" | Sketch 005 lock sentence | Stage-keyed mental model for operators. |
| `/review/page.tsx` re-exported by `/stage-1/page.tsx` | `/stage-1/page.tsx` is the canonical surface | Phase 81 (this phase) | Removes the legacy chrome that bypassed the shell. |

**Deprecated/outdated:**
- `QueueTree` component → deleted (D-02).
- `loadPageData`'s `params.tab === "pending"` branch → deleted (D-10); legacy `?tab=pending` survives only via middleware.
- `selection.tab === "pending"` branch in `row-list.tsx` → deleted; replaced by page-level branch on `params.sub`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `swarms.stage2_entity_resolver` for debtor-email is currently set to a non-null value (so Stage 2 tab renders for the canonical test swarm). | Pattern 1 / Open Q1 | If null, `/stage-2` page resolves but the Stage 2 tab won't appear in the strip. Plan must either (a) rely on Phase 76 having already set it, or (b) add a one-line registry update. **Mitigation:** verify via `select stage2_entity_resolver from swarms where swarm_type='debtor-email'` as Wave 0 / smoke step. |
| A2 | The Phase 71-08 fix means `classifier_queue_counts.topic` is the correct per-noise-category count source even after Phase 75's noise/intent split. | Standard Stack / D-06 | If wrong, chip badges show wrong counts. **Mitigation:** Sketch 005 + CONTEXT D-06 explicitly assert this; the loader's filter-promise (page.tsx:450) already maps `params.topic` to `pipeline_events.decision` which confirms the topic↔Stage1-decision identity. Confidence raised to MEDIUM. |
| A3 | `loadTaggingFailuresForReview` requires `pairs: Array<{automation_run_id, email_id}>` — for the Stage 2 count we need a thin count query, not the full pairs join. | D-12, Pattern in Stage 2 sketch | The existing helper is row-by-row enrichment-shaped, not a count helper. Either: write a small `loadStage2WeeklyCount(admin): Promise<number>` that queries `debtor.email_labels` directly (`icontroller_tag_status='failed'` AND `created_at > now() - 7d`), OR call `loadTaggingFailuresForReview` with all recent pairs and use `.size`. The first is cleaner (~10 LOC). |
| A4 | The `unknown` chip is already in the seeded `swarm_noise_categories` rows for debtor-email. | D-06, anti-pattern note | **VERIFIED via migration `20260429b_swarm_registry.sql`**: `('debtor-email','unknown','Skip (label-only)', null, 'reject', null, 60)`. Confidence: HIGH. Re-tagging from `[ASSUMED]` → `[VERIFIED]`. |
| A5 | The "Pending promotion" tail pill should clear `?topic` when activated (D-11 says it's an entry-point separate from the chips). | Code Examples / Pattern 2 | Operator behavior question. Recommendation: clearing `?topic` makes sense (Pending is a different mode, not a filter on top of Stage 1 rows). Locked decision in chip-strip code sketch. |

## Open Questions

1. **Is `swarms.stage2_entity_resolver` populated for `debtor-email` today?**
   - What we know: derive-stage-tabs.ts gates Stage 2 on `Boolean(swarm.stage2_entity_resolver)`. The column exists (Phase 68 migration). Phase 76 deferred-items don't mention it.
   - What's unclear: whether anyone ran `update swarms set stage2_entity_resolver = 'debtor-email/label-resolver' where swarm_type='debtor-email'`.
   - Recommendation: Wave 0 verification step — query Supabase, and if null, include a one-line UPDATE in the plan. Either way the plan ships; this just decides if a tiny migration ships with it.

2. **Should the Filters popover (entity + mailbox) ship in Phase 81 or be a follow-up?**
   - What we know: D-07 says "compact secondary affordance"; Claude's Discretion explicitly leaves the call to the planner.
   - What's unclear: the current QueueTree allows entity + mailbox drill-down via tree expand. Removing QueueTree without the popover regresses power-user filtering (URL params still work, but no UI affordance).
   - Recommendation: ship the popover as a single small task in this phase. Cost: ~80 LOC + 1 component. Avoids a Phase 81.5 follow-up. Use `<details><summary>Filters</summary>...</details>` or a basic `useState`-driven popover; no new dependency.

3. **Mock fixture refresh — fix in this phase or carry forward?**
   - What we know: 22 failing tests in `safety-review-loader.test.ts` due to mock missing `.schema()` accessor (Phase 71-08 commit `5ad38e4`).
   - What's unclear: whether the fix is genuinely small (one method on the mock) or rabbit-holes into deeper test-infra debt.
   - Recommendation: scope-time-box one task to "add `.schema()` to mock fixture; rerun safety-review-loader tests; if green, ship; if not, carry forward". 30-min cap. Confidence MEDIUM — this is a planner discretion call.

4. **`/stage-1?sub=pending` rule-detail-pane: Wilson CI bound rendering source?**
   - What we know: D-09 says detail pane shows "Wilson CI bounds, promote/reject actions" and CONTEXT §specifics says "reuse the existing `web/app/(dashboard)/swarm/[swarmId]/(components)` rule-promotion patterns where they exist; otherwise plumb fresh server actions".
   - What's unclear: whether `swarm/[swarmId]/(components)` actually has rule promotion UI today (haven't verified).
   - Recommendation: planner Wave 0 grep for "promote" / "ci_lo" / "Wilson" under `web/app/(dashboard)/swarm/`. If found, reuse. If not, plumb fresh server actions in `actions.ts` (`promoteRule`, `rejectRule`).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase Admin client | All loaders | ✓ | — | — |
| `swarms` registry row (`debtor-email`) | `loadSwarm` 404 gate | ✓ | — | — |
| `swarm_noise_categories` rows for `debtor-email` | Chip strip | ✓ | 7 rows seeded | — |
| `classifier_queue_counts` RPC | Chip badges | ✓ | — | — |
| `pipeline_events_email_summary` view | Predicted-row feed | ✓ | — | — |
| `_shell/PageHeader` + `_shell/StageTabStrip` | Shell wrap | ✓ | — | — |
| `loadTaggingFailuresForReview` | Stage 2 count | ✓ | (debtor-email-only) | "—" placeholder for other swarms |
| Tagging-failures debug surface (link target for D-13) | Stage 2 `↗` link | **UNVERIFIED** | — | If absent, link to `/swarm/${swarmType}` operations dashboard instead |

**Missing dependencies with no fallback:** None.

**Action:** Wave 0 verification — confirm tagging-failures debug surface exists at the URL the planner picks. If not, fallback to operations dashboard.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (existing repo standard) |
| Config file | `web/vitest.config.ts` (existing) |
| Quick run command | `cd web && npx vitest run --no-coverage` |
| Full suite command | `cd web && npm test` (or `npx vitest run`) |
| E2E framework | Playwright via Browserless (existing pattern); for this phase, prefer Vitest + React Testing Library where possible — pure UI/route phase doesn't need cross-browser smoke |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TBD-01 | Stage 1 page renders shell + tab strip with `currentStage=1` | unit (RTL render) | `npx vitest run web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/page-shell.test.tsx -x` | ❌ Wave 0 |
| TBD-02 | Chip strip renders one chip per `swarm_noise_categories` row + "All" + tail pill | unit (RTL) | `npx vitest run web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/noise-category-chip-strip.test.tsx -x` | ❌ Wave 0 |
| TBD-03 | Active chip click writes `?topic=<key>` to URL; loader filter unchanged | unit (RTL + mock router) | `npx vitest run …chip-strip.test.tsx` (above) | (covered by TBD-02 test file) |
| TBD-04 | `?sub=pending` branches loader to candidate-rule list | unit (loader) | `npx vitest run web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/load-page-data.test.ts -x` | ✅ (moves with rename; needs `sub` test cases added) |
| TBD-05 | Legacy `/review`, `?tab=safety`, `?tab=pending` redirect with query params preserved | unit (pure function) | `npx vitest run web/__tests__/middleware-review-redirect.test.ts -x` | ✅ (existing 11 tests; may need 1–2 added cases for new combinations) |
| TBD-06 | `/stage-2` resolves with placeholder + count + link | unit (RTL) | `npx vitest run web/app/(dashboard)/automations/[swarm]/stage-2/__tests__/page.test.tsx -x` | ❌ Wave 0 |
| TBD-07 | No imports resolve to `/review/...` after move | repo-wide grep | `! git grep -E "automations/\[swarm\]/review" -- '*.ts' '*.tsx'` (return code = 0 means clean) | n/a (grep) |
| TBD-08 | `QueueTree` is gone | repo-wide grep | `! git grep "QueueTree"` | n/a (grep) |
| TBD-09 | Stage 3 + Stage 4 render unchanged | regression unit | `npx vitest run web/app/(dashboard)/automations/[swarm]/_shell/__tests__/derive-stage-tabs.test.ts -x` | ✅ |
| TBD-10 | Cross-swarm: `/automations/{other-swarm}/stage-1` populates from that registry | manual smoke (or unit with mocked second swarm) | `manual: visit /automations/sales-email/stage-1` | manual gate |

### Sampling Rate

- **Per task commit:** Run targeted file under change: `npx vitest run <single-test> -x`
- **Per wave merge:** `cd web && npx vitest run --no-coverage` (whole suite, fail-fast off)
- **Phase gate:** Full suite green before `/gsd-verify-work`. Plus manual smoke against the local dev server: visit `/automations/debtor-email/stage-1`, click each chip, click Pending pill, click `/stage-2` tab, click `↗` link.

### Wave 0 Gaps

- [ ] `web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/page-shell.test.tsx` — covers TBD-01 (PageHeader present, StageTabStrip currentStage=1, no "Bulk Review" h1).
- [ ] `web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/noise-category-chip-strip.test.tsx` — covers TBD-02 + TBD-03 (chip rendering, click handler, URL push).
- [ ] `web/app/(dashboard)/automations/[swarm]/stage-2/__tests__/page.test.tsx` — covers TBD-06 (placeholder, count, link).
- [ ] Extend existing `web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/load-page-data.test.ts` (post-rename) — add 2 cases for `params.sub === 'pending'` branch (returns candidates only / empty rows).
- [ ] (Optional, planner-discretion) Add `.schema()` accessor to `safety-review-loader.test.ts` mock fixture — unblocks 22 inherited failures.
- [ ] Repo-wide grep guards (TBD-07, TBD-08) wired into CI as a `pretest` script or a one-line vitest test.

## Security Domain

> Phase has `security_enforcement` enabled (default). However, this is a pure UI phase with no new endpoints, no new secrets, no new auth surface, and no new SQL. The relevant concern is **open redirect** which is already mitigated.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing Supabase session middleware (unchanged) |
| V3 Session Management | yes | Existing Supabase SSR cookies (unchanged) |
| V4 Access Control | yes | `loadSwarm` returns null for unknown/disabled swarms → `notFound()` 404 (existing pattern) |
| V5 Input Validation | yes | `params.swarm` regex-validated in middleware; `params.topic` consumed only as a `.eq()` value (parameterised by Supabase client — safe) |
| V6 Cryptography | no | No new crypto |

### Known Threat Patterns for {Next.js App Router + Supabase}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Open redirect (`?next=...` / legacy `/review` redirect) | Tampering | `resolveReviewRedirect` constructs target from regex-captured swarm + closed-enum `tab`. **Already mitigated** (Phase 76 T-76-08-01 test). |
| Spoofed `swarm` segment hits unauthorised data | Information Disclosure | `loadSwarm` registry check + `notFound()` gate. Existing pattern; replicated for `/stage-2`. |
| SQL injection via `?topic=` chip filter | Tampering | Supabase query builder parameterises `.eq("decision_details->>topic", params.topic)`. No string interpolation. |
| URL-state XSS via `?sub=` rendered into UI | Tampering | React escapes by default; the `sub` value is consumed for branching only (`=== 'pending'`), not interpolated into JSX. |

**Phase 81 introduces zero new threat surface.**

## Sources

### Primary (HIGH confidence)
- `web/app/(dashboard)/automations/[swarm]/review/page.tsx` (read in full this session) — loader shape, `loadPageData` signature, `PageData` type, `?selected=` resolution, realtime channel mount
- `web/app/(dashboard)/automations/[swarm]/review/queue-tree.tsx` (read in full) — being deleted; tree-level + URL-push patterns; confirms `?sub=pending` push at line 432
- `web/app/(dashboard)/automations/[swarm]/review/recipient-chip-strip.tsx` (read in full) — chip strip visual template
- `web/app/(dashboard)/automations/[swarm]/_shell/page-header.tsx` (read in full) — PageHeader props
- `web/app/(dashboard)/automations/[swarm]/_shell/stage-tab-strip.tsx` (read in full) — StageTabStrip with `counts` prop API
- `web/app/(dashboard)/automations/[swarm]/_shell/derive-stage-tabs.ts` (read in full) — Stage 2 derivation gates on `swarm.stage2_entity_resolver`
- `web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx` (read in full) — canonical shell-wrapped page pattern; Replay vs Reclassify dropdown demonstrates correct `swarm_intents`/`swarm_noise_categories` hard-separation
- `web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx` (read in full) — minimal placeholder shape for `/stage-2/page.tsx`
- `web/middleware.ts` (read in full) — `resolveReviewRedirect` already preserves query params at 308; closed-enum `tab` filter mitigates open redirect
- `web/__tests__/middleware-review-redirect.test.ts` (read in full) — 11 existing test cases cover the redirect contract
- `web/lib/swarms/registry.ts` + `web/lib/swarms/types.ts` (read in full) — `loadSwarmNoiseCategories` returns `category_key`-keyed rows; 60s TTL + last-known-good
- `web/app/(dashboard)/automations/debtor-email/_lib/tagging-failures-loader.ts` (read in full) — Stage 2 count source; debtor-only schema; sparse Map shape
- `supabase/migrations/20260428_classifier_queue_counts.sql` (read in full) — RPC SQL: GROUP BY (swarm_type, topic, entity, mailbox_id) on `automation_runs.status='predicted'`
- `supabase/migrations/20260429b_swarm_registry.sql` (relevant section) — verified seeded noise category rows for `debtor-email`: `payment, payment_admittance, auto_reply, ooo_temporary, ooo_permanent, invoice_copy_request, unknown` (7 rows)
- `web/app/globals.css` (relevant tokens) — verified `--v7-radius-pill: 999px`, `--v7-brand-primary[-soft]`, `--v7-brand-secondary[-soft]`, `--v7-line`, `--v7-panel-2`
- `.planning/phases/76-stage-3-kanban-human-lane-wiring/deferred-items.md` (read in full) — 22 inherited test failures (`admin.schema is not a function`)
- `docs/agentic-pipeline/README.md` + `docs/agentic-pipeline/stage-1-regex.md` — hard-separation rule (RFC, locked)
- `.planning/phases/81-fold-stage-1-bulk-review-into-the-stage-keyed-shell-close-th/81-CONTEXT.md` — D-01 through D-19 (this phase's spec)

### Secondary (MEDIUM confidence)
- `web/app/(dashboard)/automations/[swarm]/review/row-list.tsx` (excerpts read) — `PendingPromotionPanel` location at line 268; render gate `selection.tab === "pending"`
- `web/app/(dashboard)/automations/[swarm]/review/keyboard-shortcuts.tsx` (excerpts) — uses `bulk-review:*` window event names; not user-visible (D-19 spirit applies — leave as-is)
- `web/app/(dashboard)/automations/[swarm]/review/race-cohort-banner.tsx` (excerpts) — confirmed not tree-coupled

### Tertiary (LOW confidence — flagged in Open Questions)
- Existence of rule-promotion components under `web/app/(dashboard)/swarm/[swarmId]/(components)` — not searched this session (Open Q4)
- Current value of `swarms.stage2_entity_resolver` for `debtor-email` — not queried this session (Open Q1)
- Tagging-failures debug surface URL — not located this session (Environment §)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every dependency exists and was read this session.
- Architecture: HIGH — Stage 3 page is a working canonical example; this phase replicates the shape for Stage 1 + Stage 2.
- Pitfalls: HIGH — external imports inventoried via grep; loader-test failures documented in Phase 76 deferred-items; QueueTree URL-push patterns read.
- Validation: HIGH — Vitest existing; redirect tests existing; new test files are mechanical Wave 0 additions.
- Open questions: 4 questions identified, all small and Wave-0-resolvable.

**Research date:** 2026-05-08
**Valid until:** 2026-06-07 (30 days; codebase is stable on this surface — Phase 76 already locked the shell, Phase 75 already locked the noise/intent split)
