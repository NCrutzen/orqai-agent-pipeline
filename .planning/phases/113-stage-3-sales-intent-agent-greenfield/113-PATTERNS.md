# Phase 113: Stage 3 Sales Intent Agent (greenfield) - Pattern Map

**Mapped:** 2026-06-05
**Files analyzed:** 8 new/modified
**Analogs found:** 8 / 8 (every file has an exact or strong in-tree analog — this is a "copy the debtor swarm, swap the swarm_type" phase)

> **Architectural lock applies to every file below.** STAGE3-01: the shared
> classifier (`debtor-email-coordinator.ts`) and dispatcher (`stage-3-dispatcher.ts`)
> get ZERO edits. None of the files in this map touch those two. Hard separation:
> no `swarm_intents` key may also exist in `swarm_noise_categories` (the 13 sales
> noise keys). The codegen 3-way invariant (TS union ⇄ `swarm_intents` rows ⇄ Orq
> json_schema enum) must hold after the seed migration.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `web/lib/automations/sales-email/coordinator/types.ts` | model/schema | transform (Zod gate) | `web/lib/automations/debtor-email/coordinator/types.ts` | exact (V3 shape + 1 additive axis) |
| `web/lib/automations/sales-email/coordinator/invoke-intent.ts` | service | request-response (Orq /responses) | `web/lib/automations/debtor-email/coordinator/invoke-intent.ts` | exact (AGENT_KEY swap + agent-key param — see Q1) |
| `web/lib/automations/sales-email/coordinator/assemble-input.ts` | utility | transform (XML build + cap) | `web/lib/automations/debtor-email/coordinator/assemble-input.ts` | exact (reuse signature verbatim) |
| `web/lib/automations/sales-email/retro/reconstruct-input.ts` | utility | transform (DB read → InvokeIntentInput) | `web/lib/automations/debtor-email/retro/reconstruct-input.ts` | exact (+ Phase 116 attachment folding — Pitfall 4) |
| `web/lib/inngest/functions/sales-email-stage-3-retro-classify.ts` | service (Inngest fn) | batch (offline side-channel) | `web/lib/inngest/functions/debtor-email-stage-3-retro-classify.ts` + `sales-email-stage-1-retro-classify.ts` | exact (two sibling analogs) |
| `web/scripts/orq/manage-sales-intent-agent.ts` | config script | request-response (Orq CRUD) | (no in-tree script; CLAUDE.md Orq block is the spec) | role-match (pattern from CLAUDE.md learnings) |
| `supabase/migrations/<ts>_phase113_sales_swarm_intents.sql` | migration | CRUD (registry seed) | `20260504b_swarms_registry_generalisation.sql` + `20260507_phase76_swarm_intents_handler_status.sql` | exact (INSERT + handler_status='placeholder') |
| `web/lib/automations/debtor-email/coordinator/intent.generated.ts` | codegen artifact | transform (regen, not hand-edit) | `web/scripts/gen-intent-types.ts` (the producer) | exact — DO NOT create a sales copy (Pitfall 3) |

---

## Pattern Assignments

### `sales-email/coordinator/types.ts` (model/schema, transform)

**Analog:** `web/lib/automations/debtor-email/coordinator/types.ts`

**What to copy:** the V3 ranked-output shape verbatim, extended with ONE nullable
field (`entity_relationship`, D-05). Source the closed-list enum from the codegen
map, NOT a hand-written tuple.

**Enum-from-codegen pattern** (debtor `types.ts` lines 16-20 re-export the generated map; AI-SPEC §4b shows the sales import):
```typescript
import { z } from "zod";
import { SWARM_INTENTS_BY_SWARM } from "@/lib/automations/debtor-email/coordinator/intent.generated";
// NOTE: import from the DEBTOR-pathed generated file — there is ONE shared file
// keyed by swarm_type (Pitfall 3). Do NOT create sales-email/coordinator/intent.generated.ts.
const SALES_INTENT = SWARM_INTENTS_BY_SWARM["sales-email"];
```

**Ranked-entry + output shape** (debtor `types.ts` lines 119-166 — mirror exactly, add the nullable axis):
```typescript
export const rankedSalesIntentEntry = z.object({
  intent: z.enum(SALES_INTENT),
  confidence: z.enum(CONFIDENCE),          // ["low","medium","high"]
  reasoning: z.string().max(300),          // debtor widened 200→300 after ~12% drift failures (line 124-133)
});

export const SALES_INTENT_VERSION = "2026-06-xx.v1" as const;  // planning sets the date

export const salesIntentOutputSchema = z.object({
  ranked: z.array(rankedSalesIntentEntry).min(1).max(5),  // OQ6 — bound prompt blow-up
  language: z.enum(LANGUAGE),              // ["nl","en","de","fr"]
  urgency: z.enum(URGENCY),                // ["low","normal","high"]
  intent_version: z.literal(SALES_INTENT_VERSION),
  intent_proposal: z.string().max(64).regex(/^[a-z][a-z0-9_]*$/).nullable(),  // D-11 open-set
  proposal_reason: z.string().max(280).nullable(),
  entity_relationship: z.enum([/* exact values at planning, e.g.
    "resolved_entity","unresolved_known_pattern","unknown_third_party" */]).nullable(),  // D-05 NEW
});
```

**Critical constraint:** `entity_relationship` MUST be `.nullable()` so the shared
read path (Bulk Review, dispatcher) ignores it on debtor rows — additive only.
The json_schema mirror uses `{"anyOf":[{...},{"type":"null"}]}`, NEVER the
`{"type":[...,"null"]}` shorthand (CLAUDE.md learning `3970bad9`).

---

### `sales-email/coordinator/invoke-intent.ts` (service, request-response)

**Analog:** `web/lib/automations/debtor-email/coordinator/invoke-intent.ts` (read this session)

**Core Orq call pattern** (debtor lines 14-16, 160-197):
```typescript
const ORQ_ENDPOINT = "https://api.orq.ai/v2/agents";
const AGENT_KEY = "sales-intent-agent";   // the AGENT_KEY swap from debtor
const TIMEOUT_MS = 45_000;                 // > Orq's 31s internal retry (Pitfall 6 — NOT 30s)

const res = await fetch(`${ORQ_ENDPOINT}/${AGENT_KEY}/responses`, {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    message: { role: "user", parts: [{ kind: "text", text: buildUserMessage(...) }] },
    configuration: { blocking: true, variables },  // variables carry email_id for trace-join
  }),
  signal: AbortSignal.timeout(TIMEOUT_MS),
});
```

**Fence-strip + Zod double-gate** (debtor lines 191-229):
```typescript
const raw = json.output?.[0]?.parts?.[0]?.text ?? "";
if (!raw) throw new Error("Orq intent-agent returned empty output");
const stripped = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
const parsed = JSON.parse(stripped);              // attach `raw` to the thrown error on failure
const validated = salesIntentOutputSchema.safeParse(parsed);  // .raw attached on !success → Bulk Review retry
```

**Replay-safety / determinism patterns to carry over:**
- `sortKeys()` on prompt vars + `received_at` kept OUT of the prompt text (debtor lines 70-76, 113-129) so retries N minutes later hash to the same prompt string (idempotency cache holds).
- Forward the Orq `usage` block (debtor lines 231-241) — the retro loop accumulates `total_tokens` per run.

> **⚠ Q1 — LOAD-BEARING DESIGN DECISION (RESEARCH Open Q #1 / Assumption A2, HIGH risk).**
> Debtor `invoke-intent.ts` hardcodes `AGENT_KEY='debtor-intent-agent'`, and the
> shared `debtor-email-coordinator.ts` imports `invokeIntentAgent` from the debtor
> path. `swarms.stage3_coordinator_agent_key='sales-intent-agent'` is already set,
> strongly implying the agent key should be READ from the registry per-invocation.
> **Planning MUST resolve how the shared classifier selects the sales agent key**
> — likely parameterize `invokeIntentAgent({ agent_key, ... })` and have the
> coordinator pass `loadSwarm(swarm_type).stage3_coordinator_agent_key`. Parameterizing
> a coordinator *support* file is arguably inside STAGE3-01's non-edit boundary
> (the classifier itself), but confirm the exact boundary with the plan-checker.

---

### `sales-email/coordinator/assemble-input.ts` (utility, transform)

**Analog:** `web/lib/automations/debtor-email/coordinator/assemble-input.ts`

Reuse the signature verbatim — `assembleInput({ subject, bodyFull, priors, tenantDomains, capChars })`
with `STAGE_3_INPUT_CAP_CHARS = 8000`. Truncates the quoted thread first, keeps
the inbound message intact, returns a truncation flag + `input_chars` for
`pipeline_events.decision_details.input_size`. If sales conversation shape is
identical, consider importing the debtor `assembleInput` directly rather than
copying (planning decides — `tenantDomains` differs per swarm via the generated map).

---

### `sales-email/retro/reconstruct-input.ts` (utility, transform)

**Analog:** `web/lib/automations/debtor-email/retro/reconstruct-input.ts` (read this session)

**What to copy:** builds the exact `InvokeIntentInput` the live coordinator would
build, from a persisted email. `assembled_input` MUST be byte-comparable to a live
`assembleInput()` call (the comparison-validity invariant).

**Schema-scoping pattern** (debtor lines 81-92 — `emails`/`conversation_context` live in `email_pipeline`, not `public`):
```typescript
const { data: emailData } = await admin
  .schema("email_pipeline")                 // WITHOUT this: "Could not find table 'public.emails'"
  .from("emails")
  .select("id, subject, body_text, body_full_text, sender_email, mailbox, received_at")
  .eq("id", email_id).maybeSingle();
```

**Pure-function discipline** (debtor lines 17-18): no `Date.now()`, no random —
safe under Inngest replay.

> **⚠ Pitfall 4 (the reason 116 was sequenced before 113).** Debtor reconstruct
> reads `body_full_text ?? body_text` (line 118) — it predates attachment folding.
> The sales reconstruct MUST replicate the live Stage 2 attachment-text folding
> (the `selectResolverBody` + attachment-text concatenation inline in
> `stage-2-customer-resolver.ts:84+`) or the retro corpus sees LESS context than
> live and clusters miss PO/offertenummer intents. Keep it byte-comparable to what
> live Stage 3 assembles. Also: sales `entity` derivation differs from debtor's
> static `MAILBOX_ENTITY_MAP` (lines 38-43) — sales corpus is dual-source
> (Outlook + SugarCRM, see select-candidates); derive accordingly.

---

### `sales-email-stage-3-retro-classify.ts` (Inngest fn, batch / offline side-channel)

**Primary analog:** `web/lib/inngest/functions/debtor-email-stage-3-retro-classify.ts` (read this session — same Stage 3 retro purpose)
**Secondary analog:** `web/lib/inngest/functions/sales-email-stage-1-retro-classify.ts` (read this session — same SALES side, already wired to the sales `select-candidates`)

**Function shell** (debtor Stage-3 retro lines 48-56):
```typescript
export const salesEmailStage3RetroClassify = inngest.createFunction(
  { id: "sales-email-stage-3-retro-classify", name: "Phase 113 — sales-email Stage 3 retro-classify",
    retries: 3, concurrency: { limit: 1 } },
  { event: "sales-email/retro-classify.requested" },
  async ({ event, step }) => { ... }
);
```

**The 6 architectural locks to copy verbatim** (debtor Stage-3 retro header lines 8-30, source-grep-guarded):
1. **Side-Channel Isolation** — writes ONLY `stage_3_retro_runs` (+ baseline). NEVER `automation_runs`, live `agent_runs`, or `pipeline_events`. Enforced by a source-grep guard test (mirror the debtor/Phase-111 guard test).
2. **Cache bypass** — call `invokeIntentAgent` (the sales one) directly; no live coordinator-wrapper import.
3. **R-04 precondition gate** (debtor lines 63-94) — refuse to run if the cluster surface has `< 5` rows or max `refreshed_at` is `> 7` days stale. Fail loud.
4. **Replay-safe run_id** (debtor lines 96-99): `const run_id = await step.run("resolve-run-id", async () => event.data.run_id ?? crypto.randomUUID())` — INSIDE `step.run`.
5. **Step-memo discipline** (debtor lines 111-151): each per-email `step.run("classify-${email_id}")` returns ONLY the token count; the full verdict is upserted to `stage_3_retro_runs` inside the step with `onConflict: "run_id,email_id", ignoreDuplicates: true`.
6. **`inngest.send` binding** — never destructured; this function emits no downstream events.

**Candidate selection (reuse, don't rebuild):** call the EXISTING sales
`selectCandidates` from `@/lib/automations/sales-email/retro/select-candidates`
(read this session) — it already handles dual-corpus (Outlook + SugarCRM),
`normalizeDirection`, the 40k `STAGE_1_RETRO_HARD_CAP` fail-loud truncation guard,
the single-tenant SugarCRM invariant, and email_id dedup. Scope the retro window
deliberately (RESEARCH Open Q #3: 933 Outlook + 34,725 SugarCRM — a full sweep is
~$170 of Haiku; recommend last 30–90d Outlook for the primary vocabulary).

---

### `web/scripts/orq/manage-sales-intent-agent.ts` (config script, request-response)

**Analog:** no in-tree script — the CLAUDE.md Orq block + `docs/orqai-patterns.md`
are the spec; debtor's agent config is the anchor to copy values from.

**The mandatory create→PATCH→verify sequence (D-13, Pitfalls 5):**
1. `list_models` FIRST — validate the primary + EVERY fallback ID against the catalog (PATCH accepts unknown IDs silently and breaks the Studio dropdown). Anchor on the live `debtor-intent-agent` (Haiku 4.5 via Bedrock EU: `aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0`).
2. `create_agent` with a BARE model id (`create_agent` silently drops `model.parameters.response_format`).
3. Immediate `update_agent` PATCH with the full `model.parameters` incl. strict `response_format` json_schema — nullable fields use `{"anyOf":[...,{"type":"null"}]}`, never the array shorthand. `temperature: 0`, `max_tokens` bounded (~1000).
4. `get_agent` to verify persistence.
5. The json_schema **tool resource** itself requires Studio (MCP has no tool CRUD) — follow the canonical CLAUDE.md JSON-enforcement workflow (Studio → Tools → Add → JSON Schema, then Model parameters → Response Format = "JSON Schema").

**Fallback chain** (CLAUDE.md catalog, all `list_models`-validated):
`openai/gpt-4o-mini`, `google-ai/gemini-2.5-flash`, `mistral/mistral-large-2411`.

---

### `supabase/migrations/<ts>_phase113_sales_swarm_intents.sql` (migration, CRUD)

**Analogs:** `20260504b_swarms_registry_generalisation.sql` (the INSERT shape, lines 94-103) + `20260507_phase76_swarm_intents_handler_status.sql` (the `handler_status='placeholder'` set).

**INSERT shape** (20260504b lines 94-103):
```sql
insert into public.swarm_intents (swarm_type, intent_key, handler_agent_key, handler_event, requires_orchestration) values
  ('sales-email', '<promoted_intent>', null, 'sales-email/<promoted_intent>.requested', false),
  ...
  ('sales-email', 'other', null, 'sales-email/other.requested', false)
on conflict (swarm_type, intent_key) do nothing;
```

**Handler-status pattern (STAGE3-03 — every sales intent is handler-less today):**
```sql
update public.swarm_intents set handler_status = 'placeholder'
 where swarm_type = 'sales-email';   -- NO Stage 4 handlers until V11.0
```

**Mandatory seed invariants:**
- **`other` MUST be seeded** with `handler_status='placeholder'` (Assumption A4 / Pitfall 1). Without it the residual bucket throws in the dispatcher → silent dead-letter.
- **Hard-separation guard:** none of the 13 sales `swarm_noise_categories` keys (e.g. `auto_reply`, `ooo_temporary`, `payment_admittance`, `unknown`) may appear here.
- **Atomic commit (D-04):** this migration + `npm run codegen` (regenerates the shared `intent.generated.ts`) + the Orq json_schema enum update ship in ONE commit so the 3-way invariant never drifts. No runtime `swarm_intents` writes from the promote button.

> The intent_key VALUES are NOT chosen here — they are the operator-promoted
> clusters from the retro discovery pass (D-01/D-02, coverage-threshold ≈80%).

---

### `intent.generated.ts` (codegen artifact — regenerate, never hand-edit)

**Producer:** `web/scripts/gen-intent-types.ts` (read this session).

**Pitfall 3 — there is ONE shared generated file, under the DEBTOR path:**
`web/lib/automations/debtor-email/coordinator/intent.generated.ts`. The script
reads ALL swarms and emits `SWARM_INTENTS_BY_SWARM` keyed by swarm_type
(`sales-email: []` today, populated after the seed migration). DO NOT create a
sales copy — the AI-SPEC/RESEARCH structure blocks that list a sales
`intent.generated.ts` are aspirational; the VERIFIED reality is one file.

**Regen + CI gate** (gen-intent-types lines 78-92, 135-145): alphabetical sort for
stable diffs, idempotent skip-write if identical. CI: `npm run codegen && git diff --exit-code`.

---

## Shared Patterns

### Orq structured-output (Zod double-gate + strict json_schema)
**Source:** debtor `invoke-intent.ts` lines 191-229 + `types.ts` lines 99-166; CLAUDE.md Orq block.
**Apply to:** `invoke-intent.ts`, `types.ts`, `manage-sales-intent-agent.ts`.
Server-side strict json_schema (~98%) + client `salesIntentOutputSchema.parse()` (residual + fence/drift). Nullable → `anyOf`, never `["string","null"]`. 45s client timeout. `temperature: 0`.

### Inngest replay safety
**Source:** debtor + sales Stage-3/Stage-1 retro functions (header locks).
**Apply to:** `sales-email-stage-3-retro-classify.ts`.
Non-deterministic ids inside `step.run`; `inngest.send` never destructured; each per-email step returns only a scalar (token count), full output persisted inside the step; `onConflict` upsert for replay idempotency.

### Registry-as-source-of-truth + atomic migration+codegen
**Source:** `gen-intent-types.ts` + the 20260504b / phase76 seed migrations.
**Apply to:** the seed migration + `intent.generated.ts`.
ONE atomic commit: migration + `npm run codegen` + Orq json_schema enum. 3-way invariant (TS ⇄ registry ⇄ json_schema). `npm run codegen && git diff --exit-code` CI gate.

### RLS on every new table
**Source:** `20260521_phase87_stage_3_retro_runs.sql` lines 34-52 (sales reuses this EXISTING table — no new table expected, but if planning adds one):
```sql
ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
CREATE POLICY ..._service_all ON ... FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ..._auth_select ON ... FOR SELECT TO authenticated USING (true);
```
**Apply to:** any new table. NOTE: `stage_3_retro_runs` already exists and is RLS-enabled — the sales retro function writes to it with `swarm_type='sales-email'`; no new migration for it.

### Side-channel isolation (offline retro never touches live pipeline)
**Source:** debtor Stage-3 retro header lock #1 + the Phase 111 sales Stage-1 source-grep guard test.
**Apply to:** `sales-email-stage-3-retro-classify.ts` + its Wave 0 guard test.
Allowed writes: `stage_3_retro_runs` (+ baseline) ONLY. A source-grep test asserts the forbidden-token list (`automation_runs`, live `agent_runs`, `pipeline_events`) never appears.

---

## Read-Only Reference (NOT modified — STAGE3-01)

These are the shared seam the sales files plug into. Read for contract, never edit.

| File | Why read-only | Key contract |
|------|---------------|--------------|
| `web/lib/inngest/functions/debtor-email-coordinator.ts` | SHARED Stage 3 classifier (Phase 110 D-07, swarm_type derived from payload) | The function sales rides; see Q1 for agent-key dispatch |
| `web/lib/inngest/functions/stage-3-dispatcher.ts` | SHARED dispatcher (`*/predicted`, `loadSwarmIntents`, branch-free) | placeholder branch already does the STAGE3-03 Kanban insert: `automation_runs(automation='sales-email-kanban', result.kanban_reason='no_handler')` + flips `agent_runs.status → routed_human_queue` (RESEARCH Code Examples) |
| `web/lib/automations/sales-email/resolve-customer.ts` | EXISTS (Phase 114) — Stage 2 resolver | supplies `entity_relationship` input via the PipelineStageContext envelope (D-06) |

---

## No Analog Found

None. Every file has a strong in-tree analog. The only file without a code analog
(`manage-sales-intent-agent.ts`) has a fully-specified pattern in the CLAUDE.md Orq
block + `docs/orqai-patterns.md` (create→PATCH→verify).

---

## Open Questions Forwarded to Planner

1. **Agent-key dispatch (Q1 above, HIGH risk).** How does the shared classifier
   select the sales agent key? Resolve the exact non-edit boundary (parameterize
   `invokeIntentAgent` vs. per-swarm wrapper) with the plan-checker.
2. **`entity_relationship` values + persistence location** (D-05) — candidates
   `resolved_entity`/`unresolved_known_pattern`/`unknown_third_party`; persist on
   `coordinator_runs` or `pipeline_events.decision_details` (additive JSONB, no
   migration). Must stay swarm-agnostic + nullable.
3. **Retro corpus window** (Open Q #3) — scope to recent Outlook (~933, last 30–90d)
   for primary vocabulary; bounded SugarCRM sample optional. Respect the 40k cap.

---

## Metadata

**Analog search scope:** `web/lib/automations/{debtor-email,sales-email}/coordinator/`,
`.../retro/`, `web/lib/inngest/functions/`, `web/scripts/`, `supabase/migrations/`.
**Files scanned:** ~14 read in full (invoke-intent, types, both retro-classify fns,
both reconstruct/select-candidates, gen-intent-types, 3 migrations, assemble-input sig,
dispatcher excerpt via RESEARCH).
**Pattern extraction date:** 2026-06-05
