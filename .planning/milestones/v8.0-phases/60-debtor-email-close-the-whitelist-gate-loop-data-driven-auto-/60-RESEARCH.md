# Phase 60: Debtor email — close the whitelist-gate loop - Research

**Researched:** 2026-04-28
**Domain:** Postgres schema design + Inngest cron/event topology + Next.js queue UI + Supabase Realtime broadcast wiring
**Confidence:** HIGH (codebase patterns), HIGH (schema), MEDIUM (Wilson math implementation choice — both options viable), HIGH (UI reuse)

## Summary

Phase 60 has two coupled deliverables on top of an already-functional pipeline:

1. **Promotion engine** — replace the 6-rule hardcoded `Set` in `web/app/api/automations/debtor-email/ingest/route.ts:39-46` with a `public.classifier_rules` table read through a 60s in-memory cache. A daily Inngest cron (`TZ=Europe/Amsterdam 0 6 * * 1-5`) computes Wilson 95% CI-lo per rule from review-feedback telemetry and (post-flip) mutates `status`. Audit history goes in `public.classifier_rule_evaluations`. Per-mailbox kill-switch in `public.classifier_rules_mailbox_overrides`.
2. **Queue-driven UI** — rewrite `/automations/debtor-email-review/page.tsx` to read `automation_runs WHERE status='predicted'` directly. Add typed columns `swarm_type/topic/entity/mailbox_id` to `automation_runs`. Tree-nav (topic → entity → mailbox) with row list in a v7 right-sliding drawer. Approve/Reject only writes `status='feedback'` + an `agent_runs` verdict row + fires `classifier/verdict.recorded`; a new `classifier-verdict-worker` Inngest function does the slow Outlook + iController work async.

**Critical finding (BLOCKER for D-01 as written):** CONTEXT.md D-01 references `public.agent_runs.human_verdict` as the telemetry source. **That table does not exist.** Migration `supabase/migrations/20260423_debtor_agent_runs.sql` created `debtor.agent_runs` (debtor-scoped, not generic). Phase 55-05-PLAN was intended to migrate to `public.agent_runs` with `swarm_type` discriminator, but no commit landed it (verified: `grep -rn "public.agent_runs" supabase/migrations/` returns nothing; `web/lib/automations/debtor-email/triage/agent-runs.ts` still uses `.schema("debtor").from("agent_runs")`). Phase 60 must either (a) absorb the 55-05 migration as Wave 0, or (b) source CI-lo from `automation_runs.status='feedback'` only and defer the agent_runs unification. Recommend (a) — keeps D-23 (agent-intent rules) feasible without re-architecting.

**Primary recommendation:** Plan Wave 0 = migrations + 55-05 absorption. Wave 1 = ingest-route refactor (cache + table read with hardcoded fallback). Wave 2 = cron + dashboard. Wave 3 = queue-UI rewrite + verdict-worker. Wave 4 = remove fallback after 1-day clean run.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Whitelist read on ingest hot path | API (`route.ts`) | Module-level cache | Sub-100ms; cache hides DB hop |
| Wilson CI-lo computation | Backend (Inngest function, TS) | — | Cron context; SQL function adds deploy friction (D-09 cron is daily, perf is irrelevant) |
| Telemetry aggregation (`agent_runs` × `automation_runs` join) | Database (Supabase via service-role client inside Inngest step) | — | Standard Supabase admin client pattern in `orqai-trace-sync.ts` |
| Promotion mutation (write `status`) | Backend (Inngest function) | — | Service-role write, audit row in same step |
| Queue counts query | Database (Supabase via server component) | — | `GROUP BY` on indexed columns; sub-100ms target |
| Queue list rendering | Frontend Server (Next.js server component) | Frontend Client (broadcast-driven refetch) | Server fetch on initial load, client refetch on `automations:debtor-email-review:stale` |
| Realtime invalidation | Database (Postgres broadcast via service-role) | Frontend Client (`AutomationRealtimeProvider`) | Existing Phase 59 channel pattern |
| Verdict side-effects (Outlook categorize, archive, iController-delete) | Backend (Inngest event-triggered worker) | — | Reuses `openIControllerSession`, retries, decoupled from server-action timeout |
| Race-cohort affordance detection | Frontend Client | Backend (cron emits broadcast) | Cron writes promoted rule → broadcast → UI computes "rows for this rule that predate `promoted_at`" |
| Tree-nav UI state | Frontend Client (URL-driven selection, local expand state) | — | Per UI-SPEC §Interaction Contract |

## User Constraints (from CONTEXT.md)

### Locked Decisions

D-00..D-29 from `60-CONTEXT.md` are locked. Highlights the planner MUST honor:

- **D-00:** All new tables/columns/Inngest functions keyed by `swarm_type`. Phase 60 only populates `debtor-email`.
- **D-01:** Telemetry source is `agent_runs.human_verdict`. (See *Critical finding* above — needs `public.agent_runs` migration absorbed.)
- **D-02:** Auto-promotion: N≥30 AND Wilson 95% CI-lo ≥95%.
- **D-03:** Auto-demotion: CI-lo<92% (5% hysteresis gap), Slack/log alert per demotion.
- **D-04:** Backfill seeds 6 hardcoded debtor rules from historical `automation_runs.status='feedback'`; sets `status='promoted'`.
- **D-05:** `public.classifier_rules` columns specified verbatim. `UNIQUE(swarm_type, rule_key)`.
- **D-06:** Append-only `public.classifier_rule_evaluations`. 1 row/rule/cron-run. Action enum: `no_change|promoted|demoted|shadow_would_promote|shadow_would_demote`.
- **D-07:** `public.classifier_rules_mailbox_overrides` matrix table; `override in ('block','force_promote')`.
- **D-08:** Module-level in-memory cache, 60s TTL, keyed by `swarm_type`.
- **D-09:** Cron `TZ=Europe/Amsterdam 0 6 * * 1-5` (daily, business-day window).
- **D-10:** Source of truth is `automation_runs.status='predicted'`. Outlook live-fetch is REMOVED from `page.tsx`.
- **D-11:** `automation_runs` gets typed columns: `swarm_type text not null`, `topic text`, `entity text`, `mailbox_id int`.
- **D-12:** Topic→entity→mailbox tree in right-sliding drawer; reuse `agent-detail-drawer.tsx` pattern.
- **D-13:** Counts query = single `GROUP BY swarm_type, topic, entity, mailbox_id` on `status='predicted'`. Indexes `(status, swarm_type)`, `(status, entity)`, `(status, mailbox_id)`.
- **D-14:** Cursor pagination on `created_at`, page-size 100.
- **D-15:** Rule-filter via `?rule=X` JSONB lookup + "Pending promotion" tab.
- **D-16:** Approve/reject = write `human_verdict` + `automation_runs.status='feedback'` + fire `classifier/verdict.recorded`. Side-effects async in worker.
- **D-17:** Row leaves queue on `predicted → feedback` transition.
- **D-18:** Promotion does NOT touch existing `predicted` rows (telemetry preserved); reviewer manually clears.
- **D-19:** Shadow-mode 14d. Cron writes evaluations but does NOT mutate `classifier_rules.status` until `classifier_cron.mutate=true`.
- **D-20:** Per-mailbox kill-switch via `classifier_rules_mailbox_overrides`. Smeba (`mailbox_id=4`) gets immediate benefit; others stay gated by `auto_label_enabled`.
- **D-21:** Per-row approve/reject default. Bulk-approve ONLY for race-condition cohort.
- **D-22:** `classify.ts` UNCHANGED. Regex stays in code.
- **D-23:** LLM intent-agent rules use `kind='agent_intent'`; same lifecycle.
- **D-24:** Reject-after-promotion → next cron run demotes via <92% gate. No tripwire.
- **D-25:** Hand-labels on unknown rows are stored only; no Phase 60 action.
- **D-26:** `/automations/classifier-rules` dashboard page; v7 design tokens.
- **D-27:** No archive/delete of `automation_runs`. Indexes on `(swarm_type, status, created_at desc)`.
- **D-28:** Migration order: Additive → backfill → switch reads (with fallback) → drop fallback.
- **D-29:** Two Inngest functions: `classifier-promotion-cron` + `classifier-verdict-worker`.

### Claude's Discretion

(Recommendations made in this research — see relevant sections.)

- Rule-key namespacing for agent-intent: **recommend `intent:copy_invoice`** (colon delimiter, low collision risk).
- Counts-query indexing: **recommend separate covering indexes per D-13** rather than one mega-covering — see Common Pitfalls §Index bloat.
- Wilson-CI implementation: **recommend TypeScript inside the Inngest function** — see Code Examples.
- Schema name: **recommend `public.classifier_*`** — D-05 already locks `public`.
- v7 drawer variant: **recommend full-page tree+detail layout for the queue, NOT a Sheet drawer over another page** — UI-SPEC §Component Reuse Map already pins this.
- Broadcast channel name: **`automations:debtor-email-review:stale`** already exists. Reuse for Phase 60 (D-13 invalidation).
- Backfill script: **recommend Inngest one-shot function** triggered by manual event `classifier/backfill.run` — keeps service-role secret out of `scripts/`.
- `corrected_category` field: **recommend `agent_runs.verdict_reason` (already in Phase 55 spec) + a new `corrected_category text` column on the same row**.

### Deferred Ideas (OUT OF SCOPE)

Per CONTEXT.md `<deferred>`:
- Outlook Category-as-routing-key, rule-discovery from unknowns, DB-backed regex, LLM prompt-iteration loop, tripwire/24h alerts, manual-flip approval per rule, saved views, materialized counts views, archive strategy for `automation_runs`, general bulk-approve UI.

## Phase Requirements

No phase requirement IDs were provided (`phase_req_ids: null`). CONTEXT.md decisions D-00..D-29 are the canonical spec. The planner maps each plan-wave to the Decision IDs it satisfies.

## Standard Stack

### Core (already installed — no new dependencies)

| Library | Version (verified via package.json) | Purpose | Why Standard |
|---------|-------------------------------------|---------|--------------|
| `@supabase/supabase-js` | already in `web/` | DB writes via service-role admin client | Stack mandate (CLAUDE.md) |
| `inngest` | already in `web/` | Cron + event-trigger durable functions | Stack mandate; existing pattern in `web/lib/inngest/functions/` |
| `next` (App Router) | already in `web/` | Server components for queue page | Stack mandate |
| `lucide-react` | already in `web/` | Icons (Ban, CircleCheck per UI-SPEC) | shadcn convention |
| shadcn `Tabs`, `Table`, `Dialog`, `Sheet`, `Button`, `Badge` | initialized via `web/components.json` | UI primitives | Already in repo per UI-SPEC §Registry Safety |

### Reuse anchors (NEW CODE NEEDED, but borrows existing files)

| Anchor file | What we reuse |
|-------------|---------------|
| `web/components/v7/drawer/agent-detail-drawer.tsx` | Sheet-body styles, slide-in pattern (UI-SPEC: structural reference, NOT a Sheet over another page) |
| `web/components/v7/swarm-sidebar.tsx`, `web/components/v7/swarm-list-item.tsx`, `web/components/v7/sidebar-mini-stat.tsx` | Tree-row + count-badge styling |
| `web/components/v7/kanban/job-tag-pill.tsx` | Status pills |
| `web/components/automations/automation-realtime-provider.tsx` | Broadcast subscription on `automations:debtor-email-review:stale` |
| `web/lib/automations/runs/emit.ts` (`emitAutomationRunStale`) | Single-broadcast helper for D-13 invalidation |
| `web/lib/inngest/functions/orqai-trace-sync.ts` | Reference pattern for `step.run` per-swarm isolation, watermark upserts |
| `web/lib/inngest/functions/debtor-email-bridge.ts` | Reference pattern for cron with `TZ=Europe/Amsterdam ... 1-5` |
| `web/lib/inngest/functions/debtor-email-icontroller-cleanup-worker.ts` | Reference pattern for event-triggered worker (Browserless session management) |
| `web/lib/automations/icontroller/session.ts` | iController session layer (`openIControllerSession`, `deleteEmailOnPage`) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inngest cron for daily promotion | Vercel cron route | Inngest gives us retries + step.run audit; Vercel cron has no idempotency without manual work. Stick with Inngest. |
| TypeScript Wilson CI implementation | Postgres SQL function | SQL keeps math next to data, but adds a migration + deploy coupling. Cron runs once/day; perf is irrelevant. TS lets us unit-test with vitest (Phase 36 has jsdom config). **Recommend TS.** |
| In-memory cache | Edge Config / Upstash KV | Adds infra. Module-level Map is fine for daily-promotion-latency-tolerance (D-08). Vercel warm invocations share module state. |
| Standalone backfill TS in `scripts/` | Inngest one-shot function | TS script needs service-role secret in env; Inngest function reads from runtime env. Recommend Inngest function with manual event trigger. |

**Installation:** None. All dependencies already in `web/package.json`.

**Version verification:** Skipped (no new packages).

## Architecture Patterns

### System Architecture Diagram

```
                   Zapier (per-mailbox)
                         │  POST /ingest
                         ▼
      ┌──────────────────────────────────────┐
      │ /api/automations/debtor-email/ingest │
      │  1. resolve mailbox settings         │
      │  2. fetch+classify                   │
      │  3. read whitelist (CACHED 60s)──────┼─► public.classifier_rules
      │     • cache miss → SELECT by         │   (+ mailbox_overrides matrix)
      │       swarm_type='debtor-email'      │
      │     • cache hit → instant            │
      │  4. branch:                          │
      │     a. AUTO → categorize+archive     │
      │        + insert deferred row         │
      │     b. PREDICTED →                   │
      │        INSERT automation_runs        │
      │        (status='predicted',          │
      │         swarm_type, topic,           │
      │         entity, mailbox_id)          │
      │        + emitAutomationRunStale      │
      └──────────────────────────────────────┘
                         │
        broadcast: automations:debtor-email-review:stale
                         │
                         ▼
      ┌──────────────────────────────────────┐
      │ /automations/debtor-email-review     │
      │   (Server Component on initial load) │
      │  • counts query: GROUP BY            │
      │    swarm_type,topic,entity,mailbox_id│
      │  • list query: ORDER BY created_at   │
      │    DESC LIMIT 100                    │
      │   (Client refetch on broadcast)      │
      └──────────────────────────────────────┘
                         │
                approve / reject click
                         ▼
      ┌──────────────────────────────────────┐
      │ Server action (verdict-write only)   │
      │  1. UPDATE automation_runs           │
      │     SET status='feedback' WHERE id=… │
      │  2. INSERT public.agent_runs         │
      │     (human_verdict, swarm_type,…)    │
      │  3. inngest.send('classifier/        │
      │     verdict.recorded', …)            │
      │  4. emitAutomationRunStale           │
      │  RETURNS instantly                   │
      └──────────────────────────────────────┘
                         │
                         ▼
      ┌──────────────────────────────────────┐
      │ Inngest: classifier-verdict-worker   │
      │  event: classifier/verdict.recorded  │
      │  step.run('categorize'):             │
      │    if approve → categorize+archive   │
      │  step.run('icontroller-delete'):     │
      │    if approve & needs deletion       │
      │      → openIControllerSession        │
      │      → deleteEmailOnPage             │
      │  on failure → status='failed'        │
      │  retry-button rewrites status        │
      └──────────────────────────────────────┘

      ┌──────────────────────────────────────┐
      │ Inngest: classifier-promotion-cron   │
      │  cron: TZ=Europe/Amsterdam 0 6       │
      │        * * 1-5                       │
      │  step.run('list-rules-per-swarm')    │
      │  for swarm in [debtor-email,…]:      │
      │    step.run(`eval-${swarm}-${rule}`):│
      │      • SELECT count(*), count(*)     │
      │        FILTER (WHERE                 │
      │        human_verdict='approved')     │
      │        FROM public.agent_runs        │
      │        WHERE swarm_type=…            │
      │          AND rule_key=…  ←joined via │
      │          automation_run_id           │
      │      • compute Wilson CI-lo (TS)     │
      │      • INSERT classifier_rule_       │
      │        evaluations (action=…)        │
      │      • IF mutate flag ON:            │
      │          UPDATE classifier_rules.    │
      │          status per gates D-02/D-03  │
      └──────────────────────────────────────┘
```

### Recommended Project Structure

```
web/
├── app/
│   ├── api/automations/debtor-email/ingest/route.ts        # MODIFY: read classifier_rules via cache
│   └── (dashboard)/automations/
│       ├── debtor-email-review/                             # FULL REWRITE
│       │   ├── page.tsx                                     # Server: counts + initial list
│       │   ├── actions.ts                                   # Verdict-write only
│       │   ├── queue-tree.tsx                               # NEW: recursive tree-row component
│       │   ├── predicted-row-list.tsx                       # NEW: row list with optimistic transitions
│       │   ├── predicted-row-item.tsx                       # NEW
│       │   └── race-cohort-banner.tsx                       # NEW
│       └── classifier-rules/                                # NEW PAGE (D-26)
│           ├── page.tsx                                     # Server: load rules + 14d sparkline data
│           ├── rules-table.tsx                              # NEW
│           ├── ci-lo-sparkline.tsx                          # NEW (inline SVG, 64×24px)
│           ├── rule-status-badge.tsx                        # NEW
│           └── block-rule-modal.tsx                         # NEW
├── lib/
│   ├── classifier/                                          # NEW MODULE (cross-swarm)
│   │   ├── cache.ts                                         # Module-level Map<swarm_type,{rules,exp}>
│   │   ├── read.ts                                          # readWhitelist(swarm_type) — used by ingest
│   │   ├── wilson.ts                                        # wilsonCiLower(n,k,z=1.96)
│   │   └── types.ts                                         # ClassifierRule, RuleStatus, etc.
│   └── inngest/
│       ├── functions/
│       │   ├── classifier-promotion-cron.ts                 # NEW (D-29)
│       │   ├── classifier-verdict-worker.ts                 # NEW (D-29)
│       │   └── classifier-backfill.ts                       # NEW (one-shot for D-04)
│       └── events.ts                                        # ADD classifier/verdict.recorded + classifier/backfill.run
└── tests/                                                   # vitest (already configured)
    ├── classifier/wilson.test.ts                            # NEW: pure-math unit tests
    ├── classifier/cache.test.ts                             # NEW: TTL behavior
    └── classifier/promotion-gates.test.ts                   # NEW: D-02/D-03 logic
supabase/migrations/
├── 20260428_public_agent_runs.sql                           # NEW (absorbs Phase 55-05; see Critical Finding)
├── 20260428_classifier_rules.sql                            # NEW (D-05/D-06/D-07)
└── 20260428_automation_runs_typed_columns.sql               # NEW (D-11) + indexes (D-13/D-27)
```

### Pattern 1: Module-level cache (D-08)

**What:** Map keyed by `swarm_type`, value `{rules: Set<string>, expires: number}`, TTL 60s.

**When to use:** Hot-path reads on serverless invocations where a 60s freshness lag is acceptable.

**Behavior on Vercel:** A warm invocation reuses the module's memory; a cold start re-fetches from DB on first miss. Different Vercel containers = independent caches. With 60s TTL the worst-case staleness is bounded; the cron runs daily so promotion-latency tolerance is hours not seconds.

**Example:**
```typescript
// web/lib/classifier/cache.ts
import type { SupabaseClient } from "@supabase/supabase-js";

interface CacheEntry {
  rules: Set<string>;       // promoted-only rule_keys
  expires: number;
}

const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

export async function readWhitelist(
  admin: SupabaseClient,
  swarmType: string,
): Promise<Set<string>> {
  const now = Date.now();
  const hit = CACHE.get(swarmType);
  if (hit && hit.expires > now) return hit.rules;

  const { data, error } = await admin
    .from("classifier_rules")
    .select("rule_key")
    .eq("swarm_type", swarmType)
    .eq("status", "promoted");
  if (error) {
    // FALLBACK during Wave 3 of D-28: return hardcoded set if read fails
    return hit?.rules ?? new Set<string>();
  }
  const rules = new Set((data ?? []).map((r) => r.rule_key));
  CACHE.set(swarmType, { rules, expires: now + TTL_MS });
  return rules;
}
```

**Source:** No existing module-level cache in the codebase to copy verbatim — this is new but follows the standard Map-with-TTL pattern. [VERIFIED: codebase grep `grep -rn "Map<.*Set<string>>\|TTL_MS\|module-level cache" web/lib/` returns no matches]

### Pattern 2: Wilson 95% CI-lower-bound in TypeScript

**What:** Pure math, no dependencies.

**Formula** [CITED: standard statistical reference, Wilson score interval, z=1.96 for 95%]:

```
p̂ = k / n
ci_lo = (p̂ + z²/(2n) − z·√((p̂(1-p̂) + z²/(4n)) / n)) / (1 + z²/n)
```

**Code:**
```typescript
// web/lib/classifier/wilson.ts
const Z_95 = 1.959963984540054; // 1.96 with full precision

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

**Verification empirically against `route.ts:24-32`:**
- N=169, k=169 → ci_lo ≈ 0.978 ✓
- N=151, k=151 → ci_lo ≈ 0.976 (JSDoc says 0.967 — JSDoc is rough)
- N=79,  k=79  → ci_lo ≈ 0.954 ✓
- N=415, k=415 → ci_lo ≈ 0.991 ✓

JSDoc rounding is informational; the planner should treat the live cron output as canonical and use the empirical values only for spot-checks during shadow mode (D-19).

### Pattern 3: Inngest cron with `TZ=Europe/Amsterdam ... 1-5` (CLAUDE.md mandate)

**Reference:** `web/lib/inngest/functions/debtor-email-bridge.ts:22` and `…/debtor-email-icontroller-cleanup-dispatcher.ts:47`.

**Example (verbatim from existing dispatcher):**
```typescript
inngest.createFunction(
  { id: "automations/debtor-email-icontroller-dispatch",
    retries: 1,
    concurrency: { limit: 1 } },
  { cron: "TZ=Europe/Amsterdam */5 6-19 * * 1-5" },  // Phase 60: "0 6 * * 1-5"
  async ({ step }) => { /* … */ }
);
```

**Source:** `web/lib/inngest/functions/debtor-email-icontroller-cleanup-dispatcher.ts:41-48` [VERIFIED]

### Pattern 4: Event-triggered worker (Phase 60 verdict-worker)

**Reference:** `web/lib/inngest/functions/debtor-email-icontroller-cleanup-worker.ts`.

**Inheritable choices:**
- `retries: 0` for Browserless-touching steps (long-tail timeouts cascade — see existing comment lines 47-61 in cleanup-worker)
- Wrap each side-effect in `step.run(...)` (CLAUDE.md `docs/inngest-patterns.md` mandate)
- After flipping row to `status='pending'`, `await emitAutomationRunStale(admin, "debtor-email-review")`
- 1.5s × workerIndex stagger if multiple shards (line 80-82 in cleanup-worker — likely not needed for verdict-worker since events fan out 1-per-row naturally)

### Pattern 5: AutomationRealtimeProvider (Phase 59)

**Channel:** `automations:debtor-email-review:stale`. **Already wired** in `web/components/automations/automation-realtime-provider.tsx` and emitted by `web/lib/automations/runs/emit.ts`.

**For Phase 60 queue UI:** drop in `<AutomationRealtimeProvider automations={["debtor-email-review"]}>` at the top of the new page. Children get `useAutomationRuns()` returning live `runs[]`. Server component does initial counts/list query; client refetches on broadcast.

**Source:** `web/components/automations/automation-realtime-provider.tsx:43-111` [VERIFIED]

### Anti-Patterns to Avoid

- **Subscribing per-component to `automation_runs`** — would re-introduce the Phase 59 fan-out problem. Use the shared provider.
- **Client-direct call to `classify.ts`** — Phase 60 explicitly removes re-classification on read (D-10). The `result jsonb` already has `predicted.rule`; trust it.
- **Server-action that does Outlook + iController inline** — current `actions.ts` does this and risks 5-min Vercel timeout. D-16 mandates async worker.
- **Storing migrations under `scripts/` for backfill** — bypasses Inngest replay/audit. Use Inngest one-shot function with manual event trigger.
- **Putting cron-string with `*/N` in a JSDoc `/** */` comment** — `*/N` closes the comment. CLAUDE.md learning `eb434cfd`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Wilson confidence interval | Custom approximation | `wilsonCiLower(n, k)` from new `web/lib/classifier/wilson.ts` | Standard statistical formula; spot-checked against `route.ts` JSDoc empirics |
| Realtime fan-out | New Supabase channel | Existing `automations:debtor-email-review:stale` channel + `AutomationRealtimeProvider` | Phase 59 already debugged the fan-out; one channel per automation name is the contract |
| Single-row broadcast | Custom emitter | `emitAutomationRunStale(admin, "debtor-email-review")` | Already handles try/catch + channel cleanup |
| iController session lifecycle | New Browserless connect | `openIControllerSession` / `closeIControllerSession` from `web/lib/automations/icontroller/session.ts` | Handles 2FA, session-key sharding, retries |
| Outlook categorize/archive | New Graph calls | `categorizeEmail` / `archiveEmail` from `web/lib/outlook` | Already handles MR_LABELS taxonomy |
| v7 right-sliding drawer | New Sheet | `web/components/v7/drawer/agent-detail-drawer.tsx` Sheet body styles (UI-SPEC: structural reference, not Sheet-over-page) | Inherits dark/light theme + glass radii |
| Tree-row component | New scratch component | `swarm-list-item.tsx` count-badge + `sidebar-mini-stat.tsx` stat-pill patterns | Inherits v7 token styling |
| Inngest serve-route registration | New route | `web/app/api/inngest/route.ts:28-48` — append both new functions to the `functions` array | Single registration point |

**Key insight:** The codebase already has every primitive Phase 60 needs. The work is composition + 3 migrations + ~7 new files (3 inngest functions, 4 UI files for queue rewrite, 5 UI files for `/classifier-rules`, ~4 lib files in `web/lib/classifier/`). No new npm packages.

## Runtime State Inventory

> Phase 60 is part rename / part schema migration: it changes how rules are stored, how the queue is populated, and where verdict telemetry lands. Inventory:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | (1) Hardcoded `AUTO_ACTION_RULES` Set in `route.ts:39-46` — 6 rule keys. Migrate to `classifier_rules` rows via backfill. (2) Existing `automation_runs.result` JSONB has `predicted.rule, predicted.category, predicted.confidence, source_mailbox, entity` — backfill new typed columns from these paths. (3) `debtor.agent_runs` rows from Phase 55 swarm exist (verified: `web/lib/automations/debtor-email/triage/agent-runs.ts:24` writes there). They have `human_verdict` already. Either move to `public.agent_runs` or query both during transition. | (1) Wave 0 migration + Inngest backfill function. (2) Single `UPDATE automation_runs SET swarm_type='debtor-email', topic=result->>'category', entity=result->>'entity', mailbox_id=(SELECT id FROM debtor.labeling_settings WHERE source_mailbox=result->>'source_mailbox')` — wrapped in batched migration. (3) Critical: see Critical Finding — recommend Wave 0 absorbs 55-05. |
| Live service config | Zapier webhooks per mailbox (Smeba is the only fully-wired one; Berki/Sicli/Smeba-Fire/FireControl seeded but `auto_label_enabled=false`). They post to `/api/automations/debtor-email/ingest` with `source_mailbox` field. **No change needed** — Phase 60 doesn't touch the Zap surface. The ingest route's logic is what changes. | None. |
| OS-registered state | None. No cron jobs registered outside Inngest, no Windows Task Scheduler, no pm2 saved processes. | None — verified by `find . -name "ecosystem.config*"` returning empty and Inngest registration audit in `web/app/api/inngest/route.ts`. |
| Secrets/env vars | (1) `ZAPIER_INGEST_SECRET` — already used by ingest route, no change. (2) NEW: `CLASSIFIER_CRON_MUTATE` env var (boolean, default false during shadow). Alternative: row in a new `public.settings` table — see Pitfall §Shadow-mode flag below. (3) `BROWSERLESS_API_TOKEN` — used by verdict-worker via existing iController session module, no change. (4) `INNGEST_*` — no change. | Recommend env var for the flag. Set in Vercel ENV after 14-day shadow window. |
| Build artifacts / installed packages | None. No new npm packages; no build-time generation needed. The new SQL migrations get applied via Supabase Management API per CLAUDE.md project pattern (memory: `reference_supabase_management_api.md`). | None. |

**The canonical question:** *After every file in the repo is updated, what runtime systems still have the old string cached, stored, or registered?*
- **`AUTO_ACTION_RULES` Set:** removed in Wave 4 of D-28 after 1-day clean run. Until then, ingest route falls back to it if `classifier_rules` returns empty.
- **Existing `predicted` rows from before typed-column backfill:** rows get NEW columns populated by the migration; UI queries the typed columns from day 1. Untyped rows post-migration would be a bug — surface via a CHECK constraint or backfill verification step.

## Common Pitfalls

### Pitfall 1: `public.agent_runs` does not exist (BLOCKER)

**What goes wrong:** D-01 references `public.agent_runs.human_verdict` but the migration that landed creates `debtor.agent_runs`. The promotion cron's join query will silently return zero rows.

**Why it happens:** Phase 55's CONTEXT planned `public.agent_runs`, but the migration committed (`20260423_debtor_agent_runs.sql`) used the `debtor` schema. Phase 55-05-PLAN was the migration plan; verified via git log that it didn't ship — `web/lib/automations/debtor-email/triage/agent-runs.ts:24` still writes to `.schema("debtor")`.

**How to avoid:** Wave 0 of Phase 60 MUST include the schema migration to `public.agent_runs` with `swarm_type` (Phase 55-05 plan). Otherwise:
- Option B: Phase 60 sources telemetry purely from `automation_runs.status='feedback'` (which already encodes `predicted.rule, decision, override_category` per `actions.ts:104-129`). This loses the agent-intent path (D-23) cleanly but unblocks the regex path.
- **Recommended option:** A — absorb 55-05.

**Warning signs:** Cron runs once, writes 6 rule_evaluation rows with N=0, then "no_change" forever. Detection: any `classifier_rule_evaluations.n=0` after a backfill day = config error.

### Pitfall 2: Race condition on classification + promotion

**What goes wrong:** A rule promoted by the 06:00 cron has `predicted` rows already in queue from yesterday. Reviewer-clicked-through batch is now stale — they're approving rows that the system would now auto-action.

**Why it happens:** D-18 explicitly leaves the cohort in queue (telemetry preservation).

**How to avoid:** D-21 surfaces a banner on the relevant tree-node. Detection logic:
```sql
SELECT count(*) FROM automation_runs ar
WHERE ar.status = 'predicted'
  AND ar.swarm_type = 'debtor-email'
  AND ar.result->'predicted'->>'rule' = $rule_key
  AND ar.created_at < cr.promoted_at  -- the cohort
FROM classifier_rules cr WHERE cr.rule_key = $rule_key;
```

The UI watches for `classifier_rules.status='promoted'` changes via a small additional broadcast on the existing channel (or by polling `classifier_rules` once on tree-load) — Phase 60 doesn't need a second realtime channel.

**Warning signs:** Reviewers report "I just approved a rule that auto-actions now — was my approval needed?" — answer: yes, telemetry feeds future demotion math (D-24).

### Pitfall 3: Index bloat from a single covering index

**What goes wrong:** A "covering" index `(status, swarm_type, topic, entity, mailbox_id, created_at)` doesn't actually serve all D-13 queries efficiently. Postgres can only seek on a leading prefix; a query filtered by `entity` alone won't use this index.

**Why it happens:** B-tree indexes are prefix-seekable. The 3 separate composite indexes from D-13 give the query planner real options.

**How to avoid:** Stick with D-13 verbatim — `(status, swarm_type)`, `(status, entity)`, `(status, mailbox_id)`. Plus `(swarm_type, status, created_at desc)` for the cursor-paginated list (D-27). Test with `EXPLAIN ANALYZE` on the counts query.

**Warning signs:** Queue page renders in >100ms on test data with 10k rows.

### Pitfall 4: Shadow-mode flag mechanics — env var vs settings row

**What goes wrong:** Env-var requires a Vercel redeploy to flip. Settings-row in a new `public.classifier_runtime_settings` table is dashboard-toggleable but adds another table.

**How to avoid:** Recommend **env var** (`CLASSIFIER_CRON_MUTATE=true`) for D-19 because:
1. The flip is a one-time event after 14d shadow.
2. The cron reads the value at the start of every run — adding a `if (process.env.CLASSIFIER_CRON_MUTATE !== "true") return shadow_mode_path()` is one line.
3. CLAUDE.md inventories Vercel env-var pattern as the standard for infra flags.

If the team wants it dashboard-toggleable later, migrate to a settings-row in a follow-up phase.

**Warning signs:** "How do I flip the flag" question in operations chat — write the runbook before flip-day.

### Pitfall 5: JSONB double-encoding in `automation_runs.result`

**What goes wrong:** `result` field accidentally gets stringified twice (e.g., when something passes a JSON-string instead of an object). Reads via `result->'predicted'->>'rule'` return null because `result` is now a JSON-encoded string, not an object.

**Why it happens:** Documented codebase issue per `docs/supabase-patterns.md` and CLAUDE.md (`while (typeof state === 'string') state = JSON.parse(state)`).

**How to avoid:** Defensive read helper for the `predicted.rule` lookup in the rule-filter (D-15). For the typed columns (D-11), this is moot — `swarm_type/topic/entity/mailbox_id` are top-level columns.

### Pitfall 6: Cron timezone string inside JSDoc

**What goes wrong:** Putting `cron: "*/2 6-19 * * 1-5"` literally in a `/** */` JSDoc closes the comment at `*/`.

**How to avoid:** Single-line `// cron …` comments OR describe the schedule in words. CLAUDE.md learning `eb434cfd`.

### Pitfall 7: ON CONFLICT semantics for `classifier_rule_evaluations`

**What goes wrong:** Cron runs twice on the same day (e.g., manual re-trigger after fix). Without idempotency, two evaluation rows per rule per day → distorts sparkline.

**How to avoid:** `UNIQUE(swarm_type, rule_key, evaluated_at::date)` index + `INSERT … ON CONFLICT DO UPDATE`. The `code_context` section of CONTEXT.md mentions this — pin it explicitly.

### Pitfall 8: Verdict-worker double-categorize on retry

**What goes wrong:** Inngest retries a failed step. If `categorize` step succeeded but `archive` failed, retry calls categorize again, doubling labels.

**How to avoid:** Per `cleanup-worker.ts:91-98` pattern — flip row to `status='pending'` BEFORE side-effects, and check Outlook `categories` for an existing MR-label as idempotency. Also: split into separate `step.run("categorize")` and `step.run("archive")` so each is independently memoized.

## Code Examples

### Migration: `public.classifier_rules` (D-05)

```sql
-- Source: derived from CONTEXT.md D-05 verbatim
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
-- service-role writes; clients read via server actions or admin client
```

### Migration: typed columns + indexes on `automation_runs` (D-11/D-13/D-27)

```sql
-- Source: derived from D-11/D-13/D-27. Backfill UPDATE wrapped in batched runs.
ALTER TABLE public.automation_runs
  ADD COLUMN IF NOT EXISTS swarm_type  text,
  ADD COLUMN IF NOT EXISTS topic       text,
  ADD COLUMN IF NOT EXISTS entity      text,
  ADD COLUMN IF NOT EXISTS mailbox_id  int;

-- Backfill from existing JSONB shape (verified against route.ts:272-289)
UPDATE public.automation_runs ar
SET
  swarm_type = 'debtor-email',
  topic      = ar.result->'predicted'->>'category',
  entity     = ar.result->>'entity',
  mailbox_id = ls.id
FROM debtor.labeling_settings ls
WHERE ar.automation = 'debtor-email-review'
  AND ar.swarm_type IS NULL
  AND ls.source_mailbox = ar.result->>'source_mailbox';

ALTER TABLE public.automation_runs
  ALTER COLUMN swarm_type SET NOT NULL;  -- after backfill confirmed

CREATE INDEX automation_runs_status_swarm_idx
  ON public.automation_runs (status, swarm_type);
CREATE INDEX automation_runs_status_entity_idx
  ON public.automation_runs (status, entity);
CREATE INDEX automation_runs_status_mailbox_idx
  ON public.automation_runs (status, mailbox_id);
CREATE INDEX automation_runs_swarm_status_created_idx
  ON public.automation_runs (swarm_type, status, created_at desc);
```

### Counts query (D-13)

```typescript
// Source: derived from D-13. Single round-trip, group-by typed columns.
const { data } = await admin
  .from("automation_runs")
  .select("swarm_type, topic, entity, mailbox_id, count:id.count()")
  .eq("status", "predicted")
  .eq("swarm_type", "debtor-email"); // Phase 60 only populates debtor-email
// Postgres returns one row per (topic,entity,mailbox_id) — flatten to tree client-side
```

(Supabase JS does not natively `GROUP BY`; use a Postgres function or raw SQL via `.rpc(...)`. **Recommend** creating a small SQL function `public.classifier_queue_counts(swarm_type text)` and calling via `admin.rpc("classifier_queue_counts", {swarm_type: "debtor-email"})`.)

### Backfill seed for the 6 hardcoded rules (D-04)

Per `route.ts:24-32` JSDoc, plus the 7th category-rollup. Computed via `wilsonCiLower(n, n)` where every observed feedback was `approved`:

| rule_key | empirical N | empirical k=approved | computed CI-lo (z=1.96) | promoted? |
|----------|-------------|-----------------------|--------------------------|-----------|
| `subject_paid_marker` | 169 | 169 | 0.978 | YES (≥30, ≥0.95) |
| `payment_subject` | 151 | 151 | 0.976 | YES |
| `payment_sender+subject` | 79 | 79 | 0.954 | YES |
| `payment_system_sender+body` | 9 | 9 | 0.701 | NO individually — promoted via category-rollup decision |
| `payment_sender+hint+body` | 8 | 8 | 0.676 | NO individually — promoted via category-rollup |
| `payment_sender+body` | 2 | 2 | 0.342 | NO individually — promoted via category-rollup |

**Category-rollup question (per CONTEXT.md `<specifics>`):** The N=2/N=8/N=9 rules are listed as "dekking via category-rollup" because the parent category `payment_admittance` aggregated to N=415, k=415, ci_lo=0.991. Recommend the planner adopts ONE of these schema shapes:

- **Option A (parent_rule_key):** Add `parent_rule_key text null` to `classifier_rules`. Backfill seeds these 3 small-N rules with `parent_rule_key='category:payment_admittance'` and a row at `rule_key='category:payment_admittance', kind='category_rollup', n=415, k=415, status='promoted'`. Cron promotes a leaf rule if either its own gates pass OR its parent passes.
- **Option B (just promote them with manual notes):** Backfill these as `status='promoted'`, `n=9/8/2`, `notes='promoted-via-payment_admittance-category-rollup-N=415'`. Skip the parent table row. Future cron evaluations will compute their own CI-lo as N grows; if it ever drops below 92%, demote per D-03.

**Recommend Option B.** Reasoning: simplest schema (no `parent_rule_key` column needed), promotes correctly today, and the cron's own per-rule math takes over once each rule individually reaches N≥30. The `notes` field carries the audit trail. Option A adds a polymorphic complexity that's only used for 3 historical rules.

**Implementation as Inngest one-shot function** (`classifier/backfill.run` event):

```typescript
// web/lib/inngest/functions/classifier-backfill.ts
import { wilsonCiLower } from "@/lib/classifier/wilson";

export const classifierBackfill = inngest.createFunction(
  { id: "classifier/backfill", retries: 1 },
  { event: "classifier/backfill.run" },
  async ({ step }) => {
    const seeds = [
      { rule_key: "subject_paid_marker", n: 169, agree: 169 },
      { rule_key: "payment_subject", n: 151, agree: 151 },
      { rule_key: "payment_sender+subject", n: 79, agree: 79 },
      { rule_key: "payment_system_sender+body", n: 9, agree: 9,
        notes: "promoted via payment_admittance category-rollup N=415" },
      { rule_key: "payment_sender+hint+body", n: 8, agree: 8,
        notes: "promoted via payment_admittance category-rollup N=415" },
      { rule_key: "payment_sender+body", n: 2, agree: 2,
        notes: "promoted via payment_admittance category-rollup N=415" },
    ];
    return step.run("seed-classifier-rules", async () => {
      const admin = createAdminClient();
      for (const s of seeds) {
        const ci_lo = wilsonCiLower(s.n, s.agree);
        await admin.from("classifier_rules").upsert(
          {
            swarm_type: "debtor-email",
            rule_key: s.rule_key,
            kind: "regex",
            status: "promoted",
            n: s.n,
            agree: s.agree,
            ci_lo,
            last_evaluated: new Date().toISOString(),
            promoted_at: new Date().toISOString(),
            notes: s.notes ?? null,
          },
          { onConflict: "swarm_type,rule_key" }
        );
      }
      return { seeded: seeds.length };
    });
  }
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded `Set<string>` of whitelisted rules | DB-backed `classifier_rules` table + cache | Phase 60 | Rule promotion is data-driven; no code deploy needed for promotion |
| Outlook live-fetch + re-classify on page load (5×300 walk) | Read `automation_runs.status='predicted'` | Phase 60 | Sub-100ms render; no Graph API dependency on page load |
| Server-action does Outlook + iController inline (5-min budget) | Verdict-write only; async worker via Inngest event | Phase 60 | Reviewer UI returns instantly; failures retry with backoff |
| Per-component `automation_runs` postgres_changes subscription | Single broadcast channel `automations:{name}:stale` + refetch | Phase 59 | Realtime fan-out under cap |
| Cron with `* * * * *` UTC | `TZ=Europe/Amsterdam ... 1-5` business-hours window | Phase 58 | 74% Inngest cost reduction (memory: `project_session_20260415_autonomous`) |

**Deprecated/outdated (within Phase 60 surface):**
- `LEGACY_DEFAULT_MAILBOX = "debiteuren@smeba.nl"` in `route.ts:14` — keep until all Zaps pass `source_mailbox`. Not Phase 60 scope.
- `AUTO_ACTION_RULES` Set — removed in Wave 4 of D-28.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `public.agent_runs` does not exist; only `debtor.agent_runs` does | Critical Finding, Pitfall 1 | [VERIFIED via grep + git log; LOW risk] |
| A2 | Wilson CI-lo for N=k=151 ≈ 0.976 (JSDoc rounds to 0.967) | Code Examples §Backfill | [ASSUMED math correct; LOW risk — provide both empirical and computed values to planner] |
| A3 | `result->>'source_mailbox'` is the JSON path that maps to `mailbox_id` via `debtor.labeling_settings` | Migration backfill | [VERIFIED: `route.ts:236, 278` writes `source_mailbox` into `result`] |
| A4 | Vercel module-level Map persists across warm invocations within the same container | Pattern 1 | [CITED: Vercel docs on serverless instance reuse, well-established. Different containers = independent caches; acceptable per D-08 60s TTL] |
| A5 | Existing channel `automations:debtor-email-review:stale` can be reused for typed-column-update broadcasts | Pattern 5 | [VERIFIED: `emit.ts:21` parameterizes channel name on `automation` only — no per-row payload to invalidate] |
| A6 | Phase 55-05 PLAN content (the 55-05 PLAN file's actual mutation set) is reusable here | Critical Finding | [ASSUMED — recommend the planner reads `.planning/phases/55-debtor-email-pipeline-hardening/55-05-PLAN.md` and adapts. NOT verified in this research session beyond confirming the file exists.] |
| A7 | Postgres `count:id.count()` syntax in Supabase JS works for the counts query | Code Examples §Counts query | [ASSUMED — recommend verifying with a Postgres function-based RPC instead, which avoids client-library quirks] |
| A8 | `mailbox_id` should be `int` mapping to `debtor.labeling_settings.id` | D-11 / migration | [ASSUMED based on UI-SPEC's `mailbox=4` URL example — but `labeling_settings` PK type was not directly inspected. Planner should verify with `\d debtor.labeling_settings` before writing migration.] |

## Open Questions

1. **Schema for `public.agent_runs` — copy verbatim from Phase 55 spec, or simplify?**
   - What we know: 55-CONTEXT.md (lines 25-28) lists the planned columns. `debtor.agent_runs` (already deployed) has a richer schema (state machine, intent enum).
   - What's unclear: which Phase 55 columns are still needed for Phase 60's CI-lo math vs which are debtor-swarm-specific.
   - Recommendation: Phase 60 needs only `id, swarm_type, automation_run_id, rule_key, human_verdict, verdict_reason, corrected_category, created_at`. Anything else is gravy and can ride along from the 55-05 spec, but isn't a Phase 60 blocker.

2. **`mailbox_id` as `int` vs `text` (entity name)?**
   - UI-SPEC uses `mailbox=4` (int). `debtor.labeling_settings` has integer `id` (likely — not directly verified).
   - Recommendation: planner should run `psql "\d debtor.labeling_settings"` (or query Supabase REST) before writing the migration. If `id` is `bigint`, use `bigint` not `int`.

3. **Does the cron need a per-rule `step.run()` boundary, or one big aggregate?**
   - Per-rule `step.run` adds memoization granularity (a flaky DB read on rule X doesn't restart the loop). Cost: ~6-20 step.runs per cron tick, well below limits.
   - Recommendation: per-rule. Mirrors `orqai-trace-sync.ts` per-swarm pattern.

4. **Where does `agent_runs.rule_key` come from for the existing-rows backfill?**
   - Existing `automation_runs.result.predicted.rule` is the rule that fired at predict-time.
   - Existing `automation_runs.status='feedback'` rows have `result.predicted.rule` AND `result.decision in ('approve','exclude','recategorize')` per `actions.ts:108-127`.
   - For the cron's CI-lo math: `n` = count of feedback rows for `rule_key`; `agree` = count where `decision='approve' AND override_category IS NULL`.
   - Recommendation: define this in a SQL view `public.classifier_rule_telemetry` so cron reads `(swarm_type, rule_key, n, agree)` directly. Decouples cron from `automation_runs` JSONB structure.

5. **Bulk-clear race-cohort UI: how does the FE know "rule X was just promoted today"?**
   - Server-component reads `classifier_rules WHERE promoted_at::date = today AND swarm_type='debtor-email'` on initial load.
   - Pass list to client; banner shows on tree-node when (selected rule ∈ that list) AND (count of remaining `predicted` rows for rule > 0).
   - Recommendation: include this in the initial server query alongside counts; no extra realtime channel needed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Vercel + Next.js App Router | Page rewrites, server actions | ✓ | already deployed | — |
| Supabase | All migrations + queries | ✓ | already configured (URL in CLAUDE.md) | — |
| Inngest | 2 new functions + backfill | ✓ | already wired (`web/app/api/inngest/route.ts:28-48`) | — |
| Browserless.io | iController-delete in verdict-worker | ✓ | `BROWSERLESS_API_TOKEN` env var per CLAUDE.md | — |
| Outlook Graph API | Categorize+archive in verdict-worker | ✓ | already used by current `actions.ts` | — |
| `vitest` (test framework) | Wilson + cache + gate unit tests | ✓ | already configured (Phase 36 jsdom setup) | — |
| Supabase Management API | Migration apply | ⚠ Conditional | "Token expired" per `.planning/STATE.md` blocker list | User must apply migrations via Supabase Studio SQL editor OR provide a current `sbp_*` token |

**Missing dependencies with no fallback:** None blocking — Supabase Management API token is the only non-trivial gap, and the Studio fallback is well-documented.

**Missing dependencies with fallback:**
- Supabase Management API token expired → use Supabase Studio SQL editor (per Phase 50 verification deferred runbook).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (already in `web/`); Phase 36 introduced jsdom config |
| Config file | `web/vitest.config.ts` (verify path; Phase 36-00-PLAN created stubs) |
| Quick run command | `cd web && pnpm vitest run --reporter=basic` (or `npm test`) |
| Full suite command | `cd web && pnpm vitest run` |

### Phase Requirements → Test Map

CONTEXT.md uses Decision IDs (D-00..D-29) instead of formal requirement IDs. Map to tests:

| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|-------------|
| D-02 | Wilson 95% CI-lo math correct (gates: N≥30, ci_lo≥0.95) | unit | `pnpm vitest run web/tests/classifier/wilson.test.ts` | ❌ Wave 0 |
| D-03 | Demote at <0.92 (hysteresis) | unit | `pnpm vitest run web/tests/classifier/promotion-gates.test.ts -t demotion` | ❌ Wave 0 |
| D-04 | Backfill seeds 6 rules with correct CI-lo, status='promoted' | integration | `pnpm vitest run web/tests/classifier/backfill.test.ts` | ❌ Wave 0 |
| D-05 | classifier_rules CHECK constraints reject invalid status/kind | integration (DB) | manual SQL via Supabase Studio | ❌ Wave 0 (or skip — DDL is self-validating) |
| D-08 | Cache returns same Set within 60s; refetches after | unit | `pnpm vitest run web/tests/classifier/cache.test.ts` | ❌ Wave 0 |
| D-10 | Page renders with status='predicted' rows; Outlook NOT called | integration (mocked) | `pnpm vitest run web/tests/queue/page.test.tsx` | ❌ Wave 0 |
| D-11 | Migration backfill populates typed columns from result JSONB | integration (DB) | manual via SQL `SELECT count(*) WHERE swarm_type IS NULL` post-backfill | ❌ Wave 0 (assertion only) |
| D-13 | Counts query uses index (no Seq Scan on 10k rows) | manual | `EXPLAIN ANALYZE` in Supabase Studio | manual-only |
| D-15 | `?rule=X` filter applies to JSONB path | integration | `pnpm vitest run web/tests/queue/rule-filter.test.tsx` | ❌ Wave 0 |
| D-16 | Approve writes feedback row + fires Inngest event; does NOT call Outlook inline | integration (mocked Inngest) | `pnpm vitest run web/tests/queue/actions.test.ts` | ❌ Wave 0 |
| D-17 | Row disappears from list on `predicted → feedback` (broadcast invalidates) | manual / smoke | manual click-through | manual-only |
| D-19 | Cron with `CLASSIFIER_CRON_MUTATE=false` writes evaluation row but NOT classifier_rules.status update | integration (mocked DB) | `pnpm vitest run web/tests/classifier/cron-shadow.test.ts` | ❌ Wave 0 |
| D-21 | Race-cohort banner shows when rule.promoted_at=today AND remaining count > 0 | unit | `pnpm vitest run web/tests/queue/race-cohort.test.tsx` | ❌ Wave 0 |
| D-29 | Both Inngest functions register successfully (route.ts handler resolves) | smoke | `pnpm dev` then GET `/api/inngest` returns function list | manual-only |

### Sampling Rate
- **Per task commit:** `pnpm vitest run web/tests/classifier --reporter=basic` (Wilson + cache + gates < 5s)
- **Per wave merge:** `pnpm vitest run` (full suite)
- **Phase gate:** Full suite green + manual click-through of queue UI + 1-day shadow-mode cron successful run before flipping `CLASSIFIER_CRON_MUTATE=true`

### Wave 0 Gaps
- [ ] `web/tests/classifier/wilson.test.ts` — covers D-02
- [ ] `web/tests/classifier/cache.test.ts` — covers D-08
- [ ] `web/tests/classifier/promotion-gates.test.ts` — covers D-02/D-03
- [ ] `web/tests/classifier/backfill.test.ts` — covers D-04
- [ ] `web/tests/classifier/cron-shadow.test.ts` — covers D-19 (mocked admin client)
- [ ] `web/tests/queue/page.test.tsx` — covers D-10
- [ ] `web/tests/queue/rule-filter.test.tsx` — covers D-15
- [ ] `web/tests/queue/actions.test.ts` — covers D-16
- [ ] `web/tests/queue/race-cohort.test.tsx` — covers D-21
- [ ] `web/tests/classifier-rules/rules-table.test.tsx` — covers D-26
- [ ] (Optional) `web/tests/conftest`-equivalent: shared mocks for Supabase admin client + Inngest send

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | partial | `ZAPIER_INGEST_SECRET` header on `/ingest` (already wired); reviewer is authenticated via existing Supabase auth on `/automations/*` |
| V3 Session Management | inherited | Supabase auth handles |
| V4 Access Control | yes | Service-role client for cron + worker writes; RLS on `classifier_rules` (read-only for clients), `classifier_rule_evaluations` (no client read), `automation_runs` (existing policy) |
| V5 Input Validation | yes | `swarm_type` enum-like CHECK; `kind` CHECK; `status` CHECK; rule_key length ≤ 128; `mailbox_id` FK or numeric range |
| V6 Cryptography | n/a | No new secrets, no new crypto. Existing `BROWSERLESS_API_TOKEN`, `ZAPIER_INGEST_SECRET`, Supabase service role key — all already in Vercel env vars |
| V8 Errors & Logging | yes | Cron logs every evaluation; demotion fires Slack/log alert per D-03 |
| V13 Configuration | yes | `CLASSIFIER_CRON_MUTATE` env var documented; rotation N/A (boolean flag) |

### Known Threat Patterns for {Vercel + Supabase + Inngest}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Privilege escalation via direct write to `classifier_rules` from client | Elevation | RLS denies non-service-role; UI changes go through server actions that use admin client and validate user is staff |
| SQL injection on `?rule=X` JSONB filter | Tampering | Use Supabase JS `eq("result->predicted->>rule", ruleFilter)` builder — parameterized |
| Replay of Zapier ingest with stolen secret | Spoofing | Existing X-Zapier-Secret header; rotate on suspicion (out of Phase 60 scope) |
| Reviewer abuses bulk-clear race-cohort to skip approvals | Repudiation | All verdicts logged in `agent_runs` with `verdict_set_by`; sparkline in `/classifier-rules` shows demotion if false-positives accumulate (D-24) |
| Worker leaks email content into Inngest step output (memoization size limit) | Information Disclosure | Per `docs/inngest-patterns.md` §"Large Outputs" — store body in Supabase, return `{run_id}` reference. Already current pattern. |
| Verdict-worker double-action on retry | Tampering | Idempotency via Outlook category-presence check (existing `MR_LABELS` pattern in `route.ts:254-262`) |

## Sources

### Primary (HIGH confidence)
- `web/app/api/automations/debtor-email/ingest/route.ts:18-46, 230-323` — hardcoded rules + JSDoc empirics + `predicted` insert branch
- `web/lib/automations/runs/emit.ts:1-37` — broadcast contract
- `web/components/automations/automation-realtime-provider.tsx:43-111` — channel subscription contract
- `web/lib/inngest/functions/debtor-email-icontroller-cleanup-dispatcher.ts:41-48` — cron pattern
- `web/lib/inngest/functions/debtor-email-icontroller-cleanup-worker.ts:45-65, 91-160` — event-worker pattern
- `web/lib/inngest/functions/orqai-trace-sync.ts` — per-entity step.run isolation
- `web/components/v7/drawer/agent-detail-drawer.tsx` — Sheet drawer pattern
- `web/lib/debtor-email/classify.ts:240-358` — full rule-key list (verified 21 rule keys)
- `supabase/migrations/20260326_automation_runs.sql` — base table
- `supabase/migrations/20260423_debtor_agent_runs.sql` — Phase 55's actually-deployed schema (debtor schema, NOT public)
- `supabase/migrations/20260423_mailbox_settings_expansion.sql` — `debtor.labeling_settings` extension
- `.planning/phases/55-debtor-email-pipeline-hardening/55-CONTEXT.md` — planned (not-yet-shipped) `public.agent_runs`
- `.planning/phases/60-debtor-email-close-the-whitelist-gate-loop-data-driven-auto-/60-CONTEXT.md` — D-00..D-29
- `.planning/phases/60-debtor-email-close-the-whitelist-gate-loop-data-driven-auto-/60-UI-SPEC.md` — design contract
- `.planning/STATE.md` — Supabase Management API token expired blocker
- `CLAUDE.md` — stack mandates, cron rules, JSONB double-encoding, learning `eb434cfd`
- `docs/inngest-patterns.md` — step.run + waitForEvent + Large Outputs

### Secondary (MEDIUM confidence)
- Wilson score interval formula — standard statistical reference; spot-checked against `route.ts:24-32` empirics
- Vercel serverless module-level memory persistence across warm invocations — Vercel docs (well-established serverless behavior)

### Tertiary (LOW confidence)
- (None — all claims traceable to either the codebase or the locked CONTEXT.md.)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies already in repo; verified via grep
- Architecture: HIGH — every pattern has an existing-file reference
- Pitfalls: HIGH — all 8 grounded in either the codebase or CLAUDE.md learnings
- Pitfall 1 (`public.agent_runs` doesn't exist): VERIFIED — could be a research blocker if planner can't absorb 55-05
- Code examples: HIGH for SQL/TS; MEDIUM for the Supabase JS counts-query (Assumption A7 needs validation)

**Research date:** 2026-04-28
**Valid until:** 2026-05-28 (30 days; stable codebase, no fast-moving deps)

## RESEARCH COMPLETE

**Phase:** 60 — Debtor email — close the whitelist-gate loop
**Confidence:** HIGH overall, with one BLOCKING ambiguity flagged (Pitfall 1)

### Key Findings

1. **`public.agent_runs` does not exist.** D-01 cites it as the telemetry source, but only `debtor.agent_runs` was deployed in Phase 55. Phase 55-05 (the rename plan) did not ship. **The planner must absorb the 55-05 migration into Phase 60 Wave 0** OR pivot to source telemetry from `automation_runs.status='feedback'` only (which loses D-23 agent-intent path cleanly).
2. **Codebase already has every primitive Phase 60 needs.** No new npm packages. Realtime channel `automations:debtor-email-review:stale` is reusable. Inngest cron + event-worker patterns are 1:1 copyable from cleanup-dispatcher/worker. Wilson math is ~10 lines of TS with vitest unit tests.
3. **Backfill is mechanical.** Six rules + computed CI-lo seed cleanly via an Inngest one-shot function. Recommend Option B (notes-field for rollup-promoted rules; no `parent_rule_key` column).
4. **Counts query needs an RPC**, not raw Supabase JS — Supabase JS doesn't natively `GROUP BY`. Plan a small Postgres function `classifier_queue_counts(swarm_type)`.
5. **`CLASSIFIER_CRON_MUTATE` env var is the right shadow-mode flag** (D-19) — simpler than a settings table and easy to flip in Vercel ENV after the 14-day window.

### File Created
`/Users/nickcrutzen/Developer/Agent Workforce/.planning/phases/60-debtor-email-close-the-whitelist-gate-loop-data-driven-auto-/60-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Every dependency already in repo; nothing new to install |
| Architecture | HIGH | All patterns reference existing committed files |
| Pitfalls | HIGH | All 8 traceable; Pitfall 1 is a flagged BLOCKER for D-01 |
| Wilson math | MEDIUM-HIGH | Standard formula, spot-checked against JSDoc empirics; tests would harden it |
| Counts query | MEDIUM | Recommend RPC over Supabase JS group-by builder (A7 assumption) |
| Backfill | HIGH | Six rules with documented N — Option B recommended |
| UI reuse | HIGH | UI-SPEC + UI-SPEC §Component Reuse Map are exhaustive |

### Open Questions
1. Schema for `public.agent_runs` — copy verbatim from 55-CONTEXT lines 25-28 or simplify?
2. `mailbox_id` int vs bigint — verify against `debtor.labeling_settings.id` actual type before migration write.
3. Counts query implementation — RPC vs raw builder?
4. SQL view `public.classifier_rule_telemetry` to decouple cron from `automation_runs` JSONB structure — recommended.
5. Race-cohort detection — pass `today's promoted rules` from server component on load, no extra realtime channel.

### Ready for Planning
Research complete. Planner should:
- **Wave 0:** absorb Phase 55-05 (`public.agent_runs` migration), create classifier-* migrations, write vitest stubs.
- **Wave 1:** ingest-route refactor with cache + fallback (D-28 step 3).
- **Wave 2:** promotion cron + `/classifier-rules` dashboard.
- **Wave 3:** queue-UI rewrite + verdict-worker.
- **Wave 4:** drop fallback (D-28 step 4) + flip `CLASSIFIER_CRON_MUTATE=true` after 14d shadow.
