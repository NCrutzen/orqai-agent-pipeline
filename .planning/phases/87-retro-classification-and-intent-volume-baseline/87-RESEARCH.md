# Phase 87: Retro-classification + intent-volume baseline — Research

**Researched:** 2026-05-20
**Domain:** Inngest one-shot batch + Orq.ai agent replay + Supabase aggregation
**Confidence:** HIGH (all critical paths verified against in-repo source)

## Summary

Phase 87 re-invokes the **live** `debtor-intent-agent` (V3 prompt, persisted in Orq Studio) against historical mail in `email_pipeline.emails`, writes one row per (run_id, email_id) to a new `stage_3_retro_runs` table, then aggregates into `intent_volume_baselines`. Every input the live Stage 3 classifier needs (full body, conversation context priors, Stage 2 customer fields, entity) is already persisted in Supabase — **no Microsoft Graph re-fetch, no Stage 2 re-run required**. The retro function is a thin loop that reconstructs the prompt-builder inputs from `email_pipeline.emails` + `email_pipeline.conversation_context` + `debtor.email_labels`, calls the existing `invokeIntentAgent()` helper, and persists.

The biggest planning risk is **NOT** schema or invocation; it's batching cost-shape. 5000 × ~4s serial = ~5.5h; needs Inngest `step.run` per email inside one function (deterministic, replay-safe) with bounded parallelism via a tunable `BATCH_SIZE`.

**Primary recommendation:** Reuse `invokeIntentAgent()` from `web/lib/automations/debtor-email/coordinator/invoke-intent.ts` verbatim. Reconstruct the call payload from persisted rows via a single SQL JOIN. Persist one `stage_3_retro_runs` row per email; aggregate at the end of the run into `intent_volume_baselines`. Do NOT write `pipeline_events`, `coordinator_runs`, or `agent_runs` (this is a side-channel that must not pollute live telemetry — see Architectural Responsibility Map below).

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 — Retro-classification source:** persisted emails from `email_pipeline.emails.body_full_text` (Supabase), NOT Microsoft Graph re-fetch. Idempotent, no rate limits, reproducible.
- **D-02 — One-shot Inngest function:** `debtor-email-stage-3-retro-classify`, manually triggered via `inngest.send`. Inputs `{ swarm_type, since_date, until_date, sample_limit? }`. Writes to new `stage_3_retro_runs` table with `(run_id, email_id)` UNIQUE. Re-runs allowed under fresh `run_id`.
- **D-03 — Cost cap:** default 30 days, hard cap **5000 emails per run, fail loud** above. Total token usage per `run_id` reported in closure summary.
- **D-04 — Comparison report shape:** Markdown file `87-BASELINE-REPORT.md` with 4 sections: (1) distribution shift table, (2) open-set proposal summary from Phase 86 clusters, (3) 20-row hand-graded diff sample, (4) hypotheses confirmed/refuted vs Phase 83 D-07 and Phase 84 thresholds.
- **D-05 — Snapshot table `intent_volume_baselines`:** `(baseline_id, swarm_type, window_start, window_end, intent_key, intent_source ∈ {closed_list, proposal_cluster}, count, share, created_at)`. Phase 87 writes one snapshot; never overwrite. Schema LOCKED.
- **D-06 — Read-only:** No auto-promotion of proposals, no `swarm_intents` writes, no registry changes, no Stage 4 dispatch.
- **D-07 — Sales-email parity:** debtor-email only unless V10.0 ships first (per orchestrator: V10.0 unlikely → debtor-email only).

### Claude's Discretion (planner ratify or flip)

- **Trigger surface:** CLI script `scripts/run-retro-classify.ts` (NOT a dashboard button). Calls `inngest.send` against local/prod Inngest dev URL.
- **Sample selection over cap:** recency-first; for pre-v8.1 baseline window, take same calendar length immediately preceding the post-v8.1 window.
- **Hand-grading sink:** inline markdown table in `87-BASELINE-REPORT.md` (one operator, 20 rows).
- **Concurrency model:** sequential `step.run` per email (deterministic; replay-safe). No `step.parallel` — Orq billing + Inngest step memo size both favour sequential.

### Deferred Ideas (OUT OF SCOPE)

- Automated proposal promotion → V9.0 Learning Inbox.
- V8.2 handler scoping decisions (Phase 87 is *input* to V8.2).
- LLM-based diff analysis (D-04 step 3 = human review of 20 rows).
- Dashboard trigger button.
- Re-design of `intent_volume_baselines` schema (locked).
- Sales-email Stage 3 corpus (unless V10.0 lands first — not expected).

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-87-01 | Retro-classify ≤5000 historical debtor-emails through live `debtor-intent-agent` V3 | Reuse `invokeIntentAgent()` (§ Invocation Path); reconstruct inputs from persisted Supabase rows (§ Stage 2 Replay Source) |
| REQ-87-02 | Persist one row per (run_id, email_id) to `stage_3_retro_runs` with original-vs-new top-intent | New migration; schema mirrors closure-summary needs (§ Schema) |
| REQ-87-03 | Aggregate into `intent_volume_baselines` snapshot | Single SQL aggregation per run (§ Baseline Generation SQL) |
| REQ-87-04 | Hand-graded 20-row diff sample where `original_top_intent ≠ new_top_intent` | `ORDER BY random() LIMIT 20` over diff predicate (§ Diff Sample SQL) |
| REQ-87-05 | Markdown closure report at `.planning/phases/87-…/87-BASELINE-REPORT.md` | 4-section shape per D-04 (§ Report Generator) |
| REQ-87-06 | Cost telemetry: total Orq token usage per run_id | `invokeOrqAgentWithUsage` returns `usage.{prompt,completion,total}_tokens`; sum in-loop (§ Telemetry) |
| REQ-87-07 | R-04 precondition gate: refuse to run if proposal-cluster data <7d old or <5 clusters present | Inngest pre-flight `step.run` reads `intent_proposal_clusters` (§ Precondition Gate) |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Trigger (CLI command) | Local dev shell | — | One-off operator action; no UI per D-04 |
| Event ingress | Inngest function | — | `inngest.send({ name: "debtor-email/retro-classify.requested" })` — see [Inngest patterns](#inngest-patterns) |
| Per-email replay loop | Inngest `step.run` (sequential) | — | Replay-safe + deterministic per CLAUDE.md Phase 65 lesson |
| LLM invocation | Orq.ai `debtor-intent-agent` (live, V3) | — | The agent **is** the source of truth — retro must invoke the same surface the pipeline does, otherwise comparison is invalid |
| Input assembly | Pure JS (`assembleInput()`) | Supabase read (priors + body) | Existing helper at `web/lib/automations/debtor-email/coordinator/assemble-input.ts` |
| Persist verdict | Supabase `stage_3_retro_runs` | — | NEW table; isolated from production telemetry (do NOT write `pipeline_events`/`coordinator_runs`/`agent_runs` — see § Side-Channel Isolation) |
| Aggregate baseline | Supabase SQL aggregation | — | `INSERT … SELECT … GROUP BY` into `intent_volume_baselines` |
| Pre-v8.1 distribution | Supabase read of `pipeline_events` stage=3 | — | Live verdicts already persist top-1 + ranked here (Phase 70 TELE-01) |
| Report rendering | Operator-written Markdown | SQL-output paste | D-04 step 3 is human; report is hand-written from query outputs |

**Side-channel isolation (CRITICAL).** Per locked architecture (`docs/agentic-pipeline/stage-3-coordinator.md`), `agent_runs.status: classifying → predicted` is a first-class observable state that drives the Stage 3.5 dispatcher. If the retro function writes `agent_runs` or emits `<swarm_type>/predicted`, the dispatcher will fire Stage 4 handlers and cause real Outlook drafts / iController taggings on historical emails. **The retro function MUST write to its own `stage_3_retro_runs` table only.** It MUST NOT call `mergeToolOutputs`, `updateRun`, `emitPipelineEvent`, `inngest.send("debtor-email/predicted")`, or insert into `coordinator_runs`.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `inngest` | already-pinned in `web/package.json` | Durable function for the batch loop | CLAUDE.md non-negotiable; existing `intent-proposals-refresh.ts` is the exact pattern |
| `@/lib/inngest/client` | in-repo | `inngest.send` for trigger | Standard ingress |
| `@/lib/supabase/admin` | in-repo | `createAdminClient()` for service-role reads/writes | Standard Inngest pattern |
| `@/lib/automations/debtor-email/coordinator/invoke-intent` | in-repo | `invokeIntentAgent()` — direct Orq agent call | Identical to production Stage 3 invocation surface |
| `@/lib/automations/debtor-email/coordinator/assemble-input` | in-repo | `assembleInput()` — wrapped XML `<inbound_message>` + `<quoted_thread>` | Identical to production input shape |
| `tsx` | already-pinned | CLI execution for `scripts/run-retro-classify.ts` | Standard codegen-script pattern |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@inngest/realtime` | n/a | — | Not needed; CLI is fire-and-forget |
| `zod` | already-pinned | Validate `V2 \| V3` agent output | Already used by `invokeIntentAgent` internally |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `invokeIntentAgent()` (low-level) | `invokeOrqAgentWithUsage(agent_key, inputs)` from `web/lib/automations/orq-agents/client.ts` | **Use `invokeIntentAgent` not the generic one.** Generic one wraps `inputs` as JSON in the user message; the production Stage 3 path uses `invokeIntentAgent`'s XML-tagged `<context>` + `<inbound_message>` prompt. Comparison validity requires matching prompts exactly. |
| Sequential `step.run` | `step.parallel` | Sequential = ~5.5h for 5000 emails but deterministic, debuggable, and avoids Orq concurrent-burst billing. Parallel buys ~3× speed but step-memo sizes blow up + replay debugging gets painful. Recommend sequential with explicit `BATCH_SIZE=50` checkpoint commits (so a mid-batch crash doesn't lose progress). |
| New Inngest function | Inline CLI loop | Inngest required for: durable retries on Orq 5xx, replay if mid-run crash, observable progress in Inngest dashboard. CLI-only would lose all three. |

**Installation:** None — all dependencies in-repo.

**Version verification:** Skipped — no new packages.

## System Architecture Diagram

```
                    CLI: tsx scripts/run-retro-classify.ts
                         { swarm_type, since, until, sample_limit? }
                                  │
                                  ▼
                    inngest.send("debtor-email/retro-classify.requested", payload)
                                  │
                                  ▼
              ┌──────────────────────────────────────────────────┐
              │ Inngest fn: debtor-email-stage-3-retro-classify  │
              │                                                  │
              │  step.run("precondition-gate")                   │
              │   ↳ check intent_proposal_clusters recency       │
              │   ↳ fail loud if <7d or <5 clusters              │
              │                                                  │
              │  step.run("resolve-run-id") → UUID (inside step) │
              │                                                  │
              │  step.run("select-candidates")                   │
              │   ↳ SELECT emails reached Stage 3 in window     │
              │   ↳ cap at 5000 by recency; fail loud above     │
              │                                                  │
              │  for each email (sequential):                    │
              │    step.run(`classify-${email_id}`)              │
              │     ↳ fetch body_full_text + priors + entity     │
              │     ↳ assembleInput()                            │
              │     ↳ invokeIntentAgent()                        │
              │     ↳ INSERT stage_3_retro_runs (run_id,email_id)│
              │     ↳ tokens += usage.total_tokens               │
              │                                                  │
              │  step.run("aggregate-baseline")                  │
              │   ↳ INSERT INTO intent_volume_baselines          │
              │     SELECT ... GROUP BY new_top_intent           │
              │   ↳ also: INSERT proposal-cluster rows           │
              │                                                  │
              │  step.run("emit-summary")                        │
              │   ↳ return { run_id, processed, total_tokens }   │
              └──────────────────────────────────────────────────┘
                                  │
                                  ▼
              Operator reads:
                stage_3_retro_runs (raw verdicts)
                intent_volume_baselines (snapshot)
                pipeline_events stage=3 in pre-window (live distribution)
              ↳ hand-writes 87-BASELINE-REPORT.md (4 sections)
```

The diagram shows: **CLI ingress → durable function → sequential per-email replay → aggregation → operator-authored report**. The function does NOT touch live pipeline tables.

## Architecture Patterns

### Recommended Project Structure

```
scripts/
└── run-retro-classify.ts            # CLI ingress: inngest.send + arg parsing

supabase/migrations/
└── 20260521_phase87_stage_3_retro_runs.sql       # NEW
└── 20260521_phase87_intent_volume_baselines.sql  # NEW (D-05 locked schema)

web/lib/automations/debtor-email/retro/
├── select-candidates.ts             # SQL builder for the 5000-email selection
├── reconstruct-input.ts             # Map persisted rows → InvokeIntentInput
├── aggregate-baseline.ts            # SQL aggregation builder
└── __tests__/
    ├── select-candidates.test.ts
    ├── reconstruct-input.test.ts
    └── aggregate-baseline.test.ts

web/lib/inngest/functions/
└── debtor-email-stage-3-retro-classify.ts   # The Inngest function

web/lib/inngest/events.ts            # Add "debtor-email/retro-classify.requested" event
web/lib/inngest/index.ts             # Register the new function

.planning/phases/87-.../
└── 87-BASELINE-REPORT.md            # Operator-written closure report
```

### Pattern 1: Replay-safe per-email loop

**What:** sequential `step.run` per email; non-deterministic values (run_id, timestamps) created INSIDE step.run; never destructure `inngest.send`.
**When:** any Inngest function that iterates persisted data.
**Example:**

```typescript
// CLAUDE.md Phase 65 lesson — generate run_id INSIDE step.run, otherwise
// every replay regenerates it and writes orphan rows.
const run_id = await step.run("resolve-run-id", async () =>
  event.data.run_id ?? crypto.randomUUID()
);

let totalTokens = 0;
for (const email of candidates) {
  await step.run(`classify-${email.id}`, async () => {
    const input = await reconstructInput(admin, email.id);
    const { output, raw } = await invokeIntentAgent(input);
    const usage = (output as { _usage?: { total_tokens: number } })._usage;
    await admin.from("stage_3_retro_runs").insert({
      run_id,
      email_id: email.id,
      swarm_type: "debtor-email",
      original_top_intent: email.original_top_intent,
      new_top_intent: output.ranked[0].intent,
      original_confidence: email.original_confidence,
      new_confidence: output.ranked[0].confidence,
      intent_proposal:
        output.intent_version === "2026-05-19.v3"
          ? output.intent_proposal
          : null,
      ranked_intents: output.ranked,
    });
    return usage?.total_tokens ?? 0;
  }).then((t) => { totalTokens += t as number; });
}
```

Note: `invokeIntentAgent()` today returns `{ output, raw }` — it does NOT include usage. To capture token usage per call, **either** extend `invokeIntentAgent` to surface `usage` (cleanest; pattern matches `invokeOrqAgentWithUsage`), **or** switch the retro path to call Orq's `/responses` endpoint directly with the same prompt-builder output and parse `usage`. Recommend extending `invokeIntentAgent`.

### Pattern 2: Stage 2 replay from persisted rows

The live event `debtor-email/coordinator.requested` carries `customer_account_id` and `customer_name` from Stage 2. The intent agent doesn't actually use these in the prompt (verified: `buildUserMessage` in `invoke-intent.ts:65-91` only reads `email_id`, `run_id`, `sender_email`, `sender_domain`, `mailbox`, `entity`, `assembled_input`). So Stage 2 fields are NOT needed for retro classification — only `entity` is required, which is persisted on `debtor.email_labels.entity` OR can be derived from `emails.mailbox` via the existing `labeling_settings.entity` mapping.

**This means: Stage 2 output replay is unnecessary for Phase 87.** The retro function can reconstruct everything from `email_pipeline.emails` + `email_pipeline.conversation_context` + a single read of `debtor.email_labels` for entity. **Not a blocker** (this was the most likely planning risk).

### Pattern 3: Aggregate baseline in one INSERT…SELECT

```sql
INSERT INTO intent_volume_baselines
  (swarm_type, window_start, window_end, intent_key, intent_source, count, share)
SELECT
  'debtor-email',
  $1::date,
  $2::date,
  new_top_intent,
  'closed_list',
  count(*),
  count(*)::numeric / (SELECT count(*) FROM stage_3_retro_runs WHERE run_id = $3)
FROM stage_3_retro_runs
WHERE run_id = $3
GROUP BY new_top_intent;
```

Proposal-cluster rows append from `intent_proposal_clusters` (window-overlapping):

```sql
INSERT INTO intent_volume_baselines
  (swarm_type, window_start, window_end, intent_key, intent_source, count, share)
SELECT
  swarm_type, $1::date, $2::date, centroid_label, 'proposal_cluster',
  member_count,
  member_count::numeric / NULLIF((SELECT count(*) FROM stage_3_retro_runs WHERE run_id = $3), 0)
FROM intent_proposal_clusters
WHERE swarm_type = 'debtor-email'
  AND window_end::date BETWEEN $1::date AND $2::date;
```

### Anti-Patterns to Avoid

- **DON'T** write to `agent_runs` / `coordinator_runs` / `pipeline_events` from the retro function. These are live-pipeline state. Writing them would fire Stage 3.5 dispatch and create real drafts on historical emails. (See § Side-Channel Isolation above.)
- **DON'T** use `step.parallel` for the 5000-email loop. Orq concurrent-burst behaviour is untested; sequential is the safe replay shape.
- **DON'T** generate `run_id`, `crypto.randomUUID()`, or `Date.now()` outside `step.run`. CLAUDE.md Phase 65 lock-in.
- **DON'T** destructure `inngest.send` (`const send = inngest.send`). Loses `this`-binding. CLAUDE.md Phase 65 lock-in. Always call as `inngest.send(…)` or via the `DynamicSend` cast pattern.
- **DON'T** swallow Orq 4xx/5xx errors per-email. Inngest `retries: 3` on the function level handles transient 5xx; on persistent 4xx (schema mismatch), let the step throw and surface the failed email_id in the function output for operator triage.
- **DON'T** reuse the live `findCachedOutput` path. Phase 85's cache keys on `intent_version = V3` would silently hand back cached results from live runs that already happened — defeating the comparison. Skip cache; always call live.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Prompt assembly | New XML builder | `assembleInput()` from `coordinator/assemble-input.ts` | Live pipeline uses this; identical input is the whole point of retro |
| Orq invocation | Raw fetch loop | `invokeIntentAgent()` from `coordinator/invoke-intent.ts` | Already validates V2/V3, sorts keys, handles timeouts |
| Schema validation | Re-create Zod schema | `intentAgentOutputSchemaV3` (live) | Avoid drift |
| Levenshtein clustering | Re-implement | `clusterProposals` from `web/lib/automations/intent-proposals/cluster.ts` | Already used by Phase 86 |
| Migration template | Hand-write RLS | `supabase/migrations/_template.sql` | CLAUDE.md mandatory + `npm run check:supabase` pre-push gate |
| Codegen drift detection | Manual diff | `npm run codegen && git diff --exit-code` | Standard project pattern |

**Key insight:** every primitive Phase 87 needs already exists. The phase is wiring, not building.

## Runtime State Inventory

This is a greenfield-additive phase (new function + new tables + new CLI). It changes no existing runtime state and renames nothing. Section omitted per template guidance — no rename/refactor risk.

## Common Pitfalls

### Pitfall 1: Comparing apples to oranges in the distribution-shift table

**What goes wrong:** Pre-v8.1 baseline counts come from `pipeline_events` where stage=3, but Phase 84's Stage 1 noise rules filtered out classes of emails (Coupa, auto-replies, own-domain loopback) that USED to reach Stage 3. So the pre-v8.1 window's `pipeline_events` includes ~N rows that never would have reached Stage 3 today — naively comparing top-intent counts overstates the "shift."
**Why it happens:** the funnel changed shape, not just the classifier.
**How to avoid:** apply the same Stage 1 noise-filter predicate to the pre-v8.1 sample before counting. Operationally: select pre-v8.1 `pipeline_events` stage=3 rows, then EXCLUDE rows whose `email_id` would have hit a Phase 84 noise rule (auto-reply sender, Coupa domain, own-domain). The shift table footnote should call this out: "pre-v8.1 counts filtered to the Phase 84 Stage 1 noise-survivor predicate."
**Warning signs:** distribution-shift table shows huge drops in `general_inquiry` / `other` that look impossible. Symptom = forgot to apply the filter.

### Pitfall 2: Token usage missing from `invokeIntentAgent`

**What goes wrong:** the helper returns `{ output, raw }` only. Phase 87 D-03 requires total token usage per `run_id`. Without the extension, the closure summary can't report this.
**How to avoid:** plan adds a non-breaking extension to `invokeIntentAgent`: return `{ output, raw, usage }`. The Orq `/responses` JSON already carries `usage.input_tokens / output_tokens / total_tokens` (verified in `web/lib/automations/orq-agents/client.ts:198-208`); plumb it through.
**Warning signs:** retro function returns `total_tokens: 0`.

### Pitfall 3: Cache poisoning from Phase 85 V3 cache rows

**What goes wrong:** `findCachedOutput` reads cached V3 outputs from prior live runs and skips the Orq call. The retro pass would then hand back the SAME output the live pipeline already produced — making the comparison a tautology.
**How to avoid:** the retro function must call `invokeIntentAgent` directly, NOT route through `debtor-email-coordinator`'s cache-aware path. The signature is already cache-free at the `invokeIntentAgent` level (cache lives one level up in `debtor-email-coordinator.ts:198-208`).
**Warning signs:** new_top_intent EXACTLY matches original_top_intent for 100% of rows.

### Pitfall 4: Inngest function step-memo bloat at 5000 emails

**What goes wrong:** every `step.run` return value is memoised in Inngest's state store. 5000 steps × per-email `ranked_intents` jsonb = bloats memo storage and slows replay.
**How to avoid:** **return only the token-count** from each per-email step; persist the full output to Supabase INSIDE the step. Don't return `output` from the step.
**Warning signs:** Inngest dashboard shows function "state size" growing into MBs; replay times increase per step.

### Pitfall 5: Running before Phase 86 cluster data has matured (R-04)

**What goes wrong:** Phase 87 fires before ≥7d of `intent_proposal_clusters` has accumulated. The "Open-set proposal summary" section of the report is empty or misleading. Operator can't tell whether the open-set surface failed or just hasn't run long enough.
**How to avoid:** precondition `step.run` at function entry: `SELECT max(refreshed_at), count(*) FROM intent_proposal_clusters WHERE swarm_type='debtor-email'`. If `refreshed_at < now() - 7 days` OR `count < 5`, **throw** with a clear message: `"Phase 87 precondition: intent_proposal_clusters has only {N} clusters refreshed at {ts}; need ≥5 and ≥7 days of data. See Phase 86 verification status."`
**Warning signs:** report's section 2 is `(no clusters)`.

### Pitfall 6: Migration omitting RLS on the two new tables

**What goes wrong:** `npm run check:supabase` pre-push hook fails the commit because the new tables are in `public` schema with RLS disabled. Migration looks like it succeeded locally because the hook only runs at push time.
**How to avoid:** start from `supabase/migrations/_template.sql`. Service-role-only policy is the right shape for both `stage_3_retro_runs` (backend-only) and `intent_volume_baselines` (read by V8.2/V9.0/V11.0 via service role + future dashboards may need `authenticated SELECT`).
**Warning signs:** `git push` blocked by pre-push hook with `rls_disabled_in_public` ERROR.

## Code Examples

### Reconstructing the InvokeIntentInput from persisted rows

```typescript
// Source: web/lib/automations/debtor-email/coordinator/invoke-intent.ts:18-36
import type { InvokeIntentInput } from "@/lib/automations/debtor-email/coordinator/invoke-intent";
import { assembleInput } from "@/lib/automations/debtor-email/coordinator/assemble-input";
import { TENANT_DOMAINS_BY_SWARM } from "@/lib/automations/debtor-email/coordinator/tenant-domains.generated";

const STAGE_3_INPUT_CAP_CHARS = 8000;
const TENANT_DOMAINS = [...TENANT_DOMAINS_BY_SWARM["debtor-email"]];

export async function reconstructInput(
  admin: SupabaseClient,
  email_id: string,
  retro_run_id: string,
): Promise<InvokeIntentInput> {
  const { data: e } = await admin
    .from("emails")
    .schema("email_pipeline")
    .select("id, subject, body_full_text, body_text, sender_email, mailbox, received_at")
    .eq("id", email_id)
    .single();

  // Entity: persisted on debtor.email_labels (Stage 2 output).
  const { data: lbl } = await admin
    .from("email_labels")
    .schema("debtor")
    .select("entity")
    .eq("email_id", email_id)
    .maybeSingle();

  const { data: priorsRows } = await admin
    .from("conversation_context")
    .schema("email_pipeline")
    .select("position, sender_email, subject, received_at, body_text")
    .eq("email_id", email_id)
    .order("position", { ascending: true });

  const priors = (priorsRows ?? []).map((r) => ({
    position: Number(r.position),
    senderEmail: r.sender_email,
    subject: r.subject,
    receivedAt: r.received_at,
    bodyText: r.body_text,
  }));

  const bodyFull = e.body_full_text ?? e.body_text ?? "";
  const assembled = assembleInput({
    subject: e.subject ?? "",
    bodyFull,
    priors,
    tenantDomains: TENANT_DOMAINS,
    capChars: STAGE_3_INPUT_CAP_CHARS,
  });

  const sender_domain = (e.sender_email ?? "").split("@")[1] ?? "";

  return {
    email_id,
    inngest_run_id: retro_run_id,
    subject: e.subject ?? "",
    body_text: e.body_text ?? "",
    assembled_input: assembled.text,
    sender_email: e.sender_email ?? "",
    sender_domain,
    mailbox: e.mailbox ?? "",
    entity: lbl?.entity ?? "smeba",
    received_at: e.received_at ?? "",
  };
}
```

### 5000-email selection SQL

The "survived Stage 1" predicate is: **a `pipeline_events` stage=3 row exists** for this email. (Stage 3 is only reached by Stage-1-surviving emails per the funnel.)

```typescript
// Source: docs/agentic-pipeline/README.md — funnel guarantees stage=3 ⇒ survived Stage 1
const { data: candidates } = await admin
  .from("pipeline_events")
  .select(
    "email_id, decision, confidence, decision_details, created_at",
  )
  .eq("swarm_type", "debtor-email")
  .eq("stage", 3)
  .gte("created_at", since_iso)
  .lt("created_at", until_iso)
  .order("created_at", { ascending: false })
  .limit(5001);  // fetch 5001 to detect cap breach

if ((candidates ?? []).length > 5000) {
  throw new Error(
    `Phase 87 D-03 cap exceeded: ${candidates.length} stage=3 events in [${since_iso}, ${until_iso}). ` +
    `Narrow the window or raise the cap explicitly.`,
  );
}
// candidates[i].decision = original_top_intent
// candidates[i].confidence = original_confidence (numeric, may be null)
```

### Diff sample SQL (D-04 step 3)

```sql
SELECT
  r.email_id,
  e.subject,
  e.sender_email,
  r.original_top_intent,
  r.new_top_intent,
  r.original_confidence,
  r.new_confidence,
  (r.ranked_intents->0->>'reasoning') AS new_top_reasoning
FROM stage_3_retro_runs r
JOIN email_pipeline.emails e ON e.id = r.email_id
WHERE r.run_id = $1
  AND r.original_top_intent IS DISTINCT FROM r.new_top_intent
ORDER BY random()
LIMIT 20;
```

Plain `ORDER BY random()` chosen over stratified-by-intent-pair: stratification would require ~7×7=49 intent-pair buckets with ~0-3 samples each — operator hand-grading 20 spread that thin would lose statistical power on the high-volume pairs. Random-20 over the full diff set weights toward the largest diff buckets, which is what we want for the "did the prompt v3 sharpen the boundaries that hurt most?" question.

### New table schemas

`stage_3_retro_runs`:

```sql
-- supabase/migrations/20260521_phase87_stage_3_retro_runs.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.stage_3_retro_runs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                   uuid NOT NULL,
  email_id                 uuid NOT NULL,
  swarm_type               text NOT NULL,
  original_top_intent      text,
  original_confidence      numeric(4,3),
  new_top_intent           text NOT NULL,
  new_confidence           text,                      -- agent returns 'low'|'medium'|'high'
  intent_proposal          text,
  proposal_reason          text,
  ranked_intents           jsonb NOT NULL,
  token_usage_total        int NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS stage_3_retro_runs_run_email_uniq
  ON public.stage_3_retro_runs (run_id, email_id);

CREATE INDEX IF NOT EXISTS stage_3_retro_runs_run_idx
  ON public.stage_3_retro_runs (run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS stage_3_retro_runs_diff_idx
  ON public.stage_3_retro_runs (run_id)
  WHERE original_top_intent IS DISTINCT FROM new_top_intent;

ALTER TABLE public.stage_3_retro_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stage_3_retro_runs_service_all ON public.stage_3_retro_runs;
CREATE POLICY stage_3_retro_runs_service_all
  ON public.stage_3_retro_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS stage_3_retro_runs_auth_select ON public.stage_3_retro_runs;
CREATE POLICY stage_3_retro_runs_auth_select
  ON public.stage_3_retro_runs FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.stage_3_retro_runs TO authenticated;
GRANT ALL    ON public.stage_3_retro_runs TO service_role;

COMMIT;
```

`intent_volume_baselines`: copy verbatim from CONTEXT D-05 schema; add RLS policies + service-role/authenticated grants per template.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Compare classifier by re-classifying via a side-process | Compare by re-invoking the **same live agent surface** with the **same prompt builder** | This phase | Eliminates "shadow classifier drift" — the only difference is prompt+schema versions, not invocation transport |
| Hand-curate baseline rows | Read live `pipeline_events` for pre-v8.1 distribution | Phase 70+ | Already-persisted data; no extra work |
| Open-set proposals discovered offline | `intent_proposal_clusters` table refreshed nightly by Phase 86 cron | Phase 86 | Phase 87 reads, doesn't compute |

**Deprecated/outdated:**
- The `scripts/phase-65-regression-backfill.ts` pattern (in-script Orq calls) — Phase 87 should NOT follow this shape; use Inngest for durability.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `pipeline_events` stage=3 fully captures pre-v8.1 live verdicts back to the start of the 30-day window | Pitfall 1 + 5000-selection | If `pipeline_events` only started writing partway through the window, pre-v8.1 counts undershoot. Mitigation: planner verifies first `created_at` on `pipeline_events WHERE stage=3 AND swarm_type='debtor-email'` and clamps `since_date` accordingly. [VERIFIED: migration `20260506a_pipeline_events.sql` + Phase 70 TELE-01 — table exists since Phase 70 (~early May 2026). With 30-day window from 2026-05-20 baseline, start date ≈ 2026-04-20, comfortably after Phase 70.] |
| A2 | Orq `/responses` `usage.total_tokens` is reliable per call | Pitfall 2 | [VERIFIED in code: `web/lib/automations/orq-agents/client.ts:198-208`. Phase 65 already plumbs it through `invokeOrqAgentWithUsage`.] |
| A3 | The live agent in Orq Studio is at V3 prompt+schema state by the time Phase 87 runs | All sections | [VERIFIED via Phase 85 verification status and 86-VERIFICATION.md which assumes V3 live.] |
| A4 | `debtor.email_labels.entity` is non-null for every email that reached Stage 3 | reconstruct-input.ts | If null, fallback `"smeba"` matches today's coordinator default (`debtor-email-coordinator.ts:88-94`). Same fallback chain — safe. |
| A5 | `assembleInput()` is pure given (subject, bodyFull, priors, tenantDomains, capChars) — i.e. deterministic across replays | All sections | [VERIFIED: `assemble-input.ts` has no I/O, no random, no Date.now.] |
| A6 | The live `debtor-intent-agent` honours per-call invocation without server-side caching | Pitfall 3 | [ASSUMED] Orq Studio "caching" toggle, if enabled per-agent, could short-circuit. Pre-flight: smoke test 3 known-different emails in a row and confirm 3 distinct outputs. |

**A6 needs a smoke test in Plan 01 (precondition gate validation).**

## Open Questions

1. **Should Phase 87 also re-run the pre-v8.1 window through the V3 agent (counter-factual: "what would V3 say about the OLD emails?")?**
   - What we know: D-04 step 1 is "pre-v8.1 count (live distribution from Phase 76+), post-v8.1 count (this re-run)." The pre-v8.1 count is the *live* distribution — V2 prompt, no full body.
   - What's unclear: A counter-factual run (re-classify the pre-v8.1 emails with V3 prompt) would give a 4-way comparison: V2-old-input, V2-new-input (impossible — no V2 on full body), V3-old-input (counterfactual), V3-new-input (this phase). The strongest evidence for v8.1 "worked" comes from comparing V3-on-old vs V3-on-new (isolates the input change). Currently the report design doesn't ask for this.
   - Recommendation: scope this OUT of Phase 87 (extra 5000 emails = 2× cost; D-03 cap would need amending). Note as a follow-up if R-01 fires (acceptance threshold missed) — counter-factual would help diagnose whether prompt or input is at fault.

2. **`stage_3_retro_runs` retention policy?**
   - What we know: D-05 says "future Phase 87 runs … append never overwrite." `intent_volume_baselines` is append-only. But `stage_3_retro_runs` could grow to N × 5000 per re-run.
   - Recommendation: no auto-purge in Phase 87. Add a TODO for V11.0 (dashboard) to add a retention cron when row count crosses ~50k.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Inngest dev/prod runtime | All execution | ✓ | already-deployed (`web/lib/inngest/client.ts`) | — |
| Supabase service role | All DB writes | ✓ | `SUPABASE_SERVICE_ROLE_KEY` in Vercel env | — |
| `ORQ_API_KEY` | `invokeIntentAgent` | ✓ | in Vercel env (verified at `invoke-intent.ts:97-98`) | — |
| Live `debtor-intent-agent` V3 in Orq Studio | All classification | Pending Phase 85 deploy (per STATE.md "v8.1 → main pending Vercel redeploy") | — | **BLOCKER**: Phase 87 cannot run until Phase 85 deploys to prod Orq tenant + Phase 86 has ≥7d data |
| `email_pipeline.emails.body_full_text` populated | Replay input | Pending Phase 83 backfill completion | — | Code falls back to `body_text` per `debtor-email-coordinator.ts:163-164` — degraded but not broken |
| `intent_proposal_clusters` ≥5 clusters, ≥7d data | Section 2 of report | Pending Phase 86 R-04 closure (currently KEEP-OPEN-PENDING-WINDOW) | — | Precondition gate refuses to run |

**Missing dependencies with no fallback:**
- Phase 85 V3 agent must be live in prod Orq.
- Phase 86 cluster data must be ≥7d mature.

**Missing dependencies with fallback:**
- `body_full_text` falls back to `body_text` for not-yet-backfilled rows; flag in report if a meaningful subset of retro emails fell back.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (already configured per other `__tests__/` dirs in `web/lib/`) |
| Config file | `web/vitest.config.ts` (existing) |
| Quick run command | `cd web && npx vitest run lib/automations/debtor-email/retro/__tests__ -t "<test name>"` |
| Full suite command | `cd web && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-87-01 | `reconstructInput()` produces same assembled_input as live coordinator for a given email_id | unit | `cd web && npx vitest run lib/automations/debtor-email/retro/__tests__/reconstruct-input.test.ts` | ❌ Wave 0 |
| REQ-87-02 | `stage_3_retro_runs (run_id, email_id)` UNIQUE — second INSERT with same pair throws | integration | `cd web && npx vitest run lib/automations/debtor-email/retro/__tests__/migration.test.ts` (against local supabase) | ❌ Wave 0 |
| REQ-87-03 | Aggregation builder produces correct `count`/`share` summing to 1.0 ± epsilon | unit | `cd web && npx vitest run lib/automations/debtor-email/retro/__tests__/aggregate-baseline.test.ts` | ❌ Wave 0 |
| REQ-87-04 | Diff-sample SQL returns ≤20 rows, all with `original_top_intent != new_top_intent` | unit (sql-builder test) | same as REQ-87-03 | ❌ Wave 0 |
| REQ-87-05 | Markdown report generator — N/A (operator-written) | manual | Operator review of `87-BASELINE-REPORT.md` | — |
| REQ-87-06 | Total token usage accumulator sums per-call `usage.total_tokens` | unit | `cd web && npx vitest run lib/inngest/functions/__tests__/debtor-email-stage-3-retro-classify.test.ts` | ❌ Wave 0 |
| REQ-87-07 | Precondition gate throws when `intent_proposal_clusters` is empty or stale | unit | same as REQ-87-06 | ❌ Wave 0 |
| Smoke | End-to-end on 50-email sample on live prod → row count == 50, total_tokens > 0, no errors | smoke (manual) | `tsx scripts/run-retro-classify.ts --since 2026-05-13 --until 2026-05-20 --sample-limit 50` | — |

### Sampling Rate

- **Per task commit:** `cd web && npx vitest run lib/automations/debtor-email/retro` (subset, <10s)
- **Per wave merge:** `cd web && npm test`
- **Phase gate:** Full Vitest suite green + manual 50-email smoke run completes + Inngest dashboard shows zero `step.run` failures.

### Wave 0 Gaps

- [ ] `web/lib/automations/debtor-email/retro/__tests__/reconstruct-input.test.ts` — covers REQ-87-01 (fixture: real `email_pipeline.emails` row → assertion that `assembled_input` exactly matches the live coordinator's assembly for the same row).
- [ ] `web/lib/automations/debtor-email/retro/__tests__/aggregate-baseline.test.ts` — covers REQ-87-03 + REQ-87-04 (SQL-builder unit tests; in-memory `stage_3_retro_runs` fixture).
- [ ] `web/lib/inngest/functions/__tests__/debtor-email-stage-3-retro-classify.test.ts` — covers REQ-87-06 + REQ-87-07 (mocked `invokeIntentAgent`, mocked supabase admin; assert precondition gate + token sum + write shape).
- [ ] Shared fixture: `web/lib/automations/debtor-email/retro/__tests__/fixtures/sample-emails.ts` — 3 known emails with deterministic agent-output mocks.

## Project Constraints (from CLAUDE.md)

- **Stack:** Inngest (durable function), Supabase (service role), Orq.ai (LLM via Router). NEVER OpenAI/Anthropic direct, NEVER bespoke auth.
- **RLS verplicht** op `stage_3_retro_runs` + `intent_volume_baselines` — both in `public` schema. Use `supabase/migrations/_template.sql`. Pre-push hook (`npm run check:supabase`) blocks otherwise.
- **No `SECURITY DEFINER` views** on public schema (Phase 87 only creates tables, no views — n/a).
- **Replay-safe id generation:** `crypto.randomUUID()` for `run_id` INSIDE `step.run("resolve-run-id", …)`. Verbatim CLAUDE.md Phase 65 pattern.
- **No `inngest.send` destructuring.** Call inline; use `DynamicSend` cast if needed for dynamic event names. (Not needed here — event name is a static string literal.)
- **Cron rules N/A** — Phase 87 is event-triggered, not cron.
- **Orq.ai catalog:** the **live** `debtor-intent-agent` is what Phase 87 invokes. No `list_models` / `update_agent` ritual in this phase (Phase 85 owned that). Phase 87 just calls. Phase 85's V3 model + fallback chain is already persisted in Orq Studio.
- **45s client timeout** on Orq calls (already set in `invoke-intent.ts:16`).
- **JSON output enforcement** — already configured on the agent (V3 strict json_schema with anyOf-nullable per Phase 85 D-04). Phase 87 just reads what the agent returns.
- **Test-first:** all 4 Wave 0 test files written before implementation per project config (`mode: yolo` doesn't waive testing; it waives discussion gates).
- **Project tracking:** Phase 87 lives under existing `agent-workforce` project in `projects` table — no new row needed.

## Sources

### Primary (HIGH confidence)

- In-repo: `web/lib/inngest/functions/debtor-email-coordinator.ts` (lines 99-110: replay-safe run_id; 150-267: assembleInput + invokeIntentAgent integration)
- In-repo: `web/lib/automations/debtor-email/coordinator/invoke-intent.ts` (full file: prompt builder, agent call, V2/V3 schema discrimination)
- In-repo: `web/lib/automations/debtor-email/coordinator/assemble-input.ts` (deterministic, pure)
- In-repo: `web/lib/inngest/functions/intent-proposals-refresh.ts` (template for batch-update Inngest function shape)
- In-repo: `web/lib/automations/orq-agents/client.ts` lines 198-208 (Orq `/responses` returns `usage.{input,output,total}_tokens`)
- In-repo: `supabase/migrations/20260501a_coordinator_runs.sql`, `20260520_phase86_intent_proposals_v1.sql`, `20260520_phase86_intent_proposal_clusters.sql`
- In-repo: `supabase/migrations/_template.sql` (RLS pattern)
- Locked RFC: `docs/agentic-pipeline/README.md`, `docs/agentic-pipeline/stage-3-coordinator.md`, `docs/agentic-pipeline/context-shape-contract.md`
- Phase docs: `85-CONTEXT.md` (V3 schema + intent_version), `86-CONTEXT.md` (cluster surface), `83-CONTEXT.md` (body_full_text column)

### Secondary (MEDIUM confidence)

- CLAUDE.md learnings: `dae6276` (this-binding), `dd2583a` (replay-id), `3970bad9` (anyOf), `f980a2a1` (list_models pre-flight)

### Tertiary (LOW confidence)

- None. Every claim in this research is backed by an in-repo file reference or a locked RFC doc.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every primitive exists in-repo; phase is wiring, not building.
- Architecture: HIGH — Side-Channel Isolation rule is the one architectural choice that must hold; rest is pattern-matching against Phase 86's `intent-proposals-refresh.ts`.
- Pitfalls: HIGH — all five pitfalls have either CLAUDE.md learnings backing them or direct code references.
- Wave 0 gaps: MEDIUM — exact fixture shape (Pitfall 4's "return only token count") needs to be confirmed in PLAN-CHECK.

**Research date:** 2026-05-20
**Valid until:** 2026-06-20 (30 days; the live `debtor-intent-agent` could be revised by then, which would shift the "what V3 looks like" snapshot Phase 87 captures — re-validate if the phase doesn't execute within the window)
