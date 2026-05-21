---
phase: 76
plan: 07
type: execute
wave: 6
depends_on: [05, 06]
files_modified:
  - web/app/(dashboard)/automations/[swarm]/stage-4/page.tsx
  - web/app/(dashboard)/automations/[swarm]/stage-4/selection-context.tsx
  - web/app/(dashboard)/automations/[swarm]/stage-4/row-list.tsx
  - web/app/(dashboard)/automations/[swarm]/stage-4/filter-chips.tsx
  - web/app/(dashboard)/automations/[swarm]/stage-4/detail-pane.tsx
  - web/app/(dashboard)/automations/[swarm]/stage-4/error-detail-section.tsx
autonomous: false
requirements: []
must_haves:
  truths:
    - "Stage 4 tab renders at /automations/[swarm]/stage-4 (D-04 REVISED)"
    - "Shows automation_runs rows where status='pending' AND result.kanban_reason='handler_error'"
    - "Single 'Handler errors <count>' filter chip per UI-SPEC"
    - "Detail pane shows error_detail section + Reclassify and Close actions (NO intent-edit dropdown — Stage 4 has no Replay-edit)"
    - "Reuses Stage 3 components (reason-pill, action-stack, inline-editor Reclassify variant) — does NOT duplicate"
  artifacts:
    - path: "web/app/(dashboard)/automations/[swarm]/stage-4/page.tsx"
      provides: "Stage 4 RSC — loads handler_error Kanban rows"
    - path: "web/app/(dashboard)/automations/[swarm]/stage-4/error-detail-section.tsx"
      provides: "Error detail expanding section per UI-SPEC §Detail pane copy"
  key_links:
    - from: "stage-4/page.tsx"
      to: "loadKanbanRows (filtered to handler_error)"
      via: "RSC server-side fetch"
      pattern: "handler_error"
    - from: "stage-4/detail-pane.tsx"
      to: "Stage 3 components (reason-pill, action-stack, inline-editor)"
      via: "import from '../stage-3/'"
      pattern: "from.*stage-3"
---

<objective>
Layer the Stage 4 tab on top of the shell built in Plan 06. Stage 4 reuses the same `_shell/` (page-header + stage-tab-strip), the same Server Actions (`_actions/`), and most Stage 3 components — only the page wrapper, filter chips (single chip), detail pane (error_detail section instead of ranked output), and a thin `error-detail-section.tsx` are new.

Per UI-SPEC §Component Inventory: "Shared between Stage 3 and Stage 4 tabs: row-list, reason-pill, detail-pane shell, action-stack, inline-editor (Reclassify variant only on Stage 4 — no intent-edit), selection-context."

Stage 4 has NO `Replay through Stage 4` button (handler errors aren't replayed via intent-edit; operator either Reclassifies or Closes — Replay-as-retry is deferred). Match UI-SPEC §Action stack lock.

Purpose: Close the third Kanban-trigger lane (handler_error from Plan 04). After this plan + Plan 06, every email leaving Stage 1 either dispatches a registered handler that completes OR lands in Stage 3 (intent triage) OR Stage 4 (handler error) Kanban — never silently disappears.

Output: 6 files. Browser-loadable Stage 4 at `/automations/debtor-email/stage-4`. Checkpoint:human-verify gate.
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
@web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx
@web/app/(dashboard)/automations/[swarm]/stage-3/row-list.tsx
@web/app/(dashboard)/automations/[swarm]/stage-3/detail-pane.tsx
@web/app/(dashboard)/automations/[swarm]/stage-3/action-stack.tsx
@web/app/(dashboard)/automations/[swarm]/stage-3/inline-editor.tsx
@web/app/(dashboard)/automations/[swarm]/stage-3/reason-pill.tsx
@web/app/(dashboard)/automations/[swarm]/stage-3/selection-context.tsx
@web/app/(dashboard)/automations/[swarm]/_shell/page-header.tsx
@web/app/(dashboard)/automations/[swarm]/_shell/stage-tab-strip.tsx
@web/app/(dashboard)/automations/[swarm]/_lib/kanban-loader.ts
@web/lib/swarms/types.ts

<interfaces>
<!-- Stage 4 reuses Plan 06's Stage 3 components. Two options for refactoring shared components: -->
<!--   (a) keep them under stage-3/ and import across (`from '../stage-3/reason-pill'`); -->
<!--   (b) move shared components to a `_components/` directory under [swarm]/. -->
<!-- Pick (a) for v1 — cheaper to move later if Stage 4 diverges; UI-SPEC declares them shared by file path note. -->
<!-- Stage 4 action-stack uses ONLY [Reclassify, Close] — NOT [Replay, Reclassify, Close]. -->
<!--   Implementation: parameterize `stage-3/action-stack.tsx` to accept `actions: ('replay'|'reclassify'|'close')[]` prop; -->
<!--   Stage 3 passes ['replay','reclassify','close']; Stage 4 passes ['reclassify','close']. -->
<!--   This requires a small modification to stage-3/action-stack.tsx — done in Task 1 below. -->

<!-- Filter chip for Stage 4: single chip "Handler errors <count>" (UI-SPEC §Filter chips). -->
<!-- No filtering needed — but render the chip for visual consistency with Stage 3. -->

<!-- Detail pane diff vs Stage 3: -->
<!--   - replace "Stage 3 ranked output" section with "Error detail" section -->
<!--   - error-detail-section.tsx renders result.error_detail in a code/pre block; if empty, renders "No error detail recorded" -->
<!--   - Email body section: same as Stage 3 -->

<!-- IMPORTANT cross-swarm rule: zero literal `'debtor-email'` / `'sales-email'` strings in stage-4/ files. -->

<!-- W3 noise-category field name (verified 2026-05-07 against web/lib/swarms/types.ts:80): -->
<!--   The single canonical field on swarm_noise_categories is `category_key` (string). There is NO `noise_key` field. -->
<!--   Stage 4 page MUST filter via `c.category_key !== "unknown"` exclusively — no `c.noise_key ?? c.category_key` fallback. -->
-->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Refactor stage-3/action-stack.tsx to accept `actions` prop (enables Stage 4 reuse without duplication)</name>
  <files>web/app/(dashboard)/automations/[swarm]/stage-3/action-stack.tsx</files>
  <read_first>
    - web/app/(dashboard)/automations/[swarm]/stage-3/action-stack.tsx (Plan 06 output)
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-UI-SPEC.md §Action stack (action labels + keyboard shortcuts)
  </read_first>
  <behavior>
    - Add `actions?: ReadonlyArray<'replay' | 'reclassify' | 'close'>` prop with default `['replay','reclassify','close']`.
    - Render only the buttons whose key is in the `actions` array, in the order given.
    - Keyboard shortcuts only fire for visible buttons.
    - Stage 3 callers continue to work unchanged (default value covers them).
  </behavior>
  <action>
1. Open `web/app/(dashboard)/automations/[swarm]/stage-3/action-stack.tsx`. Locate the props type/interface.
2. Add the optional prop:
   ```ts
   interface ActionStackProps {
     // ... existing props
     actions?: ReadonlyArray<'replay' | 'reclassify' | 'close'>;
   }
   ```
3. Default to `['replay', 'reclassify', 'close']` if undefined.
4. Wrap each button render and its keyboard handler in a check `if (actions.includes('replay')) { … }` etc.
5. Do NOT change copy/styling — only conditional rendering.
6. Update component doc comment to reflect the new prop.
  </action>
  <verify>
    <automated>cd web && npx tsc --noEmit && grep -c "actions.*replay.*reclassify.*close\|actions:.*ReadonlyArray\|actions?: ReadonlyArray" 'web/app/(dashboard)/automations/[swarm]/stage-3/action-stack.tsx'</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "actions" 'web/app/(dashboard)/automations/[swarm]/stage-3/action-stack.tsx'` ≥ 3 (prop type + default + condition checks)
    - Stage 3 page still renders all three buttons (regression — manual smoke acceptable)
    - `cd web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>action-stack.tsx parameterized; Stage 4 can pass `['reclassify','close']` without duplicating the component.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Build Stage 4 tab — page.tsx + selection-context + row-list + filter-chips + detail-pane + error-detail-section</name>
  <files>
    web/app/(dashboard)/automations/[swarm]/stage-4/page.tsx,
    web/app/(dashboard)/automations/[swarm]/stage-4/selection-context.tsx,
    web/app/(dashboard)/automations/[swarm]/stage-4/row-list.tsx,
    web/app/(dashboard)/automations/[swarm]/stage-4/filter-chips.tsx,
    web/app/(dashboard)/automations/[swarm]/stage-4/detail-pane.tsx,
    web/app/(dashboard)/automations/[swarm]/stage-4/error-detail-section.tsx
  </files>
  <read_first>
    - web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx (mirror)
    - web/app/(dashboard)/automations/[swarm]/stage-3/row-list.tsx (composite Stage3Client — pattern to mirror)
    - web/app/(dashboard)/automations/[swarm]/stage-3/detail-pane.tsx (mirror minus ranked-output section)
    - web/app/(dashboard)/automations/[swarm]/stage-3/selection-context.tsx (verbatim copy)
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-UI-SPEC.md §Component Inventory + §Filter chips + §Detail pane + §Empty states
    - web/app/(dashboard)/automations/[swarm]/_lib/kanban-loader.ts
    - web/lib/swarms/types.ts (W3: confirm `category_key` is the single canonical field on swarm_noise_categories rows. Use `c.category_key !== "unknown"` directly in the page noise filter; do NOT keep the `c.noise_key ?? c.category_key` fallback.)
  </read_first>
  <behavior>
    - stage-4/page.tsx RSC: same shape as stage-3/page.tsx but filters rows to `result.kanban_reason === 'handler_error'`. Passes `currentStage={4}` to StageTabStrip. Loads only `noiseCategories` (no intents needed — Stage 4 has no Replay-edit). Mounts `<Stage4Client>`.
    - stage-4/selection-context.tsx: VERBATIM copy of stage-3/selection-context.tsx (could share via stage-3/, but keeping separate per CONTEXT.md "different row sets, different navigation behavior").
    - stage-4/row-list.tsx (exports Stage4Client): same two-column grid as Stage 3, but with single filter chip and Stage 4 detail pane.
    - stage-4/filter-chips.tsx: renders single `Handler errors <count>` chip per UI-SPEC §Filter chips.
    - stage-4/detail-pane.tsx: subject + meta + ErrorDetailSection + Email body preview + ActionStack (with `actions={['reclassify','close']}` per Task 1's parameterization). Reuses imports from `../stage-3/`.
    - stage-4/error-detail-section.tsx: renders `result.error_detail` in `<pre>` block with `--v7-red` accent (UI-SPEC §Color destructive); shows `result.error_name` as a small heading; if both empty, renders "No error detail recorded" muted.
    - Empty state copy verbatim per UI-SPEC §Empty states: heading `No handler errors`, body `Stage 4 handlers ran cleanly in the visible window.`
  </behavior>
  <action>
1. **stage-4/page.tsx** (RSC mirroring stage-3/page.tsx):
```tsx
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm, loadSwarmNoiseCategories } from "@/lib/swarms/registry";
import { loadKanbanRows } from "../_lib/kanban-loader";
import { PageHeader } from "../_shell/page-header";
import { StageTabStrip } from "../_shell/stage-tab-strip";
import { AutomationRealtimeProvider } from "@/components/automations/automation-realtime-provider";
import { SelectionProvider } from "./selection-context";
import { Stage4Client } from "./row-list";

export const dynamic = "force-dynamic";

export default async function Stage4Page({ params }: { params: Promise<{ swarm: string }> }) {
  const { swarm: swarmType } = await params;
  const admin = createAdminClient();
  const swarm = await loadSwarm(admin, swarmType);
  if (!swarm) notFound();

  const [allRows, noiseCategories] = await Promise.all([
    loadKanbanRows(admin, swarmType),
    loadSwarmNoiseCategories(admin, swarmType),
  ]);
  const stage4Rows = allRows.filter((r) => r.result.kanban_reason === "handler_error");
  const stage3Count = allRows.filter((r) =>
    r.result.kanban_reason === "no_handler" || r.result.kanban_reason === "low_confidence"
  ).length;

  return (
    <>
      <PageHeader swarm={swarm} />
      <StageTabStrip
        swarm={swarm}
        currentStage={4}
        counts={{ 3: stage3Count, 4: stage4Rows.length }}
      />
      <AutomationRealtimeProvider automations={[`${swarmType}-kanban`]} initialLimit={500}>
        <SelectionProvider rowIds={stage4Rows.map((r) => r.id)}>
          <Stage4Client
            swarmType={swarmType}
            rows={stage4Rows}
            noiseCategories={noiseCategories.filter((c) => c.category_key !== "unknown")}
          />
        </SelectionProvider>
      </AutomationRealtimeProvider>
    </>
  );
}
```

W3 fix: the dropdown filter MUST use `c.category_key !== "unknown"` (single canonical field per `web/lib/swarms/types.ts`). Do NOT keep the `c.noise_key ?? c.category_key` fallback that shipped in the Plan 05 scaffold — `noise_key` is not a real field on the union.

2. **selection-context.tsx**: verbatim copy of stage-3/selection-context.tsx. Adjust only relative imports if needed.

3. **row-list.tsx (Stage4Client)**: mirror Stage3Client shape from stage-3/row-list.tsx. Two-column `[1fr 460px]` grid. Left: `<Stage4FilterChips />` + scrollable list of rows (each row: subject + topic-as-mono-pill + reason-pill `handler_error` + timestamp). Right: `<Stage4DetailPane />`. Empty state per UI-SPEC.

4. **filter-chips.tsx**: single chip per UI-SPEC. Active by default (only chip).
```tsx
"use client";
export function Stage4FilterChips({ count }: { count: number }) {
  return (
    <div className="chip-strip" style={{
      display: "flex",
      gap: "var(--space-2)",
      padding: "var(--space-3) var(--space-5)",
    }}>
      <button className="chip is-active" style={{
        fontSize: "13px",
        padding: "var(--space-1) var(--space-3)",
        background: "var(--v7-brand-primary-soft)",
        color: "var(--v7-brand-primary)",
        border: "1px solid var(--v7-brand-primary)",
        borderRadius: "var(--space-1)",
      }}>Handler errors <span style={{ fontFamily: "var(--font-mono)", marginLeft: "var(--space-1)" }}>{count}</span></button>
    </div>
  );
}
```

5. **detail-pane.tsx**: import `ReasonPill` from `../stage-3/reason-pill`, `ActionStack` from `../stage-3/action-stack`, `InlineEditor` from `../stage-3/inline-editor`, plus the new local `ErrorDetailSection`. Lay out: subject + meta + ErrorDetailSection + Email body preview + ActionStack with `actions={['reclassify','close']}`.

6. **error-detail-section.tsx**:
```tsx
import type { KanbanRow } from "../_lib/kanban-loader";

export function ErrorDetailSection({ row }: { row: KanbanRow }) {
  const detail = row.result.error_detail;
  const name = row.result.error_name;
  if (!detail && !name) {
    return (
      <section style={{ padding: "var(--space-3) var(--space-4)" }}>
        <div style={{
          fontSize: "11px", fontWeight: 500, letterSpacing: "0.05em",
          textTransform: "uppercase", color: "var(--v7-text-muted)",
          marginBottom: "var(--space-2)",
        }}>Error detail</div>
        <div style={{ fontSize: "13px", color: "var(--v7-text-muted)" }}>No error detail recorded</div>
      </section>
    );
  }
  return (
    <section style={{ padding: "var(--space-3) var(--space-4)" }}>
      <div style={{
        fontSize: "11px", fontWeight: 500, letterSpacing: "0.05em",
        textTransform: "uppercase", color: "var(--v7-text-muted)",
        marginBottom: "var(--space-2)",
      }}>Error detail</div>
      {name ? (
        <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--v7-red)", marginBottom: "var(--space-1)" }}>{name}</div>
      ) : null}
      {detail ? (
        <pre style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          color: "var(--v7-red)",
          background: "var(--v7-red-soft)",
          padding: "var(--space-2) var(--space-3)",
          borderRadius: "var(--space-1)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          margin: 0,
        }}>{detail}</pre>
      ) : null}
    </section>
  );
}
```

NO test scaffold required for this plan beyond what Plan 01 provided — components are visual + already-tested Server Actions.

**Cross-swarm rule:** zero literal `'debtor-email'` / `'sales-email'` strings.
**W3 single-field rule:** zero `c.noise_key ?? c.category_key` / `c.noise_key || c.category_key` fallbacks anywhere in `stage-4/` files.
  </action>
  <verify>
    <automated>cd web && npx tsc --noEmit && for f in page selection-context row-list filter-chips detail-pane error-detail-section; do test -f "web/app/(dashboard)/automations/[swarm]/stage-4/$f.tsx" || echo "MISSING $f"; done && grep -E "['\"](debtor-email|sales-email)['\"]" 'web/app/(dashboard)/automations/[swarm]/stage-4/'*.tsx ; echo "exit=$?"</automated>
  </verify>
  <acceptance_criteria>
    - 6 files exist
    - `grep -c "handler_error" 'web/app/(dashboard)/automations/[swarm]/stage-4/page.tsx'` ≥ 1
    - `grep -c "actions={\\[.*reclassify.*close.*\\]}\|actions=\\['reclassify','close'\\]" 'web/app/(dashboard)/automations/[swarm]/stage-4/detail-pane.tsx'` ≥ 1 (Stage 4 omits Replay)
    - `grep -c "Handler errors" 'web/app/(dashboard)/automations/[swarm]/stage-4/filter-chips.tsx'` ≥ 1 (UI-SPEC verbatim)
    - `grep -c "No handler errors" 'web/app/(dashboard)/automations/[swarm]/stage-4/'*.tsx` ≥ 1 (empty state copy)
    - Cross-swarm grep on stage-4/ returns ZERO literal swarm-name matches
    - **W3 single-field gate (Stage 4):** `grep -nE 'noise_key\\s*\\?\\?\\s*category_key|noise_key\\s*\\|\\|\\s*category_key' 'web/app/(dashboard)/automations/[swarm]/stage-4/'*.tsx` returns ZERO matches (executor must pick `category_key` exclusively — single field per types.ts)
    - **W3 canonical field present:** `grep -nE 'c\\.category_key' 'web/app/(dashboard)/automations/[swarm]/stage-4/page.tsx'` ≥ 1
    - `cd web && npx tsc --noEmit` exits 0
    - `cd web && npx next build 2>&1 | tail -20` does NOT report errors for `[swarm]/stage-4`
  </acceptance_criteria>
  <done>Stage 4 tab built; reuses Stage 3 components; UI-SPEC contract enforced; cross-swarm clean; W3 single-field gate passes (no `noise_key ?? category_key` fallback in stage-4 files).</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Human-verify Stage 4 surface end-to-end</name>
  <what-built>Stage 4 handler-error queue at /automations/[swarm]/stage-4 with single filter chip, error_detail section in detail pane, and Reclassify+Close actions only.</what-built>
  <how-to-verify>
    1. `cd web && npm run dev` (if not already running from Plan 06)
    2. Visit `http://localhost:3000/automations/debtor-email/stage-4`
       - Expected: page header + tab strip same as Stage 3; Stage 4 tab is active.
       - Expected: single chip `Handler errors <count>`; if zero rows → empty state `No handler errors` heading + body copy verbatim per UI-SPEC.
    3. End-to-end smoke (optional but recommended):
       - Manually trigger a handler failure: insert a fake event via Supabase or run a test that throws inside `classifier-invoice-copy-handler`. Or directly insert a Kanban row:
         ```sql
         INSERT INTO public.automation_runs (automation, swarm_type, status, topic, result, triggered_by)
         VALUES ('debtor-email-kanban', 'debtor-email', 'pending', 'invoice_copy_request',
           '{"kanban_reason":"handler_error","intent":"invoice_copy_request","email_id":"test-em-2","error_detail":"Orq.ai timeout after 30s","error_name":"OrqTimeoutError"}'::jsonb,
           'manual-test-stage4');
         ```
       - Expected: row appears within ~2s; chip count updates; clicking the row populates detail pane with red `Error detail` section showing `OrqTimeoutError` heading and the error message in a red mono pre block.
    4. Action smoke:
       - Detail pane shows ONLY two buttons: `↶ Reclassify as noise` + `✕ Close (manual)`. NO Replay button.
       - Click `✕ Close (manual)` → row disappears optimistically; SQL `SELECT status FROM automation_runs WHERE topic='invoice_copy_request' AND triggered_by='manual-test-stage4'` returns `completed`.
       - For Reclassify: insert another row → click `↶ Reclassify as noise` → inline editor opens → pick `auto_reply` → Confirm → row closes.
    5. Visual checks (UI-SPEC):
       - Error detail section uses `--v7-red` text on `--v7-red-soft` background.
       - Reason pill on row shows "handler_error" in red.
       - Tab badge counts on Stage 3 (intent) and Stage 4 (handler) reflect actual row counts independently.
  </how-to-verify>
  <resume-signal>
    Type "approved" when Stage 4 page renders correctly, error_detail section displays, both visible actions work end-to-end, and tab counts are accurate. Otherwise paste the screenshot or behavior so the planner can revise.
  </resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Operator browser → /automations/[swarm]/stage-4 | Untrusted [swarm] segment — `loadSwarm` validates |
| Stage 4 client → Server Actions | Already validated in Plan 05; this plan invokes them |
| result.error_detail rendered to operator | Server-controlled string; no operator-injection vector |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-76-07-01 | S (Spoofing) | [swarm] route segment | mitigate | `loadSwarm` validates per Plan 06 pattern |
| T-76-07-02 | I (Information disclosure) | result.error_detail may include stack frames or downstream payloads | accept | Service-role-only access; Phase 79 may add redaction; v1 is acceptable per CONTEXT.md "Pull-only" |
| T-76-07-03 | T (Tampering) | error-detail-section renders pre-block | mitigate | React auto-escapes; the `<pre>` content is text-only, no HTML interpolation |
| T-76-07-04 | E (Elevation of privilege / IDOR) | Operator views handler-errors from another mailbox | accept-for-now | Same as T-76-06-05; Phase 999.2 |
| T-76-07-05 | T (Tampering) | Reused Stage 3 inline-editor + action-stack | inherit | All security mitigations from Plan 05 + 06 carry over (registry validation, compound IDOR filters) |
</threat_model>

<verification>
- 6 files exist; action-stack parameterized for Stage 4 reuse.
- Stage 4 page does NOT render Replay button.
- Empty state + error-detail copy verbatim per UI-SPEC.
- Cross-swarm grep zero matches.
- W3 single-field gate: stage-4/page.tsx uses `c.category_key !== "unknown"` exclusively; zero `noise_key ?? category_key` matches anywhere in stage-4/.
- `cd web && npx tsc --noEmit` and `npx next build` clean.
- Human-verify checkpoint approved.
</verification>

<success_criteria>
- Operator can view handler-error rows at /automations/debtor-email/stage-4 and act via Reclassify or Close.
- Stage 3 components reused without duplication (action-stack parameterized).
- Stage 4 tab badge count accurate; chip count accurate; empty state correct.
- W3 single-field rule enforced across stage-4 files.
</success_criteria>

<output>
After completion, create `.planning/phases/76-stage-3-kanban-human-lane-wiring/76-07-SUMMARY.md` documenting:
- Diff in stage-3/action-stack.tsx (new `actions` prop)
- 6 stage-4/ files with line counts
- Cross-swarm grep evidence
- W3 gate evidence (zero `noise_key ?? category_key` fallbacks; canonical `category_key` filter present)
- Screenshot or notes from human-verify checkpoint
</output>
