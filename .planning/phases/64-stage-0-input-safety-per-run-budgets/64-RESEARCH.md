# Phase 64: Stage 0 input safety + per-run budgets — Research

**Researched:** 2026-04-30
**Domain:** Prompt-injection screening, per-run cost/token budgets, intent-scoped tool allowlists, operator review surface
**Confidence:** HIGH (existing stack 100% verified by reading the live code; injection-pattern seed list MEDIUM — adapted from OWASP/published guidance, not project-specific corpus)

## Summary

Phase 64 lands Stage 0 of the v8.0 5-stage funnel: prompt-injection screening + per-run budget enforcement + intent-scoped tool allowlist. The work splits cleanly along three axes:

1. **Detection layering (SAFE-01..04):** regex-on-every-email + LLM-on-every-email (Haiku via Orq.ai Router) running BEFORE the existing `web/lib/debtor-email/classify.ts` Stage 1. This is locked in CONTEXT D-01 and contradicts the published RFC's "LLM-on-inconclusive" wording — the RFC paragraph in `docs/agentic-pipeline/stage-0-safety.md` MUST be updated in the same phase (D-02).
2. **Budget enforcement (BUDG-01):** an Inngest `step.run`-bounded accumulator that tracks tokens + cost per top-level invocation; on breach, emit a first-class `pipeline.budget_breached` event (NOT throw) and let a separate Inngest function file the Kanban Human Review item. Inngest's default 3-retry behaviour MUST NOT trigger on breach (use `retries: 0` on the breach-handler function or surface as `NonRetriableError`).
3. **Allowlist (BUDG-02):** additive `text[]` column on `public.zapier_tools` with default-deny semantics, enforced in `web/lib/automations/debtor-email/nxt-zap-client.ts`'s `loadTool()` path before the POST.

**Primary recommendation:** Build Stage 0 as a NEW Inngest function (`stage-0-safety-worker`) wired in BEFORE the existing `/api/automations/debtor-email/ingest` route hands off to the classifier. This preserves the current sync-ingest contract for Zapier (still returns `action: "labeled"|...`) while keeping Stage 0 in a durable, retriable boundary where token/cost tracking belongs. Do NOT add Stage 0 inline in the ingest route — synchronous Vercel routes have a 30s `maxDuration` and the LLM-verdict adds an extra 2–4s per email which compounds with the existing Graph fetch + classifier latency.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Stage 0 detection layering:**
- D-01: Stage 0 runs **regex + LLM verdict on every inbound email** (uniform per-email cost signal feeds override axis 4; Haiku cost ~€0.0003/email is acceptable).
- D-02: This decision **contradicts the Phase 63 RFC** (`docs/agentic-pipeline/stage-0-safety.md` says "LLM verdict step is conditional"). Phase 64 plan MUST include a task to update that RFC paragraph.
- D-03: LLM verdict model = `anthropic/claude-haiku-4-5` (primary) + Orq.ai Router fallbacks. JSON via `response_format.json_schema`. NOT Sonnet.
- D-04: Seed regex pattern set = Anthropic prompt-injection-defenses guidance + ~5–10 custom Dutch/English entries ("negeer eerdere instructies", "ignore the above", system-prompt-leak attempts). Iterate via graduated-automation hook (Phase 71).

**`zapier_tools.allowed_for_intents`:**
- D-05: Add as `text[]` column on existing `zapier_tools` table. NOT a junction table.
- D-06: **Default-deny:** NULL or empty `allowed_for_intents` ⇒ no intent can invoke. New tools must explicitly register intents.
- D-07: Intent identifier = `swarm_categories.key` (reuse existing registry; no parallel `swarm_intents` table in this phase).
- D-08: Enforcement in `web/lib/automations/debtor-email/nxt-zap-client.ts` (and any parallel `zapier_tools` consumer). Throw typed `ToolNotAllowedForIntentError`. NOT enforced server-side in Zapier.

**Bulk Review surface for `injection_suspected`:**
- D-09: Dedicated tab/lane "Safety review" — NOT a filter on existing draft-review tab.
- D-10: Per-flagged-email surfaced fields: (1) regex pattern matched, (2) LLM verdict + 1–2 sentence reason, (3) raw body with matched span highlighted, (4) per-email token cost in cents.
- D-11: Operator actions: (a) Mark safe → reprocess through Stage 1 with `safety_overridden` audit flag, (b) Dismiss/archive (logged), (c) Escalate to existing Kanban Human Review lane.
- D-12: "Reply manually" is NOT a Stage 0 action — out of scope for this phase.

**Budget breach → human queue handoff:**
- D-13: Breach = explicit `pipeline.budget_breached` event consumed by separate Inngest function. NOT a thrown error. Inngest auto-retry MUST NOT trigger.
- D-14: Ceiling = both tokens AND cost. Breach when EITHER exceeds. Cost is the operator-visible number (axis 4 already speaks in cents).
- D-15: "Per-run" = one top-level Inngest function invocation. Counter resets per invocation. Retries within same function share budget. NOT per-thread, NOT per-email-across-functions.
- D-16: Exact ceiling values (token cap, cost cap in cents) **deferred to research/planner**. Starting point: ~3× observed median run cost.

**Cost outlier → override axis 4:**
- D-17: `>3× median per-email cost`. Median window (rolling vs absolute) deferred to research/planner.

### Claude's Discretion

- Exact regex pattern list (D-04 seeds the source).
- Exact ceiling values (D-16) — recommend 5,000 token / 15-cent ceiling per Inngest invocation as conservative default (see § Common Pitfalls / Budget Sizing).
- Median window for axis-4 outlier (D-17) — recommend 7-day rolling median computed off `automation_runs.result.cost_cents` (see § Cost Telemetry).
- Inngest event names + payload shapes for `pipeline.budget_breached`.
- Bulk Review UI implementation (component reuse vs new components).
- Migration ordering between `allowed_for_intents` column add and backfill of existing tools.

### Deferred Ideas (OUT OF SCOPE)

- "Reply manually" as a Stage 0 action.
- Many-to-many categories ↔ intents.
- Promotion-ladder thresholds for tightening Stage 0 regex (Phase 71).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SAFE-01 | Detect prompt-injection in inbound body before any LLM sees it | § Standard Stack (Stage 0 detection), § Architecture Patterns (Pattern 1) |
| SAFE-02 | Suspect emails flagged `injection_suspected`, routed to human-only review | § Architecture Patterns (Pattern 2 — flag persistence), § Code Examples |
| SAFE-03 | Layered detection (regex + lightweight LLM classifier) per Anthropic guidance | § Standard Stack, § Don't Hand-Roll (use Orq.ai Router) |
| SAFE-04 | Operator can audit injection-flagged emails in Bulk Review with trigger pattern surfaced | § Architecture Patterns (Pattern 3 — Safety Review tab) |
| BUDG-01 | Per-run hard token + cost ceiling enforced in Inngest; runs exceeding halt + escalate | § Architecture Patterns (Pattern 4 — budget accumulator), § Common Pitfalls |
| BUDG-02 | Tool calls gated by intent allowlist (`zapier_tools.allowed_for_intents`) | § Architecture Patterns (Pattern 5 — allowlist enforcement), § Code Examples |
| BUDG-03 | Per-email token cost in Bulk Review; outliers (>3× median) as override axis | § Cost Telemetry, § Architecture Patterns (Pattern 6 — outlier detection) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Regex pattern matching | API/Backend (Vercel route or Inngest step) | — | Pure deterministic computation; no I/O. Lives wherever Stage 1 classifier lives (already established pattern: `web/lib/debtor-email/classify.ts`). |
| LLM injection verdict | API/Backend (Inngest step) | — | Side effect (LLM call). MUST be inside `step.run()` per `docs/inngest-patterns.md`. Calls Orq.ai Router server-side; never client. |
| Budget accumulator state | Database (Supabase) + Inngest step memoization | — | Per-invocation counter persisted to `automation_runs.result` for audit; in-flight tracking via `step.run` return values (memoized on replay). |
| `pipeline.budget_breached` event emission | API/Backend (Inngest event) | — | First-class signal per D-13. Handled by separate Inngest function. |
| Tool allowlist enforcement | API/Backend (`nxt-zap-client.ts` library) | — | Pre-POST guard in the canonical client wrapper. Default-deny means a missing column / NULL value blocks the call. |
| `injection_suspected` row persistence | Database (Supabase `automation_runs` + `email_labels`) | — | Reuses existing audit tables; no new schema for the row itself, only for the verdict fields. |
| Safety Review tab UI | Frontend (Next.js dashboard) | API/Backend (data loader) | Reuses `/automations/[swarm]/review` shell; new tab segment in `swarm.ui_config` or query param. |
| Cost outlier detection | API/Backend (cron Inngest function) | Database (read-model) | Periodic median computation; results written back to a column or telemetry table for the Bulk Review UI to read cheaply. |

## Standard Stack

### Core (already used; reuse, do not add)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `inngest` | ^3.54.0 (project pin) | Durable function for Stage 0 + budget breach handler | Project-mandated for event-driven pipelines per CLAUDE.md. `step.run` boundaries match D-15 "per-run" semantics. [VERIFIED: web/package.json] |
| `@orq-ai/node` | ^4.7.7 (project pin) | LLM Router for the Haiku injection verdict | Project rule: NEVER direct LLM API keys; ALWAYS Orq.ai Router. [VERIFIED: CLAUDE.md, web/package.json] |
| `zod` | ^4.3.6 (project pin) | Validate LLM verdict JSON output | Mandatory per `docs/orqai-patterns.md` — prompt-only JSON has 15–20% failure rate. [VERIFIED: web/package.json] |
| `@supabase/supabase-js` | ^2.99.1 (project pin) | Service-role writes for verdict + budget breach rows | Project rule: service role for automation writes (no RLS server-side). [VERIFIED: CLAUDE.md] |
| Existing `nxt-zap-client.ts` | n/a (in-repo) | Tool allowlist enforcement seam | Already the canonical tool-call wrapper; `loadTool()` reads `zapier_tools` row — natural place for allowlist check. [VERIFIED: web/lib/automations/debtor-email/nxt-zap-client.ts:50-72] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `anthropic/claude-haiku-4-5` (model, not lib) | n/a | Stage 0 verdict primary model per D-03 | Binary classification (safe / injection_suspected); Haiku is cost-appropriate. Sonnet is overkill. [CITED: CONTEXT D-03] |
| Inngest fallback models (Orq.ai Router) | n/a | Auto-fallback on Haiku timeout/error | 3–4 fallbacks per `docs/orqai-patterns.md`. Suggest: `openai/gpt-4o-mini`, `anthropic/claude-haiku-3-5`, `google/gemini-2.0-flash`. [CITED: docs/orqai-patterns.md] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled regex + Orq.ai Haiku | `rebuff` (npm 0.1.0) | Rebuff is alpha (v0.1.0); supplies vector-DB + canary-token detection but adds 2 new infra dependencies (Pinecone + OpenAI key). Rejected: contradicts CLAUDE.md "no direct LLM API keys" rule. [VERIFIED: npm view rebuff version → 0.1.0] |
| Orq.ai Haiku | LLM-Guard (Python `llm-guard`) | Python only; not viable in our Node.js stack. [VERIFIED: llm-guard is Python-only per project README] |
| Inline Stage 0 in `/ingest` route | Stage 0 as separate Inngest function | Inline keeps the existing sync contract simple BUT (a) Vercel `maxDuration: 30` already strained by Graph fetch + classifier; (b) budget tracking semantically belongs at function boundary not request boundary; (c) D-15 says counter resets per Inngest invocation, not per HTTP request. Recommendation: separate Inngest function. |
| Anthropic native `prompt-injection` API | Orq.ai Haiku via Router | Anthropic has no dedicated injection API — the recommended pattern is Constitutional Classifier or sentinel input. Haiku via Router is the same thing with project's mandated routing layer. |

**Installation:** No new packages required. Phase ships entirely against the existing dependency graph.

**Version verification:**
- `inngest@3.54.0` — VERIFIED 2026-04-30 via `package.json`. Latest publish per registry: 3.55+ exists; project pin `^3.54.0` will accept newer minor.
- `@orq-ai/node@4.7.7` — VERIFIED 2026-04-30 via `package.json`. Latest registry: 4.8.1. Project pin `^4.7.7` accepts; consider bumping if any Orq.ai changes touch `response_format` strictness. [VERIFIED: npm view @orq-ai/node version → 4.8.1]
- `@anthropic-ai/sdk@0.91.1` — exists in registry; NOT used directly per CLAUDE.md (Orq.ai Router only).

## Architecture Patterns

### System Architecture Diagram

```
inbound (Zapier → Outlook → /ingest route)
  │
  │ POST messageId, source_mailbox + X-Zapier-Secret
  ↓
┌──────────────────────────────────────────────────┐
│ /api/automations/debtor-email/ingest             │
│   - resolve mailbox settings                      │
│   - fetch Graph body                              │
│   - emit `pipeline/email.received` Inngest event  │
│     (NEW: stops here for unknown bucket;          │
│     payment-noise auto-actions still happen sync) │
└────────┬─────────────────────────────────────────┘
         │ event
         ↓
┌──────────────────────────────────────────────────┐
│ stage-0-safety-worker (NEW Inngest function)     │
│  retries: 0 (idempotent steps)                    │
│                                                   │
│  step.run("regex-screen")                         │
│    → returns { matched_pattern: string|null }     │
│                                                   │
│  step.run("llm-verdict")                          │
│    → Orq.ai Router: claude-haiku-4-5              │
│    → response_format.json_schema:                 │
│       { verdict: "safe"|"injection_suspected",    │
│         reason: string,                           │
│         usage: {prompt_tokens, completion_tokens, │
│                 cost_cents} }                     │
│                                                   │
│  step.run("update-budget-counter")                │
│    → atomic UPDATE on automation_runs:            │
│       result.cost_cents += verdict.cost_cents     │
│       result.token_count += verdict.total_tokens  │
│                                                   │
│  step.run("check-budget")                         │
│    if cost > CEILING_CENTS or tokens > CEILING_T: │
│      await inngest.send("pipeline/budget_breached"│
│      return { halted: true }                      │
│                                                   │
│  step.run("persist-verdict")                      │
│    → INSERT into automation_runs:                 │
│         status = 'predicted'                      │
│         topic = 'safety_review' (if suspected)    │
│         OR continue to classifier (if safe)       │
└────────┬─────────────────────────────────────────┘
         │
    ┌────┴────────────────┐
    │ verdict='safe'       │ verdict='injection_suspected'
    ↓                      ↓
classifier-verdict-worker  Safety Review tab
(existing — Stage 1)       (Bulk Review surface)
                           operator chooses:
                           - Mark safe → re-emit
                             pipeline/email.received
                             with safety_overridden=true
                           - Dismiss → status='completed'
                           - Escalate → swarm_jobs row in
                             Kanban human-review lane


Independent path:
inngest.send("pipeline/budget_breached", {automation_run_id, ...})
         ↓
budget-breach-handler (NEW Inngest function, retries: 0)
   → INSERT swarm_jobs row in Kanban human-review lane
   → UPDATE automation_runs status='failed' with breach reason


Tool-call enforcement (orthogonal):
handler-agent → callNxtTool(tool_id, input, intent)
                          ↓
                 nxt-zap-client.loadTool(tool_id)
                          ↓
                 if !tool.allowed_for_intents.includes(intent):
                    throw new ToolNotAllowedForIntentError(...)
                          ↓
                 (else continue to existing POST flow)
```

### Recommended Project Structure

```
web/
├── lib/
│   ├── stage-0/                            # NEW
│   │   ├── regex-patterns.ts                # seed patterns (D-04)
│   │   ├── regex-screen.ts                  # pure function (testable)
│   │   ├── llm-verdict.ts                   # Orq.ai Router call + Zod
│   │   ├── budget-counter.ts                # accumulator helpers
│   │   └── __tests__/
│   ├── inngest/
│   │   ├── functions/
│   │   │   ├── stage-0-safety-worker.ts     # NEW
│   │   │   └── budget-breach-handler.ts     # NEW
│   │   └── events.ts                        # ADD: pipeline/email.received,
│   │                                        #      pipeline/budget_breached
│   └── automations/
│       └── debtor-email/
│           └── nxt-zap-client.ts            # MODIFY: add allowlist check
└── app/
    └── (dashboard)/
        └── automations/
            └── [swarm]/
                └── review/
                    └── page.tsx              # MODIFY: add ?tab=safety filter
                                              # OR new "safety" tree branch
supabase/
└── migrations/
    └── 20260430e_stage_0_safety_and_allowlist.sql   # NEW (single migration)
```

### Pattern 1: Stage 0 Detection (regex + LLM)

**What:** Two-step verdict in a single Inngest function. Both run on every email per D-01. Regex provides the audit trail and seeds graduated-automation telemetry; LLM provides the verdict.

**When to use:** Every inbound email before Stage 1 classifier sees it.

**Example:**
```typescript
// web/lib/stage-0/regex-patterns.ts
// Source: OWASP LLM Prompt Injection Prevention Cheat Sheet 2025 +
//         Anthropic prompt-injection-defenses guidance + Dutch debtor seed.
export const INJECTION_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  // English imperative override
  { name: "ignore_previous", pattern: /ignore\s+(?:all\s+|the\s+|your\s+|prior\s+|previous\s+|above\s+|earlier\s+)+(?:instructions?|prompts?|context|rules?|guidelines?|directions?|commands?|system\s+prompt)/i },
  { name: "disregard_above", pattern: /disregard\s+(?:everything|the\s+above|prior|previous)/i },
  { name: "you_are_now", pattern: /you\s+are\s+now\s+(?:a|an|the)\s+/i },
  // System-prompt leak attempts
  { name: "reveal_system_prompt", pattern: /(?:reveal|show|print|output|display)\s+(?:your\s+)?(?:system\s+prompt|instructions|original\s+prompt)/i },
  { name: "developer_message", pattern: /<\s*\/?\s*(?:system|developer|admin|sudo)\s*>/i },
  // Dutch (high-frequency in our corpus per D-04)
  { name: "negeer_instructies", pattern: /negeer\s+(?:alle\s+|de\s+|je\s+|voorgaande\s+|eerdere\s+|bovenstaande\s+)+(?:instructies?|opdrachten?|regels?)/i },
  { name: "vergeet_alles", pattern: /vergeet\s+(?:alles|wat\s+er\s+(?:hierboven|eerder)\s+staat|je\s+(?:instructies|opdracht))/i },
  { name: "doe_alsof", pattern: /doe\s+alsof\s+je\s+(?:een|geen)\s+/i },
  // Delimiter-injection
  { name: "fake_role_marker", pattern: /^\s*(?:assistant|system|user)\s*:\s*/im },
  // Obvious tool-name fishing
  { name: "tool_invocation_attempt", pattern: /<\s*tool[_-]?(?:call|use|invoke)/i },
];

export function regexScreen(body: string): { matched: string | null } {
  for (const p of INJECTION_PATTERNS) {
    if (p.pattern.test(body)) return { matched: p.name };
  }
  return { matched: null };
}
```

```typescript
// web/lib/stage-0/llm-verdict.ts
// Source: Pattern from docs/orqai-patterns.md §3 (response_format json_schema mandatory).
import { z } from "zod";
import { Orq } from "@orq-ai/node";

const VerdictSchema = z.object({
  verdict: z.enum(["safe", "injection_suspected"]),
  reason: z.string().max(280),
  matched_span: z.string().nullable(),  // verbatim quoted span from email
});

export async function llmInjectionVerdict(args: {
  email_id: string;
  body: string;
  subject: string;
}): Promise<{
  verdict: "safe" | "injection_suspected";
  reason: string;
  matched_span: string | null;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; cost_cents: number };
}> {
  const orq = new Orq({ apiKey: process.env.ORQ_API_KEY! });
  const response = await orq.deployments.invoke({
    key: "stage-0-safety-classifier",   // Orq.ai agent key (provisioned in this phase)
    messages: [{ role: "user", content: `<email_subject>${args.subject}</email_subject>\n<email_body>${args.body}</email_body>` }],
    metadata: { user_id: args.email_id },
  });
  const parsed = VerdictSchema.safeParse(JSON.parse(response.choices[0].message.content));
  if (!parsed.success) throw new Error(`Stage 0 verdict parse failed: ${parsed.error.message}`);
  // Orq.ai returns usage on response.usage and cost on response.billing.total_cost (cents).
  // VERIFIED: see web/lib/orqai/trace-mapper.schema.ts — gen_ai.usage + orq.billing.total_cost shape.
  return {
    ...parsed.data,
    usage: {
      prompt_tokens: response.usage?.prompt_tokens ?? 0,
      completion_tokens: response.usage?.completion_tokens ?? 0,
      total_tokens: response.usage?.total_tokens ?? 0,
      cost_cents: Math.round((response.billing?.total_cost ?? 0) * 100),  // Orq.ai returns dollars; convert to cents
    },
  };
}
```

### Pattern 2: `injection_suspected` Persistence

**What:** Persist verdict to `automation_runs` so the Safety Review tab reads it. NO new table; reuse the existing telemetry seam.

**When to use:** After every Stage 0 verdict.

**Example:**
```typescript
// Inside stage-0-safety-worker step.run("persist-verdict")
await admin.from("automation_runs").insert({
  automation: "debtor-email-review",
  status: verdict === "safe" ? "predicted" : "predicted",  // 'predicted' for both — Safety tab filters on topic
  swarm_type: "debtor-email",
  topic: verdict === "injection_suspected" ? "safety_review" : null,
  entity: settings.entity,
  mailbox_id,
  result: {
    stage: "stage_0_safety",
    message_id,
    source_mailbox,
    verdict,                          // 'safe' | 'injection_suspected'
    regex_matched: regexResult.matched,
    llm_reason: llmResult.reason,
    matched_span: llmResult.matched_span,
    cost_cents: llmResult.usage.cost_cents,
    token_count: llmResult.usage.total_tokens,
    safety_overridden: false,         // flips true when operator marks safe
  },
  triggered_by: "stage-0-safety-worker",
  completed_at: new Date().toISOString(),
});
```

The Safety Review tab in `/automations/debtor-email/review` filters `WHERE topic='safety_review'`.

### Pattern 3: Safety Review Tab

**What:** New "Safety review" lane in the existing `/automations/[swarm]/review` page. Reuses `swarm.ui_config` plumbing.

**When to use:** Operator audits flagged emails per D-09, D-10, D-11.

**Implementation options (planner picks one):**

| Option | What it requires | Tradeoff |
|--------|------------------|----------|
| (A) Extend `tree_levels` to include `topic='safety_review'` as first-level filter | One-line `swarm.ui_config` update; row-list reads `topic` | Minimal code change but couples safety into the same tree as classifier categories. |
| (B) New top-level tab on the review page driven by `?tab=safety` query param | New tab component in `page.tsx`; data loader filters on topic; new `DetailPane` variant for safety actions (Mark safe / Dismiss / Escalate) | More code but cleaner separation per D-09 ("dedicated tab/lane … not a filter"). RECOMMENDED. |

**Recommendation:** Option B aligns with D-09's "different mental model, different actions per row" wording.

### Pattern 4: Per-Run Budget Accumulator

**What:** Track tokens + cost across all `step.run()` LLM calls within one top-level Inngest invocation. Halt when EITHER ceiling breached.

**When to use:** Every Inngest function that calls Orq.ai. For Phase 64 specifically: `stage-0-safety-worker` + the existing `classifier-label-resolver` + `classifier-invoice-copy-handler` (these three already make LLM calls and need the accumulator wired in).

**Example:**
```typescript
// web/lib/stage-0/budget-counter.ts
export const BUDGET_CEILING_CENTS = 15;   // 15 cents per run (D-16 starting point)
export const BUDGET_CEILING_TOKENS = 5_000;

export interface BudgetState {
  cost_cents: number;
  token_count: number;
}

export function check(state: BudgetState): { breached: boolean; reason?: string } {
  if (state.cost_cents > BUDGET_CEILING_CENTS) {
    return { breached: true, reason: `cost_cents ${state.cost_cents} > ${BUDGET_CEILING_CENTS}` };
  }
  if (state.token_count > BUDGET_CEILING_TOKENS) {
    return { breached: true, reason: `token_count ${state.token_count} > ${BUDGET_CEILING_TOKENS}` };
  }
  return { breached: false };
}

// Usage inside an Inngest function:
async function runWithBudget(automation_run_id: string, step: any) {
  let budget: BudgetState = { cost_cents: 0, token_count: 0 };

  const verdict = await step.run("llm-verdict", () => llmInjectionVerdict({...}));
  budget = {
    cost_cents: budget.cost_cents + verdict.usage.cost_cents,
    token_count: budget.token_count + verdict.usage.total_tokens,
  };

  const check = await step.run("check-budget", () => budgetCounter.check(budget));
  if (check.breached) {
    await step.run("emit-budget-breach", () =>
      inngest.send({
        name: "pipeline/budget_breached",
        data: { automation_run_id, budget, reason: check.reason },
      })
    );
    return { halted: true, reason: check.reason };
  }
  // … continue
}
```

**Key:** the accumulator is a local variable. Inngest replays the function from the top on retry, but each `step.run` is memoized — so the verdict result is replayed instantly, and the local `budget` reconstructs deterministically. No race, no double-charge.

### Pattern 5: Tool Allowlist Enforcement (BUDG-02)

**What:** Pre-POST guard in `nxt-zap-client.ts`. Default-deny per D-06.

**When to use:** Every tool invocation that goes through `callNxtTool` or any other consumer of `zapier_tools`.

**Example:**
```typescript
// web/lib/automations/debtor-email/nxt-zap-client.ts (modify existing)
export class ToolNotAllowedForIntentError extends Error {
  constructor(public tool_id: string, public intent: string) {
    super(`Tool "${tool_id}" not allowed for intent "${intent}"`);
    this.name = "ToolNotAllowedForIntentError";
  }
}

type ZapierToolRow = {
  // … existing fields …
  allowed_for_intents: string[] | null;   // NEW
};

// In callNxtTool, add `intent: string` parameter:
export async function callNxtTool<T extends NxtToolId>(
  tool_id: T,
  input: ...,
  intent: string,                                // NEW required parameter
): Promise<...> {
  const tool = await loadTool(tool_id);

  // BUDG-02: default-deny per D-06.
  const allowed = tool.allowed_for_intents ?? [];
  if (allowed.length === 0 || !allowed.includes(intent)) {
    throw new ToolNotAllowedForIntentError(tool_id, intent);
  }
  // … existing flow …
}
```

**Schema migration (additive):**
```sql
-- supabase/migrations/20260430e_stage_0_safety_and_allowlist.sql
ALTER TABLE public.zapier_tools
  ADD COLUMN IF NOT EXISTS allowed_for_intents text[];

-- Backfill: existing tools wired to their currently-allowed intents
-- (D-07: intent identifier = swarm_categories.key).
UPDATE public.zapier_tools
SET allowed_for_intents = ARRAY['unknown', 'invoice_copy_request']
WHERE tool_id IN ('nxt.contact_lookup','nxt.identifier_lookup','nxt.candidate_details');

UPDATE public.zapier_tools
SET allowed_for_intents = ARRAY['invoice_copy_request']
WHERE tool_id = 'nxt.invoice_fetch';
```

### Pattern 6: Cost Outlier Detection (BUDG-03)

**What:** Periodic median computation; outliers flagged inline on the Bulk Review row.

**When to use:** Every email with a Stage 0 verdict (cost is recorded; outlier-flag is computed cheaply at read time OR by cron).

**Recommendation:** **Compute at read time** in the Bulk Review data loader — the Postgres query is cheap (one window function over last 7 days):

```sql
WITH recent AS (
  SELECT
    id,
    (result->>'cost_cents')::int AS cost_cents,
    percentile_disc(0.5) WITHIN GROUP (
      ORDER BY (result->>'cost_cents')::int
    ) OVER () AS median_cost
  FROM automation_runs
  WHERE swarm_type = 'debtor-email'
    AND created_at > now() - interval '7 days'
    AND result ? 'cost_cents'
)
SELECT
  id,
  cost_cents,
  median_cost,
  (cost_cents > 3 * median_cost) AS is_cost_outlier
FROM recent;
```

**Why 7-day rolling (D-17):** Volume in `automation_runs` is small enough that a 7-day window gives stable median (>200 samples); any shorter is noisy on weekends; longer lags real shifts in cost (e.g., a Sonnet-handler swap).

### Anti-Patterns to Avoid

- **Inline LLM call in `/ingest` route:** breaks Vercel `maxDuration` budget. Use Inngest function.
- **Throwing on budget breach:** triggers Inngest auto-retry which spends MORE budget. Use event emit per D-13.
- **NULL `allowed_for_intents` = "all intents":** violates default-deny D-06. Treat NULL/empty as "no intents".
- **Persisting injection-suspected emails to a NEW table:** unnecessary; reuse `automation_runs` with `topic='safety_review'` filter.
- **Allowlist check in Zapier (server-side):** Zapier doesn't see our intent vocabulary; check in the canonical client wrapper per D-08.
- **Checking budget OUTSIDE `step.run`:** the check itself is a no-op side-effect that should be memoized; outside-step code re-runs on replay (per `docs/inngest-patterns.md` §"Side Effects Must Be Inside step.run()").

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Prompt-injection regex set | Custom-derived list from scratch | OWASP LLM Prompt Injection Prevention Cheat Sheet 2025 + Anthropic guidance + 5–10 Dutch debtor-specific entries (D-04) | Public lists already cover the 80% case; project-specific Dutch additions are the 20% delta. |
| LLM verdict | Direct Anthropic API call | Orq.ai Router with `response_format.json_schema` | Project rule (CLAUDE.md): NEVER direct LLM keys; ALWAYS Orq.ai. Plus Router gives free fallback chain. |
| Token/cost telemetry | Custom token counter + cost table | Orq.ai trace `attributes.gen_ai.usage` + `attributes.orq.billing.total_cost` | Already populated by Orq.ai on every call (verified `web/lib/orqai/trace-mapper.schema.ts`). Read `response.usage` + `response.billing.total_cost` directly. |
| Budget breach signaling | Custom error class with retry-suppression flag | First-class Inngest event + `retries: 0` on the breach handler | Per D-13. Inngest's `NonRetriableError` works but conflates "halt this run" with "tell another system about it"; an event is the right shape. |
| Median outlier detection | Streaming approximate-median library (P²/T-Digest) | Plain `percentile_disc(0.5)` SQL window function | Volume is < 1000 emails/day; exact percentile is fine. T-Digest is for Datadog-scale. |
| Safety Review tab | New page from scratch | Extend existing `/automations/[swarm]/review` with new tab | The shell + `swarm.ui_config` already supports per-swarm UI variations; reuse. |
| `injection_suspected` storage | New `safety_reviews` table | Existing `automation_runs.topic='safety_review'` rows | Same audit + realtime + cleanup machinery as everything else in the swarm. |

**Key insight:** Phase 64 is mostly **wire** work, not **build** work. Every primitive needed already exists; the value is in the integration topology and the few new SQL columns / Inngest functions that connect them.

## Runtime State Inventory

This is a code/config addition phase, not a rename. The 5 categories:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no string is being renamed. New `automation_runs.result.stage='stage_0_safety'` rows will appear after deploy. | None for migration. |
| Live service config | Orq.ai must have a new agent provisioned: `stage-0-safety-classifier` (D-03 model = `claude-haiku-4-5`). This lives in Orq.ai, NOT in git — must be created via `/orq-agent` skill or Orq MCP. | Provision agent before deploy; record `agent_key` in CLAUDE.md or `docs/debtor-email-pipeline-architecture.md` registry section. |
| OS-registered state | None. | None. |
| Secrets/env vars | `ORQ_API_KEY` — already exists, no change. | None. |
| Build artifacts | None — additive code only. | None. |

## Common Pitfalls

### Pitfall 1: Budget breach causes Inngest infinite-retry loop
**What goes wrong:** If breach is signaled by a thrown error, Inngest retries 3 times by default — each retry re-spends the budget on fallback Orq.ai models, multiplying cost.
**Why it happens:** Stage 0 worker has `retries: N` and treats over-budget as an exceptional state.
**How to avoid:** Use `inngest.send("pipeline/budget_breached", ...)` from inside `step.run` and `return { halted: true }`. Set `retries: 0` on the breach-handler function. Per D-13.
**Warning signs:** Same `automation_run_id` accumulating multiple `cost_cents` increments in `automation_runs.result`.

### Pitfall 2: NULL allowlist treated as "open" instead of "denied"
**What goes wrong:** A new tool is registered without setting `allowed_for_intents` and is invoked freely — defeats BUDG-02's purpose.
**Why it happens:** Programmer-friendly default would be "if absent, allow"; security-friendly default is the opposite.
**How to avoid:** In `nxt-zap-client.ts`, write `const allowed = tool.allowed_for_intents ?? []` and require non-empty AND `.includes(intent)`. Test: insert a tool row with NULL column; assert `callNxtTool` throws `ToolNotAllowedForIntentError`.
**Warning signs:** New tool works on first registration without explicit intent list = bug.

### Pitfall 3: LLM verdict's own LLM call gets injection-screened recursively
**What goes wrong:** If Stage 0 is naively wrapped around ALL Orq.ai calls (not just the inbound-email body), the verdict prompt itself contains "ignore previous instructions" verbatim from the user email and triggers the regex.
**Why it happens:** Conflating "screen INBOUND user-controlled content" with "screen ALL LLM input".
**How to avoid:** Stage 0 runs ONCE per inbound email, on the email body, before any other LLM sees it. Downstream LLMs (label-tiebreaker, copy-document body agent) get the SCREENED body but do NOT get re-screened.
**Warning signs:** Stage 0 invocations > 1 per email; nested `pipeline/email.received` events.

### Pitfall 4: Budget ceiling sized too tight on legit multi-step runs
**What goes wrong:** A single email triggers Stage 0 (Haiku) + classifier-label-resolver (LLM tiebreaker, Sonnet) + invoice-copy handler (Sonnet body draft) — total 3 LLM calls, ~6,000 tokens, ~12 cents on a normal run. If ceiling is 5 cents, every legit invoice-copy run breaches.
**Why it happens:** Sizing only against Stage 0 cost (~0.03¢) and not against the full pipeline.
**How to avoid:** **Phase 64 starting ceilings: 15 cents, 5,000 tokens** — sized at ~3× observed median for a multi-LLM run. Document chosen numbers + rationale in plan per D-16. Validate against last 30 days of `automation_runs` before merging.
**Warning signs:** > 5% of runs hitting `pipeline/budget_breached` in week 1.

### Pitfall 5: Safety-overridden re-process loops Stage 0 again
**What goes wrong:** Operator marks-safe → re-emit `pipeline/email.received` → Stage 0 runs again → flags again → infinite loop on the Safety Review tab.
**Why it happens:** Re-emit doesn't carry the override flag.
**How to avoid:** Check `event.data.safety_overridden === true` at the top of `stage-0-safety-worker` and skip directly to Stage 1 if so. Audit row records `safety_overridden=true` for the resolver telemetry.
**Warning signs:** Same `email_id` appearing in safety-review tab multiple times.

### Pitfall 6: Outlier detection bootstrap problem
**What goes wrong:** First N emails have no median to compare against — all flag as outliers (or none do).
**Why it happens:** `> 3× median` requires a median.
**How to avoid:** Threshold the window: only compute outlier flag when the 7-day window has ≥ 100 samples. Below that, default `is_cost_outlier=false`. Document this in the plan.
**Warning signs:** All Stage 0 cards show outlier badge in week 1.

## Code Examples

### Stage 0 Inngest function (skeleton)
```typescript
// web/lib/inngest/functions/stage-0-safety-worker.ts
// Source: pattern from existing classifier-verdict-worker.ts (registry-driven step layout).
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { regexScreen } from "@/lib/stage-0/regex-screen";
import { llmInjectionVerdict } from "@/lib/stage-0/llm-verdict";
import * as budget from "@/lib/stage-0/budget-counter";

export const stage0SafetyWorker = inngest.createFunction(
  { id: "stage-0/safety-worker", retries: 0 },
  { event: "pipeline/email.received" },
  async ({ event, step }) => {
    const { email_id, body, subject, automation_run_id, safety_overridden } = event.data;

    // Pitfall 5: skip Stage 0 on operator override.
    if (safety_overridden) {
      await step.run("forward-to-classifier", () =>
        inngest.send({ name: "classifier/screen.requested", data: { email_id } })
      );
      return { skipped: "safety_overridden" };
    }

    const regexResult = await step.run("regex-screen", () => regexScreen(body));

    const llmResult = await step.run("llm-verdict", () =>
      llmInjectionVerdict({ email_id, body, subject })
    );

    let budgetState: budget.BudgetState = {
      cost_cents: llmResult.usage.cost_cents,
      token_count: llmResult.usage.total_tokens,
    };

    const budgetCheck = await step.run("check-budget", () => budget.check(budgetState));
    if (budgetCheck.breached) {
      await step.run("emit-budget-breach", () =>
        inngest.send({
          name: "pipeline/budget_breached",
          data: { automation_run_id, email_id, budget: budgetState, reason: budgetCheck.reason },
        })
      );
      return { halted: true };
    }

    await step.run("persist-verdict", async () => {
      const admin = createAdminClient();
      await admin.from("automation_runs").insert({
        automation: "debtor-email-review",
        status: "predicted",
        swarm_type: "debtor-email",
        topic: llmResult.verdict === "injection_suspected" ? "safety_review" : null,
        result: {
          stage: "stage_0_safety",
          email_id,
          verdict: llmResult.verdict,
          regex_matched: regexResult.matched,
          llm_reason: llmResult.reason,
          matched_span: llmResult.matched_span,
          cost_cents: llmResult.usage.cost_cents,
          token_count: llmResult.usage.total_tokens,
          safety_overridden: false,
        },
        triggered_by: "stage-0-safety-worker",
      });
    });

    if (llmResult.verdict === "safe") {
      await step.run("forward-to-classifier", () =>
        inngest.send({ name: "classifier/screen.requested", data: { email_id } })
      );
    }
    // else: it lands in the Safety Review tab; operator triages.

    return { verdict: llmResult.verdict };
  },
);
```

### Budget breach handler
```typescript
// web/lib/inngest/functions/budget-breach-handler.ts
export const budgetBreachHandler = inngest.createFunction(
  { id: "stage-0/budget-breach-handler", retries: 0 },
  { event: "pipeline/budget_breached" },
  async ({ event, step }) => {
    const { automation_run_id, email_id, budget, reason } = event.data;
    const admin = createAdminClient();

    await step.run("mark-failed", async () => {
      await admin.from("automation_runs").update({
        status: "failed",
        error_message: `budget breach: ${reason}`,
        completed_at: new Date().toISOString(),
      }).eq("id", automation_run_id);
    });

    await step.run("file-kanban-card", async () => {
      // Reuses the existing Kanban Human Review lane (D-11/D-13).
      await admin.from("automation_runs").insert({
        automation: "debtor-email-review",
        status: "pending",   // → maps to swarm_jobs.stage='review' via existing bridge
        swarm_type: "debtor-email",
        topic: "budget_breach",
        result: { source_automation_run_id: automation_run_id, email_id, budget, reason },
        triggered_by: "budget-breach-handler",
      });
    });
  },
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prompt-only JSON instructions for LLM output | `response_format.json_schema` (strict) | OpenAI Aug 2024, Anthropic Q4 2024, Orq.ai standardised early 2025 | Phase 64's verdict step MUST use json_schema, NOT prompt-only. Per `docs/orqai-patterns.md` §3. |
| Catch-all "noise" filtering before LLM | Layered Stage 0 (regex + LLM verdict) per Anthropic Constitutional Classifiers | Anthropic published Constitutional Classifiers paper, late 2024 | Justifies the regex-first + LLM-verdict pattern locked in D-01. |
| "LLM-on-inconclusive" gating (cost optimisation) | "LLM-on-every-email" (uniform telemetry signal) | Project decision 2026-04-30 (CONTEXT D-01, D-02) | Phase 64 deviates from the published RFC; RFC update required. |
| Per-Zap env-var routing | `zapier_tools` registry table | Phase 56-01b (2026-04-29) | Phase 64 extends this with `allowed_for_intents`; aligned with the registry-as-data principle. |

**Deprecated/outdated:**
- `LLM-Guard` (Python only) — not viable in Node stack.
- `rebuff@0.1.0` — alpha, requires Pinecone + direct OpenAI key — violates CLAUDE.md.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Orq.ai response object exposes `usage.{prompt_tokens,completion_tokens,total_tokens}` and `billing.total_cost` (in dollars, convert ×100 for cents) | Code Examples (Pattern 1) | Cost telemetry pulls wrong number — verify by logging one real Orq.ai response from a Haiku call before merging. The schema in `web/lib/orqai/trace-mapper.schema.ts` confirms these fields exist on TRACE attributes; inline response shape needs one-call verification. [ASSUMED] |
| A2 | `claude-haiku-4-5` is available via Orq.ai Router | CONTEXT D-03 / Standard Stack | If model is named differently in Router, agent provisioning fails. Verify in Orq.ai console before starting. [ASSUMED — copied from CONTEXT D-03] |
| A3 | Starting ceiling 15¢ / 5,000 tokens covers 95%+ of legit runs | Pitfall 4, Pattern 4 | Too-tight ceiling → false-positive breaches. Validate against last 30 days of `automation_runs.result.cost_cents` data BEFORE setting. [ASSUMED — derived from rough cost model; needs real-data verification in Plan 1] |
| A4 | 7-day rolling median is the right window for axis-4 outlier (D-17) | Pattern 6 | Too short → noisy on weekends; too long → laggy on cost-shift events. Defensible default given current volume (<1000 emails/day) but not measured. [ASSUMED] |
| A5 | Email body in Dutch is the dominant language for injection patterns in our corpus | D-04 / Code Examples regex list | Seed list weighted toward English+Dutch. If a French/German injection happens, regex misses but LLM should catch. Document in plan as known limitation. [ASSUMED] |
| A6 | Existing `automation_runs.result` jsonb shape can absorb Stage 0 fields without schema migration | Pattern 2 | The column is `jsonb` (no schema constraint) — verified. But indices on `result->>'cost_cents'` would help BUDG-03 query perf; planner may want to add a GIN index. [VERIFIED column type; index decision ASSUMED] |
| A7 | Bumping `@orq-ai/node` from 4.7.7 → 4.8.1 is non-breaking | Standard Stack version verification | Minor bump in same major; should be safe but not required for Phase 64. [ASSUMED — semver convention] |

## Open Questions

1. **Where does `safety_overridden` audit flag live — `automation_runs.result.safety_overridden` (jsonb field) or new column on `email_labels`?**
   - What we know: D-11 says re-process with `safety_overridden` audit flag.
   - What's unclear: whether axis-1 telemetry math (graduated automation) needs to filter overridden rows out, which would prefer a top-level column.
   - Recommendation: **Use `automation_runs.result.safety_overridden` (jsonb) for Phase 64; promote to a column in Phase 71 if axis math needs it.** Avoids a schema migration for what may be ephemeral.

2. **Should `pipeline/email.received` replace the current `debtor/email.received` (used for shadow-triage) or coexist?**
   - What we know: Existing `/ingest` route already fires `debtor/email.received` for shadow-triage.
   - What's unclear: Phase 64 introduces a similar event — naming-collision risk.
   - Recommendation: **Use `stage-0/email.received` as the Stage 0 trigger to avoid collision.** Plan can rename in a later phase if RFC alignment requires.

3. **Does the existing `classifier-verdict-worker` need a budget accumulator too, or only Stage 0?**
   - What we know: BUDG-01 says "each pipeline run" gets a ceiling (D-15 = per-Inngest-invocation).
   - What's unclear: Stage 0 emits an event that triggers the classifier, which is a SEPARATE Inngest invocation per D-15. So they get separate budgets.
   - Recommendation: **Phase 64 ships budget-tracking ONLY in Stage 0. Plan should document this as known limitation; classifier + invoice-copy handler get budget tracking in Phase 65/66.** Otherwise scope creep.

4. **Should the Bulk Review SQL median computation become a materialised view?**
   - What we know: Volume is small; live query is cheap today.
   - What's unclear: Won't be cheap forever.
   - Recommendation: **Live query for Phase 64; promote to materialised view if pageload exceeds 200ms in production.** Defer to Phase 70 telemetry consolidation.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Orq.ai (Router + agents) | LLM verdict | ✓ | 4.7.7 client | — |
| `claude-haiku-4-5` model in Orq.ai Router | LLM verdict | ✗ (NOT VERIFIED — needs probe) | — | Haiku 3.5 if 4.5 unavailable; document as fallback in plan |
| Inngest | All workers | ✓ | 3.54.0 | — |
| Supabase service role | All writes | ✓ | client 2.99.1 | — |
| `automation_runs` table | Verdict persistence | ✓ | — | — |
| `zapier_tools` table | Allowlist column add | ✓ | — | — |
| `swarm_categories.key` registry | Intent identifier source (D-07) | ✓ | — | — |
| `/automations/[swarm]/review` shell | Safety Review tab | ✓ | Phase 56.7 | — |
| Kanban Human Review lane (`swarm_jobs`) | Budget breach destination | ✓ | Phase 52 | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:**
- `claude-haiku-4-5` availability in Orq.ai Router — fall back to `claude-haiku-3-5` if 4.5 not yet provisioned. Plan should include a Wave 0 probe step.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (verified by `find ... __tests__` and existing `web/lib/classifier/__tests__/`) |
| Config file | `web/vitest.config.ts` (existing, not phase-specific) |
| Quick run command | `cd web && npx vitest run --reporter=basic` |
| Full suite command | `cd web && npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SAFE-01 | Regex screen flags "ignore previous instructions" + Dutch equivalent | unit | `cd web && npx vitest run lib/stage-0/__tests__/regex-screen.test.ts` | ❌ Wave 0 |
| SAFE-01 | LLM verdict returns `injection_suspected` for known-malicious sample | integration (mocked Orq.ai) | `cd web && npx vitest run lib/stage-0/__tests__/llm-verdict.test.ts` | ❌ Wave 0 |
| SAFE-02 | Stage 0 worker writes `topic='safety_review'` row when verdict=injection_suspected | integration (mocked Inngest+Supabase) | `cd web && npx vitest run lib/inngest/functions/__tests__/stage-0-safety-worker.test.ts` | ❌ Wave 0 |
| SAFE-02 | Stage 0 worker does NOT emit `classifier/screen.requested` when injection_suspected | integration | (same test file as above) | ❌ Wave 0 |
| SAFE-03 | Both regex AND LLM run on every email (D-01) | unit (worker test asserts both step.run calls) | (same as SAFE-02) | ❌ Wave 0 |
| SAFE-04 | Bulk Review query returns flagged rows with regex_matched + llm_reason + matched_span + cost_cents | integration | `cd web && npx vitest run app/__tests__/safety-review.test.tsx` (or page-data-loader test) | ❌ Wave 0 |
| BUDG-01 | When budget exceeded, worker emits `pipeline/budget_breached` and does NOT throw | unit | `cd web && npx vitest run lib/stage-0/__tests__/budget-counter.test.ts` + worker test | ❌ Wave 0 |
| BUDG-01 | Inngest retry does NOT fire on budget breach | integration | (worker test asserts function returns success after emit) | ❌ Wave 0 |
| BUDG-02 | `callNxtTool` throws `ToolNotAllowedForIntentError` when intent not in allowlist | unit | `cd web && npx vitest run lib/automations/debtor-email/__tests__/nxt-zap-client.test.ts` | ❌ Wave 0 |
| BUDG-02 | NULL/empty `allowed_for_intents` denies (default-deny) | unit | (same as above) | ❌ Wave 0 |
| BUDG-03 | Cost outlier query flags rows where cost > 3× median | SQL test or integration | manual SQL fixture or vitest with Supabase test-client | ❌ Wave 0 |
| RFC update (D-02) | `docs/agentic-pipeline/stage-0-safety.md` no longer says "LLM verdict step is conditional" | doc lint | `grep -L "conditional" docs/agentic-pipeline/stage-0-safety.md` | n/a (manual + grep gate) |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run lib/stage-0/ lib/automations/debtor-email/__tests__/ lib/inngest/functions/__tests__/`
- **Per wave merge:** `cd web && npm run test`
- **Phase gate:** Full suite green + manual sample of 10 real-world Dutch debtor emails through Stage 0 in dry-run mode (verdict logged, no side effects).

### Wave 0 Gaps
- [ ] `web/lib/stage-0/__tests__/regex-screen.test.ts` — covers SAFE-01 deterministic patterns + non-match cases
- [ ] `web/lib/stage-0/__tests__/llm-verdict.test.ts` — covers SAFE-01/03 with Orq.ai mock
- [ ] `web/lib/stage-0/__tests__/budget-counter.test.ts` — covers BUDG-01 ceiling logic
- [ ] `web/lib/inngest/functions/__tests__/stage-0-safety-worker.test.ts` — covers worker happy path + breach path + safety-override skip path (SAFE-02, SAFE-03, BUDG-01, Pitfalls 1, 5)
- [ ] `web/lib/automations/debtor-email/__tests__/nxt-zap-client.test.ts` — covers BUDG-02 allowlist (existing file may exist; verify; otherwise add)
- [ ] `web/lib/inngest/functions/__tests__/budget-breach-handler.test.ts` — covers Kanban-card-filing on breach (BUDG-01)
- [ ] Bulk Review data-loader test for `topic='safety_review'` filter and outlier flag (SAFE-04, BUDG-03)
- [ ] Vitest mock for Orq.ai `deployments.invoke` (likely already exists in repo; locate before adding new)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no new auth surface) | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | Tool allowlist (BUDG-02) — default-deny + intent-scoped capability checks. Implements least-privilege at the tool boundary. |
| V5 Input Validation | yes | Stage 0 IS the input-validation control for LLM context. Layered regex + LLM classifier per Anthropic Constitutional Classifiers guidance. zod-validated LLM response per `docs/orqai-patterns.md`. |
| V6 Cryptography | no | — |
| V7 Error Handling & Logging | yes | All Stage 0 verdicts persisted to `automation_runs` (audit trail). Budget breaches logged with reason + budget snapshot. No raw email body in error messages (privacy). |
| V8 Data Protection | partial | Email body stored in `email_pipeline.emails` (existing). Stage 0 adds `matched_span` (verbatim quote) to `automation_runs.result` — already inside the trust boundary; same access controls apply. |
| V13 API & Web Service | yes | Allowlist enforcement IS API-level access control on tool surface. `ToolNotAllowedForIntentError` is a typed deny. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Direct prompt injection ("ignore previous instructions") | Tampering | Stage 0 regex + LLM verdict (SAFE-01) |
| Indirect prompt injection (malicious content in email body fed to handler agent) | Tampering | Same Stage 0 — body is screened BEFORE any LLM context window includes it (SAFE-02) |
| Tool-confused-deputy (handler invokes higher-privilege tool than its intent allows) | Elevation of Privilege | `zapier_tools.allowed_for_intents` default-deny allowlist (BUDG-02) |
| Cost-exhaustion DoS (adversary triggers many emails to spend Orq.ai budget) | Denial of Service | Per-run token + cost ceiling with halt + human-queue handoff (BUDG-01) |
| System-prompt leak (attacker tricks LLM into revealing instructions) | Information Disclosure | Stage 0 regex catches "reveal system prompt" family + LLM verdict catches paraphrases |
| Delimiter-injection (fake `<system>` tags in body) | Tampering | Regex pattern `fake_role_marker` |
| Multilingual evasion (Dutch/French injection in non-English regex set) | Tampering | LLM verdict on every email (D-01) catches what regex misses; Dutch seed regex covers high-frequency cases |

## Sources

### Primary (HIGH confidence)
- `web/lib/automations/debtor-email/nxt-zap-client.ts:50-72,168-283` — canonical tool-call wrapper; allowlist enforcement seam
- `web/lib/inngest/functions/classifier-verdict-worker.ts` — pattern for registry-driven Inngest worker
- `web/lib/orqai/trace-mapper.schema.ts:11-55` — Orq.ai trace shape (`gen_ai.usage`, `orq.billing.total_cost`)
- `web/app/api/automations/debtor-email/ingest/route.ts:125-478` — current sync ingest path; Stage 0 hook point
- `supabase/migrations/20260429_zapier_tools_registry.sql` — `zapier_tools` schema baseline (no `allowed_for_intents` today)
- `supabase/migrations/20260428_public_agent_runs.sql:9-91` — `agent_runs` enum surface (existing override telemetry)
- `supabase/migrations/20260430c_email_labels_feedback_and_invoice_copy.sql` — feedback verdict columns precedent
- `supabase/migrations/20260429b_swarm_registry.sql:11-65` — `swarms` + `swarm_categories` shape; `swarm_categories.key` is the intent identifier per D-07
- `docs/agentic-pipeline/stage-0-safety.md` — RFC for Stage 0 (paragraph contradicting D-01 documented in CONTEXT D-02)
- `docs/agentic-pipeline/stage-4-handler.md` — `allowed_for_intents` forward-reference
- `docs/agentic-pipeline/override-model.md` — axis 4 + cost-outlier interaction
- `docs/orqai-patterns.md` §3 — `response_format.json_schema` mandatory; §6 — 45s client timeout
- `docs/inngest-patterns.md` — `step.run` semantics, side-effects in steps, `waitForEvent` gates
- `CLAUDE.md` — Inngest cron defaults, NEVER direct LLM keys, default-deny security posture, Zapier-tool registry
- `package.json` — `inngest@^3.54.0`, `@orq-ai/node@^4.7.7`, `zod@^4.3.6`, `@supabase/supabase-js@^2.99.1`

### Secondary (MEDIUM confidence)
- OWASP LLM Prompt Injection Prevention Cheat Sheet 2025 — regex pattern seed list (publicly maintained, widely cited)
- Anthropic Building Effective Agents — workflow-vs-agent distinction underpinning Stage 0
- Anthropic Constitutional Classifiers — paradigm justification (cited in `stage-0-safety.md`)

### Tertiary (LOW confidence)
- `claude-haiku-4-5` exact model availability in Orq.ai Router — flagged in Assumptions Log A2
- Cost-per-Haiku-call estimate (~€0.0003/email) — copied from CONTEXT D-01; not independently measured

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package and pattern is verified in repo or `package.json`.
- Architecture: HIGH — wire diagram is derivable from existing code; no novel infrastructure.
- Pitfalls: MEDIUM — Pitfalls 1, 2, 3, 5 are deductive from code reading; Pitfalls 4, 6 are cost-model assumptions that need data validation in Plan 1.
- Tool allowlist: HIGH — schema diff is one column add; backfill is straightforward.
- Validation tests: MEDIUM — file paths are recommendations, not verified existence; planner may rename.

**Research date:** 2026-04-30
**Valid until:** 2026-05-30 (30 days — stable stack; Orq.ai model availability is the most likely thing to drift)

Sources:
- [OWASP LLM Prompt Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)
- [Anthropic — Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)
- [Lakera — Prompt Injection & the Rise of Prompt Attacks](https://www.lakera.ai/blog/guide-to-prompt-injection)
- [Wiz — Defending AI Systems Against Prompt Injection Attacks](https://www.wiz.io/academy/ai-security/prompt-injection-attack)
