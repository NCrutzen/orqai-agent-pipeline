# Phase 71: Bulk Review 4-axis redesign + capability/regression eval split — Pattern Map

**Mapped:** 2026-05-05
**Files analyzed:** 23 (5 backend NEW + 4 backend EXTEND + 12 UI NEW + 2 UI EXTEND + 4 test NEW/EXTEND + 1 SQL NEW + 1 helper NEW)
**Analogs found:** 23 / 23 (every file has a strong same-role + same-data-flow analog already in the repo)

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/20260507a_pipeline_events_email_summary.sql` | DB migration (VIEW + INDEX + GRANT) | read-side aggregation | `supabase/migrations/20260430f_automation_runs_outlier_view.sql` | role + flow exact (read-side aggregate object on top of an authoritative table; GRANT pattern identical) |
| `web/lib/pipeline-events/types.ts` (EXTEND) | TS type module | compile-time contract | self (Phase 70 file already shipped) | exact — extension only |
| `web/lib/inngest/functions/debtor-email-override-handler.ts` (NEW) | Inngest fan-out function | event-driven, multi-step | `web/lib/inngest/functions/classifier-verdict-worker.ts` | exact — same shape (createFunction + retries:0 + step.run per branch + cast-through-unknown for dynamic event names) |
| `web/lib/inngest/functions/classifier-verdict-worker.ts` (EXTEND) | Inngest function | request-response (axis-1 emit injection) | self | exact — surgical add of `emitPipelineEvent` call before the existing `flip-to-pending` step |
| `web/lib/inngest/functions/classifier-label-resolver.ts` (EXTEND) | Inngest function | axis-2 customer-correction handler | self | exact — already imports `emitPipelineEvent` + `numericConfidence`; adds override emit + `coordinator_runs.update` step |
| `web/lib/inngest/functions/debtor-email-coordinator.ts` (EXTEND) | Inngest function | axis-3 re-dispatch path | `classifier-verdict-worker.ts` swarm_dispatch branch (lines 179–207) | role exact — re-emits handler events through the same `inngest.send as unknown as SendFn` pattern |
| `web/lib/inngest/functions/classifier-invoice-copy-handler.ts` (EXTEND) | Inngest function | axis-4 emit-only quality rating | self | exact — already imports `emitPipelineEvent`; new path is emit-only with `decision='draft_quality_rated'` |
| `web/app/api/automations/debtor-email/override/route.ts` (NEW) | Next.js POST route | request → Inngest event | `web/app/api/automations/debtor-email/ingest/route.ts` | role exact (different auth model: ingest uses header secret; override uses `auth.getUser()` server session per D-13) |
| `web/app/(dashboard)/automations/[swarm]/review/page.tsx` (EXTEND) | RSC data loader | DB → page props (read view swap) | self (Phase 70-06 already rewired sub-queries 2 + 6) | exact — D-10 swap of sub-query (2) source from `pipeline_events` → `pipeline_events_email_summary` |
| `web/app/(dashboard)/automations/[swarm]/review/row-list.tsx` (EXTEND) | Client Component | render predicted-row list | self | exact — adds recipient column + 4 stage cells per row |
| `web/app/(dashboard)/automations/[swarm]/review/detail-pane.tsx` (EXTEND) | Client Component | per-email override drill-in | self | exact — replace existing single-stage Select with `PipelineFlow` (N-stage) + 4 widgets + eval-radio |
| `web/app/(dashboard)/automations/[swarm]/review/recipient-chip-strip.tsx` (NEW) | Client Component (URL-driven filter) | client → URL params | (sibling) `web/app/(dashboard)/automations/[swarm]/review/queue-tree.tsx` | role match (URL-param mutation pattern) |
| `…/review/components/predicted-row.tsx` (NEW) | Client Component | render single row | `…/review/row-strip.tsx` | role exact (single-row presentational) |
| `…/review/components/pipeline-flow.tsx` (NEW) | Client Component | render N-stage data-driven timeline | (no exact analog; closest: `safety-detail-pane.tsx`) | partial — same surface (detail-pane child component) but new pattern (N-step data-array render) |
| `…/review/components/stage-step.tsx` (NEW) | Client Component | one node + control area | (no exact analog) | new — leaf component for `pipeline-flow.tsx` |
| `…/review/components/stage-1-widget.tsx` (NEW) | Client Component (Select) | category dropdown from registry | `detail-pane.tsx` lines 24–32 (existing Select usage) | exact — same shadcn `Select` primitive + `loadSwarmCategories` source |
| `…/review/components/stage-2-widget.tsx` (NEW) | Client Component (Combobox + Switch) | customer typeahead + re-run toggle | `web/components/ui/command.tsx` (Combobox primitive already initialised) + sibling Select usage | partial — Combobox is established primitive; Switch primitive does NOT yet exist in `web/components/ui/` (planner Wave 0: add `switch.tsx` shadcn or fall back to checkbox-styled button). |
| `…/review/components/stage-3-widget.tsx` (NEW) | Client Component (Select) | handler dropdown from `swarm_intents` | same as stage-1-widget | exact |
| `…/review/components/stage-4-widget.tsx` (NEW) | Client Component (button group + Textarea) | 1–5 quality + reason | `detail-pane.tsx` Textarea usage (line 32) | role match |
| `…/review/components/eval-type-radio.tsx` (NEW) | Client Component (RadioGroup) | capability/regression toggle | `web/components/ui/dropdown-menu.tsx` `RadioGroup` primitive (Radix) | partial — Radix primitive exists; needs new shadcn `radio-group.tsx` wrapper file OR a hand-rolled card-shaped group. Planner picks. |
| `…/review/components/override-confirm-dialog.tsx` (NEW) | Client Component (Dialog) | confirmation modal | `web/components/ui/dialog.tsx` (existing); usage analog — there is no current Dialog usage in the review surface; planner can grep `Dialog` across `web/app/(dashboard)/` for an analog | partial — primitive ready, no in-surface analog usage |
| `…/review/components/icontroller-info-banner.tsx` (NEW) | Client Component (info banner) | post-submit one-shot banner | `web/app/(dashboard)/automations/[swarm]/review/race-cohort-banner.tsx` | role exact (in-surface banner with V7 token chrome) |
| `…/review/keyboard-shortcuts.tsx` (EXTEND) | Client Component | window keydown → CustomEvents | self | exact — adds `1/2/3/4/c/g/⌘⏎/Esc` bindings to existing handler + Cheatsheet |
| `web/lib/swarms/brand-color.ts` (NEW) | Utility (helper) | static map registry-code → CSS-var | `web/lib/swarms/brand-register.ts` | role match (registry consumer; pure-TS helper) |
| `web/app/(dashboard)/automations/[swarm]/review/__tests__/load-page-data.test.ts` (EXTEND) | vitest unit | mock chainable admin client | self | exact |
| `web/lib/inngest/functions/__tests__/debtor-email-override-handler.test.ts` (NEW) | vitest unit/integration | Inngest handler under stepStub | `web/lib/inngest/functions/__tests__/classifier-verdict-worker.test.ts` | exact — same mock harness + `stepStub.run = (_name, fn) => fn()` shortcut |
| `web/app/api/automations/debtor-email/override/__tests__/route.test.ts` (NEW) | vitest unit | NextRequest → handler | `web/app/api/automations/debtor-email/ingest/__tests__/route.test.ts` | exact — same `NextRequest` + chainable Supabase mock pattern |
| `web/lib/pipeline-events/__tests__/email-summary.test.ts` (NEW) | vitest DB-shape test | view assertions | (no analog — first per-view test in repo) | partial — falls back to integration-style mock of admin client returning view rows |

---

## Pattern Assignments

### `supabase/migrations/20260507a_pipeline_events_email_summary.sql` (DB migration, VIEW + GRANT)

**Analog:** `supabase/migrations/20260430f_automation_runs_outlier_view.sql` (read-side derived object on top of an authoritative table; CREATE OR REPLACE + GRANT pattern). Authoritative table schema reference: `supabase/migrations/20260506a_pipeline_events.sql`.

**Header / rationale block pattern** (`20260430f` lines 1–14):
```sql
-- Phase 64 BUDG-03 / D-17: 7-day rolling median for per-email cost outlier flag.
--
-- Bootstrap guard (Pitfall 6): is_cost_outlier=false when window has <100
-- samples. ...
-- Read-time pure SQL function: cheap to call from the loader on every page
-- render. No materialised view needed at this volume ...
```
Phase 71 should mirror this header style: cite `71-CONTEXT D-09`, justify VIEW (not table), document the `security_invoker=true` decision (Pitfall 4 from RESEARCH).

**Index + GRANT pattern** (also `20260506a_pipeline_events.sql` lines 42–47, 75–76):
```sql
CREATE INDEX IF NOT EXISTS pipeline_events_email_id_idx
  ON public.pipeline_events (email_id);
CREATE INDEX IF NOT EXISTS pipeline_events_swarm_stage_created_idx
  ON public.pipeline_events (swarm_type, stage, created_at DESC);
...
GRANT SELECT ON public.pipeline_events TO authenticated;
GRANT ALL    ON public.pipeline_events TO service_role;
```
Phase 71 ships index `pipeline_events_email_stage_created_idx ON (email_id, stage, created_at DESC)` per CONTEXT D-09, and `GRANT SELECT … TO authenticated, service_role` on the view per RESEARCH §Pattern 2.

**View body** — RESEARCH §Pattern 2 already provides the canonical SQL; planner copies verbatim with the `WITH (security_invoker=true)` clause (Pitfall 4).

---

### `web/lib/pipeline-events/types.ts` (EXTEND)

**Analog:** self. Phase 70 already shipped `PipelineEventInput` with `override?: Record<string, unknown> | null` and `eval_type?: "capability" | "regression" | null` (lines 51–52).

**Pattern:** add the `OverrideAxis` literal-union and `OverrideJson` interface alongside the existing `Stage` const + `numericConfidence` helper. Source the shape verbatim from CONTEXT D-01 / RESEARCH "Override jsonb shape (locked, D-01)".

```typescript
// EXTEND — append after numericConfidence (line 86)
export type OverrideAxis =
  | "stage_1_category"
  | "stage_2_customer"
  | "stage_3_intent"
  | "stage_4_handler_output";

export interface OverrideJson {
  axis: OverrideAxis;
  original_decision: string;
  original_event_id: string;       // uuid
  operator_id: string;              // uuid (auth.uid())
  reason: string | null;            // ≤1000 chars
  submitted_at: string;             // ISO timestamptz
}

// Tighten the existing PipelineEventInput.override type (still backward compat
// because `OverrideJson` is structurally a `Record<string, unknown>`):
//   override?: OverrideJson | null;
```

Comment style: follow lines 1–10 (Phase 70 banner), 27–43 (field-level notes) of the existing file.

---

### `web/lib/inngest/functions/debtor-email-override-handler.ts` (NEW)

**Analog:** `web/lib/inngest/functions/classifier-verdict-worker.ts` — same `inngest.createFunction({id, retries: 0}, {event}, async ({event, step}) => {…})` shape with a switch over a registry-resolved string and `step.run` per branch.

**Imports pattern** (verdict-worker lines 19–24):
```typescript
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitPipelineEvent } from "@/lib/pipeline-events/emit";
import { loadSwarmIntents } from "@/lib/swarms/registry";
import type { OverrideAxis, OverrideJson } from "@/lib/pipeline-events/types";
```

**SendFn cast pattern** (label-resolver line 34, verdict-worker lines 162–173 + 192–204):
```typescript
type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;
// usage:
await (inngest.send as unknown as SendFn)({ name: intent.handler_event, data: {...} });
```
Required because `inngest.send` is typed against the static EventSchemas map and refuses runtime-resolved event names (CLAUDE.md Phase 65 binding rule + CLAUDE.md "NOOIT inngest.send destructureren"). Do NOT `const send = inngest.send` — use either `(inngest.send as unknown as SendFn)({…})` inline or `inngest.send.bind(inngest)({…})`.

**Function shell + step.run discipline** (verdict-worker lines 26–67 — exhaustive flip-to-pending pattern):
```typescript
export const classifierVerdictWorker = inngest.createFunction(
  { id: "classifier/verdict-worker", retries: 0 },
  { event: "classifier/verdict.recorded" },
  async ({ event, step }) => {
    const { /* destructure event.data */ } = event.data;
    const admin = createAdminClient();

    if (decision === "reject") {
      await step.run("mark-complete-reject", async () => {
        await admin.from("automation_runs").update({...}).eq("id", automation_run_id);
        // ...
      });
      return { ok: true, decision };
    }

    // --- Approve path: registry-driven dispatch ---
    await step.run("flip-to-pending", async () => {/* ... */});

    const categories = await step.run("load-categories", () =>
      loadSwarmCategories(admin, swarm_type),
    );
    // ...
    try {
      switch (category.action) {
        case "categorize_archive": { /* step.run("categorize", ...) */ break; }
        case "swarm_dispatch": {
          await step.run("dispatch", async () => {
            await (inngest.send as unknown as SendFn)({
              name: category.swarm_dispatch!,
              data: { /* ... */ },
            });
          });
          break;
        }
        default: {
          const _exhaustive: never = category.action;
          throw new Error(`unhandled action: ${_exhaustive as string}`);
        }
      }
      // ...
    } catch (err) { /* mark-failed step */ }
  },
);
```

**Phase 71 override-handler shape** (RESEARCH §Pattern 1 — copy verbatim):
- Event: `"debtor-email/override.submitted"`
- `step.run("axis-${axis}-emit", …)` calls `emitPipelineEvent(admin, {...})` with `override: {…OverrideJson}`, `eval_type`, `triggered_by: "operator-override"`, `decision = corrected value`.
- `submitted_at = new Date().toISOString()` MUST be inside the same `step.run` (RESEARCH §Pitfall 2 / CLAUDE.md Phase 65 dae6276 lesson — replay-unsafe id generation).
- Switch on `event.data.axis` with one `step.run` per branch:
  - `stage_1_category`: re-dispatch existing `classifier/verdict.recorded` (the verdict-worker handles the reroute side-effects per D-04 — additive wrap).
  - `stage_2_customer`: `step.run("axis-2-update-coordinator", …)` UPDATEs `coordinator_runs.customer_account_id`; conditional `step.run("axis-2-replay-stage-3-4", …)` sends `debtor-email/coordinator-complete` event when `re_run_downstream=true`.
  - `stage_3_intent`: load handler from `loadSwarmIntents(admin, "debtor-email")`, send `intent.handler_event`.
  - `stage_4_handler_output`: emit-only — no side-effect.

**Exhaustive switch guard** (verdict-worker lines 208–213): always include the `default: const _exhaustive: never = … ; throw …` so a future axis add fails tsc.

**Error handling** (verdict-worker lines 228–242): wrap the `try/catch` around the side-effect switch; emit override row OUTSIDE the try (it must always succeed first, then side-effects); on failure log via `step.run("mark-failed-…")`.

---

### `web/lib/inngest/functions/classifier-verdict-worker.ts` (EXTEND, axis-1 emit injection)

**Pattern:** add an `emitPipelineEvent(admin, {...override...})` call in a NEW `step.run("axis-1-override-emit", …)` BEFORE the existing `step.run("flip-to-pending", …)` (line 61). Engaged when `event.data.triggered_by === "operator-override"` (a marker the override-handler stamps when re-dispatching `classifier/verdict.recorded`).

**Reference:** existing emit site in `classifier-invoice-copy-handler.ts` line 43 already imports `emitPipelineEvent` — copy its import line. Reference Pitfall 5 in RESEARCH (Stage 1 race vs verdict-worker — emit override row FIRST, then enter `flip-to-pending`).

---

### `web/lib/inngest/functions/classifier-label-resolver.ts` (EXTEND, axis-2 customer correction)

**Already imports** (lines 17–18):
```typescript
import { emitPipelineEvent } from "@/lib/pipeline-events/emit";
import { numericConfidence } from "@/lib/pipeline-events/types";
```

**Pattern:** the override-handler (`debtor-email-override-handler.ts`) is the primary owner of axis-2 (per D-12 fan-out). Label-resolver only needs to be touched if Stage 2's downstream label-resolution path needs awareness of the override marker — RESEARCH does not require an emit injection here in v1. Planner: confirm during Wave 0 that label-resolver stays untouched in Phase 71. If touched: mirror the import-already-in-place + `emitPipelineEvent` inside an existing `step.run` (the `step.run` boundary in this file at line 52 is the canonical replay-safe boundary).

---

### `web/lib/inngest/functions/debtor-email-coordinator.ts` (EXTEND, axis-3 re-dispatch)

**Pattern:** axis-3 is owned by the override-handler's `axis-3-dispatch-handler` step (RESEARCH §Pattern 1). The coordinator file gets touched ONLY if a re-dispatched handler event needs special treatment vs first-pass. Planner: confirm Wave 0 the coordinator file stays untouched. Reference SendFn cast pattern from label-resolver line 34 / verdict-worker lines 162–173 if any new dispatch is added.

---

### `web/lib/inngest/functions/classifier-invoice-copy-handler.ts` (EXTEND, axis-4 emit-only hook)

**Already imports `emitPipelineEvent`** (line 43).

**Pattern:** axis-4 is fully owned by the override-handler's emit-only branch (no side-effect; no re-run; no iController draft mutation per D-15). The invoice-copy handler does NOT need an extension in Phase 71 — the emit happens upstream. Planner: confirm Wave 0; if any draft-quality field needs to flow into a later handler call, mirror the emit-helper-inside-step.run pattern from line 43 of this file.

---

### `web/app/api/automations/debtor-email/override/route.ts` (NEW)

**Analog:** `web/app/api/automations/debtor-email/ingest/route.ts` (same dir; Next.js POST route + admin client + `inngest.send`).

**Imports + module flags** (ingest lines 1–12):
```typescript
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
```

**Phase 71 differences (D-13 server-side auth — NOT the ingest's header secret):**
```typescript
import { createClient } from "@/lib/supabase/server"; // user-scoped session client
import { z } from "zod";
import type { OverrideAxis } from "@/lib/pipeline-events/types";

const OverridePayload = z.object({
  axis: z.enum(["stage_1_category","stage_2_customer","stage_3_intent","stage_4_handler_output"]),
  email_id: z.string().uuid(),
  original_event_id: z.string().uuid(),
  original_decision: z.string(),
  decision: z.string(),
  decision_details: z.record(z.unknown()).optional(),
  eval_type: z.enum(["capability","regression"]),
  reason: z.string().max(1000).optional(),
  re_run_downstream: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = OverridePayload.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  // D-13: operator_id is server-stamped, NEVER from payload
  await inngest.send.bind(inngest)({
    name: "debtor-email/override.submitted",
    data: { ...parsed.data, operator_id: user.id },
  });
  return NextResponse.json({ ok: true });
}
```

**Server-session reference:** `web/lib/supabase/server.ts` (the entire file is the canonical pattern — `createServerClient` + `cookies()`; route signs `auth.getUser()` against the cookie session).

**Anti-pattern:** do NOT use `createAdminClient()` for the auth check — admin bypasses RLS. Use it ONLY for the (none-needed) server-side write path; in this route, the route does NO direct DB write (D-11), only `inngest.send`.

---

### `web/app/(dashboard)/automations/[swarm]/review/page.tsx` (EXTEND, D-10 view swap)

**Pattern:** the existing loader at lines 259–268 reads:
```typescript
const listQuery = admin
  .from("pipeline_events")
  .select("id, created_at, swarm_type, stage, email_id, decision, confidence, decision_details, automation_run_id, agent_run_id")
  .eq("swarm_type", swarmType)
  .eq("stage", 1)
  .order("created_at", { ascending: false })
  .limit(100);
```

**Phase 71 swap (CONTEXT D-10):** the predicted-row feed (sub-query 2 only — NOT sub-query 6) reads from `pipeline_events_email_summary`:
```typescript
const listQuery = admin
  .from("pipeline_events_email_summary")
  .select("email_id, swarm_type, stage_1_decision, stage_2_decision, stage_3_decision, stage_4_decision, stage_1_overridden, stage_2_overridden, stage_3_overridden, stage_4_overridden, total_cost_cents, tool_call_count, first_event_at, last_event_at")
  .eq("swarm_type", swarmType)
  .order("last_event_at", { ascending: false })
  .limit(100);
```

The `mapEventToPredictedRow` mapper (lines 191–210) is replaced/extended with `mapSummaryToPredictedRow` that produces a row whose `result` carries the per-stage decisions for the row-list rendering. The selected-row branch (sub-query 6, around lines 277+) STAYS on raw `pipeline_events` (per-stage timeline).

**Filter pattern:** existing `decision_details->>topic`/`entity`/`mailbox_id` filters on lines 272–280 must move to the per-row view filter — either denormalised into the view (planner picks) or applied via a JOIN-back to raw `pipeline_events`.

---

### `web/app/(dashboard)/automations/[swarm]/review/row-list.tsx` (EXTEND)

**Pattern:** existing component (lines 1–80) renders `<Link>`-wrapped rows via `RowStrip`. Phase 71 adds a recipient column + 4 stage cells per row. Reuse `useSelection` hook (line 52). Add new sub-component `PredictedRow` (NEW file `components/predicted-row.tsx`) — its presentational shape mirrors `row-strip.tsx`.

**Recipient brand-dot binding pattern** — call `brandColorToken(swarm.entity_brand)` from the new helper. The helper signature matches `web/lib/swarms/brand-register.ts` (registry-driven map, no hash-derived palette per UI-SPEC).

---

### `web/app/(dashboard)/automations/[swarm]/review/detail-pane.tsx` (EXTEND)

**Pattern:** existing imports (lines 14–37) include `Select`, `Textarea`, `Button`, `useSelection`, `recordVerdict`. Phase 71 adds:
1. `PipelineFlow` (N-stage data array) replaces the single-stage Select drill-in.
2. `Stage1Widget` / `Stage2Widget` / `Stage3Widget` / `Stage4Widget` mounted under each "dirty" stage step.
3. `EvalTypeRadio` + submit/discard bar at the bottom.
4. Confirmation dialog (UI-SPEC § confirmation modal trigger conditions).

**Server-action invocation pattern** (existing `recordVerdict` at line 33) — Phase 71 adds a `submitOverride()` server action that POSTs to `/api/automations/debtor-email/override` (or just `fetch()` to it; planner picks). Reuse `toast` from `sonner` (line 23) for success/error feedback per UI-SPEC.

**Body cache pattern** (lines 40–66): keep verbatim — Phase 71 reuses `prefetchReviewEmailBody` for opening the email body in the new layout.

---

### `web/app/(dashboard)/automations/[swarm]/review/recipient-chip-strip.tsx` (NEW)

**Analog:** `web/app/(dashboard)/automations/[swarm]/review/queue-tree.tsx` (URL-param-driven filter sibling).

**Pattern:** UI-SPEC § "Recipient chip strip behaviour" locks the contract: clicking a chip mutates `?inbox=…`. Use `next/navigation`'s `useRouter` + `useSearchParams` (matches `selection-context.tsx` URL plumbing). ARIA: `role="tablist"` per chip, with `aria-selected` on active.

---

### `…/review/components/predicted-row.tsx` (NEW)

**Analog:** `web/app/(dashboard)/automations/[swarm]/review/row-strip.tsx` (single-row presentational, sibling).

**Pattern:** plain function component receiving a `SummaryRow` shape; no internal state. Render: recipient column (dot + email), from/subject mono, 4 stage cells (each shows `↻` glyph in `--override` amber when `stage_N_overridden=true`, or stage decision in `--v7-fs-sm` mono), cost + cap/reg pill column. Locked grid `200px 280px 1fr 84px 70px` per UI-SPEC § Page structure.

---

### `…/review/components/pipeline-flow.tsx` + `stage-step.tsx` (NEW)

**Analog:** none exact in repo. Pattern is data-driven: parent receives `Stage[]` array, maps each to a `<StageStep>`. Connecting line is a CSS pseudo-element (`::before` 2px wide, `--v7-line` colour, 15px from left), per UI-SPEC.

**Pattern source:** UI-SPEC § "Detail-pane vertical pipeline (N-stage)" gives the full contract. ARIA: `<ol>` with `<li>` per step; node circle `aria-hidden="true"`; visually-hidden status span per step.

---

### `…/review/components/stage-1-widget.tsx` (NEW, category Select)

**Analog:** existing `detail-pane.tsx` Select usage (line 24–32 imports + later usage in the file). Phase 71 component is a thin wrapper over `<Select>` + `<SelectItem>` populated from `loadSwarmCategories(admin, "debtor-email")` server-side and passed down as a prop. Plus synthetic top-of-list options `noise` and `archive` per UI-SPEC § per-stage table (S1).

**Source pattern** (existing detail-pane Select usage):
```typescript
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
```
Same primitive usage for stage-3-widget (handler from `swarm_intents`).

---

### `…/review/components/stage-2-widget.tsx` (NEW, customer combobox + Switch)

**Analog (combobox):** `web/components/ui/command.tsx` (Radix Command primitive — already in repo).
**Switch primitive:** does NOT exist at `web/components/ui/`. Wave 0: planner picks (a) `npx shadcn add switch` to vendor it, OR (b) hand-roll a button-styled toggle (no native `<Switch>`). UI-SPEC names `Switch`; (a) is the lower-friction path.

**Customer search source (RESEARCH Open Q1):** UI-SPEC says `email_pipeline.customer_index` but no such table exists. Wave 0 spike: confirm OR fall back to `coordinator_runs DISTINCT customer_account_id, customer_name`. Planner locks the source.

---

### `…/review/components/stage-3-widget.tsx` (NEW, handler Select)

**Analog:** stage-1-widget pattern + `loadSwarmIntents(admin, "debtor-email")` from `web/lib/swarms/registry.ts:80`. Display `intent_key` + tooltip showing `handler_agent_key` (UI-SPEC).

---

### `…/review/components/stage-4-widget.tsx` (NEW, 1–5 buttons + Textarea)

**Analog (textarea):** existing `detail-pane.tsx` line 32 import.
**Pattern:** 5 `<Button>`s in a row (1=terrible … 5=perfect), aria-pressed semantics; below: `<Textarea>` with `maxLength=1000` + char-count visible at >800. Textarea reuses the project `web/components/ui/textarea.tsx` primitive.

---

### `…/review/components/eval-type-radio.tsx` (NEW)

**Pattern:** Radix RadioGroup primitive (already in `dropdown-menu.tsx` line 118–122 as `DropdownMenuRadioGroup`, but UI-SPEC needs a card-shaped standalone radio group). Wave 0: `npx shadcn add radio-group` to vendor `web/components/ui/radio-group.tsx`. Default selection = `regression` (CONTEXT D-08 safety bias). Tooltip on section heading per UI-SPEC.

---

### `…/review/components/override-confirm-dialog.tsx` (NEW)

**Analog (primitive):** `web/components/ui/dialog.tsx`. UI-SPEC § "Confirmation modal" locks copy. Trigger conditions: Stage 2 with re-run, Stage 3 always, ≥2 axes dirty.

---

### `…/review/components/icontroller-info-banner.tsx` (NEW)

**Analog:** `web/app/(dashboard)/automations/[swarm]/review/race-cohort-banner.tsx` (in-surface banner; reuses V7 tokens).

**Pattern:** dismissible banner using `--v7-blue-soft` background + `ⓘ` glyph; copy locked by UI-SPEC § Stage-4 info banner. Render only when Stage 3 or 4 override fires AND an iController draft exists for the email.

---

### `…/review/keyboard-shortcuts.tsx` (EXTEND)

**Pattern:** existing window-keydown handler (lines 50–80) + `ACTION_EVENTS` const (lines 25–34). Phase 71 adds `1/2/3/4` (focus stage widget), `c` (capability), `g` (regression — "ge"), `⌘⏎`/`Ctrl+⏎` (submit), `Esc` (discard). Existing input-focus guard (`isTypingTarget`, lines 37–48) stays unchanged. Add new entries to `ACTION_EVENTS` and emit CustomEvents on `window` so `detail-pane.tsx` can wire actions without coupling.

---

### `web/lib/swarms/brand-color.ts` (NEW)

**Analog:** `web/lib/swarms/brand-register.ts` (sibling — registry consumer, pure-TS map).

**Pattern:** static map (no DB read) keyed by the `Entity` literal-union from `web/lib/swarms/entity.generated.ts` (Phase 69 codegen — DO NOT edit by hand). Signature locked by UI-SPEC § Color:
```typescript
export function brandColorToken(brand: Entity): string;  // returns "--v7-lime" etc
```
Mapping table from UI-SPEC § Color (smeba=lime, smeba-fire=pink, berki=amber, sicli-noord=blue, sicli-sud=teal). New brands MUST get a color at registry-INSERT time; CI gate (`npm run codegen && git diff --exit-code`) catches drift (CLAUDE.md "Build-time codegen for registry-driven literal-union TS types").

---

### `web/app/(dashboard)/automations/[swarm]/review/__tests__/load-page-data.test.ts` (EXTEND)

**Already-perfect harness:** chainable mock builder (lines 27–78) + side-loader mocks (lines 82–103). Phase 71 adds a new scenario:
- `from("pipeline_events_email_summary")` is hit for the predicted-row feed sub-query.
- `from("pipeline_events")` is still hit for the selected-row detail (sub-query 6).
- Side-loader mocks (`loadCoordinatorRunsForReview`, `loadTaggingFailuresForReview`) keep the regression assertion.

Pattern: copy the existing scenario block, add a `pipeline_events_email_summary` table assertion on `_mockBuilder.from(table)` calls.

---

### `web/lib/inngest/functions/__tests__/debtor-email-override-handler.test.ts` (NEW)

**Analog:** `web/lib/inngest/functions/__tests__/classifier-verdict-worker.test.ts`.

**Imports + Inngest mock pattern** (verdict-worker test lines 1–17):
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const inngestSend = vi.fn().mockResolvedValue({ ids: ["evt"] });
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: inngestSend,
    createFunction: vi.fn((cfg, _trigger, handler) => ({ __config: cfg, handler })),
  },
}));
```

**Step stub** (verdict-worker test lines 76–79):
```typescript
const stepStub = {
  run: async (_name: string, fn: () => Promise<unknown>) => fn(),
};
```

**Admin chainable mock** (verdict-worker test lines 42–74) — `from(table)` returns `{insert, update}`-shaped chains; arrays at module scope record every insert/update payload for assertion. Phase 71 needs `pipeline_events` insert recording (override emit) + `coordinator_runs` update recording (axis-2 path).

**Coverage matrix** (RESEARCH §Validation → "Override Coverage Matrix"): {axis × {capability, regression} × {happy, edge}} = 16 baseline cases + replay-idempotency test.

**Replay-safety test pattern:** call the handler twice with the same event payload; assert `pipeline_events` insert array has exactly 2 rows (one per replay attempt — emit IS idempotent under step.run boundary; we don't dedup, but we DO ensure deterministic submitted_at via `step.run`).

---

### `web/app/api/automations/debtor-email/override/__tests__/route.test.ts` (NEW)

**Analog:** `web/app/api/automations/debtor-email/ingest/__tests__/route.test.ts`.

**NextRequest pattern** (lines 23–24):
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
```

**Inngest mock** (line 30–32):
```typescript
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue({ ids: ["evt"] }) },
}));
```

**Auth mock pattern (NEW vs ingest analog — different auth model):** mock `@/lib/supabase/server`'s `createClient().auth.getUser()` to return `{data: {user: {id: "uuid-…"}}}` for happy-path; return `{data: {user: null}}` for the 401 test.

**Coverage** (RESEARCH §Validation "Phase Requirements → Test Map"):
- Happy path emits `debtor-email/override.submitted` with all OverridePayload fields.
- D-13: `operator_id` from payload is IGNORED if present; route stamps `user.id`.
- D-14: `reason` >1000 chars → 400.
- Default `eval_type=regression` enforced (or actually: present in zod schema; UI default is regression — route asserts presence, both values valid).
- Unauthenticated → 401.

---

### `web/lib/pipeline-events/__tests__/email-summary.test.ts` (NEW)

**Analog:** none exact (no existing per-view test). Use the chainable admin mock from `load-page-data.test.ts` lines 27–78. Coverage:
- View returns one row per `(email_id, swarm_type)`.
- Override-wins-latest semantics (per-stage `DISTINCT ON … ORDER BY created_at DESC`).
- `total_cost_cents` SUM matches sum of input rows.
- `tool_call_count` rolls up Stage 4 events with `decision_details ? 'tool_calls'`.

If integration-style (real Postgres), use the `supabase/migrations/20260507a_pipeline_events_email_summary.sql` against a local Supabase shadow DB. Pure unit-style (admin mock returning rows) is acceptable for v1.

---

## Shared Patterns

### Replay-safe step.run discipline (CRITICAL)

**Source:** CLAUDE.md §Inngest + `classifier-verdict-worker.ts` lines 26–67 + RESEARCH §Pitfall 2.

**Apply to:** every Inngest function in Phase 71 (override-handler + any verdict-worker / label-resolver / coordinator extension).

**Rule:** every UUID/Date.now/`new Date().toISOString()` MUST be inside the SAME `step.run` that uses it. Phase 65 commits `dae6276` + `dd2583a` document the exact failure mode (replay regenerates value; INSERT on key-A then UPDATE on key-B; silent no-op).

```typescript
// CORRECT
await step.run("axis-1-emit", async () => {
  const submitted_at = new Date().toISOString();    // inside the step
  await emitPipelineEvent(admin, {
    swarm_type: "debtor-email",
    stage: 1,
    override: { ..., submitted_at },
    // ...
  });
});

// WRONG (replay-unsafe)
const submitted_at = new Date().toISOString();      // outside the step
await step.run("axis-1-emit", async () => {
  await emitPipelineEvent(admin, { override: { ..., submitted_at } });
});
```

### Inngest send binding (CRITICAL)

**Source:** CLAUDE.md §Inngest + label-resolver line 34 + verdict-worker lines 162–173, 192–204 + RESEARCH §Pitfall 3.

**Apply to:** every `inngest.send(…)` call in override-handler + override route.

**Rule:** NEVER `const send = inngest.send`. Always `inngest.send.bind(inngest)({…})` OR `(inngest.send as unknown as SendFn)({…})` inline. Mocked tests don't catch this — only live smoke does.

```typescript
type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;

await (inngest.send as unknown as SendFn)({
  name: intent.handler_event,    // dynamic event name from registry
  data: { email_id, triggered_by: "operator-override-replay" },
});
```

### Pipeline-event canonical insert (CRITICAL)

**Source:** `web/lib/pipeline-events/emit.ts:29` + `web/lib/pipeline-events/types.ts:44`.

**Apply to:** every `pipeline_events` INSERT in Phase 71. NEVER hand-roll `admin.from("pipeline_events").insert(…)`.

```typescript
import { emitPipelineEvent } from "@/lib/pipeline-events/emit";
import type { OverrideJson } from "@/lib/pipeline-events/types";

await emitPipelineEvent(admin, {
  swarm_type: "debtor-email",
  stage: 1,
  email_id,
  decision: corrected_value,
  confidence: null,
  override: { axis, original_decision, original_event_id, operator_id, reason, submitted_at } satisfies OverrideJson,
  eval_type,                       // 'capability' | 'regression' — separate column per D-01
  decision_details,
  triggered_by: "operator-override",
});
```

### Server-side operator_id stamping (SECURITY)

**Source:** CONTEXT D-13 + RESEARCH §Pattern 3.

**Apply to:** override route ONLY. Never trust client payload's `operator_id`.

```typescript
const sb = await createClient();
const { data: { user } } = await sb.auth.getUser();
if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

await inngest.send.bind(inngest)({
  name: "debtor-email/override.submitted",
  data: { ...parsed.data, operator_id: user.id },   // server-stamped
});
```

### Zod payload validation

**Source:** existing route `web/app/api/automations/debtor-email/ingest/route.ts` already uses ad-hoc validation (`if (!messageId) return 400`). Phase 71 lifts to `zod` per RESEARCH "Don't Hand-Roll" — same library used elsewhere in the project.

**Apply to:** override route POST.

### V7 token-only chrome (UI)

**Source:** UI-SPEC § Design System ("token-only — no raw hex").

**Apply to:** every NEW UI component. Reference `web/app/globals.css` for `--v7-*` tokens. Recipient brand-dot uses `brandColorToken()` from `web/lib/swarms/brand-color.ts` (NEW), which returns CSS var names — NOT hex.

### URL-param-driven filter state

**Source:** existing `selection-context.tsx` + `queue-tree.tsx` in the review surface.

**Apply to:** `recipient-chip-strip.tsx` (`?inbox=…`). Survives reload + supports operator deep-links (UI-SPEC).

### ARIA + focus rings

**Source:** UI-SPEC § Focus order + ARIA. Apply to ALL new interactive elements: `outline: 2px solid var(--v7-brand-secondary); outline-offset: 2px;` on focus; never `outline: none` without replacement.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `web/lib/pipeline-events/__tests__/email-summary.test.ts` | DB-shape test | view assertions | First per-view unit test in repo. Falls back to admin-chainable-mock pattern from `load-page-data.test.ts`. |
| `…/review/components/pipeline-flow.tsx` | data-driven N-stage timeline | render | No prior N-stage timeline component in the codebase. Closest aesthetic precedent is `safety-detail-pane.tsx` (single-stage layout); Phase 71 invents the data-array → vertical-step pattern. UI-SPEC § Detail-pane vertical pipeline owns the contract. |
| `…/review/components/stage-step.tsx` | leaf step component | render | New leaf for `pipeline-flow.tsx`. |

**Switch primitive in `web/components/ui/switch.tsx`** (used by `stage-2-widget.tsx`) is also missing from the repo. Wave 0: vendor it via `npx shadcn add switch` (low friction; matches existing primitive style) OR hand-roll. Planner picks.

**RadioGroup primitive in `web/components/ui/radio-group.tsx`** is missing as a standalone wrapper (only embedded in `dropdown-menu.tsx`). Wave 0: vendor `npx shadcn add radio-group` OR hand-roll. Planner picks.

---

## Metadata

**Analog search scope:** `web/lib/inngest/functions/`, `web/lib/pipeline-events/`, `web/app/(dashboard)/automations/[swarm]/review/`, `web/app/api/automations/debtor-email/`, `supabase/migrations/`, `web/lib/swarms/`, `web/lib/supabase/`, `web/components/ui/`, `web/lib/automations/debtor-email/`.

**Files scanned:** ~40 (Read tool calls + Bash listings).

**Pattern extraction date:** 2026-05-05.

**Confidence:** HIGH — every backend file has an exact same-role same-data-flow analog already in production; UI primitives are mostly initialised (only `switch.tsx` and `radio-group.tsx` need vendoring). RESEARCH.md already extracted ~80% of the patterns verbatim — this PATTERNS.md anchors them to file:line for the planner.
