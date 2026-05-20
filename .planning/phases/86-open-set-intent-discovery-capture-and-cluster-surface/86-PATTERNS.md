# Phase 86: Open-set intent discovery — capture + cluster surface · Pattern Map

**Mapped:** 2026-05-20
**Files analyzed:** 11 read (0 re-reads)
**Analogs found:** 5 / 7 with strong in-repo precedent · 2 GREENFIELD (MV, Levenshtein)

**RFC anchors (read-first):**
- `docs/agentic-pipeline/README.md` — 5-stage funnel.
- `docs/agentic-pipeline/stage-3-coordinator.md` — ranked-intent classifier.
- **Hard-separation invariant preserved:** Phase 86 reads *only* `swarm_intents`-lane telemetry (`coordinator_runs.decision_details.intent_proposal`). The surface NEVER reads/writes `swarm_noise_categories`. A proposed intent that V9.0 later promotes lands in `swarm_intents` — never in noise categories.

---

## 0. Storage Truth (CRITICAL — CONTEXT D-01 is WRONG)

**CONTEXT D-01 claims** `intent_proposal` + `proposal_reason` live in `coordinator_runs.ranked_intents` JSONB.
**Reality after Phase 85 Plan 02 ship (commits `b18a62fe` / `74f9c5f0` / `53ebb086`, 2026-05-20):** the proposal fields land in TWO JSONB locations, NEITHER of them `ranked_intents`:

| Sink | Column | Path | Site | Lines |
|---|---|---|---|---|
| **Canonical (per-email audit)** | `agent_runs.tool_outputs` | `intent_first_pass.intent_proposal` + `intent_first_pass.proposal_reason` | `web/lib/inngest/functions/debtor-email-coordinator.ts` → `mergeToolOutputs("intent_first_pass", output, ...)` | **L231–235** |
| **Telemetry (per-decision row)** | `coordinator_runs.decision_details` (NB: NOT `ranked_intents`) | `decision_details.intent_proposal` + `decision_details.proposal_reason` | same file → `emitPipelineEvent(..., decision_details: { ... ...(output.intent_version === INTENT_VERSION_V3 && { intent_proposal, proposal_reason }) })` | **L323–332** (spread-conditional emit) |
| `coordinator_runs.ranked_intents` | unchanged | only `output.ranked` (the ranked-array) — proposal fields NOT here | `update("coordinator_runs").update({ ranked_intents: output.ranked })` | L280–283 |

**Verified literal at `debtor-email-coordinator.ts:329-332`** (spread-conditional, emits ONLY on V3 outputs):
```typescript
...(output.intent_version === INTENT_VERSION_V3 && {
  intent_proposal: output.intent_proposal,
  proposal_reason: output.proposal_reason,
}),
```

**Implication for Phase 86 SQL view (`intent_proposals_v1`):**
- The CONTEXT D-02 column mapping `proposal_label = ranked_intents->>'intent_proposal'` **does NOT match production**. Either change the source path or the storage. Recommended: change the source path (the V3 telemetry is *already* shipped — re-routing it to `ranked_intents` would burn a migration + a coordinator re-deploy for zero benefit).
- **Corrected mapping for `intent_proposals_v1`:**
  - `proposal_label` ← `coordinator_runs.decision_details->>'intent_proposal'`
  - `proposal_reason` ← `coordinator_runs.decision_details->>'proposal_reason'`
  - `ranked_top_intent` ← `coordinator_runs.ranked_intents->0->>'intent'` (note: `ranked_intents` is the ranked-array directly — no `->'ranked'` wrapper; the `output.ranked` array is the column value)
  - `intent_version` ← `coordinator_runs.decision_details->>'intent_version'` (Phase 85 D-07: actual LLM version, not hardcoded)
  - Filter clause: `WHERE coordinator_runs.decision_details->>'intent_proposal' IS NOT NULL`
- **CONFIDENCE: HIGH** — literally read off live coordinator code (post-Phase-85 deploy) and Phase 85 Plan 02 SUMMARY decisions.

**Planner action item:** raise a CONTEXT-D-01 amendment when planning the view migration. The CONTEXT's "no migration needed beyond schema docs" still holds — only the JSONB *path* changes from what D-01 wrote.

---

## File Classification

| New / modified file | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `docs/agentic-pipeline/stage-3-coordinator.md` (M) — JSONB-shape doc update | doc | n/a | self (existing RFC) | exact — additive paragraph |
| `supabase/migrations/2026MMDD_phase86_intent_proposals_v1.sql` (NEW) — materialized view + index | migration / read view | transform (read-only over JSONB) | `20260510_phase80_agent_runs_stuck_classifying_view.sql` (regular VIEW; closest in-repo precedent — see GREENFIELD below for MV) | MEDIUM (regular view exists; MATERIALIZED VIEW is GREENFIELD) |
| `web/lib/inngest/functions/intent-proposals-refresh-cron.ts` (NEW) — nightly MV refresh | controller / Inngest cron fn | event-driven (cron) | `web/lib/inngest/functions/email-feedback-snapshot.ts` (Phase 82.4 — nightly cron, single step.run, `TZ=Europe/Amsterdam`) | HIGH (exact shape) |
| `web/app/(dashboard)/automations/[swarm]/intent-proposals/page.tsx` (NEW) — RSC tab page | component / Next.js RSC | request-response | `web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx` (Phase 82 Plan 05 — registry-driven shell mount) | HIGH (exact tab shape) |
| `web/app/(dashboard)/automations/[swarm]/intent-proposals/client-shell.tsx` (NEW) — client cluster list | component / RCC | transform (client-side grouping render) | `web/app/(dashboard)/automations/[swarm]/stage-3/client-shell.tsx` | MEDIUM (different content, same shell composition) |
| `web/app/(dashboard)/automations/[swarm]/_shell/derive-stage-tabs.ts` (M) — extend tab list | utility | pure function | self | exact — additive entry (NB: this is NOT a "stage" tab — see D-04 below) |
| `web/app/(dashboard)/automations/[swarm]/_shell/stage-tab-strip.tsx` (M) — render new tab | component | pure render | self | exact — render path already iterates `tabs.filter(present)` |
| `web/lib/automations/debtor-email/intent-proposals/cluster.ts` (NEW) — Levenshtein clustering | utility | transform (pure JS) | none in `web/lib/**` (only `node_modules/fast-levenshtein` exists, NOT imported anywhere in source) | GREENFIELD (shape below) |
| `web/lib/automations/debtor-email/intent-proposals/normalize.ts` (NEW) — label normalizer | utility | transform (pure JS) | no exact analog; closest is regex-noise normalisation in `web/lib/automations/debtor-email/classifier/*` | GREENFIELD-trivial |
| `web/app/(dashboard)/automations/[swarm]/intent-proposals/__tests__/cluster.test.ts` (NEW) | test | unit (pure) | `web/lib/automations/debtor-email/coordinator/__tests__/types-v2.test.ts` (zero `vi.mock`) | HIGH |
| Telemetry on tab open — `pipeline_events.stage=3, decision='proposals_tab_view'` (or new `intent_proposal_views` table) | controller / event emit | request-response → INSERT | `web/lib/pipeline-events/emit.ts` + Phase 70 TELE-01 pattern | MEDIUM (re-use `pipeline_events`; new `decision` enum value) |

---

## 1. SQL view pattern — `intent_proposals_v1`

**Match quality: MEDIUM** — there are 3 in-repo `CREATE OR REPLACE VIEW` precedents but **ZERO `MATERIALIZED VIEW` precedents** in `supabase/migrations/`. CONTEXT D-02 specifies "materialised view"; if the planner sticks with that, the MV shape is GREENFIELD.

**Existing regular-view precedents (read first):**
- `supabase/migrations/20260510_phase80_agent_runs_stuck_classifying_view.sql` — closest analog: join-with-aggregation over `agent_runs` + `automation_runs`, defensive regex guard before `::uuid` cast, leading doc-comment, `CREATE OR REPLACE VIEW public.<name> AS`.
- `supabase/migrations/20260507a_pipeline_events_email_summary.sql` — `pipeline_events` summary view.
- `supabase/migrations/20260430f_automation_runs_outlier_view.sql` — outlier classification view.

**Why MV matters here (nightly refresh):**
- A plain VIEW over `coordinator_runs ⋈ agent_runs ⋈ email_pipeline.emails` re-runs the JSONB filter on every tab-open. With ~1000s of coordinator_runs/week this is fine read-time; the *only* reason to go MV is to make the cluster job idempotent vs. running over a stable snapshot.
- **Recommendation to planner:** start with **regular VIEW** (matches existing precedent, simpler to alter), and add a thin pre-cluster snapshot table `intent_proposal_clusters_v1` (refreshed nightly by the cron) to hold the *clustered* output. The view is the live denormalisation; the cluster output is what gets pre-computed nightly. This keeps the migration low-risk and aligned with existing patterns.
- **Alternative (if D-02 MV is mandated):** stamp a `CREATE MATERIALIZED VIEW public.intent_proposals_v1 AS ...` + `CREATE UNIQUE INDEX intent_proposals_v1_id_idx ON public.intent_proposals_v1 (coordinator_run_id);` to enable `REFRESH MATERIALIZED VIEW CONCURRENTLY`. UNIQUE index is mandatory for CONCURRENTLY.

**Canonical shape (regular VIEW variant — copy-paste from `20260510_phase80...` shell):**
```sql
-- Phase 86 — intent_proposals_v1 read view for the Bulk Review
-- "Intent proposals" tab. Joins coordinator_runs to agent_runs and
-- email_pipeline.emails so the cluster surface can render proposal
-- label + reason + ranked-top intent + sample subject/sender in a
-- single SELECT.
--
-- Source of truth (Phase 85 Plan 02 deploy 2026-05-20):
--   intent_proposal + proposal_reason live in
--   coordinator_runs.decision_details (NOT ranked_intents). The V3
--   telemetry is emitted spread-conditionally so V2 rows have NULL
--   here naturally — the IS NOT NULL filter is the open-set predicate.

CREATE OR REPLACE VIEW public.intent_proposals_v1 AS
SELECT cr.run_id                                                AS coordinator_run_id,
       cr.email_id                                              AS email_id,
       cr.swarm_type,
       cr.decision_details->>'intent_proposal'                  AS proposal_label,
       cr.decision_details->>'proposal_reason'                  AS proposal_reason,
       cr.decision_details->>'intent_version'                   AS intent_version,
       cr.ranked_intents->0->>'intent'                          AS ranked_top_intent,
       cr.created_at,
       e.subject,
       e.sender_email,
       e.mailbox
  FROM public.coordinator_runs cr
  LEFT JOIN public.agent_runs ar
    ON ar.coordinator_run_id = cr.run_id
  LEFT JOIN email_pipeline.emails e
    ON e.id = cr.email_id
 WHERE cr.decision_details->>'intent_proposal' IS NOT NULL;
```

**Verify before applying:**
- `coordinator_runs` column names (`run_id`, `email_id`, `swarm_type`, `decision_details`, `ranked_intents`, `created_at`) — derived from coordinator code reads at L202/L222/L280/L290/L294. The planner SHOULD `list_tables` `coordinator_runs` via supabase MCP before writing the migration.
- `email_pipeline.emails.id` is the canonical email UUID (MEMORY: `feedback_email_pipeline_lookup_keys`).

**CONFIDENCE: MEDIUM** (regular view: HIGH precedent; MV: GREENFIELD).

---

## 2. Cron pattern — nightly refresh

**Match quality: HIGH** — exact analog exists.

**Analog:** `web/lib/inngest/functions/email-feedback-snapshot.ts` (Phase 82.4 Plan 07). Read in full (L1–123). Same cadence-class (nightly), same `TZ=Europe/Amsterdam` discipline, same replay-id rule (mint UUID INSIDE step.run), same comment-block ritual.

**Mandatory pattern to mirror:**
```typescript
// File header: NO /** */ comments containing cron strings.
// CLAUDE.md Inngest rule: */N inside JSDoc closes the block.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";

export const intentProposalsRefresh = inngest.createFunction(
  { id: "intent-proposals/nightly-refresh", retries: 1 },
  { cron: "TZ=Europe/Amsterdam 0 3 * * *" }, // 03:00 Amsterdam, 7 days/wk
  async ({ step }) => {
    const run_id = await step.run("resolve-run-id", async () =>
      crypto.randomUUID(),
    );

    // Option A (regular VIEW + snapshot cluster table):
    await step.run("refresh-clusters", async () => {
      const admin = createAdminClient();
      // 1. SELECT proposals from intent_proposals_v1 (last 30d window).
      // 2. cluster() in JS.
      // 3. UPSERT intent_proposal_clusters_v1 rows.
    });

    // Option B (true MV per CONTEXT D-02):
    // await step.run("refresh-mv", async () => {
    //   const admin = createAdminClient();
    //   // Supabase JS client does NOT expose REFRESH MATERIALIZED VIEW
    //   // directly. Use a Postgres function:
    //   //   CREATE OR REPLACE FUNCTION public.refresh_intent_proposals_v1()
    //   //     RETURNS void AS $$
    //   //     REFRESH MATERIALIZED VIEW CONCURRENTLY public.intent_proposals_v1;
    //   //   $$ LANGUAGE SQL SECURITY DEFINER;
    //   // then admin.rpc('refresh_intent_proposals_v1').
    // });

    return { run_id };
  },
);
```

**Critical replay-safety rules (Phase 65 lock, repeated in `email-feedback-snapshot.ts:55–70` and CLAUDE.md):**
- All non-deterministic values (UUID, "now") MUST be minted **inside** `step.run` — outside, Inngest regenerates on replay → INSERT/UPDATE key drift → silent no-op.
- DO NOT destructure `inngest.send` (Phase 65 commit `dae6276`).
- `TZ=` prefix mandatory — otherwise the cron runs UTC.

**Cron-string placement:** the cron lives in the second arg to `createFunction`, NEVER in a `/** */` JSDoc.

**Cadence choice:** CONTEXT D-02 says "nightly". `0 3 * * *` (03:00) keeps it after the 02:00 `email-feedback-snapshot` so neither cron contends. 7 days/week is correct — proposals accumulate weekends too.

**Register the function** in `web/lib/inngest/functions/index.ts` (mirrors how `emailFeedbackSnapshot` is exported there — planner should grep that file before edit).

**CONFIDENCE: HIGH**.

---

## 3. Bulk Review tab pattern — adding "Intent proposals"

**Match quality: HIGH** for the tab page shape; **MEDIUM/AMBIGUOUS** for *where* the tab plugs in.

### 3a. The tab-registration question (read this first)

The existing `_shell/derive-stage-tabs.ts` is **strictly stage-keyed**: it returns tabs of `stage: 0 | 1 | 2 | 3 | 4`. CONTEXT D-04 calls "Intent proposals" a "peer tab to the existing per-stage tabs" — but it's NOT a stage; it's a cross-stage discovery surface.

**Two viable shapes; planner picks one:**

**Shape A — extend `StageTab` with a non-stage variant.** Cleanest, no parallel tab system. Bump `StageTab.stage` to `0 | 1 | 2 | 3 | 4 | "intent-proposals"` (string discriminator), add a `FIXED` entry, gate presence on `Boolean(swarm.stage3_coordinator_agent_key)` (same as Stage 3 — proposals only exist when Stage 3 runs). `stage-tab-strip.tsx` already iterates `FIXED.map` so the render path absorbs it. Touch zero render code.

**Shape B — separate "discovery" tab strip rendered next to the stage strip.** Loose coupling, but doubles the chrome. NOT recommended.

**Recommendation:** Shape A. Discriminate stage-numeric vs. string at the type level (the existing `stage: 0 | 1 | 2 | 3 | 4` union → widen to include `"intent-proposals"`) and add a guard in `derive-stage-tabs.ts:36–43` for the string case.

### 3b. RSC page shape — copy `stage-3/page.tsx` shell

**Analog:** `web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx` (read L1–60 in this session). Mirror its imports/composition:

```typescript
// web/app/(dashboard)/automations/[swarm]/intent-proposals/page.tsx
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm } from "@/lib/swarms/registry";
import { AutomationRealtimeProvider } from "@/components/automations/automation-realtime-provider";
import { PageHeader } from "../_shell/page-header";
import { StageTabStrip } from "../_shell/stage-tab-strip";
import { IntentProposalsClientShell } from "./client-shell";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ swarm: string }>;
  searchParams: Promise<{ /* ... */ }>;
}

export default async function IntentProposalsPage({ params }: PageProps) {
  const { swarm: swarmSlug } = await params;
  const swarm = await loadSwarm(swarmSlug);
  if (!swarm) return notFound();
  if (!swarm.stage3_coordinator_agent_key) return notFound(); // tab only exists when Stage 3 is wired

  const admin = createAdminClient();
  // SELECT * FROM intent_proposal_clusters_v1 WHERE swarm_type = swarm.swarm_type
  // ORDER BY count DESC LIMIT 50.

  return (
    <>
      <PageHeader swarm={swarm} />
      <StageTabStrip swarm={swarm} currentStage="intent-proposals" />
      <IntentProposalsClientShell clusters={...} />
    </>
  );
}
```

### 3c. Client shell + cluster list rendering

**Analog:** `stage-3/client-shell.tsx` (file exists in repo at `web/app/(dashboard)/automations/[swarm]/stage-3/client-shell.tsx`; not read in this session — planner reads in plan-time).

**Read-only constraint per CONTEXT D-04:** no buttons. No promote action. Each cluster row is an expandable `<details>` with cluster centroid label, weekly count, ranked-top context, and 3-5 sample previews.

**Telemetry on mount:** fire one `pipeline_events` INSERT (or a `intent_proposal_views` row — D-07) inside a client-side `useEffect` that calls a server action; closest analog for "client → server action → admin INSERT" is the Stage 0 `actions.ts` pattern at `web/app/(dashboard)/automations/[swarm]/stage-0/actions.ts` (file exists, not read this session — planner consults in plan-time).

**CONFIDENCE: HIGH** for page-shape; **MEDIUM** for tab-registration (Shape A vs B is a planner decision).

---

## 4. Levenshtein implementation

**Match quality: GREENFIELD** — not imported anywhere in source.

`fast-levenshtein` is **transitively installed** in `node_modules` (via some other dep) but `grep -rln` shows ZERO imports from `web/lib/`, `web/app/`, or `supabase/` source files. Direct adding `fast-levenshtein` to `web/package.json` is one option (CLAUDE.md "NOOIT eigen rolwerk" doesn't apply to ~30-line algorithms, but a battle-tested pkg removes audit-trail risk for the operator).

**Recommendation: dependency-free pure-JS implementation in `web/lib/automations/debtor-email/intent-proposals/cluster.ts`** — keeps the bundle slim and the code auditable. CONTEXT D-03 explicitly wants "no new dependencies".

**Canonical shape (matrix DP, threshold via similarity ratio):**
```typescript
// web/lib/automations/debtor-email/intent-proposals/cluster.ts
// Phase 86 D-03 — pure-JS Levenshtein clustering, no deps.
// Threshold 0.85 per CONTEXT D-03; centroid = highest-frequency label.

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  // Two-row DP to keep memory at O(min(m,n)).
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,        // insert
        prev[j] + 1,            // delete
        prev[j - 1] + cost,     // substitute
      );
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

export function similarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const d = levenshtein(a, b);
  return 1 - d / Math.max(a.length, b.length);
}

// O(n²) greedy single-link clustering. n ≤ ~few thousand proposals/30d
// in steady state — fine. If n>10k we move to a blocked variant.
export function cluster(
  labels: ReadonlyArray<{ label: string; samples: unknown[] }>,
  threshold = 0.85,
): Array<{ centroid: string; members: typeof labels }> { /* greedy merge */ }
```

**Normalisation** (`normalize.ts`, called BEFORE clustering — CONTEXT D-03 step 1):
```typescript
export function normalizeLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")  // strip punctuation → underscore
    .replace(/^_+|_+$/g, "")        // trim leading/trailing underscores
    .replace(/_+/g, "_");           // collapse repeated underscores
}
```

Note: the Phase 85 Zod schema already enforces snake_case at validation time (`/^[a-z][a-z0-9_]*$/`), so normalisation is defensive — should be a no-op on schema-conformant labels.

**CONFIDENCE: GREENFIELD** — shape is canonical, planner can lift verbatim.

---

## 5. Empty-state pattern

**Match quality: HIGH** — pattern already exists at `_shell` level.

**Analog:** `web/app/(dashboard)/automations/[swarm]/_shell/_lib/types.ts:24` — `EmptyState` type already exported and consumed by `RowList` at `_shell/row-list.tsx:24` + render at L88–99 (read in this session).

**Existing consumption shape (`row-list.tsx:88-99`):**
```tsx
{rows.length === 0 ? (
  <div>
    <div>{emptyState.title}</div>
    <div>{emptyState.body}</div>
  </div>
) : (
  /* row map */
)}
```

**Apply to Phase 86:** the `IntentProposalsClientShell` accepts `emptyState: EmptyState` (re-use the type). CONTEXT D-06 copy lives in `page.tsx`:

```typescript
const EMPTY_STATE: EmptyState = {
  title: "No novel intent proposals yet",
  body: "The classifier flags emails that don't fit existing intents. Wait for the first week of live traffic.",
};
```

**Sketch-findings adherence (per `Skill("sketch-findings-agent-workforce")`):** the `_shell/row-list.tsx` empty-state path uses muted `var(--v7-text-muted)` + no buttons — copy that aesthetic. Planner should `Skill("sketch-findings-agent-workforce")` in plan-time before writing the client-shell to lock the visual palette.

**CONFIDENCE: HIGH**.

---

## 6. Telemetry pattern — tab-open tracking

**Match quality: MEDIUM** — `pipeline_events` exists and supports an additive `decision` value; bespoke `intent_proposal_views` table is a viable alternative.

**Analog:** `web/lib/pipeline-events/emit.ts` (read in full this session). Single thin INSERT wrapper, throws-on-error per the TELE-01 contract. Phase 70 pattern.

**`PipelineEventInput` shape** (from `web/lib/pipeline-events/types.ts` — referenced but not read this session; planner reads in plan-time):
- `swarm_type`, `stage` (number), `email_id`, `decision` (string), `confidence?`, `decision_details` (JSONB), `agent_run_id?`, `automation_run_id?`, `triggered_by` (string).

**Two telemetry-write shapes for Phase 86:**

**Shape α — reuse `pipeline_events`** (PREFERRED — lowest schema cost):
```typescript
await emitPipelineEvent(admin, {
  swarm_type: swarm.swarm_type,
  stage: 3,                              // proposal capture lives in Stage 3 lane
  email_id: null as any,                 // tab-view is not email-scoped
  decision: "intent_proposals_tab_view",
  decision_details: { operator_id, viewed_cluster_count, ... },
  triggered_by: "operator",
});
```
**Risk:** `pipeline_events.email_id` is likely NOT NULL (it's the per-email audit log). Planner MUST verify via `list_tables` before assuming this shape works. If NOT NULL, Shape α won't fit — fall back to Shape β.

**Shape β — new lightweight table** `intent_proposal_views`:
```sql
CREATE TABLE public.intent_proposal_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_type text NOT NULL,
  operator_id uuid REFERENCES auth.users(id),
  cluster_count_seen int,
  viewed_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: service-role-only INSERT/SELECT (mirror 20260422_enable_rls_email_tables.sql posture).
```

**Recommendation:** verify `pipeline_events.email_id` NULL-ability via supabase MCP `list_tables`, then pick Shape α if nullable, Shape β if NOT NULL.

**Verification criterion 4 from CONTEXT** ("operator opens tab ≥ 2×/week for 4 consecutive weeks") requires this signal — Phase 86 MUST ship this telemetry, not defer it.

**CONFIDENCE: MEDIUM**.

---

## Shared Patterns

### A. JSONB-additive telemetry (no migration)

**Source:** Phase 85 spread-conditional emit at `debtor-email-coordinator.ts:329-332` (the precedent that makes Phase 86 possible). Phase 83 D-09 `input_size` is the lineage.

**Apply to Phase 86:** the SQL view reads JSONB paths directly — `decision_details->>'intent_proposal'` etc. NO migration on `coordinator_runs` itself.

### B. Registry-driven tab presence

**Source:** `_shell/derive-stage-tabs.ts:35-45` — tab visibility gated on `swarm.stageN_*` registry binding.

**Apply to Phase 86:** the "Intent proposals" tab is `present: Boolean(swarm.stage3_coordinator_agent_key)` (proposals require Stage 3). Same pattern as Stage 3 tab. Cross-swarm reuse is automatic — when sales-email lights up Stage 3 (V10.0), it inherits the tab for free.

### C. Inngest cron with replay-safe IDs

**Source:** `email-feedback-snapshot.ts:51-122` — pattern is binding for every new cron in this codebase per CLAUDE.md Phase 65 rule.

### D. Skill-driven visual conformance

**Source:** CLAUDE.md auto-loaded skill `Skill("sketch-findings-agent-workforce")`.

**Apply to Phase 86:** client-shell + cluster-row visual treatment MUST consult this skill before writing CSS — palette is `var(--v7-*)` tokens, no emojis, muted empty-state.

### E. Hard-separation invariant (RFC lock)

**Source:** `docs/agentic-pipeline/README.md` + `stage-3-coordinator.md`.

**Apply to Phase 86:** the view, the cron, the UI, the telemetry — NONE may read from or write to `swarm_noise_categories`. Phase 86 is strictly a `swarm_intents`-lane (Stage 3) surface. `ranked_top_intent` in the view is the closed-list `INTENT` value from `coordinator_runs.ranked_intents[0]` — this is Stage 3 data, NOT noise.

### F. Pre-flight `list_tables` before migration

**Source:** Supabase MCP guidance (system reminder this session) + CLAUDE.md.

**Apply to Phase 86:** before writing `2026MMDD_phase86_intent_proposals_v1.sql`, planner runs `mcp__supabase__list_tables` for `coordinator_runs`, `agent_runs`, `email_pipeline.emails`, `pipeline_events`. Column names + nullability assumptions in this PATTERNS doc come from coordinator code reads — they MUST be confirmed at the DB level before the migration goes in.

---

## No Analog Found / GREENFIELD

| Item | Role | Why no analog |
|---|---|---|
| `MATERIALIZED VIEW` in `supabase/migrations/` | DDL | Zero precedents — all 3 in-repo views are plain `CREATE OR REPLACE VIEW`. If CONTEXT D-02 mandates MV, Phase 86 introduces the pattern. Recommendation: regular VIEW + snapshot table (see §1). |
| In-source Levenshtein use | utility | `fast-levenshtein` is in `node_modules` but unused in source. Pure-JS shape supplied in §4. |
| Non-stage tab in `_shell` registry | UI | `derive-stage-tabs.ts` is strictly numeric-stage-keyed. Phase 86 widens the discriminator. Shape A supplied in §3a. |
| Operator-action telemetry shape | UI → DB | `pipeline_events` is email-scoped; tab-view is not. Two shapes supplied in §6, planner verifies NULL-ability before picking. |

---

## Metadata

**Analog search scope (read once each, no re-reads):**
- `.planning/phases/86-.../86-CONTEXT.md`
- `.planning/phases/85-.../85-02-SUMMARY.md`
- `.planning/phases/85-.../85-PATTERNS.md`
- `web/lib/inngest/functions/debtor-email-coordinator.ts` (targeted L280–340)
- `web/lib/inngest/functions/email-feedback-snapshot.ts` (full)
- `web/app/(dashboard)/automations/[swarm]/_shell/derive-stage-tabs.ts` (full)
- `web/app/(dashboard)/automations/[swarm]/_shell/stage-tab-strip.tsx` (L20–80 + grep)
- `web/app/(dashboard)/automations/[swarm]/_shell/row-list.tsx` (grep + L88–99 by ref)
- `web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx` (L1–60)
- `web/lib/pipeline-events/emit.ts` (full)
- `supabase/migrations/20260510_phase80_agent_runs_stuck_classifying_view.sql` (full)
- migration directory listing (full)
- `node_modules` Levenshtein scan (negative result)

**Files scanned:** 13 reads, 0 re-reads.
**Pattern extraction date:** 2026-05-20.

---

## PATTERN MAPPING COMPLETE

**Phase:** 86 — Open-set intent discovery: capture + cluster surface
**Files classified:** 11 (1 doc, 1 migration, 1 cron fn, 4 UI, 2 lib, 1 test, 1 telemetry choice)
**Analogs found:** 5 HIGH · 3 MEDIUM · 2 GREENFIELD (MV, Levenshtein) · 1 GREENFIELD-trivial (normalize)

### Coverage
- Files with exact (HIGH) analog: 5 — cron, RSC page, derive-stage-tabs, stage-tab-strip, test shape
- Files with role-match (MEDIUM): 3 — regular VIEW migration, client-shell, telemetry emit
- GREENFIELD: 3 — MATERIALIZED VIEW (if mandated), Levenshtein impl, label normalizer

### Key Patterns Identified
- **CRITICAL — CONTEXT D-01 drift:** `intent_proposal` lives in `coordinator_runs.decision_details` + `agent_runs.tool_outputs.intent_first_pass`, NOT in `coordinator_runs.ranked_intents`. The SQL view JSONB-path mapping must be corrected before the migration is written. Source: `debtor-email-coordinator.ts:329-332` (spread-conditional emit, Phase 85 Plan 02 commit `53ebb086`).
- **No MV precedent in repo** — recommend regular VIEW + nightly-refreshed snapshot table over true MATERIALIZED VIEW; both shapes supplied.
- **Cron pattern is fully resolved** — copy `email-feedback-snapshot.ts` shell, change cadence to `0 3 * * *`, replace upload step with cluster-refresh step.
- **Tab registration requires a discriminator widening** in `derive-stage-tabs.ts` — Shape A (extend `stage` union with `"intent-proposals"`) is cleanest.
- **Empty-state + RowList re-use** — `EmptyState` type already exists in `_shell/_lib/types.ts` and is consumed by `RowList`.
- **Telemetry shape contingent on `pipeline_events.email_id` NULL-ability** — verify before picking Shape α vs β.
- **Hard-separation invariant preserved end-to-end** — Phase 86 reads only `swarm_intents`-lane telemetry; never touches `swarm_noise_categories`.

### File Created
`/Users/nickcrutzen/Developer/agent-workforce/.planning/phases/86-open-set-intent-discovery-capture-and-cluster-surface/86-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner has concrete file+line analogs for cron + RSC tab + empty state + telemetry emit, plus a corrected JSONB-path mapping for the view (CONTEXT D-01 amendment flagged), plus canonical greenfield shapes for the MV/Levenshtein/normalize trio.
