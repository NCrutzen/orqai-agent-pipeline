# Stage 4 -- Handler Agents (zapier_tools Registry)

> **Status:** RFC (Phase 63). The `zapier_tools` registry exists today; the `allowed_for_intents` allowlist column is forward-referenced to Phase 64 (BUDG-02).

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

The canonical handler agent for the debtor swarm is `debtor-copy-document-body-agent` -- the agent that drafts the iController reply for an `invoice_copy_request` intent. Per-swarm canonicalisation (a unified registry of handler agents per swarm) is forward-referenced to Phase 69 (CANO-01..04). Today, agent identity is per-swarm and named directly.

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
- Handler canonicalisation per swarm -- Phase 69 (CANO-01..04). Today's per-swarm agent naming becomes a canonical registry.
- Per-run cost ceilings (token + cost budget enforcement at the handler boundary) -- Phase 64 (BUDG-01).

## See Also

- [`./README.md`](./README.md) -- RFC entry point.
- [`./stage-3-coordinator.md`](./stage-3-coordinator.md) -- the source of dispatched intents.
- [`./context-shape-contract.md`](./context-shape-contract.md) -- the context shape this handler reads.
- [`./override-model.md`](./override-model.md) -- axis 4 captures Stage 4 corrections.
- [`./graduated-automation.md`](./graduated-automation.md) -- the prompt-tune / handler-replacement hook consumes axis 4 signals.
- [`../swarm-bridge-contract.md`](../swarm-bridge-contract.md) -- sibling, different concern: how `automation_runs` rows render in the V7 Agent OS shell.
