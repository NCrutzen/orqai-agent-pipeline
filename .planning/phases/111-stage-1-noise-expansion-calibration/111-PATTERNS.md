# Phase 111: Stage 1 Noise Expansion + Calibration - Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 7 (3 new, 4 modified)
**Analogs found:** 7 / 7

> This is a REUSE + registry-data phase. There are NO new per-swarm code branches by design. The
> three genuinely-new files mirror existing patterns closely; the three modifications generalize
> existing debtor-only mechanics to be swarm-agnostic (registry-driven), per SWARM-02 / Anti-Pattern A3.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `web/lib/inngest/functions/sales-email-stage-1-retro-classify.ts` *(NEW)* | inngest worker | batch / transform | `web/lib/inngest/functions/debtor-email-stage-3-retro-classify.ts` | role-match (Stage-3 retro; Stage-1 analog must be built) |
| `web/lib/automations/sales-email/retro/select-candidates.ts` + `aggregate-baseline.ts` *(NEW)* | utility | transform | `web/lib/automations/debtor-email/retro/{select-candidates,aggregate-baseline}.ts` | exact |
| `supabase/migrations/<date>_stage_1_retro_runs.sql` *(NEW table)* | migration | CRUD | `supabase/migrations/_template.sql` + `20260603_sales_swarm_full_funnel_enrichment.sql` | exact |
| `scripts/sales-stage-1-cluster-mine.ts` *(NEW)* | utility / script | transform | `.claude/skills/.../002-smeba-info-noise-patterns/spike-002-cluster.ts` | exact |
| `web/lib/inngest/functions/classifier-verdict-worker.ts` *(MODIFY)* | inngest worker | event-driven / request-response | self + `web/lib/pipeline-gating/dry-run-gate/index.ts` | exact (gate retrofit) |
| `web/lib/inngest/functions/classifier-screen-worker.ts` *(MODIFY)* | inngest worker | event-driven | self (generalize debtor block → Step 5) + `web/lib/classifier/cache.ts` | exact |
| `supabase/migrations/<date>_sales_noise_calibration_flip.sql` *(NEW migration, registry UPDATE)* | migration | CRUD | `20260603_sales_swarm_full_funnel_enrichment.sql` | exact |

---

## Pattern Assignments

### `web/lib/inngest/functions/sales-email-stage-1-retro-classify.ts` (NEW; inngest worker, batch/transform)

**Analog:** `web/lib/inngest/functions/debtor-email-stage-3-retro-classify.ts` (read in full, 170 lines)

**What transfers (the pattern):** the harness *shape* — precondition gate → replay-safe run_id → candidate selection → per-email `step.run` loop returning only token count → end-of-run aggregation. **What does NOT transfer:** the Stage-3 harness invokes `invokeIntentAgent` (intent) and writes `stage_3_retro_runs`; the Stage-1 retro must invoke the Stage-1 noise path (no regex for sales → `stage-1-category-classifier` LLM Pass 2 only) and write a NEW `stage_1_retro_runs` table.

**Architectural locks to copy verbatim** (header comment lines 8-31 of the analog enumerate them):

**Replay-safe run_id** (analog lines 96-99) — CLAUDE.md Phase 65 learning:
```typescript
const run_id = await step.run("resolve-run-id", async () =>
  event.data.run_id ?? crypto.randomUUID(),
);
```

**Per-email step-memo discipline + idempotent upsert** (analog lines 113-151) — each `step.run` returns ONLY a scalar (token count); the full verdict is persisted to Supabase INSIDE the step; idempotency key `(run_id, email_id)`:
```typescript
let total_tokens = 0;
for (const c of candidates) {
  const tokens: number = await step.run(`classify-${c.email_id}`, async () => {
    // ... invoke stage-1-category-classifier, build verdict ...
    const { error: insErr } = await admin
      .from("stage_1_retro_runs")          // NEW table for Stage 1
      .upsert({ run_id, email_id: c.email_id, swarm_type, /* per-category verdict + false_archive flag */ },
              { onConflict: "run_id,email_id", ignoreDuplicates: true });
    if (insErr) throw insErr as Error;
    return usage?.total_tokens ?? 0;
  });
  total_tokens += tokens;
}
```

**inngest.send binding** (analog line 29): retro fn emits NO downstream events — never destructure `inngest.send`, and emit nothing here. SIDE-CHANNEL ISOLATION (analog lines 8-14, Anti-Pattern A5): MUST NOT write live-pipeline state (`automation_runs`, live `agent_runs`, `pipeline_events`). Allowed writes: the new `stage_1_retro_runs` table ONLY. Enforce with a source-grep guard test (see Validation).

**Function-config block** (analog lines 48-55): `retries: 3, concurrency: { limit: 1 }`, `{ event: "sales-email/stage-1-retro-classify.requested" }`.

**Cross-cutting concern — direction normalization (RESEARCH Pitfall 4):** `email_pipeline.emails.direction` uses `'sent'/'incoming'` (outlook) vs `'inbound'/'outbound'` (sugarcrm). The candidate selector MUST normalize: `{inbound, incoming}` → inbound, `{sent, outbound}` → outbound. The D-09 loopback test runs only against normalized-inbound mail.

---

### `web/lib/automations/sales-email/retro/{select-candidates,aggregate-baseline}.ts` (NEW; utility, transform)

**Analog:** `web/lib/automations/debtor-email/retro/select-candidates.ts` (69 lines) + `aggregate-baseline.ts` (112 lines) — both read in full.

**`select-candidates.ts` pattern** (analog lines 37-69): pure (no `Date.now`/no random → replay-safe), takes `admin: Pick<SupabaseClient,"from">`, applies a hard cap with a fail-loud throw, paginates over Supabase, returns a typed `RetroCandidate[]`:
```typescript
export const STAGE_3_RETRO_HARD_CAP = 5000;   // sales analog: pick a cap; fail-loud over it
const { data, error } = await admin
  .from("pipeline_events")                     // sales: read email_pipeline.emails instead
  .select("...").eq("swarm_type", args.swarm_type)
  .gte("created_at", args.since).lt("created_at", args.until)
  .order("created_at", { ascending: false }).limit(cap + 1);
if (error) throw error as Error;
if (rows.length > cap) throw new Error(`cap exceeded: ${rows.length} ... Narrow the window or raise cap explicitly.`);
```
**Sales divergences:** read `email_pipeline.emails` (NOT `pipeline_events`); two corpora — `source='outlook' mailbox='verkoop@smeba.nl'` (853) AND `source='sugarcrm'` (34,725). **Pitfall 5:** for sugarcrm, filter on `source='sugarcrm'` ALONE — its `mailbox` column holds SugarCRM bean labels (`"Smeba Brandbeveiliging BV"`), NOT an email address; mailbox-filtering it returns zero rows.

**`aggregate-baseline.ts` pattern** (analog lines 42-112): JS-side GROUP BY (supabase-js has no builder GROUP BY) — tally into a `Map`, compute per-category share with `Number((count/total).toFixed(4))`, insert summary rows. For Stage 1 the tally is per-noise-category hit-rate + false-archive estimate (not per-intent share). Pure, no `Date.now`/random.

---

### `supabase/migrations/<date>_stage_1_retro_runs.sql` (NEW table)

**Analog:** `supabase/migrations/_template.sql` (read in full).

**Mandatory pattern** (template lines 21-58): wrap in `BEGIN;`/`COMMIT;`, `CREATE TABLE IF NOT EXISTS`, `ENABLE ROW LEVEL SECURITY`, and a service-role-only policy (backend-only table — no `authenticated`/`anon` policy):
```sql
ALTER TABLE public.stage_1_retro_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stage_1_retro_runs_service_all ON public.stage_1_retro_runs;
CREATE POLICY stage_1_retro_runs_service_all
  ON public.stage_1_retro_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
```
**Idempotency DDL:** add `UNIQUE (run_id, email_id)` so the harness `onConflict: "run_id,email_id"` upsert is a no-op on replay (mirrors `stage_3_retro_runs`). `npm run check:supabase` fails CI on any ERROR-level RLS advisor lint — the policy is non-negotiable.

---

### `scripts/sales-stage-1-cluster-mine.ts` (NEW; utility/script, transform)

**Analog:** `.claude/skills/spike-findings-agent-workforce/sources/002-smeba-info-noise-patterns/spike-002-cluster.ts` (read in full, 208 lines).

**Pattern to copy** — read-only, first-match-wins ordered `Rule[]`, `domainOf`/`local` helpers, paginated fetch, cluster-size report + per-cluster samples + top unknown sender domains/addresses:
```typescript
interface Rule { key: string; match: (r: Row) => boolean; }
const RULES: Rule[] = [ /* ordered by specificity, first match wins */ ];
function classify(r: Row): string { for (const rule of RULES) if (rule.match(r)) return rule.key; return "unknown"; }
// report cluster sizes, sample 8 subjects/senders per cluster, top-25 unknown domains + addresses
```
**Adaptation (RESEARCH Pattern 2):** read the **retro-run's `unknown` bucket** (`stage_1_retro_runs` where verdict='unknown'), NOT the raw mailbox. Span BOTH sources; normalize direction (Pitfall 4); do NOT hardcode `mailbox=info@smeba.nl` / `direction=incoming` as the spike does (lines 11, 117-118). Output is an operator-approvable ranked candidate list — Anti-Pattern A4: do NOT hand-curate noise keys, surface the clusters and let the operator promote.

**Per-candidate rule form (Claude's Discretion / Pitfall 7):** PREFER landing approved candidates as LLM-category rows (pure registry data — see Finding 3 below). A regex rule for sales requires a new module + `STAGE1_REGEX_MODULES` map entry + `swarms.stage1_regex_module` UPDATE = code; only do that if a candidate has a crisp deterministic signature and the planner accepts the cost.

---

### `web/lib/inngest/functions/classifier-verdict-worker.ts` (MODIFY; gate the inline Outlook calls)

**Analog:** self (lines 104-124) + `web/lib/pipeline-gating/dry-run-gate/index.ts` (read in full).

**The defect (CRITICAL FINDING 1):** the `categorize_archive` branch fires `categorizeEmail()` + `archiveEmail()` directly and unconditionally whenever `category.outlook_label` is set — NO dry-run gate. Sales `auto_reply`/`ooo_*` all have `outlook_label` set, so flipping `action` is NOT inert as CONTEXT.md assumed.

**Current unguarded block** (lines 107-124):
```typescript
case "categorize_archive": {
  if (category.outlook_label) {
    await step.run("categorize", async () => { /* categorizeEmail(...) */ });
    await step.run("archive",   async () => { /* archiveEmail(...) */ });
  }
  // ... evaluateSideEffects("stage1_categorize_archive") ...
```

**Fix pattern — wrap the inline calls in `isStageBlocked`** (dry-run-gate analog lines 47-52; the four Phase 110-04 side-effect workers already use this exact helper). Load the swarm row, then:
```typescript
import { isStageBlocked } from "@/lib/pipeline-gating/dry-run-gate";
// ...
if (category.outlook_label && !isStageBlocked(swarmRow, "stage_1_archive")) {
  await step.run("categorize", ...);
  await step.run("archive", ...);
}
```
**Convention (dry-run-gate header lines 11-14):** flag TRUE = BLOCKED (dry-run), FALSE = LIVE, MISSING = blocked (fail-closed). Sales `dry_run_config.stage_1_archive` is blocked → stays inert until Phase 112. Swarm-agnostic — NO `swarm === 'sales'` branch (Anti-Pattern A3). Extend `__tests__/dry-run-gate-preservation.test.ts`.

---

### `web/lib/inngest/functions/classifier-screen-worker.ts` (MODIFY; generalize the Wilson promotion gate)

**Analog:** self — the debtor-only block (lines 498-601) is the gate to generalize; Step 5 (lines 915-953) is where it must live; `web/lib/classifier/cache.ts` `readWhitelist` (lines 29-55) is the promoted-rule lookup.

**The defect (CRITICAL FINDING 2):** the Wilson promotion check ("auto-archive only if `llm:{cat}:high` is `status='promoted'`") lives ONLY inside the debtor-only block, gated on `stage1_regex_module === "@/lib/debtor-email/classify"` (line 499). Sales (`stage1_regex_module=null`) skips it and reaches Step 5, where `gateClearsForAutoArchive` gates on **confidence='high' alone** (lines 915-918) — no promotion check. Flipping `action` would auto-archive every high-confidence verdict from day one, defeating D-03/D-05.

**The promoted-rule lookup to reuse** (debtor block lines 584-601 — copy this mechanic into the swarm-agnostic Step 5):
```typescript
const whitelistSet = new Set(await readWhitelist(admin, swarm_type)); // already swarm-scoped via .eq("swarm_type", ...)
const effectiveMatchedRule =
  llmInvoked && llmCategoryKey && llmConfidence
    ? `llm:${llmCategoryKey}:${llmConfidence}`     // synthetic key — matches the agent_runs.rule_key minted at line 349
    : (regexOutcome.matchedRule ?? "");
const isWhitelistMatch = whitelistSet.has(effectiveMatchedRule);  // ◄ THE PROMOTION GATE
```

**Current Step 5 gate to extend** (lines 915-918) — add the promotion check so a non-promoted high-confidence LLM verdict routes to `requires_review` (status='predicted') instead of auto-archiving:
```typescript
const gateClearsForAutoArchive =
  !llmInvoked ||
  llmConfidence === "high" ||
  finalCategoryKey === "unknown";
// FIX: when llmInvoked, ALSO require isWhitelistMatch for the llm:{cat}:high rule
// before clearing to verdict.recorded; else emit classifier/screen.requires_review.
```
**Emit branches already exist** (lines 920-953): `gateClearsForAutoArchive` → `classifier/verdict.recorded`; else → `classifier/screen.requires_review` (no subscriber → stays `predicted`). `unknown` short-circuits to verdict on purpose (line 905-908). Swarm-agnostic — do NOT add a sales branch (Anti-Pattern A3); the existing debtor block stays as-is or is refactored to share the Step-5 mechanic. Extend `classifier-screen-worker.gate.test.ts` for a `stage1_regex_module=null` swarm. CLAUDE.md: never destructure `inngest.send` (inline `SendFn` cast, lines 82-87).

---

### `supabase/migrations/<date>_sales_noise_calibration_flip.sql` (NEW migration; registry UPDATE — D-06)

**Analog:** `supabase/migrations/20260603_sales_swarm_full_funnel_enrichment.sql` (read; the prior sales registry UPDATE migration).

**Pattern** (analog lines 26-29 + the verified D-06 SQL from RESEARCH lines 263-270): `BEGIN;`/`COMMIT;`, UPDATE an existing RLS-enabled table (no new table → no new policy → no RLS work), record rationale in the migration header comment (the analog's header is the audit-trail style to mirror — D-06 leaves audit shape to planner's discretion):
```sql
update public.swarm_noise_categories
set action = 'categorize_archive', updated_at = now()
where swarm_type = 'sales-email'
  and category_key in ('auto_reply','ooo_temporary','ooo_permanent');
-- payment_admittance + unknown intentionally NOT flipped (D-06 rationale in header).
```
**Notes:** No codegen — `npm run codegen` covers `swarm_intents` only, NOT `swarm_noise_categories` (Finding 3 / Runtime State). No Orq Studio step — the `stage-1-category-classifier` `category_key` field is `{'type':'string'}`, not an enum; the closed list is passed at call-time (screen-worker lines 319-322). If an audit TABLE is added instead of a header comment, it needs RLS + service-role policy (`_template.sql`).

---

## Shared Patterns

### Wilson-CI promotion gate (the locked promote bar — D-02)
**Source:** `web/lib/classifier/wilson.ts` (lines 33-49)
**Apply to:** the screen-worker gate generalization (decides whether `llm:{cat}:high` is promotable). Pure math, no deps. Do NOT hand-roll a proportion test (Don't Hand-Roll).
```typescript
export const PROMOTE_N_MIN = 30;
export const PROMOTE_CI_LO_MIN = 0.92;
export function shouldPromote(n: number, ciLo: number): boolean {
  return n >= PROMOTE_N_MIN && ciLo >= PROMOTE_CI_LO_MIN;
}
```
Promotion is operator-driven via the `classifier_rule_telemetry` view + `classifier-promotion-cron.ts` (already loops all swarms). Pitfall 6: sales telemetry is empty until operators give feedback — the retro-run does NOT promote anything.

### Promoted-rule whitelist lookup (already swarm-scoped)
**Source:** `web/lib/classifier/cache.ts` `readWhitelist(admin, swarmType)` (lines 29-55) — 60s TTL, `.eq("swarm_type", swarmType).eq("status","promoted")`.
**Apply to:** the screen-worker Step-5 gate. Note `FALLBACK_WHITELIST` is debtor-only (line 47, `swarmType === "debtor-email"`); sales degrades to an empty set on read error — acceptable (fail-closed to review).

### LLM rule_key minting + seeding (already shipped Phase 89)
**Source:** screen-worker line 349 (`rule_key: \`llm:${parsed.category_key}:${parsed.confidence}\``); seed fn `classifier-llm-rules-seed.ts` (lines 48-78).
**Apply to:** any NEW noise key from D-07 — RE-FIRE the `classifier/llm-rules-seed.run` event so the new key's `llm:{cat}:high` candidate row is minted (else its telemetry has no candidate row and the promotion cron UPDATE is a no-op). The seed filters `category_key !== 'unknown'` (Anti-Pattern A2) — preserve.

### Side-channel isolation guard test (mirror Phase 87)
**Source:** `web/lib/inngest/functions/__tests__/debtor-email-stage-3-retro-classify.test.ts` (happy-path / token-sum / idempotent-rerun shape) + the analog header's forbidden-write list (lines 8-14).
**Apply to:** the new Stage-1 retro harness test — assert it writes only `stage_1_retro_runs`, never `automation_runs`/`agent_runs`/`pipeline_events`.

---

## No Analog Found

None — every file has a strong in-repo analog. (The Stage-1 retro harness is "role-match" rather than "exact" because the existing retro is Stage-3, but the pattern transfers directly per RESEARCH Open Q 2.)

## Architectural Findings the Planner MUST Honor (from RESEARCH)

- **Finding 1:** the verdict-worker fires Outlook live — flipping `action` is NOT inert without the `isStageBlocked` retrofit. (Anti-Pattern A1.)
- **Finding 2:** the Wilson promotion gate is debtor-only — generalizing it into Step 5 is the phase's architectural centerpiece, NOT the trivial flip migration.
- **Finding 3:** a new noise key is pure registry data — INSERT row + re-fire seed; no Orq Studio edit, no codegen.

## Metadata

**Analog search scope:** `web/lib/inngest/functions/`, `web/lib/automations/debtor-email/retro/`, `web/lib/classifier/`, `web/lib/pipeline-gating/dry-run-gate/`, `supabase/migrations/`, `.claude/skills/spike-findings-agent-workforce/sources/002-*`
**Files scanned (read in full or targeted):** 13
**Pattern extraction date:** 2026-06-03
