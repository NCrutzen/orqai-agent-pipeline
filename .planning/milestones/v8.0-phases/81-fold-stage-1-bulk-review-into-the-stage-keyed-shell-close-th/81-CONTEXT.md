# Phase 81: Fold Stage 1 (Bulk Review) into the stage-keyed shell — Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the loop on Sketch 005 (`.claude/skills/sketch-findings-agent-workforce/references/stage-keyed-shell-phase-76.md`) and Phase 76 CONTEXT decisions D-04 / D-05 (REVISED). Phase 76-08 explicitly chose option (A) "minimum churn" (re-export `/review/page.tsx` from `/stage-1/page.tsx`) over option (B) (wrap the review components in `_shell/PageHeader + StageTabStrip`). The shipped result is a `/stage-1` route that still renders the legacy "Bulk Review" chrome with no stage-tab strip on top, while `/stage-0`, `/stage-3`, `/stage-4` already share the unified shell. This phase delivers what Sketch 005 actually locked.

**In scope:**
- Wrap Stage 1 in the same `_shell/PageHeader + StageTabStrip` used by Stage 0 / 3 / 4.
- Replace the `QueueTree` left column with a horizontal noise-category chip-strip filter (per sketch 005 shape).
- Wire the Pending Promotion sub-view at `/stage-1?sub=pending` end-to-end (today QueueTree pushes `?sub=pending` but `loadPageData` reads `?tab=pending`, which the redirect rewrites away — sub-view never renders).
- Stand up a Stage 2 placeholder route (`/stage-2`) with a live count + deep-link to the existing tagging-failures surface. Stage 2 stays minimal until Phase 77 fills it.
- Rename `web/app/(dashboard)/automations/[swarm]/review/` → `web/app/(dashboard)/automations/[swarm]/stage-1/` and inline the loader. Middleware `/review` → `/stage-1` redirect stays for external bookmarks.
- Drop "Bulk Review" as a UI noun (h1, copy, comments). It becomes the operator-action verb on Stage 1.

**Out of scope:**
- Cross-swarm aggregation (Phase 999.2 territory; D-06 lock from Phase 76).
- Stage 2 real content (Phase 77).
- Operator persona / mailbox-scoped permissions (deferred per Phase 76 D-06).
- Backend pipeline behavior — pure UI/route reframe. No changes to `pipeline_events`, classifier-screen-worker, escalation-gate, or any Stage 1 / Stage 2 / Stage 3 dispatch.
- Mobile / narrow-viewport polish — desktop operator surface only, same as the rest of `/automations/[swarm]/...`.

</domain>

<decisions>
## Implementation Decisions

### URL + directory shape (Q4)

- **D-01:** Rename `web/app/(dashboard)/automations/[swarm]/review/` → `web/app/(dashboard)/automations/[swarm]/stage-1/`. Inline the `loadPageData` loader and supporting components (`row-list.tsx`, `detail-pane.tsx`, `selection-context.tsx`, `recipient-chip-strip.tsx`, `keyboard-shortcuts.tsx`, `categories.ts`, `actions.ts`, `__tests__/`) under the new directory. The current `/stage-1/page.tsx` re-export shim disappears.
- **D-02:** `QueueTree` is deleted (replaced by chip-strip per D-05). `race-cohort-banner.tsx` migrates with the rest unless analysis shows it's tree-coupled.
- **D-03:** Middleware redirect `/review → /stage-1` (308) stays as the external-bookmark safety net. Internal links already targeting `/stage-1` (per the fix in commit `5a00de2`) keep working unchanged.
- **D-04:** No backwards-compat re-export at `/review/page.tsx`. The directory is gone; only the middleware preserves the legacy URL.

### Stage 1 layout — chip-strip filter (Q1)

- **D-05:** Replace `QueueTree` (3-col grid, `clamp(220px,18vw,280px) | minmax(380px,460px) | 1fr`) with a 2-col grid: `minmax(380px,460px) | 1fr` (row list + detail pane). The noise-category filter moves into a horizontal chip-strip rendered below the `StageTabStrip` and above the row list.
- **D-06:** Chip-strip data source: `swarm_noise_categories` (registry-driven, swarm-scoped) plus an "All" chip and an "unknown" chip. Chip badge counts come from the existing `classifier_queue_counts` RPC (already exposes `topic` which today maps to Stage 1 decision per Phase 71-08 fix). One chip per noise key — no nesting.
- **D-07:** `entity` and `mailbox_id` filtering survive but move into a compact secondary affordance (a small "Filters" button that opens an inline popover with entity dropdown + mailbox multi-select). Daily Stage 1 work is dominated by noise-category triage; entity/mailbox is a power-user filter, not the primary axis. Don't pre-build a complicated UI here — keep it minimal.
- **D-08:** Active chip writes the URL via `?topic=<noise_key>` (same param the loader already reads — no loader changes for the primary filter). Entity / mailbox via `?entity=` / `?mailbox=` unchanged.

### Pending Promotion sub-view (Q2)

- **D-09:** Sub-route shape: `/stage-1?sub=pending`. The `?sub=pending` URL state replaces the row list with the candidate-rule list (data already loaded today via `classifier_rules` candidates query). Detail pane on the right shows the selected rule's evidence (sample emails, Wilson CI bounds, promote/reject actions).
- **D-10:** Add `sub` to `PageSearchParams` in the loader; branch `loadPageData` on `params.sub === 'pending'` to return candidate-rule rows in place of `predicted` rows. Existing `?tab=pending` legacy code path is removed (middleware already rewrites `?tab=pending` → `?sub=pending`).
- **D-11:** Entry points to Pending Promotion: (a) a "Pending promotion · N" pill in the chip-strip's right edge (separator from noise-category chips), (b) the existing middleware redirect for legacy `?tab=pending` bookmarks. No new top-level tab — Pending stays a Stage 1 sub-view per Sketch 005.

### Stage 2 placeholder (Q3)

- **D-12:** Stage 2 placeholder shows: page title (PageHeader same as 0/1/3/4), one paragraph explaining Stage 2's role (entity / customer mapping), and a live "Customer-mapping issues this week: N" count with a `↗` link to the existing tagging-failures surface. Count source: `loadTaggingFailuresForReview` (already exists per Phase 67-06; debtor-email-only today, so the count gracefully falls back to "—" for swarms without tagging telemetry).
- **D-13:** The link target is the existing tagging-failures debug surface as it lives today (don't build a new route). Phase 77 will replace this placeholder with the real Stage 2 surface.
- **D-14:** Tab badge for `/stage-2` shows the same count value (or `0` muted when zero, per Sketch 005 "empty tabs are signal" rule).

### Stage tab strip — registry derivation (already locked in Phase 76)

- **D-15:** No change to `_shell/StageTabStrip` or its registry-driven derivation logic. Phase 81 only adds Stage 2 as a derivable stage in the tab list (via the existing registry signal — `swarms.stage2_*` flags, whatever Phase 76 wired). If the existing derivation already includes Stage 2 (it should, per D-05.5 from Phase 76), this is no-op.

### Page-header copy

- **D-16:** PageHeader for Stage 1: same shape as `/stage-0` and `/stage-3` — h2 = `swarm.display_name` (e.g. "Debtor Email"), sub-line = swarm.mailboxes joined by `·`. No "Bulk Review" anywhere. The stage label ("Stage 1 · Noise") is carried by the active tab in StageTabStrip, not in the h2.
- **D-17:** Existing intro paragraph below the h1 ("Review predicted classifications. Approved rows trigger…") is removed. The chip-strip's UX is self-explanatory; no operator-onboarding copy belongs in the daily-driver surface.

### "Bulk Review" cleanup

- **D-18:** Search-and-replace "Bulk Review" in user-visible copy across the new `/stage-1/` files; replace with stage-keyed phrasing or remove. JSDoc comments referencing the historical "Bulk Review" name stay (they're audit-trail and don't pollute the operator surface). README.md / `.planning/` artifacts are not in scope — those are historical context.
- **D-19:** Realtime channel name `${swarm_type}-review` stays as-is. It's a backend identifier, not user-visible, and renaming it is a separate refactor (would touch the Stage 1 emit + every consumer); not worth the diff.

### Claude's Discretion

- Exact chip-strip CSS (gap, chip border-radius, active-state token) — match the v7.css reference in `.claude/skills/sketch-findings-agent-workforce/sources/themes/v7.css`. Ride existing tokens; don't introduce new ones.
- Whether the secondary "Filters" popover (entity + mailbox) lands in this phase or as a follow-up — planner's call based on plan budget. If it's pushed to a follow-up, the URL params (`?entity=`, `?mailbox=`) still need to work via direct URL editing or external-link sharing.
- Test surface: extend existing `web/app/(dashboard)/automations/[swarm]/review/__tests__/load-page-data.test.ts` (move with the directory rename) and `safety-review-loader.test.ts`. Pre-existing failures noted in `76/deferred-items.md` (mock admin client missing `.schema()` accessor) are separate; this phase doesn't have to fix them, but if a small mock fixture refresh unblocks them, do it.

</decisions>

<specifics>
## Specific Ideas

- **Sketch 005 reference is canonical.** `.claude/skills/sketch-findings-agent-workforce/references/stage-keyed-shell-phase-76.md` lock sentence: *"'Bulk Review' stops being a UI noun (becomes the operator-action verb on the Stage 1 tab)."* This phase is delivering exactly that sentence.
- **Chip-strip pattern reuse.** The recipient chip strip (`recipient-chip-strip.tsx`) already establishes a chip-row component with brand colors + count badges. Reuse that visual idiom for the noise-category chip strip — same height, same radius, same active-state token. Don't fork a parallel chip component.
- **Pending Promotion detail pane.** Today `candidates` is loaded into `QueueTree` as a sidebar count + into `RowList` as the per-row "promote rule" affordance. When `?sub=pending` is active, the row list becomes a list of *candidate rules* and clicking one opens a detail pane that shows: rule_key, status, n, ci_lo, sample matched emails, and Promote / Reject server actions. Reuse the existing `web/app/(dashboard)/swarm/[swarmId]/(components)` rule-promotion patterns where they exist; otherwise plumb fresh server actions.
- **Stage 2 placeholder copy** — mirror Stage 0's tone exactly. Operators need consistency across placeholders so the empty-tab signal reads cleanly.
- **Empty chip-strip is signal.** When `swarm_noise_categories` returns zero noise keys for a swarm (e.g. a swarm not yet wired through Phase 75), render the strip with just the "All" chip rather than hiding it. Mirrors the "tabs that disappear when empty" anti-pattern from Sketch 005.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked design (sketches + previous phase contexts)
- `.claude/skills/sketch-findings-agent-workforce/references/stage-keyed-shell-phase-76.md` — Sketch 005 (winner, Variant B refined to stage-keyed tabs). The visual + interaction language this phase delivers.
- `.claude/skills/sketch-findings-agent-workforce/sources/005-swarm-shell-integration/index.html` — the actual sketched HTML.
- `.claude/skills/sketch-findings-agent-workforce/references/bulk-review-phase-71.md` — Phase 71 per-email row strip + 4-axis override. Stage 1's row list shape stays the same as Phase 71 shipped.
- `.planning/phases/76-stage-3-kanban-human-lane-wiring/76-CONTEXT.md` — D-04, D-05 (REVISED), D-05.5, D-05.6 — the exact decisions Phase 76 wrote into spec but Phase 76-08 traded away in plan execution.
- `.planning/phases/76-stage-3-kanban-human-lane-wiring/76-08-redirects-and-end-to-end-verification-PLAN.md` — the option (A) vs (B) choice paragraph; option (B) is what this phase delivers.

### Pipeline architecture (locked source of truth)
- `docs/agentic-pipeline/README.md` — 5-stage funnel. Hard-separation rule: a row is in `swarm_noise_categories` (Stage 1) XOR `swarm_intents` (Stage 3), never both. Stage 1's chip strip reads `swarm_noise_categories` only.
- `docs/agentic-pipeline/stage-1-regex.md` — Stage 1 noise filter (regex Pass 1 + LLM 2nd-pass on `unknown`). Defines what "noise category" means in the chip strip.

### Existing surfaces this phase reuses or replaces
- `web/app/(dashboard)/automations/[swarm]/review/page.tsx` — the loader that gets renamed to `/stage-1/page.tsx` (D-01). Read in full; the inlining + `?sub=pending` branch land here.
- `web/app/(dashboard)/automations/[swarm]/review/queue-tree.tsx` — the component being deleted (D-02). Don't reuse.
- `web/app/(dashboard)/automations/[swarm]/review/recipient-chip-strip.tsx` — chip-strip pattern reused for the noise-category chip strip.
- `web/app/(dashboard)/automations/[swarm]/_shell/page-header.tsx` — wrap Stage 1 in this. Same usage as `stage-0/page.tsx`, `stage-3/page.tsx`.
- `web/app/(dashboard)/automations/[swarm]/_shell/stage-tab-strip.tsx` — already registry-driven per Phase 76. No changes expected.
- `web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx` — reference shape for the new `/stage-2/page.tsx` placeholder (D-12).
- `web/app/(dashboard)/automations/[swarm]/debtor-email/_lib/tagging-failures-loader.ts` — Stage 2 placeholder count source (D-12).

### Routing / redirect contract
- `web/middleware.ts` — `resolveReviewRedirect` (D-03 contract). Recently fixed in commit `5a00de2` to preserve query params. No changes expected, but verify behavior holds with `sub` param.
- `web/__tests__/middleware-review-redirect.test.ts` — extend if any new redirect cases land.

### Operator surface conventions
- `.planning/phases/71-bulk-review-4-axis-redesign-capability-regression-eval-split/71-UI-SPEC.md` — Phase 71's UI contract for the row list + 4-axis detail pane. Stage 1's row list inherits this verbatim.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_shell/PageHeader` + `_shell/StageTabStrip` — already wraps `/stage-0`, `/stage-3`, `/stage-4`. Stage 1 + Stage 2 mount the same components. Drop-in.
- `recipient-chip-strip.tsx` — chip-row visual pattern. Fork or extract a generic `ChipStrip` if both noise-category and recipient strips end up rendered together; otherwise duplicate the visual styling, registry-driven content.
- `loadTaggingFailuresForReview` (Phase 67-06) — Stage 2 placeholder count source. Returns `Map<email_id, TaggingFailureSummary>`; for the placeholder we just need `.size` or a thin count query.
- `classifier_queue_counts` RPC — per-noise-key counts already exposed. Powers the chip-strip badges with no new query.
- `classifier_rules` candidates query — already loaded today; `?sub=pending` branch reuses the data instead of fetching afresh.
- `selection-context.tsx` (review/) — selection cache + `history.replaceState` pattern. Migrates with the directory rename; no logic change.

### Patterns to mirror (not invent)
- Stage 3 / Stage 4 page.tsx structure — `loadSwarm` → `notFound()` gate → `<PageHeader>` + `<StageTabStrip currentStage={N}>` → `<main>` with content. Stage 1 + Stage 2 follow the exact shape.
- Realtime: `<AutomationRealtimeProvider automations={['${swarmType}-review']}>` — already in `/review/page.tsx`. Migrates as-is. (Channel name stays per D-19.)

### What NOT to touch
- Backend pipeline (Stage 1 worker, escalation-gate, coordinator-orchestrator, Stage 4 handlers) — pure UI phase.
- `swarm_noise_categories` / `swarm_intents` schema — registry already supports the chip-strip; no DDL.
- Phase 76 Kanban surfaces (`/stage-3`, `/stage-4`) — visually consistent already; no edits expected.
- Realtime channel naming (D-19) — backend identifier, not user-visible.

</code_context>

<verification>
## Verification Strategy

**Goal-backward checks (planner builds these into PLAN.md must_haves):**

1. `/automations/debtor-email/stage-1` renders with `<PageHeader>` + `<StageTabStrip currentStage={1}>` on top, no "Bulk Review" h1.
2. The noise-category chip-strip renders below the tab strip with one chip per `swarm_noise_categories` row + "All" + count badges from `classifier_queue_counts`.
3. Clicking a chip writes `?topic=<noise_key>` to the URL and filters the row list (existing loader logic — already wired).
4. `/automations/debtor-email/stage-1?sub=pending` renders the candidate-rule list in place of the predicted-row list, with a working detail pane.
5. Legacy `/automations/debtor-email/review` (and `?tab=pending` / `?tab=safety` variants) still 308-redirect to the correct stage-keyed equivalents with query params preserved (existing middleware tests + Phase 81 additions).
6. `/automations/debtor-email/stage-2` resolves with the placeholder + live tagging-failures count + `↗` link to the existing tagging-failures surface.
7. The directory `web/app/(dashboard)/automations/[swarm]/review/` no longer exists. All imports targeting `../review/...` are rewritten to `./` or removed.
8. No `QueueTree` references remain in any non-test file.
9. Existing `/stage-3` and `/stage-4` surfaces render unchanged (regression check).
10. Cross-swarm: visit `/automations/sales-email/stage-1` (Phase 78 swarm if registered, else any other registered swarm) — chip-strip populates from that swarm's `swarm_noise_categories`, no debtor-email branches anywhere.

</verification>
