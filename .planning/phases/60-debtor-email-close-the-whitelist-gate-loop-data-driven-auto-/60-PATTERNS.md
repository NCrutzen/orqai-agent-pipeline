# Phase 60: Debtor email — close the whitelist-gate loop - Pattern Map

**Mapped:** 2026-04-28
**Files analyzed:** 24 (creates) + 6 (modifies)
**Analogs found:** 28 / 30

## File Classification

### Migrations (Wave 0)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/20260428_public_agent_runs.sql` | migration | DDL + backfill | `supabase/migrations/20260423_debtor_agent_runs.sql` | exact (rename + swarm_type discriminator) |
| `supabase/migrations/20260428_classifier_rules.sql` | migration | DDL | `supabase/migrations/20260423_debtor_agent_runs.sql` (CHECK + RLS + publication pattern) | role-match |
| `supabase/migrations/20260428_classifier_rule_evaluations.sql` | migration | DDL (append-only) | `supabase/migrations/20260423_debtor_agent_runs.sql` (indices + RLS) | role-match |
| `supabase/migrations/20260428_classifier_rules_mailbox_overrides.sql` | migration | DDL (matrix) | `supabase/migrations/20260423_mailbox_settings_expansion.sql` (alter + seed pattern) | role-match |
| `supabase/migrations/20260428_automation_runs_typed_columns.sql` | migration | DDL ADD COLUMN + UPDATE backfill + indexes | `supabase/migrations/20260423_mailbox_settings_expansion.sql` (`add column if not exists` + verification block) | exact |

### Library modules (Wave 0/1)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `web/lib/classifier/cache.ts` | utility (in-memory cache) | request-response (cache aside) | RESEARCH §Pattern 1 (no codebase analog — Map+TTL is greenfield) | no analog (greenfield) |
| `web/lib/classifier/wilson.ts` | utility (pure math) | transform | RESEARCH §Pattern 2 (formula) | no analog (greenfield) |
| `web/lib/classifier/read.ts` | service (DB read) | request-response | `web/lib/automations/debtor-email/triage/agent-runs.ts` (admin client read pattern) | role-match |
| `web/lib/classifier/types.ts` | model (types) | n/a | `web/lib/automations/debtor-email/triage/types.ts` | exact |

### Inngest functions (Wave 0/2/3)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `web/lib/inngest/functions/classifier-promotion-cron.ts` | inngest cron | batch + event-driven | `web/lib/inngest/functions/debtor-email-bridge.ts` (cron + per-config step.run) + `orqai-trace-sync.ts` (per-swarm isolation) | exact |
| `web/lib/inngest/functions/classifier-verdict-worker.ts` | inngest event-worker | event-driven side-effects | `web/lib/inngest/functions/debtor-email-icontroller-cleanup-worker.ts` (event-trigger, retries:0, status flip + emit broadcast) | exact |
| `web/lib/inngest/functions/classifier-backfill.ts` | inngest one-shot | batch upsert | `web/lib/inngest/functions/debtor-email-bridge.ts` (single step.run loop) | role-match |
| `web/lib/inngest/events.ts` (MODIFY) | events registry | n/a | `web/lib/inngest/events.ts:151-166` (existing `icontroller/cleanup.shard.requested`) | exact |
| `web/app/api/inngest/route.ts` (MODIFY) | inngest serve route | request-response | `web/app/api/inngest/route.ts:28-48` (append to functions array) | exact |

### Ingest route refactor (Wave 1)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `web/app/api/automations/debtor-email/ingest/route.ts:39-46` (MODIFY) | API route | request-response | itself (cache replaces hardcoded Set; uses `web/lib/classifier/cache.ts`) | self |
| `web/app/api/automations/debtor-email/ingest/route.ts:267-323` (MODIFY) | API route insert | CRUD | itself (just add typed columns to insert payload) | self |

### Queue UI (Wave 3)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `web/app/(dashboard)/automations/debtor-email-review/page.tsx` (REWRITE) | server component | CRUD read + RPC | `web/components/automations/automation-realtime-provider.tsx` (broadcast subscribe pattern) + own pre-rewrite shape | partial |
| `web/app/(dashboard)/automations/debtor-email-review/queue-tree.tsx` | client component | recursive render | `web/components/v7/swarm-list-item.tsx` + `sidebar-mini-stat.tsx` (count-badge + active-state) | role-match |
| `web/app/(dashboard)/automations/debtor-email-review/predicted-row-list.tsx` | client component | CRUD list | `web/components/v7/drawer/agent-detail-drawer.tsx` (Sheet body styles) | role-match |
| `web/app/(dashboard)/automations/debtor-email-review/predicted-row-item.tsx` | client component | request-response | `web/components/v7/kanban/job-tag-pill.tsx` (status pills) | role-match |
| `web/app/(dashboard)/automations/debtor-email-review/race-cohort-banner.tsx` | client component | request-response | `web/components/v7/realtime-status-indicator.tsx` (chip styling — referenced in UI-SPEC) | role-match |
| `web/app/(dashboard)/automations/debtor-email-review/actions.ts` (REWRITE) | server action | CRUD + event-emit | itself lines 100-130 (feedback insert) — strip side-effects, keep verdict write + add `inngest.send` | self (refactor) |

### Classifier dashboard (Wave 2)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `web/app/(dashboard)/automations/classifier-rules/page.tsx` | server component | CRUD read | `web/app/(dashboard)/automations/debtor-email-review/page.tsx` (server component + admin client) | role-match |
| `web/app/(dashboard)/automations/classifier-rules/rules-table.tsx` | client component | tabular render | `web/components/v7/kanban/job-tag-pill.tsx` + shadcn `<Table>` | partial |
| `web/app/(dashboard)/automations/classifier-rules/ci-lo-sparkline.tsx` | client component | transform (SVG) | none (greenfield 64×24 inline SVG) | no analog |
| `web/app/(dashboard)/automations/classifier-rules/rule-status-badge.tsx` | client component | render | `web/components/v7/kanban/job-tag-pill.tsx` | exact |
| `web/app/(dashboard)/automations/classifier-rules/block-rule-modal.tsx` | client component | request-response | shadcn `<Dialog>` primitives | role-match |

### Tests (Wave 0)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `web/lib/classifier/__tests__/wilson.test.ts` | test | unit | `web/lib/inngest/__tests__/pipeline-approval.test.ts` (vitest + describe/it) | role-match |
| `web/lib/classifier/__tests__/cache.test.ts` | test | unit | `web/lib/inngest/__tests__/pipeline-approval.test.ts` | role-match |
| `web/lib/classifier/__tests__/promotion-gates.test.ts` | test | unit | same | role-match |
| `web/lib/classifier/__tests__/cron-shadow.test.ts` | test | integration (mocked admin) | same | role-match |

---

## Pattern Assignments

### `supabase/migrations/20260428_public_agent_runs.sql` (migration, DDL)

**Analog:** `supabase/migrations/20260423_debtor_agent_runs.sql:1-150`

**Schema declaration + CHECK + RLS pattern** (lines 17-23, 50-83, 135-150):
```sql
create schema if not exists debtor;

create table if not exists debtor.agent_runs (
  id                 uuid primary key default gen_random_uuid(),
  email_id           uuid not null,
  inngest_run_id     text,
  entity             text not null check (entity in (
    'smeba', 'berki', 'sicli-noord', 'sicli-sud', 'smeba-fire'
  )),
  -- ...
  human_verdict      text check (human_verdict in (
    'approved', 'edited_minor', /* … */ 'rejected_other'
  )),
  -- ...
);

alter table debtor.agent_runs enable row level security;

-- Realtime publication
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'debtor' and tablename = 'agent_runs') then
    alter publication supabase_realtime add table debtor.agent_runs;
  end if;
end$$;
```

**Phase 60 deltas:**
- Schema = `public` (not `debtor`)
- Add `swarm_type text not null check (swarm_type in ('debtor-email','sales-email','planning','order-entry'))`
- Add `automation_run_id uuid references public.automation_runs(id)` (telemetry join key for the cron)
- Add `rule_key text` (denormalized; cron filters by it)
- Add `corrected_category text` (per CONTEXT D-25 / RESEARCH Open Q #1)
- Backfill: `INSERT INTO public.agent_runs (...) SELECT ... FROM debtor.agent_runs` then `DROP TABLE debtor.agent_runs CASCADE` (after verifying no live writers; or keep in parallel and switch reads first per D-28).

**Updated_at trigger pattern** (lines 119-133): copy verbatim, swap schema to `public`.

---

### `supabase/migrations/20260428_classifier_rules.sql` (migration, DDL)

**Analog:** RESEARCH §Code Examples lines 506-532 + structure pattern from `20260423_debtor_agent_runs.sql:19-83`.

**CHECK constraint pattern** (analog file lines 50-62):
```sql
status             text not null check (status in (
  'classifying', 'routed_human_queue', /* … */ 'done'
)) default 'classifying',
```

**Phase 60 schema (D-05 verbatim):**
```sql
CREATE TABLE public.classifier_rules (
  id              uuid primary key default gen_random_uuid(),
  swarm_type      text not null,
  rule_key        text not null,
  kind            text not null check (kind in ('regex','agent_intent')),
  status          text not null check (status in ('candidate','promoted','demoted','manual_block'))
                  default 'candidate',
  n               int not null default 0,
  agree           int not null default 0,
  ci_lo           numeric,
  last_evaluated  timestamptz,
  promoted_at     timestamptz,
  last_demoted_at timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (swarm_type, rule_key)
);

CREATE INDEX classifier_rules_swarm_status_idx
  ON public.classifier_rules (swarm_type, status);

ALTER TABLE public.classifier_rules ENABLE ROW LEVEL SECURITY;
```

Add the same `updated_at` trigger pattern from analog lines 119-133.

---

### `supabase/migrations/20260428_automation_runs_typed_columns.sql` (migration, DDL ADD + backfill)

**Analog:** `supabase/migrations/20260423_mailbox_settings_expansion.sql:23-29, 60-70`

**`add column if not exists` pattern** (analog lines 23-29):
```sql
alter table debtor.labeling_settings
  add column if not exists entity text
    check (entity in ('smeba', 'berki', 'sicli-noord', 'sicli-sud', 'smeba-fire')),
  add column if not exists icontroller_company text,
  add column if not exists ingest_enabled boolean not null default true,
  ...;
```

**Verification block pattern** (analog lines 60-70) — copy verbatim, adapt the missing-count query:
```sql
do $$
declare
  missing_count int;
begin
  select count(*) into missing_count
    from debtor.labeling_settings
   where entity is null;
  if missing_count > 0 then
    raise warning 'labeling_settings has % row(s) without entity — update manually before enabling triage.', missing_count;
  end if;
end$$;
```

**Phase 60 sequence:**
1. `ADD COLUMN IF NOT EXISTS swarm_type text, ADD COLUMN IF NOT EXISTS topic text, ADD COLUMN IF NOT EXISTS entity text, ADD COLUMN IF NOT EXISTS mailbox_id int;`
2. Backfill via `UPDATE … SET swarm_type='debtor-email', topic = result->'predicted'->>'category', entity = result->>'entity', mailbox_id = ls.id FROM debtor.labeling_settings ls WHERE ls.source_mailbox = ar.result->>'source_mailbox'` (RESEARCH lines 545-555).
3. Verification block raising warning if `swarm_type IS NULL` after backfill.
4. After confirmed clean: `ALTER TABLE … ALTER COLUMN swarm_type SET NOT NULL`.
5. Indexes per D-13 + D-27 (4 separate composite indexes — per Pitfall 3 RESEARCH lines 453-461).

---

### `web/lib/inngest/functions/classifier-promotion-cron.ts` (inngest cron)

**Analog:** `web/lib/inngest/functions/debtor-email-bridge.ts:17-33` (cron + per-config step.run loop) + `orqai-trace-sync.ts:69-90` (per-swarm isolation + retries).

**Cron + per-config step.run pattern** (debtor-email-bridge.ts lines 17-33):
```typescript
export const syncDebtorEmailBridgeCron = inngest.createFunction(
  {
    id: "automations/debtor-email-bridge",
    retries: 2,
  },
  { cron: "TZ=Europe/Amsterdam */2 6-19 * * 1-5" },
  async ({ step }) => {
    const results = [];
    for (const config of SWARM_BRIDGE_CONFIGS) {
      const result = await step.run(`sync:${config.swarmId}`, () =>
        syncSwarmBridge(config),
      );
      results.push(result);
    }
    return { bridges: results };
  },
);
```

**Phase 60 application:**
- Cron string per D-09: `"TZ=Europe/Amsterdam 0 6 * * 1-5"` (daily 06:00 Amsterdam business-day).
- ID: `"classifier/promotion-cron"`.
- Loop swarm_types via `SELECT DISTINCT swarm_type FROM classifier_rules`.
- Per swarm: `step.run(\`eval-${swarm}-${rule_key}\`, async () => { /* SELECT n,agree from agent_runs join automation_runs; compute wilsonCiLower; INSERT classifier_rule_evaluations; if mutate flag, UPDATE classifier_rules.status */ })`.
- Shadow-mode flag: `if (process.env.CLASSIFIER_CRON_MUTATE !== "true") { /* write evaluation row only, action='shadow_would_promote'/'shadow_would_demote' */ }` per D-19 + RESEARCH §Pitfall 4.
- Demotion alert: `console.warn` + post to Slack via existing helper (D-03).
- **Avoid `*/N` in JSDoc** (CLAUDE.md learning eb434cfd) — single-line `// cron …` comments only.

---

### `web/lib/inngest/functions/classifier-verdict-worker.ts` (inngest event-worker)

**Analog:** `web/lib/inngest/functions/debtor-email-icontroller-cleanup-worker.ts:45-172`

**Event-trigger config + retries:0 rationale** (analog lines 45-63):
```typescript
export const cleanupIControllerShardWorker = inngest.createFunction(
  {
    id: "automations/debtor-email-icontroller-shard-worker",
    // retries: 0 — Browserless connect failures cascade badly with retries...
    retries: 0,
  },
  { event: "icontroller/cleanup.shard.requested" },
  async ({ event, step }) => {
    const admin = createAdminClient();
    const { workerIndex, rows } = event.data as { ... };
    return step.run("process-shard", async () => { ... });
  },
);
```

**Status-flip-then-side-effect pattern** (analog lines 91-99):
```typescript
// Flip to pending so the kanban shows the card in progress and
// a re-trigger of the same shard can't double-pick this row.
await admin
  .from("automation_runs")
  .update({
    automation: "debtor-email-cleanup",
    status: "pending",
    result: { ...r, processed_by: processorName },
  })
  .eq("id", row.id);
await emitAutomationRunStale(admin, "debtor-email-cleanup");
```

**Try/catch per row + emit on each transition** (analog lines 101-157): copy structure for categorize → archive → iController-delete steps. Each side-effect in its own `step.run("categorize")` / `step.run("archive")` per RESEARCH §Pitfall 8 (idempotency on retry).

**Phase 60 deltas:**
- ID: `"classifier/verdict-worker"`.
- Event: `"classifier/verdict.recorded"` (new entry in `web/lib/inngest/events.ts`).
- On approve: categorize+archive via `categorizeEmail` / `archiveEmail` from `@/lib/outlook` (already used by `actions.ts:192,240`); then defer iController-delete row (same pattern as `actions.ts:291-307`).
- Final transition: `status='completed'` (success) or `status='failed'` (with `error_message`); emit `automations:debtor-email-review:stale` after every state change.

---

### `web/lib/classifier/cache.ts` (utility, request-response)

**No codebase analog — greenfield.** Use RESEARCH §Pattern 1 lines 273-306 verbatim. Key decisions:
- Module-level `Map<swarm_type, {rules: Set<string>, expires: number}>`.
- 60s TTL (D-08).
- On error from Supabase: return last-known-good cached set OR empty `Set` (defensive fallback per D-28 step 3).

**Test coverage:** `__tests__/cache.test.ts` — verify TTL behavior, fallback on error, swarm_type isolation.

---

### `web/lib/classifier/wilson.ts` (utility, transform)

**No codebase analog — greenfield.** Use RESEARCH §Pattern 2 lines 322-334 verbatim:
```typescript
const Z_95 = 1.959963984540054;

export function wilsonCiLower(n: number, k: number, z = Z_95): number {
  if (n === 0) return 0;
  const phat = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = phat + z2 / (2 * n);
  const radius = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n);
  return Math.max(0, (center - radius) / denom);
}
```

**Test cases:** spot-check against `route.ts:24-32` empirical values (RESEARCH lines 337-342).

---

### `web/lib/inngest/events.ts` (events registry — MODIFY)

**Analog:** existing `icontroller/cleanup.shard.requested` event entry at lines 151-166:
```typescript
"icontroller/cleanup.shard.requested": {
  data: {
    workerIndex: number;
    rows: Array<{ ... }>;
  };
},
```

**Phase 60 additions:**
```typescript
"classifier/verdict.recorded": {
  data: {
    automation_run_id: string;
    agent_run_id: string;
    swarm_type: string;
    rule_key: string;
    decision: "approve" | "reject";
    message_id: string;
    source_mailbox: string;
    entity: string;
    predicted_category: string;
    override_category?: string;
  };
},
"classifier/backfill.run": {
  data: {
    triggeredBy?: string;
  };
},
```

---

### `web/app/api/inngest/route.ts` (serve route — MODIFY)

**Analog:** itself, lines 22-26 (existing import + array entry pattern):
```typescript
import { syncDebtorEmailBridgeCron } from "@/lib/inngest/functions/debtor-email-bridge";
import { cleanupIControllerDispatch } from "@/lib/inngest/functions/debtor-email-icontroller-cleanup-dispatcher";
import { cleanupIControllerShardWorker } from "@/lib/inngest/functions/debtor-email-icontroller-cleanup-worker";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    /* … */
    syncDebtorEmailBridgeCron,
    cleanupIControllerDispatch,
    cleanupIControllerShardWorker,
    /* … */
  ],
});
```

**Phase 60 additions:** import + register `classifierPromotionCron`, `classifierVerdictWorker`, `classifierBackfill`.

---

### `web/app/api/automations/debtor-email/ingest/route.ts` (MODIFY lines 39-46 + 267-289)

**Self-analog.** Two surgical edits:

**Edit 1 — replace hardcoded Set (lines 39-46):**
```typescript
// BEFORE
const AUTO_ACTION_RULES = new Set<string>([
  "subject_paid_marker",
  "payment_subject",
  /* … */
]);

// AFTER
import { readWhitelist } from "@/lib/classifier/cache";
// inside handler, after admin client init:
const whitelist = await readWhitelist(admin, "debtor-email");
const isWhitelistMatch = whitelist.has(r.matchedRule);
```

Per D-28 step 3: keep hardcoded `Set` as fallback inside `cache.ts` until Wave 4 confirms 1-day clean run, then drop in follow-up commit.

**Edit 2 — add typed columns to predicted insert (lines 272-289):**
```typescript
// BEFORE
await admin.from("automation_runs").insert({
  automation: "debtor-email-review",
  status: "predicted",
  result: {
    stage: "zapier_ingest_classify",
    message_id: messageId,
    source_mailbox: sourceMailbox,
    entity: settings.entity,
    /* … */
  },
  /* … */
});

// AFTER — promote to top-level typed columns per D-11
await admin.from("automation_runs").insert({
  automation: "debtor-email-review",
  status: "predicted",
  swarm_type: "debtor-email",      // NEW
  topic: r.category,                // NEW (e.g., 'payment_admittance')
  entity: settings.entity,          // NEW (top-level, not in result)
  mailbox_id: settings.id,          // NEW (FK to debtor.labeling_settings.id)
  result: { /* unchanged */ },
  /* … */
});
```

Apply same typed-column write to ALL `automation_runs.insert` callsites in this route (also lines 230-243 — fetch_error / not_found rows).

---

### `web/app/(dashboard)/automations/debtor-email-review/actions.ts` (REWRITE)

**Self-analog (refactor) + analog: `cleanup-worker.ts:91-99` (status-flip + emit pattern).**

**Strip:** `categorizeEmail`, `archiveEmail`, iController-delete logic (lines 192-307). All side-effects move to `classifier-verdict-worker.ts`.

**Keep + adapt the feedback-write pattern (current actions.ts:104-130):**
```typescript
// Always log feedback — whatever the decision.
const feedbackRow = {
  automation: "debtor-email-review",
  status: "feedback" as const,
  result: { /* … */ predicted: { /* … */ } },
  /* … */
};
await admin.from("automation_runs").insert(feedbackRow);
await emitAutomationRunStale(admin, "debtor-email-review");
```

**New shape (per D-16/D-17):**
```typescript
"use server";
import { inngest } from "@/lib/inngest/client";

export async function recordVerdict(input: VerdictInput) {
  const admin = createAdminClient();

  // 1. UPDATE automation_runs row (predicted → feedback)
  await admin.from("automation_runs")
    .update({ status: "feedback", completed_at: new Date().toISOString() })
    .eq("id", input.automation_run_id);

  // 2. INSERT public.agent_runs (telemetry; D-01)
  const { data: ar } = await admin.from("agent_runs").insert({
    swarm_type: "debtor-email",
    automation_run_id: input.automation_run_id,
    rule_key: input.rule_key,
    human_verdict: input.decision === "approve" ? "approved" : "rejected_other",
    corrected_category: input.override_category ?? null,
    /* … */
  }).select("id").single();

  // 3. Fire event for async side-effects (D-16/D-29)
  await inngest.send({
    name: "classifier/verdict.recorded",
    data: { /* see events.ts entry above */ },
  });

  // 4. Broadcast invalidation
  await emitAutomationRunStale(admin, "debtor-email-review");

  return { ok: true };
}
```

---

### `web/app/(dashboard)/automations/debtor-email-review/page.tsx` (REWRITE)

**Self-analog (the `searchParams` + admin client + server-component shape stays).** Strip all Outlook calls.

**Pattern to strip** (current page.tsx lines 51-119): the `while (windowsWalked < MAX_WINDOWS)` loop, `listInboxMessages`, the per-batch `reviewedIds` lookup. All gone.

**New pattern (D-10/D-13/D-14):**
```typescript
import { createAdminClient } from "@/lib/supabase/admin";
import { AutomationRealtimeProvider } from "@/components/automations/automation-realtime-provider";
import { QueueTree } from "./queue-tree";
import { PredictedRowList } from "./predicted-row-list";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ topic?: string; entity?: string; mailbox?: string; rule?: string; tab?: string; before?: string }>;
}

export default async function DebtorEmailReviewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const admin = createAdminClient();

  // Counts query via RPC (D-13; per RESEARCH lines 581 — Supabase JS doesn't natively GROUP BY)
  const { data: counts } = await admin.rpc("classifier_queue_counts", {
    p_swarm_type: "debtor-email",
  });

  // Initial list (D-14 cursor pagination)
  const listQuery = admin.from("automation_runs")
    .select("*")
    .eq("status", "predicted")
    .eq("swarm_type", "debtor-email")
    .order("created_at", { ascending: false })
    .limit(100);
  if (params.before) listQuery.lt("created_at", params.before);
  if (params.entity) listQuery.eq("entity", params.entity);
  if (params.mailbox) listQuery.eq("mailbox_id", parseInt(params.mailbox));
  if (params.rule) listQuery.eq("result->predicted->>rule", params.rule);
  const { data: rows } = await listQuery;

  // Today's promoted rules — for race-cohort banner (per RESEARCH Open Q #5)
  const today = new Date(); today.setHours(0,0,0,0);
  const { data: promotedToday } = await admin.from("classifier_rules")
    .select("rule_key, promoted_at")
    .eq("swarm_type", "debtor-email")
    .eq("status", "promoted")
    .gte("promoted_at", today.toISOString());

  return (
    <AutomationRealtimeProvider automations={["debtor-email-review"]}>
      <div className="grid grid-cols-[320px_1fr] gap-6">
        <QueueTree counts={counts ?? []} selection={params} />
        <PredictedRowList
          rows={rows ?? []}
          promotedToday={promotedToday ?? []}
          selection={params}
        />
      </div>
    </AutomationRealtimeProvider>
  );
}
```

**Migration note:** the new SQL function `public.classifier_queue_counts(p_swarm_type text)` lives in `supabase/migrations/20260428_classifier_queue_counts.sql` (RESEARCH §Counts query line 581; RESEARCH Open Q #4 also recommends a SQL view `classifier_rule_telemetry` for the cron).

---

### `web/app/(dashboard)/automations/debtor-email-review/queue-tree.tsx` (NEW client component)

**Analog:** `web/components/v7/swarm-list-item.tsx:19-46` (active-state styling) + `web/components/v7/sidebar-mini-stat.tsx` (count-badge).

**Active-state pattern** (swarm-list-item.tsx lines 25-29):
```typescript
const baseClass =
  "flex flex-col gap-1 rounded-[var(--v7-radius-inner)] transition-all duration-[180ms] ease-out no-underline";
const stateClass = isActive
  ? "bg-[var(--v7-teal-soft)] border-l-[3px] border-[var(--v7-teal)] pl-[9px] pr-3 py-3"
  : "bg-transparent hover:bg-[rgba(255,255,255,0.04)] hover:translate-x-0.5 px-3 py-3";
```

**Phase 60 application:** swap `--v7-teal-soft`/`--v7-teal` for `--v7-brand-primary-soft`/`--v7-brand-primary` (per UI-SPEC §Color "Accent reserved for: ... active node in the topic→entity→mailbox tree").

**Count-badge pattern** (sidebar-mini-stat.tsx lines 18-26):
```typescript
export function SidebarMiniStat({ count, label, tone }: SidebarMiniStatProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--v7-radius-pill)] text-[12px] leading-[1.3] font-medium ${toneClasses[tone]}`}
    >
      {count} {label}
    </span>
  );
}
```

**Phase 60 specifics:**
- 3-level recursive tree: topic → entity → mailbox.
- 16px indent per depth (UI-SPEC §Spacing Scale).
- URL-driven selection (UI-SPEC §Interaction Contract): write `?topic=…&entity=…&mailbox=…` via `useRouter().push()`.
- Hide badge when `count === 0` (UI-SPEC §Sidebar count badges).
- Tabular-nums on count: `font-variant-numeric: tabular-nums` (UI-SPEC §Typography).
- WAI-ARIA tree pattern: `role="tree"`, `role="treeitem"`, `aria-expanded`, arrow-key nav.

---

### `web/app/(dashboard)/automations/debtor-email-review/predicted-row-item.tsx` (NEW client component)

**Analog:** `web/components/v7/kanban/job-tag-pill.tsx:1-37` (status pill rendering).

**Pill pattern** (analog lines 17-37):
```typescript
const VARIANT_BG: Record<JobTagVariant, string> = {
  default: "rgba(255,255,255,0.04)",
  warn: "var(--v7-amber-soft)",
  risk: "var(--v7-pink-soft)",
  ok: "var(--v7-teal-soft)",
};

export function JobTagPill({ label, variant = "default" }: JobTagPillProps) {
  return (
    <span
      className={cn(
        "px-[9px] py-[6px] rounded-[var(--v7-radius-pill)]",
        "text-[11.8px] leading-[1.2] text-[var(--v7-muted)]",
        "border border-[var(--v7-line)]",
      )}
      style={{ background: VARIANT_BG[variant] }}
    >
      {label}
    </span>
  );
}
```

**Phase 60 application:**
- Status pill (`Predicted` / `Approving…` / `Rejecting…` / `Action failed — Retry`) per UI-SPEC §Copywriting Contract.
- Approve button: filled `--v7-brand-primary` (UI-SPEC §Color: accent reserved for "Approve & action" button).
- Reject button: outline `--v7-red`.
- 8px gap between buttons (UI-SPEC).
- Optimistic transition pattern: on click, set local state → `Approving…` → call `recordVerdict` server action → on success row removes from list (server confirmed the broadcast). On failure: revert + toast `Couldn't record verdict — try again`.

---

### `web/app/(dashboard)/automations/debtor-email-review/predicted-row-list.tsx` (NEW client component)

**Analog:** `web/components/automations/automation-realtime-provider.tsx:43-111` (broadcast subscribe + refetch) + `web/components/v7/drawer/agent-detail-drawer.tsx:88-92` (Sheet body styles for the right detail panel).

**Realtime refetch pattern** (provider.tsx lines 81-94):
```typescript
const channels = automations.map((name) =>
  supabase
    .channel(`automations:${name}:stale`)
    .on("broadcast", { event: "stale" }, () => {
      refetch();
    })
    .subscribe(...),
);
```

**Phase 60 application:**
- Component wraps in `<AutomationRealtimeProvider automations={["debtor-email-review"]}>` — already at page level, so this child uses `useAutomationRuns()`.
- 200ms fade-in animation on prepend (UI-SPEC §Interaction Contract). Respect `prefers-reduced-motion`.
- Cursor `Load older` button → URL push `?before=<oldest_created_at>`.
- Empty states copy verbatim from UI-SPEC §Copywriting Contract.

---

### `web/app/(dashboard)/automations/debtor-email-review/race-cohort-banner.tsx` (NEW client component)

**Analog:** UI-SPEC names `web/components/v7/realtime-status-indicator.tsx` as the chip-styling reference. Pattern is sticky banner at top of detail panel.

**Phase 60 specifics:**
- Render only when `selection.rule ∈ promotedToday` AND `count > 0`.
- Copy: `Bulk-clear remaining {N} predicted rows for promoted rule "{rule_key}"` (UI-SPEC).
- Click → shadcn `<Dialog>` confirmation modal → on confirm, sequentially call `recordVerdict` per row, stream progress (`12 of 47 cleared…`).

---

### `web/app/(dashboard)/automations/classifier-rules/page.tsx` (NEW server component)

**Analog:** new debtor-email-review page.tsx pattern above + `createAdminClient` usage.

**Phase 60 specifics:**
- Server component reads `classifier_rules` cross-swarm + 14d evaluation history for sparkline.
- Group rows by `status` (Promoted / Candidates / Demoted / Manually blocked) — UI-SPEC §Copywriting Contract.
- No realtime — page re-fetches on focus + 5-min interval (UI-SPEC §Interaction Contract).
- Shadow-mode banner shown until `process.env.CLASSIFIER_CRON_MUTATE === "true"`.

---

### `web/app/(dashboard)/automations/classifier-rules/rule-status-badge.tsx` (NEW)

**Analog:** `web/components/v7/kanban/job-tag-pill.tsx` (exact role match).

Phase 60 status palette per UI-SPEC §Color:
```typescript
const STATUS_BG: Record<RuleStatus, string> = {
  candidate: "var(--v7-amber-soft)",
  promoted: "var(--v7-brand-primary-soft)",
  demoted: "rgba(181,69,78,0.13)",       // --v7-red @ 13%
  manual_block: "var(--v7-panel-2)",
  shadow_would_promote: "var(--v7-blue-soft)",
};
```

---

### `web/lib/classifier/__tests__/wilson.test.ts` (NEW unit test)

**Analog:** `web/lib/inngest/__tests__/pipeline-approval.test.ts:1-9`:
```typescript
import { describe, it } from "vitest";

describe("pipeline HITL integration", () => {
  it.todo("creates approval request before calling waitForEvent");
  /* … */
});
```

**Phase 60 specifics:** real assertions, not `it.todo`. Spot-check against RESEARCH Backfill table (lines 587-595): `expect(wilsonCiLower(169, 169)).toBeCloseTo(0.978, 3)`, etc.

---

## Shared Patterns

### Service-role admin client (every server-side surface)

**Source:** `web/lib/supabase/admin.ts:1-13`
**Apply to:** every Inngest function, every server action, every server component.
```typescript
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```
Usage: `const admin = createAdminClient();` at top of every handler. Bypasses RLS — service role only.

---

### Single-broadcast helper (every state-change write to `automation_runs`)

**Source:** `web/lib/automations/runs/emit.ts:16-36`
**Apply to:** Every `automation_runs` `INSERT`/`UPDATE` in: ingest route, verdict-worker, server action, backfill function.
```typescript
export async function emitAutomationRunStale(
  admin: SupabaseClient,
  automation: string,
): Promise<void> {
  if (!automation) return;
  const channelName = `automations:${automation}:stale`;
  try {
    const ch = admin.channel(channelName);
    await ch.send({
      type: "broadcast",
      event: "stale",
      payload: { automation, at: new Date().toISOString() },
    });
    await admin.removeChannel(ch);
  } catch (err) {
    console.warn("[emitAutomationRunStale] broadcast failed", { automation, err });
  }
}
```
**Channel for Phase 60:** reuse `automations:debtor-email-review:stale` (RESEARCH §Pattern 5; A5 verified).

---

### Inngest cron timezone + business-hours window

**Source:** `web/lib/inngest/functions/debtor-email-bridge.ts:22` + CLAUDE.md learning `eb434cfd`.
**Apply to:** `classifier-promotion-cron.ts` only (verdict-worker is event-trigger, backfill is one-shot).

```typescript
{ cron: "TZ=Europe/Amsterdam 0 6 * * 1-5" }  // daily 06:00 Amsterdam, Mon-Fri (D-09)
```
**Hard rule:** never put `*/N` cron strings inside `/** */` JSDoc — the `*/` closes the comment. Use `//` single-line comments OR describe in words.

---

### Idempotency on UNIQUE-constraint + ON CONFLICT (every upsert)

**Apply to:** `classifier_rules` (`UNIQUE(swarm_type, rule_key)`), `classifier_rule_evaluations` (`UNIQUE(swarm_type, rule_key, evaluated_at::date)` — per RESEARCH §Pitfall 7).

**Backfill pattern** (RESEARCH lines 627-643):
```typescript
await admin.from("classifier_rules").upsert(
  { swarm_type: "debtor-email", rule_key, /* … */ },
  { onConflict: "swarm_type,rule_key" }
);
```

---

### v7 design tokens (every new UI component)

**Source:** `web/app/globals.css` (--v7-* namespace) + UI-SPEC §Design System / §Color / §Typography / §Spacing Scale.
**Apply to:** every new component in `debtor-email-review/` and `classifier-rules/`.
- All radii: `--v7-radius-card` (24px panels), `--v7-radius-sm` (14px rows), `--v7-radius-pill` (999px badges). No new radii.
- All colors: existing `--v7-bg`, `--v7-panel`, `--v7-panel-2`, `--v7-brand-primary`, `--v7-red`, `--v7-amber-soft`, `--v7-blue-soft`. No new color tokens.
- Spacing: 4px grid. 0/4/8/16/24/32/48/64.
- Typography: Satoshi body / Cabinet Grotesk h1 + drawer-title only. Two weights (400, 600). Tabular-nums for N + CI-lo.

---

### Status-driven swarm-bridge (UI rendering)

**Source:** `web/app/api/automations/debtor-email/ingest/route.ts:272-289` (predicted insert) + Phase 55 status enum.
**Apply to:** Queue page renders `status='predicted'` rows; row leaves on `predicted → feedback` transition; verdict-worker drives `feedback → completed | failed`.

---

## No Analog Found

Files where the codebase has no closer match than RESEARCH.md provides. Planner should rely on RESEARCH excerpts:

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `web/lib/classifier/cache.ts` | utility | request-response | No module-level Map+TTL exists in repo. Greenfield (RESEARCH §Pattern 1 lines 273-306 verbatim). |
| `web/lib/classifier/wilson.ts` | utility | transform | Pure math; no statistical helpers in repo. Greenfield (RESEARCH §Pattern 2 lines 322-334 verbatim). |
| `web/app/(dashboard)/automations/classifier-rules/ci-lo-sparkline.tsx` | component | transform (SVG) | No inline-SVG sparkline in repo. UI-SPEC §Interaction Contract specifies 64×24 SVG, stroke `--v7-text`, fill `--v7-panel-2`. Greenfield. |

---

## Metadata

**Analog search scope:**
- `web/lib/inngest/functions/` (16 files scanned)
- `web/lib/automations/` (debtor-email/, runs/, icontroller/, swarm-bridge/)
- `web/components/v7/` (drawer/, kanban/, swarm-list-item, sidebar-mini-stat)
- `web/components/automations/`
- `web/app/api/automations/debtor-email/ingest/`
- `web/app/(dashboard)/automations/debtor-email-review/`
- `supabase/migrations/` (19 files scanned)
- `web/lib/supabase/admin.ts`, `web/lib/inngest/{client,events}.ts`

**Files scanned:** ~52
**Pattern extraction date:** 2026-04-28

## PATTERN MAPPING COMPLETE

**Phase:** 60 — Debtor email close the whitelist-gate loop
**Files classified:** 30 (24 new + 6 modified)
**Analogs found:** 27 / 30

### Coverage
- Files with exact analog: 11
- Files with role-match analog: 16
- Files with no analog (greenfield, RESEARCH-driven): 3

### Key Patterns Identified
- **Inngest topology** is 1:1 copyable from existing functions: cron + per-config step.run loop (`debtor-email-bridge.ts`), event-trigger + retries:0 + status-flip-then-side-effect (`debtor-email-icontroller-cleanup-worker.ts`), per-swarm isolation (`orqai-trace-sync.ts`).
- **Migration shape**: schema declaration + CHECK constraints + RLS + Realtime publication block (`20260423_debtor_agent_runs.sql`); additive `add column if not exists` + verification block (`20260423_mailbox_settings_expansion.sql`).
- **UI reuse map** is exhaustive in UI-SPEC: every new component has a v7-token-styled analog in `components/v7/` (drawer, swarm-list-item, sidebar-mini-stat, job-tag-pill).
- **Realtime contract** is single-channel `automations:{name}:stale` via `emitAutomationRunStale` + `AutomationRealtimeProvider` — Phase 59 already debugged the fan-out.
- **Service-role admin client** + **typed Inngest events** + **`onConflict` upsert** are the cross-cutting infrastructure patterns; every server-side surface uses them.

### File Created
`/Users/nickcrutzen/Developer/Agent Workforce/.planning/phases/60-debtor-email-close-the-whitelist-gate-loop-data-driven-auto-/60-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns in PLAN.md files.
