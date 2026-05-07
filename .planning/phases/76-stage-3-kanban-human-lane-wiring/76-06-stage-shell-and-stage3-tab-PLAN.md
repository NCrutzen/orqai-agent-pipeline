---
phase: 76
plan: 06
type: execute
wave: 5
depends_on: [01, 02, 03, 04, 05]
files_modified:
  - web/app/(dashboard)/automations/[swarm]/_shell/stage-tab-strip.tsx
  - web/app/(dashboard)/automations/[swarm]/_shell/page-header.tsx
  - web/app/(dashboard)/automations/[swarm]/_shell/derive-stage-tabs.ts
  - web/app/(dashboard)/automations/[swarm]/_shell/__tests__/derive-stage-tabs.test.ts
  - web/app/(dashboard)/automations/[swarm]/_actions/close.ts
  - web/app/(dashboard)/automations/[swarm]/_actions/replay.ts
  - web/app/(dashboard)/automations/[swarm]/_actions/reclassify-noise.ts
  - web/app/(dashboard)/automations/[swarm]/_lib/kanban-loader.ts
  - web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx
  - web/app/(dashboard)/automations/[swarm]/stage-3/selection-context.tsx
  - web/app/(dashboard)/automations/[swarm]/stage-3/row-list.tsx
  - web/app/(dashboard)/automations/[swarm]/stage-3/filter-chips.tsx
  - web/app/(dashboard)/automations/[swarm]/stage-3/reason-pill.tsx
  - web/app/(dashboard)/automations/[swarm]/stage-3/conf-bar.tsx
  - web/app/(dashboard)/automations/[swarm]/stage-3/detail-pane.tsx
  - web/app/(dashboard)/automations/[swarm]/stage-3/action-stack.tsx
  - web/app/(dashboard)/automations/[swarm]/stage-3/inline-editor.tsx
autonomous: false
requirements: []
must_haves:
  truths:
    - "Per-swarm stage-keyed shell renders at /automations/[swarm]/stage-3 (D-04 REVISED)"
    - "Tab list derived from swarms registry row, not hardcoded (D-05.5 NEW)"
    - "Stage 3 tab shows Kanban rows where result.kanban_reason ∈ {no_handler, low_confidence}"
    - "Filter chips: All / No handler / Low confidence with live counts"
    - "Detail pane shows ranked output, body preview, action stack (Replay/Reclassify/Close) per UI-SPEC"
    - "Inline editor: Replay variant (intent dropdown from swarm_intents) + Reclassify variant (noise dropdown from swarm_noise_categories minus 'unknown')"
    - "Optimistic removal via pendingRemovalIds (mirror review/selection-context.tsx)"
    - "Realtime channel '${swarm_type}-kanban' wired via AutomationRealtimeProvider"
    - "Zero literal swarm-name branches in Stage 3 UI files (cross-swarm reuse target — Phase 78 drops in by registry insert only)"
  artifacts:
    - path: "web/app/(dashboard)/automations/[swarm]/_shell/derive-stage-tabs.ts"
      provides: "Pure function: swarms registry row → stage tabs to render"
    - path: "web/app/(dashboard)/automations/[swarm]/_shell/stage-tab-strip.tsx"
      provides: "Tab strip component (registry-driven)"
    - path: "web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx"
      provides: "Stage 3 RSC — loads kanban rows + AutomationRealtimeProvider mount"
    - path: "web/app/(dashboard)/automations/[swarm]/stage-3/inline-editor.tsx"
      provides: "Replay + Reclassify inline editors per UI-SPEC §Action stack"
  key_links:
    - from: "stage-3/page.tsx"
      to: "loadKanbanRows (Plan 05 → moved to _lib)"
      via: "RSC server-side fetch"
      pattern: "loadKanbanRows"
    - from: "action-stack.tsx + inline-editor.tsx"
      to: "_actions/{close,replay,reclassify-noise}.ts"
      via: "Server Action invocations"
      pattern: "closeKanbanRow\\|replayKanbanRow\\|reclassifyAsNoise"
    - from: "selection-context.tsx"
      to: "row-list.tsx + detail-pane.tsx"
      via: "React context with pendingRemovalIds Set"
      pattern: "pendingRemovalIds"
---

<objective>
Build the per-swarm stage-keyed shell (`_shell/`) and the Stage 3 tab content. Stage 4 tab content reuses these components in Plan 07.

Per UI-SPEC.md (approved): exact spacing scale, typography, color tokens, file paths, and copy strings. Mirror Bulk Review patterns (`pendingRemovalIds`, viewport-sized PAGE_SIZE, parallel `Promise.all` row loaders, no SSR Graph fallback) — RESEARCH §Pattern 5/6/7 + CONTEXT.md "Bulk Review reference."

This plan also moves Plan 05's Server Actions from `[swarm]/kanban/actions/` to `[swarm]/_actions/` so Stage 3 and Stage 4 tabs share them (D-04 REVISED retired the `kanban` directory name).

Purpose: Operator's primary surface for Phase 76. Plan 07 layers Stage 4 tab on the same shell; Plan 08 wires redirects + verification.

Output: 13 files. Browser-loadable Stage 3 at `/automations/debtor-email/stage-3`. Checkpoint:human-verify gate at end.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/phases/76-stage-3-kanban-human-lane-wiring/76-CONTEXT.md
@.planning/phases/76-stage-3-kanban-human-lane-wiring/76-RESEARCH.md
@.planning/phases/76-stage-3-kanban-human-lane-wiring/76-UI-SPEC.md
@web/app/(dashboard)/automations/[swarm]/review/page.tsx
@web/app/(dashboard)/automations/[swarm]/review/selection-context.tsx
@web/app/(dashboard)/automations/[swarm]/review/row-list.tsx
@web/app/(dashboard)/automations/[swarm]/review/detail-pane.tsx
@web/app/(dashboard)/automations/[swarm]/review/keyboard-shortcuts.tsx
@web/app/(dashboard)/automations/[swarm]/review/components/stage-1-widget.tsx
@web/components/automations/automation-realtime-provider.tsx
@web/lib/swarms/registry.ts
@web/lib/swarms/types.ts
@web/app/globals.css

<interfaces>
<!-- Sketch findings skill (auto-loaded) provides locked sketch references for the stage-keyed shell, Stage 3 triage layout, action stack, and inline editor. -->

<!-- Tab derivation rule (D-05.5 NEW): -->
<!--   stage-0 always (existing safety surface) -->
<!--   stage-1 if swarm.stage1_regex_module IS NOT NULL -->
<!--   stage-2 if swarm.stage2_entity_resolver IS NOT NULL -->
<!--   stage-3 if swarm.stage3_coordinator_agent_key IS NOT NULL -->
<!--   stage-4 always (handler-error queue is universal even if zero count) -->

<!-- Realtime mount (RESEARCH §Pattern 6): -->
<!--   <AutomationRealtimeProvider automations={[`${swarm_type}-kanban`]}> -->
<!--     <SelectionProvider rowIds={…}>{children}</SelectionProvider> -->
<!--   </AutomationRealtimeProvider> -->

<!-- Server Action paths after this plan's move: -->
<!--   web/app/(dashboard)/automations/[swarm]/_actions/{close,replay,reclassify-noise}.ts -->
<!--   web/app/(dashboard)/automations/[swarm]/_lib/kanban-loader.ts -->

<!-- Noise-key field name (W3 fix): web/lib/swarms/types.ts exports the field as `category_key` (single field, no `noise_key`). -->
<!-- All inline-editor / page filter expressions in this plan and Plan 07 MUST use `category_key` directly — no `c.noise_key ?? c.category_key` fallback. The fallback shipped from Plan 05's defensive scaffold and is removed here once the canonical name is locked. -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Move Plan 05 actions to shared `_actions/` + create `derive-stage-tabs.ts` registry-driven helper</name>
  <files>
    web/app/(dashboard)/automations/[swarm]/_actions/close.ts,
    web/app/(dashboard)/automations/[swarm]/_actions/replay.ts,
    web/app/(dashboard)/automations/[swarm]/_actions/reclassify-noise.ts,
    web/app/(dashboard)/automations/[swarm]/_lib/kanban-loader.ts,
    web/app/(dashboard)/automations/[swarm]/_actions/__tests__/close.test.ts,
    web/app/(dashboard)/automations/[swarm]/_actions/__tests__/replay.test.ts,
    web/app/(dashboard)/automations/[swarm]/_actions/__tests__/reclassify-noise.test.ts,
    web/app/(dashboard)/automations/[swarm]/_lib/__tests__/kanban-loader.test.ts,
    web/app/(dashboard)/automations/[swarm]/_shell/derive-stage-tabs.ts,
    web/app/(dashboard)/automations/[swarm]/_shell/__tests__/derive-stage-tabs.test.ts
  </files>
  <read_first>
    - web/app/(dashboard)/automations/[swarm]/kanban/actions/close.ts (Plan 05 output)
    - web/app/(dashboard)/automations/[swarm]/kanban/actions/replay.ts
    - web/app/(dashboard)/automations/[swarm]/kanban/actions/reclassify-noise.ts
    - web/app/(dashboard)/automations/[swarm]/kanban/_lib/kanban-loader.ts
    - web/lib/swarms/types.ts (SwarmRow exact field names — REQUIRED before writing derive-stage-tabs)
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-CONTEXT.md (D-05.5)
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-VALIDATION.md §Wave 0 Requirements (the path-rewrite contract for the four Server Action tests + kanban-loader test — this task IS the rewrite step)
  </read_first>
  <behavior>
    - Move 4 production files + 4 test files from `kanban/actions/` and `kanban/_lib/` to `_actions/` and `_lib/`. Drop the `kanban/` directory after moves.
    - derive-stage-tabs.ts: pure function. Input=SwarmRow, output=array of `{ stage:0|1|2|3|4, label:string, slug:string, present:boolean }` per <interfaces> rules.
    - derive-stage-tabs.test.ts: minimum 4 cases — full registry row → all 5 present; missing stage2_entity_resolver → stage 2 present:false; minimal row → only stage 0+4 present:true; sales-email-shaped row (different stage modules but same shape) → tabs match registry, NOT swarm_type.
  </behavior>
  <action>
1. Move via git (preserves history):
```bash
mkdir -p web/app/\(dashboard\)/automations/\[swarm\]/_actions/__tests__
mkdir -p web/app/\(dashboard\)/automations/\[swarm\]/_lib/__tests__
mkdir -p web/app/\(dashboard\)/automations/\[swarm\]/_shell/__tests__
git mv 'web/app/(dashboard)/automations/[swarm]/kanban/actions/close.ts' 'web/app/(dashboard)/automations/[swarm]/_actions/close.ts'
git mv 'web/app/(dashboard)/automations/[swarm]/kanban/actions/replay.ts' 'web/app/(dashboard)/automations/[swarm]/_actions/replay.ts'
git mv 'web/app/(dashboard)/automations/[swarm]/kanban/actions/reclassify-noise.ts' 'web/app/(dashboard)/automations/[swarm]/_actions/reclassify-noise.ts'
git mv 'web/app/(dashboard)/automations/[swarm]/kanban/_lib/kanban-loader.ts' 'web/app/(dashboard)/automations/[swarm]/_lib/kanban-loader.ts'
git mv 'web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/close.test.ts' 'web/app/(dashboard)/automations/[swarm]/_actions/__tests__/close.test.ts'
git mv 'web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/replay.test.ts' 'web/app/(dashboard)/automations/[swarm]/_actions/__tests__/replay.test.ts'
git mv 'web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/reclassify-noise.test.ts' 'web/app/(dashboard)/automations/[swarm]/_actions/__tests__/reclassify-noise.test.ts'
git mv 'web/app/(dashboard)/automations/[swarm]/kanban/_lib/__tests__/kanban-loader.test.ts' 'web/app/(dashboard)/automations/[swarm]/_lib/__tests__/kanban-loader.test.ts'
rmdir 'web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__' 'web/app/(dashboard)/automations/[swarm]/kanban/actions' 'web/app/(dashboard)/automations/[swarm]/kanban/_lib/__tests__' 'web/app/(dashboard)/automations/[swarm]/kanban/_lib' 'web/app/(dashboard)/automations/[swarm]/kanban' 2>/dev/null || true
```

2. Create `web/app/(dashboard)/automations/[swarm]/_shell/derive-stage-tabs.ts`:

```ts
import type { SwarmRow } from "@/lib/swarms/types";

export interface StageTab {
  stage: 0 | 1 | 2 | 3 | 4;
  label: string;
  slug: string;
  present: boolean;
}

const FIXED: ReadonlyArray<{ stage: 0 | 1 | 2 | 3 | 4; label: string; slug: string }> = [
  { stage: 0, label: "Stage 0 · Safety", slug: "stage-0" },
  { stage: 1, label: "Stage 1 · Noise", slug: "stage-1" },
  { stage: 2, label: "Stage 2 · Customer", slug: "stage-2" },
  { stage: 3, label: "Stage 3 · Intent", slug: "stage-3" },
  { stage: 4, label: "Stage 4 · Handler", slug: "stage-4" },
];

export function deriveStageTabs(swarm: SwarmRow): StageTab[] {
  return FIXED.map((t) => {
    let present = false;
    if (t.stage === 0) present = true;
    if (t.stage === 1) present = Boolean(swarm.stage1_regex_module);
    if (t.stage === 2) present = Boolean(swarm.stage2_entity_resolver);
    if (t.stage === 3) present = Boolean(swarm.stage3_coordinator_agent_key);
    if (t.stage === 4) present = true;
    return { ...t, present };
  });
}
```

   IMPORTANT: confirm `SwarmRow` and the four field names against `web/lib/swarms/types.ts`. If the type name differs (e.g., `Swarm` or `SwarmsRow`), use whatever the file exports.

3. Create `_shell/__tests__/derive-stage-tabs.test.ts` with 4 cases per <behavior>.

4. **VALIDATION.md path-rewrite (W1 belt-and-suspenders):** This task IS the canonical rewrite step for the Wave 0 Server Action test paths described in 76-VALIDATION.md §Wave 0 Requirements. After the `git mv` block runs, the only valid locations are `_actions/__tests__/` and `_lib/__tests__/`. No grep against the tree should match `kanban/actions` or `kanban/_lib` anywhere.
  </action>
  <verify>
    <automated>cd web && npx vitest run 'app/(dashboard)/automations/[swarm]/_actions' && cd web && npx vitest run 'app/(dashboard)/automations/[swarm]/_lib' && cd web && npx vitest run 'app/(dashboard)/automations/[swarm]/_shell' && cd web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - 10 files exist at declared paths; the `kanban/` directory is GONE (`test ! -d 'web/app/(dashboard)/automations/[swarm]/kanban'`)
    - All 4 moved test files still pass (Plan 05 acceptance criteria carry over)
    - `derive-stage-tabs.test.ts` has ≥ 4 `it()` blocks all green
    - `cd web && npx tsc --noEmit` exits 0
    - **W1 path-rewrite gate:** `find web/app/\(dashboard\)/automations/\[swarm\] -path '*kanban*' 2>/dev/null | wc -l` returns `0` (no stale `kanban/` paths anywhere — the directory and all its contents are gone)
    - **W1 path-rewrite gate (test files):** all 5 Wave-0 test files exist at their post-move locations: `for p in '_actions/__tests__/close.test.ts' '_actions/__tests__/replay.test.ts' '_actions/__tests__/reclassify-noise.test.ts' '_lib/__tests__/kanban-loader.test.ts'; do test -f "web/app/(dashboard)/automations/[swarm]/$p" || { echo "MISSING $p"; exit 1; }; done`
  </acceptance_criteria>
  <done>Server Actions moved to shared location; registry-driven tab derivation pure-function in place; tests green; W1 path-rewrite gates pass (zero `kanban/` leftovers, all moved test files at canonical post-move locations).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Build _shell/ components (page-header + stage-tab-strip) and stage-3 RSC page</name>
  <files>
    web/app/(dashboard)/automations/[swarm]/_shell/page-header.tsx,
    web/app/(dashboard)/automations/[swarm]/_shell/stage-tab-strip.tsx,
    web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx,
    web/app/(dashboard)/automations/[swarm]/stage-3/selection-context.tsx
  </files>
  <read_first>
    - web/app/(dashboard)/automations/[swarm]/review/page.tsx (RSC pattern: dynamic='force-dynamic', loadSwarm, notFound, AutomationRealtimeProvider mount)
    - web/app/(dashboard)/automations/[swarm]/review/selection-context.tsx (verbatim copy template — pendingRemovalIds + history.replaceState pattern, ~120 lines)
    - web/components/automations/automation-realtime-provider.tsx (props: automations, initialLimit)
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-UI-SPEC.md §Layout Contract + §Spacing Scale + §Typography + §Color
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-CONTEXT.md (D-05.5, D-04 REVISED)
    - web/app/(dashboard)/automations/[swarm]/_shell/derive-stage-tabs.ts (Task 1 output)
    - web/app/(dashboard)/automations/[swarm]/_lib/kanban-loader.ts (Task 1 moved file)
    - web/lib/swarms/registry.ts (loadSwarm)
    - web/lib/swarms/types.ts (W3: confirm `category_key` is the single canonical field name on swarm_noise_categories rows — there is NO `noise_key` field. Use `c.category_key` directly in the dropdown filter; do NOT keep the `c.noise_key ?? c.category_key` fallback that shipped in Plan 05's scaffold.)
  </read_first>
  <behavior>
    - page-header.tsx: server component. Renders `<h2>{swarm.display_name ?? swarm.swarm_type}</h2>` and `<div class="sub">{swarm.mailbox}</div>`. Spacing per UI-SPEC §Spacing Scale (--space-4 vertical / --space-5 horizontal). Typography per UI-SPEC §Typography (22px/500 medium for h2, 13px/400 for sub). Uses --v7-bg-2 surface.
    - stage-tab-strip.tsx: server component. Takes `swarm: SwarmRow` and `currentStage: 0|1|2|3|4`. Calls `deriveStageTabs(swarm)`. Renders `<nav>` with one `<a>` per `present:true` tab; non-present tabs render as muted (or omitted — UI-SPEC says omit). Active tab gets `aria-current="page"` + 2px brand-primary bottom border. Right-edge `↗ Swarm operations dashboard` link to `/swarm/${swarm.id}`. Tab badge counts: pulled from a small server-side count helper passed via props (counts per stage = optional prop, defaults to undefined → no badge).
    - stage-3/page.tsx: RSC. `export const dynamic = "force-dynamic"`. Reads `params.swarm`, calls `loadSwarm`, `notFound()` on null. Calls `loadKanbanRows(admin, params.swarm)` filtered to `kanban_reason ∈ {no_handler, low_confidence}`. Loads `swarm_intents` and `swarm_noise_categories` for inline-editor dropdowns. Wraps children in `<AutomationRealtimeProvider automations={['${params.swarm}-kanban']} initialLimit={500}>` and `<SelectionProvider rowIds={rows.map(r => r.id)}>`.
    - stage-3/selection-context.tsx: VERBATIM copy of `review/selection-context.tsx` shape (pendingRemovalIds + history.replaceState). Adapt only for the rows-prop type referencing `KanbanRow` from `_lib/kanban-loader.ts`.
  </behavior>
  <action>
1. **page-header.tsx** (server component, ~30 lines):
```tsx
import type { SwarmRow } from "@/lib/swarms/types";

export function PageHeader({ swarm }: { swarm: SwarmRow }) {
  return (
    <header className="page-header" style={{
      padding: "var(--space-4) var(--space-5)",
      background: "var(--v7-bg-2)",
      borderBottom: "1px solid var(--v7-border)",
    }}>
      <h2 style={{
        fontFamily: "var(--font-display)",
        fontSize: "22px",
        fontWeight: 500,
        lineHeight: 1.2,
        margin: 0,
        color: "var(--v7-text)",
      }}>
        {swarm.display_name ?? swarm.swarm_type}
      </h2>
      {swarm.mailbox ? (
        <div className="sub" style={{
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
          color: "var(--v7-text-muted)",
          marginTop: "var(--space-1)",
        }}>
          {swarm.mailbox}
        </div>
      ) : null}
    </header>
  );
}
```
   Field names (`display_name`, `mailbox`) MUST match `web/lib/swarms/types.ts`; verify and adjust.

2. **stage-tab-strip.tsx** (server component, ~50 lines):
```tsx
import Link from "next/link";
import type { SwarmRow } from "@/lib/swarms/types";
import { deriveStageTabs } from "./derive-stage-tabs";

interface Props {
  swarm: SwarmRow;
  currentStage: 0 | 1 | 2 | 3 | 4;
  counts?: Partial<Record<0 | 1 | 2 | 3 | 4, number>>;
}

export function StageTabStrip({ swarm, currentStage, counts }: Props) {
  const tabs = deriveStageTabs(swarm).filter((t) => t.present);
  return (
    <nav className="stage-tab-strip" style={{
      display: "flex",
      gap: "var(--space-2)",
      padding: "var(--space-3) var(--space-5)",
      background: "var(--v7-bg-2)",
      borderBottom: "1px solid var(--v7-border)",
    }}>
      {tabs.map((t) => {
        const active = t.stage === currentStage;
        const count = counts?.[t.stage];
        return (
          <Link
            key={t.slug}
            href={`/automations/${swarm.swarm_type}/${t.slug}`}
            aria-current={active ? "page" : undefined}
            style={{
              fontSize: "14px",
              fontWeight: active ? 500 : 400,
              padding: "var(--space-2) var(--space-3)",
              color: active ? "var(--v7-text)" : "var(--v7-text-muted)",
              borderBottom: active ? "2px solid var(--v7-brand-primary)" : "2px solid transparent",
              textDecoration: "none",
            }}
          >
            {t.label}
            {typeof count === "number" && count > 0 ? (
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                marginLeft: "var(--space-1)",
                padding: "0 var(--space-1)",
                background: "var(--v7-brand-primary-soft)",
                color: "var(--v7-brand-primary)",
                borderRadius: "4px",
              }}>{count}</span>
            ) : null}
          </Link>
        );
      })}
      <Link href={`/swarm/${swarm.id}`} style={{
        marginLeft: "auto",
        fontSize: "13px",
        color: "var(--v7-text-muted)",
        textDecoration: "none",
      }}>↗ Swarm operations dashboard</Link>
    </nav>
  );
}
```

3. **stage-3/page.tsx** RSC (mirror review/page.tsx):
```tsx
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm, loadSwarmIntents, loadSwarmNoiseCategories } from "@/lib/swarms/registry";
import { loadKanbanRows } from "../_lib/kanban-loader";
import { PageHeader } from "../_shell/page-header";
import { StageTabStrip } from "../_shell/stage-tab-strip";
import { AutomationRealtimeProvider } from "@/components/automations/automation-realtime-provider";
import { SelectionProvider } from "./selection-context";
import { Stage3Client } from "./row-list"; // composite client component (Task 3)

export const dynamic = "force-dynamic";

export default async function Stage3Page({ params }: { params: Promise<{ swarm: string }> }) {
  const { swarm: swarmType } = await params;
  const admin = createAdminClient();
  const swarm = await loadSwarm(admin, swarmType);
  if (!swarm) notFound();

  const [allRows, intents, noiseCategories] = await Promise.all([
    loadKanbanRows(admin, swarmType),
    loadSwarmIntents(admin, swarmType),
    loadSwarmNoiseCategories(admin, swarmType),
  ]);
  const stage3Rows = allRows.filter((r) =>
    r.result.kanban_reason === "no_handler" || r.result.kanban_reason === "low_confidence"
  );
  const stage4Count = allRows.filter((r) => r.result.kanban_reason === "handler_error").length;

  return (
    <>
      <PageHeader swarm={swarm} />
      <StageTabStrip
        swarm={swarm}
        currentStage={3}
        counts={{ 3: stage3Rows.length, 4: stage4Count }}
      />
      <AutomationRealtimeProvider automations={[`${swarmType}-kanban`]} initialLimit={500}>
        <SelectionProvider rowIds={stage3Rows.map((r) => r.id)}>
          <Stage3Client
            swarmType={swarmType}
            rows={stage3Rows}
            intents={intents.filter((i) => i.handler_status === "registered")}
            noiseCategories={noiseCategories.filter((c) => c.category_key !== "unknown")}
          />
        </SelectionProvider>
      </AutomationRealtimeProvider>
    </>
  );
}
```

   IMPORTANT for noise dropdown: filter `unknown` server-side (CONTEXT.md deferred-ideas). **W3 fix:** use `c.category_key !== "unknown"` (single canonical field per `web/lib/swarms/types.ts`); do NOT keep the `c.noise_key ?? c.category_key` defensive fallback that shipped in Plan 05's scaffold.
   IMPORTANT for replay dropdown: filter to ONLY `handler_status === 'registered'` so operators can't pick a still-placeholder intent and trigger R-4 silently.

4. **selection-context.tsx**: copy `web/app/(dashboard)/automations/[swarm]/review/selection-context.tsx` verbatim, swap `RowId` references for `KanbanRow.id`. Keep pendingRemovalIds Set, history.replaceState, cleanup effect.
  </action>
  <verify>
    <automated>cd web && npx tsc --noEmit && test -f 'web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx' && test -f 'web/app/(dashboard)/automations/[swarm]/_shell/stage-tab-strip.tsx' && test -f 'web/app/(dashboard)/automations/[swarm]/_shell/page-header.tsx'</automated>
  </verify>
  <acceptance_criteria>
    - 4 files exist at declared paths
    - `grep -c "force-dynamic" 'web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx'` = 1
    - `grep -c "${swarmType}-kanban" 'web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx'` ≥ 1 (template literal — adjust for actual file format)
    - `grep -c "deriveStageTabs" 'web/app/(dashboard)/automations/[swarm]/_shell/stage-tab-strip.tsx'` ≥ 1
    - `grep -c "loadKanbanRows" 'web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx'` ≥ 1
    - `grep -c "pendingRemovalIds" 'web/app/(dashboard)/automations/[swarm]/stage-3/selection-context.tsx'` ≥ 1
    - **Cross-swarm grep:** `grep -E "['\"](debtor-email|sales-email)['\"]" 'web/app/(dashboard)/automations/[swarm]/stage-3/'*.tsx 'web/app/(dashboard)/automations/[swarm]/_shell/'*.tsx 'web/app/(dashboard)/automations/[swarm]/_actions/'*.ts 'web/app/(dashboard)/automations/[swarm]/_lib/'*.ts` returns ZERO matches
    - **W3 single-field gate:** `grep -nE 'noise_key\s*\?\?\s*category_key|noise_key\s*\|\|\s*category_key' 'web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx' 'web/app/(dashboard)/automations/[swarm]/_actions/reclassify-noise.ts'` returns ZERO matches (executor must pick `category_key` exclusively — single field per types.ts)
    - `cd web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Stage 3 RSC page loads; tab strip + page header registry-driven; selection-context mirrors review pattern; cross-swarm reuse target met; W3 single-field gate passes (no `noise_key ?? category_key` fallback in stage-3 page or reclassify-noise action).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Stage 3 client components — row-list, filter-chips, reason-pill, conf-bar, detail-pane, action-stack, inline-editor</name>
  <files>
    web/app/(dashboard)/automations/[swarm]/stage-3/row-list.tsx,
    web/app/(dashboard)/automations/[swarm]/stage-3/filter-chips.tsx,
    web/app/(dashboard)/automations/[swarm]/stage-3/reason-pill.tsx,
    web/app/(dashboard)/automations/[swarm]/stage-3/conf-bar.tsx,
    web/app/(dashboard)/automations/[swarm]/stage-3/detail-pane.tsx,
    web/app/(dashboard)/automations/[swarm]/stage-3/action-stack.tsx,
    web/app/(dashboard)/automations/[swarm]/stage-3/inline-editor.tsx
  </files>
  <read_first>
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-UI-SPEC.md (FULL FILE — Component Inventory, Layout Contract, Color, Typography, Spacing, Copywriting Contract; this task implements every component listed in the inventory)
    - web/app/(dashboard)/automations/[swarm]/review/row-list.tsx (mirror shape)
    - web/app/(dashboard)/automations/[swarm]/review/detail-pane.tsx (mirror shape)
    - web/app/(dashboard)/automations/[swarm]/review/components/stage-1-widget.tsx (intent-dropdown pattern for the Replay inline editor — CONTEXT.md §Specific Ideas)
    - web/app/(dashboard)/automations/[swarm]/review/keyboard-shortcuts.tsx (key map: ↑↓⏎ Esc N Space — UI-SPEC §Accessibility)
    - web/app/(dashboard)/automations/[swarm]/_actions/{close,replay,reclassify-noise}.ts (Server Actions to invoke)
    - web/app/(dashboard)/automations/[swarm]/_lib/kanban-loader.ts (KanbanRow type)
    - web/app/(dashboard)/automations/[swarm]/stage-3/selection-context.tsx (Task 2 output)
    - .claude/skills/sketch-findings-agent-workforce/SKILL.md (auto-loaded — sketches 005/006/007)
  </read_first>
  <behavior>
    - row-list.tsx (also exports `Stage3Client` composite component used by page.tsx Task 2): client component. Two-column grid `[1fr 460px]` per UI-SPEC §Layout. Renders filter-chips + scrollable row list on left; detail-pane on right. Subscribes to selection-context. Filters via state for `All / no_handler / low_confidence`. Hides rows in `pendingRemovalIds`. Reads broadcast invalidation from AutomationRealtimeProvider.
    - filter-chips.tsx: 3 chips (All / No handler / Low confidence) with live counts. Active chip uses --v7-brand-primary-soft background + border per UI-SPEC. Copy verbatim per UI-SPEC §Filter chips.
    - reason-pill.tsx: text+color pill. Maps `kanban_reason` → (label, color). `no_handler` → blue, `low_conf` → amber, `handler_error` → red (UI-SPEC §Color).
    - conf-bar.tsx: 40px×4px rectangle. Color by value bucket per UI-SPEC §Color (amber<0.40, blue<0.66, green≥0.66). ONLY rendered on low_confidence rows (UI-SPEC).
    - detail-pane.tsx: 460px width. Renders subject, meta, ranked output list (with ✓ picked annotation per UI-SPEC §Detail pane copy), email body preview (lazy via fetchReviewEmailBody if exists; else placeholder). Mounts action-stack at sticky bottom.
    - action-stack.tsx: 3 buttons per UI-SPEC §Action stack — Replay (primary brand-primary), Reclassify, Close. Keyboard: ⏎ Replay, N Reclassify, Space Close. Click → either fires Server Action (Close + same-intent Replay) or transforms button into inline-editor (Replay-other / Reclassify).
    - inline-editor.tsx: two variants. Replay variant: `<select>` populated from `props.intents` (passed down from page.tsx — already filtered to `handler_status='registered'`); Cancel + Confirm replay buttons; helper text per UI-SPEC. Reclassify variant: `<select>` populated from `props.noiseCategories` (already filtered to exclude `unknown`); Cancel + Confirm reclassify; helper text per UI-SPEC. Confirm calls the relevant Server Action with optimistic markPendingRemoval.
  </behavior>
  <action>
Build all 7 files per UI-SPEC §Component Inventory + §Layout Contract + §Copywriting Contract.

Hard rules from UI-SPEC (do NOT deviate):
- Spacing: only `var(--space-1..6)` (4..24px multiples). Selected-row left-border 2px uses `calc(var(--space-4) - 2px)` for compensation (UI-SPEC §Spacing).
- Typography: 4 sizes (11/13/14/22), 2 weights (400/500). Mono only for IDs, intent_keys (pills), kbd, badges, mailbox.
- Color accent reserved-for list: active tab underline, selected-row left-border, primary CTA, active chip bg-soft + border, tab badge text/bg, inline-editor outline, conf-bar high-end fill (uses --v7-success — NOT brand-primary). Anywhere else uses --text/--text-muted/--border.
- Reason pill colors:
  - `no_handler` → `--v7-blue-soft` bg, `--v7-blue` text
  - `low_confidence` → `--v7-amber-soft` bg, `--v7-amber` text. Display label "low_conf" per UI-SPEC.
  - `handler_error` → `--v7-red-soft` bg, `--v7-red` text
- Action stack copy (verbatim):
  - Primary: `✓ Replay through Stage 4` (kbd ⏎)
  - Secondary: `↶ Reclassify as noise` (kbd N)
  - Destructive: `✕ Close (manual)` (kbd Space)
- No confirm modals. Inline editor IS the destructive surface (UI-SPEC §Destructive confirmation).
- Cross-swarm: zero literal `'debtor-email'` / `'sales-email'` strings. The `swarmType` prop flows top-down from page.tsx.
- W3 single-field rule: anywhere this client code reads a noise category's key, use `category_key` directly. Do NOT introduce a `c.noise_key ?? c.category_key` or `c.noise_key || c.category_key` fallback — `web/lib/swarms/types.ts` exports `category_key` as the single canonical field.

Each component file should be focused, under ~120 lines. Use sketch findings skill (auto-loaded) for visual lock — do NOT invent layout outside the locked sketches 005/006/007.

For the inline-editor, mirror the dropdown shape from `review/components/stage-1-widget.tsx` (CONTEXT.md §Specific Ideas).

Wire optimistic removal: each Server Action call:
```ts
const { markPendingRemoval } = useSelection();
async function onConfirm() {
  markPendingRemoval(row.id);
  const res = await replayKanbanRow({ ... });
  if (!res.ok) { /* surface error per UI-SPEC §Error states; pendingRemovalIds will reconcile on next fetch */ }
}
```

For the email-body preview — try to reuse `fetchReviewEmailBody` Server Action if it exists at the importable path; if not, render a placeholder `<div>Email body preview not yet wired</div>` with a TODO comment referencing Plan 08.
  </action>
  <verify>
    <automated>cd web && npx tsc --noEmit && for f in row-list filter-chips reason-pill conf-bar detail-pane action-stack inline-editor; do test -f "web/app/(dashboard)/automations/[swarm]/stage-3/$f.tsx" || echo "MISSING $f"; done</automated>
  </verify>
  <acceptance_criteria>
    - All 7 component files exist
    - `grep -c "✓ Replay through Stage 4" 'web/app/(dashboard)/automations/[swarm]/stage-3/action-stack.tsx'` ≥ 1 (UI-SPEC verbatim copy)
    - `grep -c "↶ Reclassify as noise" 'web/app/(dashboard)/automations/[swarm]/stage-3/action-stack.tsx'` ≥ 1
    - `grep -c "✕ Close" 'web/app/(dashboard)/automations/[swarm]/stage-3/action-stack.tsx'` ≥ 1
    - `grep -c "var(--space-" 'web/app/(dashboard)/automations/[swarm]/stage-3/'*.tsx | awk -F: '{s+=$2} END{print s}'` ≥ 10 (locked spacing tokens used everywhere)
    - `grep -E "[0-9]+px" 'web/app/(dashboard)/automations/[swarm]/stage-3/'*.tsx | grep -v "var(--" | grep -v "1280px\|460px\|40px\|4px\|2px"` returns ZERO unauthorized non-var pixel values (UI-SPEC §Spacing lock; 460px pane width / 40px conf-bar / 2px border / 4px conf-bar height / 1280px breakpoint are explicitly allowed)
    - **Cross-swarm grep on Stage 3 UI:** `grep -E "['\"](debtor-email|sales-email)['\"]" 'web/app/(dashboard)/automations/[swarm]/stage-3/'*.tsx` returns ZERO matches
    - **W3 single-field gate (Stage 3 client):** `grep -nE 'noise_key\s*\?\?\s*category_key|noise_key\s*\|\|\s*category_key' 'web/app/(dashboard)/automations/[swarm]/stage-3/'*.tsx` returns ZERO matches
    - `grep -c "pendingRemovalIds\|markPendingRemoval" 'web/app/(dashboard)/automations/[swarm]/stage-3/'*.tsx` ≥ 2 (optimistic UI wired)
    - `cd web && npx tsc --noEmit` exits 0
    - `cd web && npx next build 2>&1 | tail -20` does NOT report errors for `[swarm]/stage-3` route (warnings ok)
  </acceptance_criteria>
  <done>All 7 Stage 3 components built; optimistic removal wired; UI-SPEC strings + tokens enforced; cross-swarm grep zero matches; W3 single-field gate passes; tsc green; next build green.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Human-verify Stage 3 surface (visual + functional)</name>
  <what-built>Per-swarm stage-keyed shell at /automations/debtor-email/stage-3 with registry-driven tabs, filter chips, row list, detail pane, and three operator actions wired to Server Actions from Plan 05.</what-built>
  <how-to-verify>
    1. Run dev server: `cd web && npm run dev`
    2. Visit `http://localhost:3000/automations/debtor-email/stage-3`
       - Expected: page header shows "Debtor Email" + mailbox; tab strip shows 5 tabs (Stage 0..4); Stage 3 tab is active.
       - Expected: filter chips render `All <count>` / `No handler <count>` / `Low confidence <count>`. Counts may be 0 if no Kanban rows exist yet.
       - Expected (UI-SPEC §Empty states): if no rows → "No rows in Stage 3" heading + body copy verbatim.
    3. Smoke test triggers (optional — can defer if no Kanban rows naturally present):
       - Manually insert a test row via SQL to validate end-to-end render:
         ```sql
         INSERT INTO public.automation_runs (automation, swarm_type, status, topic, result, triggered_by)
         VALUES ('debtor-email-kanban', 'debtor-email', 'pending', 'address_change',
           '{"kanban_reason":"no_handler","intent":"address_change","email_id":"test-em-1","confidence":"high"}'::jsonb,
           'manual-test');
         ```
       - Expected: row appears within ~2s (Realtime broadcast); filter chip counts update; clicking the row populates detail pane with ranked output stub + reason pill `no_handler` blue.
    4. Action smoke (use the test row):
       - Click `✕ Close (manual)` → row disappears optimistically (pendingRemovalIds); SQL `SELECT status FROM automation_runs WHERE topic='address_change' AND triggered_by='manual-test'` returns `completed`.
       - For Replay: insert another test row; click `✓ Replay through Stage 4` (same-intent path); verify Inngest dashboard shows a `debtor-email/<intent>.requested` event fired.
       - For Reclassify-as-noise: click `↶ Reclassify as noise` → inline editor opens → pick `auto_reply` → Confirm → row closes; verify `debtor-email/override.submitted` event fires with axis=stage_1_category.
    5. Visual checks (UI-SPEC):
       - 460px detail pane width
       - Mono font on intent_keys + IDs + mailbox
       - Active tab has 2px brand-primary bottom border
       - Selected row has 2px brand-primary left border with calc-compensated padding
       - Color split: dominant dark bg, secondary panels, brand-primary used ONLY on the items in UI-SPEC §Color accent reserved-for list
    6. Cross-swarm sanity (no UI rows, just routing):
       - Visit `http://localhost:3000/automations/sales-email/stage-3` (after Phase 78 inserts the swarm registry row, this should render automatically; for now, expect notFound).
       - Visit `http://localhost:3000/automations/bogus-swarm/stage-3` → expect 404.
  </how-to-verify>
  <resume-signal>
    Type "approved" when:
    - Stage 3 page renders correctly per UI-SPEC visual checks (step 5)
    - At least one of the three actions (Close / Replay / Reclassify) verified end-to-end on a test row (step 4)
    - 404 sanity check on bogus-swarm passes (step 6)
    Otherwise paste the failing screenshot or behavior so the planner can revise.
  </resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Operator browser → /automations/[swarm]/stage-3 | Untrusted [swarm] URL segment — validated by `loadSwarm` returning notFound |
| Stage 3 client components → Server Actions | Already validated in Plan 05; this plan just invokes them |
| Browser → Realtime channel | Realtime channel name is server-generated from validated swarm_type; no operator input on the channel name |
| Inline-editor dropdown options → Server Action payload | Dropdown sourced from server-rendered registry data; operator's choice is constrained to that set client-side (defense in depth — server still validates per Plan 05) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-76-06-01 | S (Spoofing) | [swarm] route segment | mitigate | `loadSwarm(admin, params.swarm)` registry lookup; `notFound()` on null. Validated server-side in RSC, before any client code runs |
| T-76-06-02 | T (Tampering) | Operator-supplied chosenIntent in inline-editor | mitigate | Client dropdown sourced from server-rendered intents.filter(handler_status='registered'); Server Action (Plan 05) re-validates against registry |
| T-76-06-03 | T (Tampering) | Operator-supplied noiseKey in inline-editor | mitigate | Client dropdown sourced from server-rendered noiseCategories.filter(key !== 'unknown'); Server Action (Plan 05) re-validates |
| T-76-06-04 | I (Information disclosure) | Stage 3 ranked output rendered in detail pane | accept | Service-role-rendered, dashboard already requires session; no public exposure |
| T-76-06-05 | E (Elevation of privilege / IDOR) | Operator URL-tampers with /automations/sales-email/stage-3 to access other-mailbox rows | accept-for-now | Plan 76 v1: any signed-in operator can view any swarm. Operator-persona / mailbox-scoped permissions deferred to Phase 999.2 (CONTEXT.md D-06) |
| T-76-06-06 | R (Repudiation) | Action audit trail | mitigate | All actions invoke Plan 05 Server Actions which write pipeline_events with operator_id |
| T-76-06-07 | D (Denial of service) | 500-row Realtime initialLimit | accept | UI-SPEC + RESEARCH §Pitfall 2 lock; pagination is Phase 79 if accumulation matters |
</threat_model>

<verification>
- 13 files exist at declared paths.
- All 4 moved test files (Plan 05) still pass after the move.
- `derive-stage-tabs.test.ts` green with ≥4 cases.
- `cd web && npx tsc --noEmit` exits 0.
- `cd web && npx next build` exits 0 (or warnings only — no errors for the new routes).
- Cross-swarm grep against Stage 3 UI files: zero literal swarm-name matches.
- W1 path-rewrite gate: zero `kanban/` paths remain after Task 1.
- W3 single-field gate: zero `noise_key ?? category_key` / `noise_key || category_key` matches in stage-3 page, reclassify-noise action, or stage-3 client components.
- Human-verify checkpoint approved.
</verification>

<success_criteria>
- Operator can load `/automations/debtor-email/stage-3`, see Kanban rows (when present), and execute Close / Replay / Reclassify successfully end-to-end.
- Tab strip is registry-driven — adding a row to `swarms` for sales-email (Phase 78) lights up the same shell with no UI code change.
- UI-SPEC visual + copy contract enforced via grep + manual verification.
</success_criteria>

<output>
After completion, create `.planning/phases/76-stage-3-kanban-human-lane-wiring/76-06-SUMMARY.md` documenting:
- Final file tree under `[swarm]/_shell/`, `[swarm]/_actions/`, `[swarm]/_lib/`, `[swarm]/stage-3/`
- Confirmation that the `[swarm]/kanban/` directory is fully retired
- Cross-swarm grep evidence (zero matches)
- W1 + W3 gate evidence (zero `kanban/` leftovers, zero `noise_key ?? category_key` fallbacks)
- Screenshot or notes from the human-verify checkpoint
</output>
