# Phase 85: Stage 3 prompt v3 — Research

**Researched:** 2026-05-20
**Domain:** Orq.ai agent config + Stage 3 ranked-intent classifier
**Confidence:** HIGH on code-side (V2 consumer map, deploy workflow, backward-compat shape); MEDIUM on Orq-validator `pattern` enforcement (needs smoke confirmation); LOW on monthly call volume (DB-only — query is pre-baked but un-run because this session has no `mcp__supabase` tool exposed; planner runs it).

## Summary

CONTEXT.md is exceptionally complete: prompt v3 structure, output schema V3, 8 boundary few-shots, deployment workflow, and risks are all locked. What the planner still needs is **operational glue**:

1. A **shortlist of real `email_pipeline.emails` rows** per few-shot slot. Phase 83 just landed `body_full_text`, so candidates must be post-Phase-83 and have non-trivial body.
2. A **call-site map** for `IntentAgentOutputV2` so the backward-compat parser is a **single switch** in `invoke-intent.ts` rather than 6+ branches.
3. A **smoke-test pattern** — the closest precedent is `web/scripts/smoke-orq-deployments.ts` (uses `/v2/deployments/invoke`, not agent invocation). For an agent-key invocation against the V3 deploy, a tiny tsx one-off following the same env-loading + cost-walker pattern is the minimal path. No `mcp__orqai-mcp__invoke_agent` precedent script exists in `web/scripts/`.
4. A **token-budget reality check** — at Sonnet 4.5's $3/1M input rate the +2-3k tokens per call is sub-cent per call. Even at 10k Stage 3 calls/month the delta is **<€0.30/month**. R-03 is over-cautious; the risk is real but the cost is not.
5. The `pattern` constraint for `proposal_reason` is **likely accepted** by OpenAI strict mode (subset of ECMA-262) but **may be "non-enforced" by Anthropic-routed responses through Orq's validator**. Plan must include a smoke step that deliberately violates the pattern to see if the validator rejects or the model just ignores it.

**Primary recommendation:** Keep CONTEXT.md as-is, but in the plan: (a) lock the few-shot email_ids only **after** the planner runs the SQL in §1 below against live Supabase; (b) implement backward-compat as a **single switch in `invoke-intent.ts`** at the `safeParse` boundary; (c) treat `proposal_reason` pattern as **belt-and-braces** (schema + prompt enforcement, with prompt as load-bearing if validator under-enforces).

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01** Prompt v3 adds `<intent_definitions>` block between `<intent_vocabulary>` and `<confidence_rubric>`, one block per intent, each ending with a one-line boundary sentence against nearest neighbour.
- **D-02** Six disambiguation pairs encoded as if-X-then-Y rules (payment_dispute vs credit_request; general_inquiry vs other; copy_document_request vs payment_dispute; address_change vs general_inquiry; contract_inquiry vs general_inquiry; peppol_request vs general_inquiry).
- **D-03** ≥8 new few-shots (target 11+ total counting existing 3), weighted toward D-02 boundaries; sourced from real `email_pipeline.emails` post-Phase-83.
- **D-04** Schema V3 adds `intent_proposal: string|null` (max 64, `^[a-z][a-z0-9_]*$`) and `proposal_reason: string|null`; both anyOf-nullable (CLAUDE.md learning `3970bad9`).
- **D-05** Stage 3.5 dispatcher behaviour unchanged — dispatch on closed-list `intent`, proposal fields are *additive* (storage location is Phase 86's concern).
- **D-06** Orq.ai deployment workflow: `list_models` → `update_agent` → PATCH schema → PATCH prompt → `get_agent` verify → bump `INTENT_VERSION` → emit V3 Zod schema.
- **D-07** Coordinator accepts both V2 and V3 outputs for one release.

### Claude's Discretion
- Exact few-shot email row picks (this research narrows to 2-3 candidates per slot via SQL the planner runs).
- Whether the backward-compat parser is a single switch or per-call-site branches (this research recommends single switch).
- Smoke-test harness shape (script vs npm test) — this research recommends a one-off tsx script following `smoke-orq-deployments.ts` shape.

### Deferred Ideas (OUT OF SCOPE)
- Storage surface for proposal fields → **Phase 86**.
- Promotion of proposals to `swarm_intents` → **V9.0 Learning Inbox**.
- Sales-email Stage 3 prompt — separate agent, separate phase (V10.0).

## Phase Requirements

Implicit from CONTEXT (no explicit REQ-IDs were supplied to this researcher):

| ID | Description | Research Support |
|----|-------------|------------------|
| P85-R1 | Deploy prompt v3 + json_schema V3 to live `debtor-intent-agent` | §2 deploy workflow, §5 `pattern` validator caveat |
| P85-R2 | 11+ few-shot examples, ≥8 new, boundary-weighted | §1 corpus-sourcing SQL + per-slot candidate queries |
| P85-R3 | TS Zod V3 schema + `INTENT_VERSION = '2026-05-19.v3'` constant | §3 single-file edit in `coordinator/types.ts` |
| P85-R4 | Backward-compat parser (V2 + V3) for one release | §2 single-switch recommendation at `invoke-intent.ts:190` |
| P85-R5 | Smoke test confirms `intent_proposal` non-null on WKA-Breman + null on clean copy_doc | §4 minimal tsx script pattern |
| P85-R6 | Disambiguation regression: ≤1/12 payment_dispute reclassifies | §6 SQL to extract the 12-sample baseline |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Prompt + schema definition | Orq.ai (agent config) | Codegen (Phase 78 intents) | Live agent owns prompt; codegen owns the enum literal-union (NOT the proposal field — that's open-set by D-04). |
| LLM invocation + Zod gate | Backend (`invoke-intent.ts`) | — | Single transport boundary; only place where V2-vs-V3 schema-version branching belongs. |
| Status flip + ranked persistence | Backend (`debtor-email-coordinator.ts`) | — | Classifier-side; writes `coordinator_runs.ranked_intents` and hoists top-1 to `agent_runs`. **Proposal fields do not flow here in Phase 85** — they stop at the Zod-validated output and are silently ignored downstream until Phase 86. |
| Dispatch decision | Backend (`stage-3-dispatcher.ts`) | `swarm_intents` registry | Reads top-1 `intent` only; Phase 85 cannot touch this without violating D-05. |
| Proposal capture surface | **Phase 86** | — | Out of scope for 85. |

## 1. Few-Shot Sourcing — Candidate-Hunt SQL

**Constraint:** Phase 83 introduced `email_pipeline.emails.body_full_text`. Only rows ingested after Phase 83's deploy date have it populated. If Phase 83 deployed in May 2026 (per CONTEXT dependency note), use `received_at > '2026-05-01'` as the floor and tighten/loosen as needed.

**Process for the planner/executor:** run the SQL below via `mcp__supabase__execute_sql` (project `mvqjhlxfvtqqubqgdvhz`). Each block returns 5-15 candidates per slot; pick 2-3 with the cleanest body content, redact PII (debtor names, invoice IDs → `<REDACTED>` markers), then drop into the prompt.

### 1.1 Universal filter — emails worth showing the LLM

```sql
-- Common pre-filter — copy-paste at the head of each slot query as a CTE
WITH usable_emails AS (
  SELECT e.id, e.subject, e.body_full_text, e.body_text, e.sender_email,
         e.sender_domain, e.mailbox, e.received_at
  FROM email_pipeline.emails e
  WHERE e.received_at > '2026-05-01'
    AND COALESCE(length(e.body_full_text), 0) BETWEEN 200 AND 4000
    AND e.body_full_text IS NOT NULL
)
```

### 1.2 Slot-by-slot candidates (joined to `coordinator_runs` for current top-1)

`coordinator_runs.ranked_intents` is jsonb array; top-1 is `ranked_intents->0->>'intent'`.

```sql
-- Slot A: payment_dispute (PURE) — 2-3 candidates, top-1 is payment_dispute
-- and reasoning mentions amount/line/VAT but NOT credit note.
SELECT cr.run_id, ue.id AS email_id, ue.subject, ue.sender_domain,
       ue.received_at, ue.body_full_text,
       cr.ranked_intents->0->>'intent' AS top1,
       cr.ranked_intents->0->>'reasoning' AS top1_reasoning
FROM usable_emails ue
JOIN public.coordinator_runs cr ON cr.email_id = ue.id
WHERE cr.ranked_intents->0->>'intent' = 'payment_dispute'
  AND (cr.ranked_intents->0->>'reasoning' ILIKE '%bedrag%'
       OR cr.ranked_intents->0->>'reasoning' ILIKE '%amount%'
       OR cr.ranked_intents->0->>'reasoning' ILIKE '%onjuist%')
  AND cr.ranked_intents->0->>'reasoning' NOT ILIKE '%credit%'
LIMIT 5;

-- Slot B: payment_dispute WITH credit-note ask — dispute + creditnota in body
SELECT cr.run_id, ue.id AS email_id, ue.subject, ue.body_full_text,
       cr.ranked_intents->0->>'intent' AS top1
FROM usable_emails ue
JOIN public.coordinator_runs cr ON cr.email_id = ue.id
WHERE cr.ranked_intents->0->>'intent' = 'payment_dispute'
  AND ue.body_full_text ILIKE '%creditnota%'
LIMIT 5;

-- Slot C: credit_request (PURE) — no dispute language
SELECT cr.run_id, ue.id AS email_id, ue.subject, ue.body_full_text
FROM usable_emails ue
JOIN public.coordinator_runs cr ON cr.email_id = ue.id
WHERE cr.ranked_intents->0->>'intent' = 'credit_request'
  AND ue.body_full_text NOT ILIKE '%onjuist%'
  AND ue.body_full_text NOT ILIKE '%betwist%'
LIMIT 5;

-- Slot D: contract_inquiry — explicit contract/SLA mention
SELECT cr.run_id, ue.id AS email_id, ue.subject, ue.body_full_text
FROM usable_emails ue
JOIN public.coordinator_runs cr ON cr.email_id = ue.id
WHERE cr.ranked_intents->0->>'intent' = 'contract_inquiry'
  AND (ue.body_full_text ILIKE '%contract%' OR ue.body_full_text ILIKE '%sla%'
       OR ue.body_full_text ILIKE '%raamovereenkomst%')
LIMIT 5;

-- Slot E: peppol_request — any Peppol mention
SELECT cr.run_id, ue.id AS email_id, ue.subject, ue.body_full_text
FROM usable_emails ue
JOIN public.coordinator_runs cr ON cr.email_id = ue.id
WHERE ue.body_full_text ILIKE '%peppol%'
   OR ue.subject ILIKE '%peppol%'
LIMIT 5;

-- Slot F: address_change wrapped in copy-doc — address + copy/factuur both present
SELECT cr.run_id, ue.id AS email_id, ue.subject, ue.body_full_text,
       cr.ranked_intents->0->>'intent' AS top1
FROM usable_emails ue
JOIN public.coordinator_runs cr ON cr.email_id = ue.id
WHERE (ue.body_full_text ILIKE '%adres%' OR ue.body_full_text ILIKE '%address%')
  AND (ue.body_full_text ILIKE '%kopie%' OR ue.body_full_text ILIKE '%copy%')
LIMIT 5;

-- Slot G: general_inquiry — clarifying question
SELECT cr.run_id, ue.id AS email_id, ue.subject, ue.body_full_text
FROM usable_emails ue
JOIN public.coordinator_runs cr ON cr.email_id = ue.id
WHERE cr.ranked_intents->0->>'intent' = 'general_inquiry'
  AND length(ue.body_full_text) < 1500
LIMIT 5;

-- Slot H: other — auto-reply / off-topic that already cleared Stage 1
-- (must NOT be Stage 1 noise — joined to confirm it reached Stage 3)
SELECT cr.run_id, ue.id AS email_id, ue.subject, ue.body_full_text
FROM usable_emails ue
JOIN public.coordinator_runs cr ON cr.email_id = ue.id
WHERE cr.ranked_intents->0->>'intent' = 'other'
LIMIT 5;

-- Slot I (open-set example for R-02 mitigation): a known novel-intent email
-- — the WKA-Breman sample CONTEXT references. Direct lookup by sender pattern:
SELECT id, subject, body_full_text, sender_email, received_at
FROM email_pipeline.emails
WHERE sender_email ILIKE '%breman%'
  AND received_at::date BETWEEN '2026-05-09' AND '2026-05-13'
ORDER BY received_at DESC
LIMIT 5;
```

**Output for plan:** the planner picks 1 row per slot (2 for A/B which is the dual `payment_dispute` example), redacts, and embeds into the prompt's `<examples>` block. Existing 3 kept-examples (copy_doc, address_change, general_inquiry) bring total to **11**.

## 2. Backward-Compat Parser Shape — Single Switch in `invoke-intent.ts`

### Call-site map for `intent_version` / `IntentAgentOutputV2`

Found via `grep -rn` for `intentAgentOutputSchemaV2 | IntentAgentOutputV2 | INTENT_VERSION_V2 | intent_version | ranked_intents`:

| Site | File:line | Role | Touched by V3? |
|------|-----------|------|----------------|
| Zod gate | `invoke-intent.ts:190` (`intentAgentOutputSchemaV2.safeParse`) | The transport boundary — parses raw LLM JSON. | **Yes — only required edit.** |
| Type export | `invoke-intent.ts:43, 50` (`InvokeIntentResult.output: IntentAgentOutputV2`) | Type narrowing for callers. | Yes — widen to `IntentAgentOutputV2 \| IntentAgentOutputV3`. |
| Classifier wiring | `web/lib/inngest/functions/debtor-email-coordinator.ts:37-38, 197-217, 234-244, 257-263, 294` | Reads `output.ranked`, `output.language`, `output.urgency`, writes `intent_version: INTENT_VERSION_V2` to `agent_runs` + `coordinator_runs.decision_details`. | Yes — must write `INTENT_VERSION_V3` when the LLM returns V3 output. The classifier already pulls top-1 from `output.ranked[0]` — that shape is unchanged. **Proposal fields are silently dropped here in Phase 85** (Phase 86 builds the capture surface). |
| Escalation gate | `escalation-gate.ts:16, 30` (`output: IntentAgentOutputV2`) | Reads `ranked` only; doesn't touch proposal fields. | Type-widen only; no behaviour change. |
| Cache lookup | `debtor-email-coordinator.ts:190-199` (`findCachedOutput<…>`) | Re-uses prior LLM output keyed on `intent_version`. | Must accept both V2 and V3 keys; safest is to look up V3 first, fall back to V2 (allows re-use of V2 cache during transition window). |
| Synthesis | `coordinator-synthesis.ts:31, 54, 76` (`ranked_intents: Array<{intent: string}> \| null`) | Reads `ranked_intents` array shape only. | Untouched — `ranked` shape is identical in V2 and V3. |
| Audit panel | `Stage3EvidencePanel.tsx:142-251` reads `ranked_intents`, `language`, `urgency`, `intent_version` from coordinator_runs/agent_runs | Renders chips. | Untouched — `intent_version` is rendered as opaque string, V3 literal just shows `model: 2026-05-19.v3`. |
| Tests | `__tests__/types-v2.test.ts`, `__tests__/invoke-intent-v2.test.ts`, `__tests__/idempotency-cache-v2.test.ts` | Schema + cache assertions. | Add V3 sibling tests; keep V2 tests alive for the transition window per D-07. |

### Recommended shape: discriminated-union schema at the Zod boundary

```typescript
// in coordinator/types.ts (sketch — planner finalises)
export const INTENT_VERSION_V3 = "2026-05-19.v3" as const;

export const intentProposalSchema = z.object({
  intent_proposal: z.string()
    .min(1).max(64)
    .regex(/^[a-z][a-z0-9_]*$/)
    .nullable(),
  proposal_reason: z.string().max(300).nullable(),
}).refine(
  (v) => (v.intent_proposal === null) === (v.proposal_reason === null),
  { message: "intent_proposal and proposal_reason must both be null or both non-null" },
);

export const intentAgentOutputSchemaV3 = z.object({
  ranked: z.array(rankedIntentEntrySchema).min(1).max(5),
  language: z.enum(LANGUAGE),
  urgency: z.enum(URGENCY),
  intent_version: z.literal(INTENT_VERSION_V3),
  intent_proposal: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/).nullable(),
  proposal_reason: z.string().max(300).nullable(),
});

export const intentAgentOutputSchemaAny =
  z.discriminatedUnion("intent_version", [
    intentAgentOutputSchemaV2,
    intentAgentOutputSchemaV3,
  ]);

export type IntentAgentOutputV3 = z.infer<typeof intentAgentOutputSchemaV3>;
export type IntentAgentOutputAny = z.infer<typeof intentAgentOutputSchemaAny>;
```

### Single-switch diff in `invoke-intent.ts`

```typescript
// Replace lines 190-201 (the v2 safeParse + result return) with:
const validated = intentAgentOutputSchemaAny.safeParse(parsed);
if (!validated.success) { /* same error wrap */ }
return { output: validated.data, raw };  // type widens to IntentAgentOutputAny
```

Downstream call sites (`debtor-email-coordinator.ts`) read `output.ranked[0]`, `output.language`, `output.urgency` — **all keys present in both V2 and V3** — so the only ergonomic edit there is the `intent_version` literal it writes back to the DB:

```typescript
intent_version: output.intent_version,  // was INTENT_VERSION_V2 (hardcoded)
```

This pulls the version from the LLM response instead of a constant, which is the correct provenance anyway. **No `if (v.intent_version === '…')` ladder needed in the classifier.**

**Verdict: minimum diff is 2 hunks (one in `types.ts` adding V3 + union, one in `invoke-intent.ts:190`). Classifier touches one literal. Escalation gate / synthesis / audit panel widen types only, zero behaviour change.**

## 3. Smoke Test Harness

No precedent script in `web/scripts/` invokes `debtor-intent-agent` directly. Closest precedents:
- `web/scripts/smoke-orq-deployments.ts` — uses `POST /v2/deployments/invoke` for **deployment keys** (Stage 0/1), NOT agents.
- `web/lib/automations/debtor-email/coordinator/invoke-intent.ts` — the production agent invocation pattern (`POST /v2/agents/{key}/responses`).

### Recommended: tiny tsx one-off, NOT npm test command

```typescript
// web/scripts/phase85-smoke-v3.ts
// Run: cd web && ORQ_API_KEY=$(grep '^ORQ_API_KEY=' .env.local | cut -d= -f2- | tr -d '"') \
//   EMAIL_ID=<uuid> npx tsx scripts/phase85-smoke-v3.ts
import { invokeIntentAgent } from "@/lib/automations/debtor-email/coordinator/invoke-intent";
import { assembleInput } from "@/lib/automations/debtor-email/coordinator/assemble-input";
import { TENANT_DOMAINS } from "@/lib/automations/debtor-email/coordinator/tenant-domains.generated";

// Pull a known email_id (e.g. the WKA-Breman row from §1 Slot I), build
// assembled_input the same way debtor-email-coordinator.ts does, invoke,
// and pretty-print { ranked, intent_proposal, proposal_reason }.
```

**Rationale:**
- The MCP-side `mcp__orqai-mcp__invoke_agent` is available to the operator's session, but a checked-in script is reproducible across plan-checker and verifier replays. Smoke #2 (WKA-Breman) and Smoke #3 (clean copy-doc) both run the same script with different `EMAIL_ID`.
- An npm test would push fixture maintenance into Vitest; the smoke is a live-API call against the deployed agent — wrong layer for the test runner.
- Pattern mirrors `smoke-orq-deployments.ts` (env-loading, stdout JSON dump, exit codes).

## 4. Token-Budget Reality — Cost Delta in EUR

### Inputs
- **Sonnet 4.5** input price: **$3 / 1M tokens** ([Anthropic pricing 2026](https://platform.claude.com/docs/en/about-claude/pricing)) — unchanged from 2025. Output: $15/1M (not affected by prompt size).
- **R-03 estimate:** +2-3k input tokens per Stage 3 call from the new `<intent_definitions>` block + 8 extra few-shots.
- **Cost per call delta:** 3,000 tokens × $3/1M = **$0.009/call ≈ €0.0083/call** at current EUR/USD.

### Monthly volume — must be queried by planner

```sql
-- Stage 3 calls / month for debtor-email swarm
SELECT count(*) AS stage3_calls_last_30d
FROM public.agent_runs
WHERE swarm_type = 'debtor-email'
  AND intent_version IN ('2026-04-23.v1', '2026-05-01.v2')
  AND created_at > now() - interval '30 days';
```

### Projected monthly delta (best-effort estimate — planner replaces with live count)

| Volume scenario | Calls/mo | Monthly delta |
|-----------------|----------|---------------|
| Low (≈100/day) | 3,000 | **€25/mo** |
| Mid (≈300/day) | 9,000 | **€75/mo** |
| High (≈1,000/day) | 30,000 | **€250/mo** |

**Verdict:** R-03 says "cost impact negligible at current volumes" — that holds for the low/mid range. If volume is in the high bucket the delta crosses the threshold where prompt-caching becomes worth enabling (Anthropic's prompt-cache cuts re-reads of the static prompt block by **90%**, dropping the delta to ~€25/mo even at 30k calls). Recommend the planner runs the volume query and, **if monthly Stage 3 calls > 10k**, adds a follow-up TODO for "enable Anthropic prompt-cache on the static `<intent_definitions>` block." Not in P85 scope per CONTEXT.

[ASSUMED — planner must verify with live SQL above]

## 5. R-01 Enforcement — `pattern` on `proposal_reason`

CONTEXT D-04 specifies `proposal_reason` must start with `"No closed-list intent fits because…"`. JSON Schema `pattern` keyword is the natural mechanism.

### Validator-surface findings

- **OpenAI strict mode** explicitly supports `pattern` as "a practical subset of ECMA-262" ([OpenAI Structured Outputs guide](https://platform.openai.com/docs/guides/structured-outputs)). However the same docs note some keywords are "accepted but not structurally enforced — the model handles them reliably in practice but outputs are not guaranteed to satisfy them." `pattern` falls in this "soft-enforced" bucket.
- **Anthropic via Orq.ai's `response_format: json_schema`**: no public documentation on which JSON Schema keywords are validator-enforced vs. accepted-but-ignored. CLAUDE.md learning `3970bad9` (the `type:["string","null"]` rejection) proves Orq's validator is **strict on shape** — it rejects invalid JSON Schema constructs at PATCH time. Whether it rejects an LLM response that violates a `pattern` it accepted is unconfirmed. [ASSUMED]

### Recommended belt-and-braces approach

1. **In the schema** — add `pattern: "^No closed-list intent fits because"` on the `proposal_reason` string branch of the anyOf. If Orq accepts the schema in PATCH, ship it.

```json
"proposal_reason": {
  "anyOf": [
    {
      "type": "string",
      "maxLength": 300,
      "pattern": "^No closed-list intent fits because"
    },
    { "type": "null" }
  ]
}
```

2. **In the prompt** — restate the rule as a hard instruction in the `<output_format>` section: *"When `intent_proposal` is non-null, `proposal_reason` MUST begin verbatim with: `No closed-list intent fits because`. If you cannot complete that sentence honestly, set `intent_proposal` to null."* — this is the load-bearing enforcement if the validator under-enforces.

3. **In the Zod gate** — mirror the regex on the V3 schema:

```typescript
proposal_reason: z.string()
  .max(300)
  .regex(/^No closed-list intent fits because/)
  .nullable(),
```

The Zod regex makes the contract enforced at the application boundary regardless of whether Orq's validator does its job. **If Orq under-enforces, the Zod gate throws and the row goes to `agent_runs.status = failed`** — visible operationally, not silently degrading.

4. **Smoke step** — deliberately invoke with an email designed to trigger a non-null proposal, then inspect whether the model's response satisfies the regex without prompt-side reminder. Run twice: once with the `pattern` schema constraint in place, once without (temporarily); compare. This establishes whether the validator is doing the work or the prompt is.

## 6. Disambiguation Regression Sample (Success #4)

CONTEXT references "the 12-email `payment_dispute` sample from 2026-05-19 session." That session is not enumerated in CONTEXT, so the planner needs to reconstruct it. Most likely it's the day's classifier output:

```sql
-- Primary: 12 payment_dispute classifications from 2026-05-19
SELECT cr.run_id, cr.email_id, ue.subject, ue.sender_domain, ue.received_at,
       cr.ranked_intents->0->>'intent' AS top1,
       cr.ranked_intents->0->>'confidence' AS top1_conf,
       cr.ranked_intents AS full_ranked
FROM public.coordinator_runs cr
JOIN email_pipeline.emails ue ON ue.id = cr.email_id
WHERE cr.ranked_intents->0->>'intent' = 'payment_dispute'
  AND cr.created_at::date = '2026-05-19'
ORDER BY cr.created_at;

-- Fallback: if < 12 rows on 2026-05-19, widen to ±3 days
SELECT cr.run_id, cr.email_id, ue.subject, ue.received_at,
       cr.ranked_intents->0->>'intent' AS top1
FROM public.coordinator_runs cr
JOIN email_pipeline.emails ue ON ue.id = cr.email_id
WHERE cr.ranked_intents->0->>'intent' = 'payment_dispute'
  AND cr.created_at::date BETWEEN '2026-05-16' AND '2026-05-22'
ORDER BY cr.created_at
LIMIT 20;
```

The planner records the 12 (or extended set's) `email_id` list as the **regression baseline**, then after V3 deploy re-invokes those emails through the smoke script and asserts at most 1 of 12 changes its ranked top-1. If the smoke uses the cache (`tool_outputs.intent_first_pass` keyed on `intent_version`), this works naturally because V3 invalidates the V2 cache.

[ASSUMED — planner must run the SQL; this session has no DB tool exposed]

## Common Pitfalls

### Pitfall 1: `create_agent` drops `response_format`
CLAUDE.md learning `cba7352b-4feb-4d11-94f8-0ebd24f15cd0`. Phase 85 uses `update_agent` (D-06 step 2) so this does not apply directly — but if the deploy fails midway and someone reaches for `create_agent`, the schema goes silently missing.

**Avoid:** Use only `update_agent` (the agent exists at `01KQECK191GE21CH8D8KEMTM9J`). Verify with `get_agent` post-PATCH, checking `model.parameters.response_format.json_schema.schema` is the V3 shape, not the V2 leftover.

### Pitfall 2: `update_agent` requires the human-readable KEY, not the slug ID
MEMORY: `feedback_orq_update_agent_key_vs_id.md`. Symptom: generic "Failed to update agent". Use `debtor-intent-agent` (the key), not `01KQECK191GE21CH8D8KEMTM9J`.

### Pitfall 3: Catalog-invalid model IDs are silently accepted
CLAUDE.md learning `f980a2a1`. D-06 step 1 (`list_models`) prevents this. The current agent's primary model + fallbacks must each appear in the `list_models` output. If `anthropic/claude-sonnet-4-5-20250929` is the primary, confirm it's still in the catalog before PATCH.

### Pitfall 4: `type: ["string", "null"]` rejected by Orq validator
CLAUDE.md learning `3970bad9-4c97-4ccf-a2f5-46475313ed1a`. D-04 mandates anyOf form — easy to forget when copy-pasting from JSON Schema 2020-12 docs.

### Pitfall 5: Cache key collisions during V2→V3 transition
The classifier's `findCachedOutput` keys on `intent_version`. During the one-release transition (D-07), an email already classified under V2 should NOT silently serve a V2 cache hit when V3 is deployed — that would mask the disambiguation regression check.

**Avoid:** Cache lookup must filter on `intent_version = V3_LITERAL` explicitly. If no V3 cache hit, fall through to fresh invocation. Do NOT widen the cache to "any of V2 or V3".

### Pitfall 6: Stage 1 vs Stage 3 conflation in `other` few-shot
D-03 Slot H requires the `other` example to be an email that **cleared Stage 1** (i.e. is not noise per `swarm_noise_categories`) but still genuinely doesn't fit a Stage 3 intent. Hard-separation rule (RFC, restated by hook): no row exists in both `swarm_noise_categories` and `swarm_intents`. The slot H SQL joins through `coordinator_runs` which guarantees the email reached Stage 3.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-version branching in 7 call sites | `if (output.intent_version === '…v2') else if ('…v3')` ladder | `z.discriminatedUnion("intent_version", […v2, …v3])` at the Zod boundary | One narrowing spot; downstream reads shared keys (ranked, language, urgency) uniformly. |
| Proposal-field persistence in P85 | New `coordinator_runs.intent_proposals` column / new table | Drop fields silently until Phase 86 lands the storage surface | D-05 explicitly defers storage to Phase 86. Phase 85 captures-and-drops is fine. |
| Live agent prompt synthesis from registry | A Phase 78-style codegen for the few-shot block | Hand-edit the prompt string, deploy once | Few-shots are not registry-driven and not source-of-truth — the prompt itself is. Only the closed-list `intent` enum and `swarm_intents.intent_key` need to stay codegen-locked. |
| `proposal_reason` prefix enforcement | Manual regex in the classifier post-Zod | Zod `.regex(/^No closed-list intent fits because/)` on the V3 schema | Application-layer enforcement, fail-loud, visible on `agent_runs.status='failed'`. |

## Code Examples

### Anthropic prompt-caching (deferred until volume justifies)

```json
// Orq.ai response: model.parameters.cache_control on the static prompt block
// (deferred; only relevant if §4 volume query > 10k calls/mo)
{
  "cache_control": { "type": "ephemeral" }
}
```
[Source: Anthropic prompt caching docs — cited per the WebSearch result]

### Discriminated-union Zod parse (the single switch)

```typescript
const validated = intentAgentOutputSchemaAny.safeParse(parsed);
if (!validated.success) {
  const e = new Error(
    `Intent-agent output schema mismatch: ${JSON.stringify(validated.error.issues)}`,
  );
  (e as { raw?: string }).raw = raw;
  throw e;
}
return { output: validated.data, raw };
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Closed-list intent enum, no escape hatch | Closed list + open-set `intent_proposal` parallel field | Phase 85 (this phase) | The classifier can signal "vocabulary cap reached" without forcing a misclassification. |
| 3 few-shots covering 3 of 8 intents | 11+ few-shots, ≥1 per intent, boundary-weighted | Phase 85 | Calibration is no longer key-name-driven; the prompt teaches the disambiguation rules. |
| Hardcoded `INTENT_VERSION_V2` written by classifier | Version read from LLM response (`output.intent_version`) | Phase 85 | Provenance is correct: the version stored on `agent_runs.intent_version` matches what the agent actually returned, not a build-time constant. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 83's `body_full_text` is populated for emails received after early May 2026 | §1 | Few-shot SQL returns NULL bodies; planner widens filter or relaxes length floor. |
| A2 | Monthly Stage 3 call volume falls in low/mid range | §4 | Cost delta could be €250/mo at high volume; prompt-cache becomes a follow-up TODO. |
| A3 | Orq.ai's validator accepts `pattern` keyword at PATCH time | §5 | Schema PATCH fails; fall back to prompt-only enforcement + Zod gate. |
| A4 | Orq.ai's validator enforces `pattern` at LLM response time | §5 | LLM returns malformed `proposal_reason`; Zod gate throws and the row fails — visible, not silent. Acceptable degradation. |
| A5 | The 12-email payment_dispute sample is from `coordinator_runs.created_at::date = '2026-05-19'` | §6 | SQL widens to ±3 days; planner picks the closest cluster. |
| A6 | Sonnet 4.5 input price remains $3/1M tokens in 2026 | §4 | Pricing has shifted; planner re-runs the calculation. Sonnet 4.6 is at the same rate per WebSearch, so the delta holds either way. |
| A7 | Anthropic's response-format validator (routed via Orq) treats Zod's `intent_version` literal as discriminator | §2 | Discriminated-union parse fails; fall back to two separate `safeParse` calls (V3 first, V2 fallback). |

## Open Questions

1. **How long is "one release" in D-07?**
   - What we know: D-07 says "one release."
   - What's unclear: in this repo a "release" is not formally tagged. Most likely interpretation = one deploy window. After that the V2 branch of the discriminated union can be deleted.
   - **Recommended default:** Hold the V2 branch alive for **14 calendar days** post-deploy. After 14 days, open a follow-up plan item to delete V2 schema + tests in a separate commit. The 14-day window mirrors Phase 65→66's v1-deletion pattern.

2. **Where do `intent_proposal` writes land if Phase 86 hasn't shipped a column yet?**
   - What we know: D-05 says Phase 86 decides storage location.
   - What's unclear: between Phase 85 deploy and Phase 86 deploy, V3 outputs carry the proposal fields but they're silently dropped by the classifier (only `output.ranked` is persisted to `coordinator_runs.ranked_intents`).
   - **Recommended default:** In Phase 85, write the full V3 output into `tool_outputs.intent_first_pass` (already happens via `mergeToolOutputs` at line 222 of `debtor-email-coordinator.ts`). The proposal fields are captured-but-not-surfaced in jsonb. Phase 86 reads from this jsonb until it builds its own column/table. **No new column in Phase 85.**

3. **Does Orq.ai's validator enforce `pattern` on string fields at LLM response time?**
   - What we know: PATCH-time validation is strict (CLAUDE.md `3970bad9`). Response-time enforcement of `pattern` is undocumented.
   - **Recommended default:** Ship with `pattern` in the schema (§5 step 1) **and** prompt-side rule (§5 step 2) **and** Zod regex (§5 step 3). Smoke test (§5 step 4) measures which layer is doing the work.

4. **Should the V3 few-shots use Dutch or English bodies?**
   - What we know: language enum is `nl, en, de, fr`. Production debtor mail is mostly nl/en.
   - What's unclear: prompt comprehension on disambiguation rules expressed in NL examples — does the LLM transfer the rule to EN inputs?
   - **Recommended default:** Mix — ≥6 of 11 examples NL (matching production distribution), ≥3 EN, ≥1 with a quoted prior in a different language than the inbound (tests Phase 83's full-thread shape). The intent_definitions block stays English (it's instructional, not example content).

5. **Should the smoke script live in `web/scripts/` or `.planning/phases/85-…/scripts/`?**
   - What we know: similar smokes live in `web/scripts/` (e.g. `smoke-orq-deployments.ts`, `phase69-dispatch-smoke.ts`).
   - **Recommended default:** `web/scripts/phase85-smoke-v3.ts` — follows the `phase69-dispatch-smoke.ts` naming precedent and stays runnable from the same `cd web && npx tsx` shell pattern Vercel devs use.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `mcp__orqai-mcp__update_agent` | D-06 deploy | ✓ (operator session) | — | Direct PATCH `https://api.orq.ai/v2/agents/debtor-intent-agent` with `ORQ_API_KEY` if MCP fails. |
| `mcp__orqai-mcp__list_models` | D-06 step 1 | ✓ (operator session) | — | `GET https://api.orq.ai/v2/models` direct fetch. |
| `mcp__orqai-mcp__get_agent` | D-06 verify | ✓ | — | `GET https://api.orq.ai/v2/agents/debtor-intent-agent` direct fetch. |
| `mcp__supabase__execute_sql` | §1 corpus SQL, §4 volume, §6 regression baseline | ✓ (operator session) | — | `web/.env.local` service-role key + REST API. |
| `ORQ_API_KEY` env var | Smoke script | ✓ in `web/.env.local` | — | — |
| Phase 83 deployed (body_full_text populated) | §1 few-shot sourcing | **MUST CONFIRM** | — | If not yet deployed, planner blocks Phase 85 per dependency. |

**Missing dependencies with no fallback:** None known. Planner confirms Phase 83 deploy state before executing §1 queries.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (per existing `*.test.ts` files in `coordinator/__tests__/`) |
| Config file | `web/vitest.config.ts` (referenced by existing V2 tests) |
| Quick run command | `cd web && npx vitest run lib/automations/debtor-email/coordinator/__tests__/types-v3.test.ts` |
| Full suite command | `cd web && npx vitest run lib/automations/debtor-email/coordinator` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P85-R3 | V3 Zod schema accepts well-formed V3 + rejects malformed | unit | `npx vitest run coordinator/__tests__/types-v3.test.ts` | ❌ Wave 0 |
| P85-R3 | `intent_proposal` null requires `proposal_reason` null (refine) | unit | same as above | ❌ Wave 0 |
| P85-R3 | `proposal_reason` regex catches missing prefix | unit | same as above | ❌ Wave 0 |
| P85-R4 | Discriminated union parses both V2 and V3 payloads | unit | `npx vitest run coordinator/__tests__/types-v3.test.ts` | ❌ Wave 0 |
| P85-R4 | V2 fixture still passes Zod after the union edit | unit | existing `types-v2.test.ts` re-run | ✅ |
| P85-R4 | `invoke-intent.ts` returns `IntentAgentOutputAny` | unit | `coordinator/__tests__/invoke-intent-v3.test.ts` (mocked fetch) | ❌ Wave 0 |
| P85-R1 | `get_agent` returns V3 schema literal | smoke (manual) | manual `mcp__orqai-mcp__get_agent debtor-intent-agent` | n/a |
| P85-R5 | WKA-Breman invocation returns non-null `intent_proposal` | smoke | `EMAIL_ID=<wka> npx tsx scripts/phase85-smoke-v3.ts` | ❌ Wave 0 |
| P85-R5 | Clean copy_doc invocation returns null `intent_proposal` | smoke | same script, different EMAIL_ID | ❌ Wave 0 |
| P85-R6 | 12-email regression: ≤1 reclassifies top-1 | smoke (loop) | `EMAIL_IDS=<csv> npx tsx scripts/phase85-smoke-v3.ts --regression` | ❌ Wave 0 |
| n/a | No Stage 4 dispatch regression (existing handler still fires) | manual | Inngest dashboard inspection post-deploy | n/a |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run lib/automations/debtor-email/coordinator/__tests__/types-v3.test.ts`
- **Per wave merge:** `cd web && npx vitest run lib/automations/debtor-email/coordinator`
- **Phase gate:** all unit suites green + 3 smoke runs (R5 positive, R5 negative, R6 regression) green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `coordinator/__tests__/types-v3.test.ts` — covers P85-R3 + P85-R4
- [ ] `coordinator/__tests__/invoke-intent-v3.test.ts` — covers P85-R4 (mocked Orq response)
- [ ] `web/scripts/phase85-smoke-v3.ts` — covers P85-R5 + P85-R6
- [ ] No framework install needed (Vitest already in place)

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `ORQ_API_KEY` env var; SOPS-managed; no rotation in P85 scope |
| V3 Session Management | no | Stateless agent invocation |
| V4 Access Control | yes | Orq.ai project-scoped key; smoke script must not log the key |
| V5 Input Validation | yes | Zod V3 schema gates LLM output; XML-escape on `assembled_input` already in place (`assemble-input.ts:44`) |
| V6 Cryptography | no | No new crypto surface |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via debtor email body | Tampering | XML-wrapped `<inbound_message>` already isolates the body; V3 prompt does not break that pattern. Few-shot examples MUST be redacted to remove any string that itself could be a prompt injection (e.g. "Ignore previous instructions" embedded in a real email body) before being added to the prompt. |
| Leaking debtor PII through few-shots | Information disclosure | All few-shot bodies in the prompt must have debtor names, invoice IDs, email addresses, phone numbers redacted to `<REDACTED>` markers. Operator review checkpoint in the plan. |
| Open-set `intent_proposal` enabling LLM to emit profanity / off-brand labels | Reputation | `pattern: "^[a-z][a-z0-9_]*$"` constrains shape; max 64 chars constrains length. Phase 86's capture surface SHOULD include a human review step before any proposal reaches `swarm_intents`. Out of P85 scope but flagged for Phase 86 CONTEXT. |
| Replay-unsafe ID generation | Tampering (CLAUDE.md Inngest learning) | N/A — Phase 85 does not introduce new IDs. Existing replay-safe pattern in `debtor-email-coordinator.ts` is untouched. |

## Sources

### Primary (HIGH confidence)
- `web/lib/automations/debtor-email/coordinator/types.ts` — V2 schema shape, INTENT_VERSION constants.
- `web/lib/automations/debtor-email/coordinator/invoke-intent.ts` — transport boundary, Zod gate location.
- `web/lib/inngest/functions/debtor-email-coordinator.ts` — classifier function, cache logic, `ranked_intents` persistence.
- `web/lib/inngest/functions/coordinator-synthesis.ts` — confirms downstream consumes only `ranked_intents` shape, agnostic to schema version.
- `web/components/automations/bulk-review/audit/Stage3EvidencePanel.tsx` — confirms audit UI treats `intent_version` as opaque chip.
- `docs/agentic-pipeline/stage-3-coordinator.md` — RFC: hard-separation, classifier-vs-dispatcher split, ranked-intent output contract.
- `CLAUDE.md` — Orq.ai JSON Schema rules (anyOf-nullable, list_models pre-flight, create vs update, key-vs-id), Inngest replay-safety patterns.
- MEMORY: `feedback_orq_update_agent_key_vs_id.md` — confirms key-not-id failure mode.

### Secondary (MEDIUM confidence)
- [Anthropic API Pricing 2026 - finout.io](https://www.finout.io/blog/anthropic-api-pricing) — Sonnet 4.5 confirmed at $3/$15 per M tokens.
- [Anthropic Pricing — Claude API Docs](https://platform.claude.com/docs/en/about-claude/pricing) — primary pricing source.
- [Introducing Claude Sonnet 4.5 - Anthropic](https://www.anthropic.com/news/claude-sonnet-4-5) — Sonnet 4.5 launch context.

### Tertiary (LOW confidence — flagged for validation)
- [OpenAI Structured Outputs guide](https://platform.openai.com/docs/guides/structured-outputs) — `pattern` keyword supported but "soft-enforced." Not directly applicable to Anthropic-via-Orq; cited as the only public reference for how strict-mode validators handle `pattern`. Smoke test (§5 step 4) is the load-bearing verification.

## Metadata

**Confidence breakdown:**
- Standard stack (Orq.ai, Sonnet 4.5, Zod): HIGH — confirmed in code + CLAUDE.md + public docs.
- Architecture (call-site map, single-switch parser): HIGH — exhaustive grep against the V2 schema usage.
- Few-shot sourcing: MEDIUM — SQL is pre-baked but live data not inspectable from this session.
- Token-budget delta: MEDIUM — formula HIGH, monthly volume LOW (un-queried).
- `pattern` validator behaviour: LOW — Orq's response-time enforcement is undocumented for this keyword.

**Research date:** 2026-05-20
**Valid until:** 2026-06-20 (Orq.ai catalog + Anthropic pricing fast-moving; SQL shapes stable longer)
