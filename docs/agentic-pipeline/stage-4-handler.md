# Stage 4 -- Handler Agents (zapier_tools Registry)

> **Status:** RFC (Phase 63). The `zapier_tools` registry exists today; the `allowed_for_intents` allowlist column is forward-referenced to Phase 64 (BUDG-02).
>
> **CANO-01..04 — IMPLEMENTED (Phase 69, 2026-05-04).** Handler-agent canonicalisation for `debtor-copy-document-body-agent` is live. See [Phase 69 implementation summary](#phase-69-implementation-summary) at the bottom of this document for details.

## Goal

A handler agent takes a single dispatched intent and a `PipelineStageContext` and produces the side effect: draft a reply, fetch a document, update a record. Handlers are **bounded single-shot**, not autonomous loops -- one LLM call, a small allowlisted set of tool invocations, a result row. Tools are registered in the `zapier_tools` table; tool routing is data-driven rather than per-handler hardcoded.

## Anthropic Pattern Mapping

A bounded single-shot handler is closer to an "automated workflow" than to an autonomous agent under Anthropic's *Building Effective Agents* distinction (`https://www.anthropic.com/engineering/building-effective-agents`). The handler does not direct its own process; it executes a fixed shape (read context -> call tool(s) -> emit result) with the tool surface explicitly allowlisted. Anthropic's guidance is to start with the simplest viable pattern; bounded single-shot is the simplest thing that ships actual side effects.

## Architecture

```
dispatched intent + PipelineStageContext
        ↓
┌────────────────────────────┐
│ handler agent (Orq.ai)     │
└────────┬───────────────────┘
         ↓ (tool call)
┌────────────────────────────┐
│ zapier_tools registry      │  -> tool_id -> backend, target_url, auth
└────────┬───────────────────┘
         ↓
┌────────────────────────────┐
│ side effect                │  -> iController draft, NXT lookup,
│                            │     document fetch, etc.
└────────┬───────────────────┘
         ↓
automation_runs row  (consumed by kanban surface; see swarm-bridge-contract.md)
```

## Today-State (Debtor-Email Worked Example)

### Reference handler agent

The canonical handler agent for the debtor swarm is `debtor-copy-document-body-agent` -- the agent that drafts the iController reply for an `invoice_copy_request` intent.

**CANO-01..04 — IMPLEMENTED (Phase 69, 2026-05-04).** Per-swarm canonicalisation is no longer forward-referenced. As of Phase 69 the body agent accepts the canonical `PipelineStageContext` shape (`customer_id`, `customer_name`, `language`, `entity_brand`, `recent_documents`, `context_version`) plus a per-invocation `brand_register` object whose fields are sourced from the `swarms.entity_brand` jsonb registry; the prompt itself never sees the union of brands. Onboarding a new brand (UK/IE backlog 999.1, future sales-email expansion) is a single `INSERT swarms.entity_brand` row + `npm run codegen` — zero agent prompt edits, zero TS enum changes. The empirical proof point: the `smeba-uk` fixture in `web/__tests__/canonicalisation/uk-ie-fixture/smeba-uk.fixture.ts` exercises a brand that was never seeded in the live registry, and the Wave 6 LIVE_SMOKE run produced register-correct output (en-GB, "Kind regards") without any prompt edit. See [`.planning/phases/69-handler-agent-canonicalisation-cross-swarm-reuse/69-06-LIVE-SMOKE.md`](../../.planning/phases/69-handler-agent-canonicalisation-cross-swarm-reuse/69-06-LIVE-SMOKE.md).

### Tool registry

The tool routing table is `public.zapier_tools` -- see [`supabase/migrations/20260429_zapier_tools_registry.sql`](../../supabase/migrations/20260429_zapier_tools_registry.sql). Today's columns:

`tool_id` (pk), `description`, `backend`, `pattern` (`sync` | `async_callback`), `target_url`, `auth_method` (`body_field` | `header_bearer`), `auth_secret_env`, `auth_field_name`, `input_schema` (jsonb), `output_schema` (jsonb), `callback_route`, `enabled`, `notes`.

Adding a new tool is a single `INSERT` into `zapier_tools`; no code change, no Vercel deploy. Auth secrets stay in environment variables; `auth_secret_env` carries the **name** of the env var, never the value. Multiple tools can share one secret env var.

### Seeded NXT tool rows (today)

- `nxt.contact_lookup`
- `nxt.identifier_lookup`
- `nxt.candidate_details`
- `nxt.invoice_fetch`

### Canonical client

[`web/lib/automations/debtor-email/nxt-zap-client.ts`](../../web/lib/automations/debtor-email/nxt-zap-client.ts) is the canonical client wrapper that reads a `tool_id` from `zapier_tools`, applies the row's auth method, and dispatches the call. Other handlers reuse this client rather than rolling their own tool-call shim.

## Allowed-Intents Allowlist (forward-ref Phase 64)

Per BUDG-02, Phase 64 adds an `allowed_for_intents text[]` column to `zapier_tools`. Each tool row will declare which intents may invoke it -- a copy-document handler cannot reach a payment-update tool because the payment-update tool's row will not list the `invoice_copy_request` intent in its `allowed_for_intents` array. Today this column **does not exist**; intent-to-tool mapping is implicit in handler code. Mark explicitly as forward-reference: this is the target shape, not the today-state.

## Implementation Patterns (link out)

- [`../zapier-patterns.md`](../zapier-patterns.md) -- the `zapier_tools` registry pattern, NXT SQL via Zapier whitelisted IP, body-field auth pattern. This doc does not duplicate that content.
- [`../browserless-patterns.md`](../browserless-patterns.md) -- handlers that touch a browser use `playwright-core` (NOT `playwright`); shadow DOM via `.evaluate()`; `waitUntil: 'domcontentloaded'` for SPAs. This doc does not duplicate.
- [`../orqai-patterns.md`](../orqai-patterns.md) -- `response_format: json_schema` mandatory, primary `anthropic/claude-sonnet-4-6` plus 3-4 fallbacks, XML-tagged prompts, 45s client timeout. This doc does not duplicate.

## Stack Constraints (per CLAUDE.md)

- Browser automation via `playwright-core`, never `playwright`. Connects to Browserless.io over CDP.
- NXT SQL only via Zapier on a whitelisted IP -- never direct DB, never AWS SDK from Vercel.
- NXT-S3 documents via the same Zapier SDK path -- one credential boundary, one auth path.
- LLM calls via Orq.ai LLM Router -- never direct OpenAI / Anthropic API keys from Vercel.

## Output Plumbing

The handler emits an `automation_runs` row consumed by the kanban surface -- see [`../swarm-bridge-contract.md`](../swarm-bridge-contract.md) (sibling concern; UI plumbing, not duplicated here).

## Override Capture

Axis 4 of the override model is the override surface for this stage. **Today-state: REAL** -- the kanban-card review surface writes `email_labels.draft_quality` (`correct` | `needed_edit` | `rejected`) and `email_labels.feedback_reason`; the matching `agent_runs.human_verdict` carries `'edited_minor'`, `'edited_major'`, and the `'rejected_*'` family. See [`./override-model.md#axis-4--wrong-handler-output-stage-4`](./override-model.md#axis-4----wrong-handler-output-stage-4).

## Graduated Automation

Axis 4 signals feed the prompt-tune / handler-replacement hook: clusters of `feedback_reason` family signals (e.g. "wrong language" repeating) queue either a prompt revision OR a handler-agent swap proposal that goes through the Learning Inbox before applying. See [`./graduated-automation.md#hook-taxonomy`](./graduated-automation.md#hook-taxonomy).

## Forward References

- `zapier_tools.allowed_for_intents text[]` column -- Phase 64 (BUDG-02). The tool->intent allowlist is forward-referenced.
- ~~Handler canonicalisation per swarm -- Phase 69 (CANO-01..04). Today's per-swarm agent naming becomes a canonical registry.~~ **IMPLEMENTED Phase 69 (2026-05-04).** See [Phase 69 implementation summary](#phase-69-implementation-summary).
- Per-run cost ceilings (token + cost budget enforcement at the handler boundary) -- Phase 64 (BUDG-01).

## Phase 69 implementation summary

Phase 69 closed CANO-01..04 by canonicalising the `debtor-copy-document-body-agent` against the Phase 68 `PipelineStageContext` contract and migrating the brand list out of the prompt and into the `swarms.entity_brand` jsonb registry. As of 2026-05-04 the live agent's prompt template is fully data-driven: it sees one brand per invocation via a parameterised `<brand_register>` block and never enumerates the brand union.

### CANO-01 — IMPLEMENTED (canonical context shape)

Input shape changed from `email_entity: Entity` (5-value TS literal-union) + `email_language: string` to:

- `entity_brand: string` — registry-driven brand code (`smeba`, `smeba-fire`, `sicli-noord`, `sicli-sud`, `berki`, ...). No literal-union enum at the contract layer.
- `language: 'nl' | 'fr' | 'en' | 'de'` — canonical `PipelineStageContext.language`.
- `brand_register: BrandRegister` — per-invocation metadata object: `{ code, display_name, register_language, register_dialect, signoff_phrase, formal_address, nxt_database_alias, icontroller_company }`. Resolved at handler entry via `loadBrandRegister(swarm_type, brand_code)`.

The Orq.ai live agent's `<entity_register>` block (5 hardcoded `<entity>` children with prose register treatment per brand) was replaced by a single `<brand_register>` template referencing the per-invocation object. See `.planning/phases/69-handler-agent-canonicalisation-cross-swarm-reuse/69-05-SUMMARY.md` for the verbatim diff.

### CANO-02 — IMPLEMENTED (data-driven brand list)

`swarms.entity_brand` migrated from `text[]` to jsonb-of-objects via [`supabase/migrations/20260505a_entity_brand_expansion.sql`](../../supabase/migrations/20260505a_entity_brand_expansion.sql). The TS `ENTITY` literal-union at `web/lib/automations/debtor-email/coordinator/types.ts` is now build-time codegen output: `scripts/gen-entity-types.ts` reads the registry and writes `web/lib/automations/debtor-email/coordinator/entity.generated.ts` with the literal-union type. CI runs `npm run codegen && git diff --exit-code` to detect drift. Operators never hand-edit `*.generated.ts`.

### CANO-03 — IMPLEMENTED (cross-cutting swarm_type)

[`supabase/migrations/20260505b_orq_agents_cross_cutting.sql`](../../supabase/migrations/20260505b_orq_agents_cross_cutting.sql) flips `public.orq_agents.swarm_type` to `'cross-cutting'` for `agent_key='debtor-copy-document-body-agent'`. Runtime read path (`loadAgent(agent_key)` in `web/lib/automations/orq-agents/client.ts`) is unchanged — `swarm_type='cross-cutting'` is an organisational hint for tooling and Bulk Review filters, not a routing decision.

### CANO-04 — IMPLEMENTED (zero-prompt-edit onboarding)

The regression suite at `web/__tests__/canonicalisation/` includes a `smeba-uk` fixture (`uk-ie-fixture/smeba-uk.fixture.ts`) using en-GB dialect, "Kind regards" signoff, "you" formal address — a brand form that was never seeded in the live registry. Wave 6 LIVE_SMOKE run executed the body agent against this fixture via the live Orq.ai agent and verified register-correct output without any prompt edit. UK/IE backlog (Phase 999.1) operationally onboards each new brand by `INSERT swarms.entity_brand` row + `npm run codegen` + commit; no agent prompt edit, no Vercel deploy required at the agent boundary. See `69-06-LIVE-SMOKE.md` for the empirical results.

### Code surface (verified by Wave 4–6)

- New module: `web/lib/swarms/brand-register.ts` (lookup + module-level Map cache).
- Extended: `web/lib/swarms/registry.ts` (loadEntityBrand, loadEntityBrandRegister exports).
- Refactored: `web/lib/inngest/functions/classifier-invoice-copy-handler.ts` (input-shape rewrite at the body-agent invocation site; `inferLanguageFromEntity` removed).
- Codegen: `scripts/gen-entity-types.ts`, `npm run codegen`.
- Migrations: `20260505a_entity_brand_expansion.sql`, `20260505b_orq_agents_cross_cutting.sql`.
- Live agent: `debtor-copy-document-body-agent` (orqai_id `01KQECMBEMRKX28E0F0T64A43K`) PATCHed via Orq MCP `update_agent` 2026-05-04; `body_version` bumped `2026-04-23.v1` → `2026-05-04.v2`. response_format strict json_schema preserved (per CLAUDE.md learning `cba7352b`).
- Verification: 52 mocked offline assertions + 4 live smoke invocations (NL + FR + EN cross-swarm + en-GB UK) all green.

### Operator note — trust boundary on `swarms.entity_brand`

`swarms.entity_brand` is operator-managed via SQL migrations only. **Treat brand metadata writes (`signoff_phrase`, `register_language`, `display_name`, etc.) with the same care as Orq agent prompt edits** — content from these fields flows directly into the `<brand_register>` prompt block at runtime via `loadBrandRegister` and is rendered by the body agent into customer-facing drafts. Stage 0 input safety (Phase 64 SAFE-*) defends inbound emails; `brand_register` is internal config and is **not** within Stage 0's scope. Threat model: T-69-01 (mitigated by operator-only write path), T-69-23 (operator awareness — this paragraph).

## See Also

- [`./README.md`](./README.md) -- RFC entry point.
- [`./stage-3-coordinator.md`](./stage-3-coordinator.md) -- the source of dispatched intents.
- [`./context-shape-contract.md`](./context-shape-contract.md) -- the context shape this handler reads.
- [`./override-model.md`](./override-model.md) -- axis 4 captures Stage 4 corrections.
- [`./graduated-automation.md`](./graduated-automation.md) -- the prompt-tune / handler-replacement hook consumes axis 4 signals.
- [`../swarm-bridge-contract.md`](../swarm-bridge-contract.md) -- sibling, different concern: how `automation_runs` rows render in the V7 Agent OS shell.
