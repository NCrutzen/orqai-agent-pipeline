# Quick Task: Apply 21 Pipeline Optimizations - Research

**Researched:** 2026-03-26
**Domain:** Orq.ai platform APIs, agent pipeline enhancements
**Confidence:** MEDIUM (mix of verified docs and LOW-confidence gaps)

## Summary

This research investigates 13 Orq.ai platform capabilities to inform the 21-optimization quick task. Key findings: (1) several features already exist in the pipeline (response_format, memory_stores field), (2) some are AI Gateway features not applicable to the Agents API (caching, auto-router), (3) A2A is already implemented via team_of_agents + call_sub_agent (not a separate protocol integration), and (4) RAGAS evaluators are available in the platform but require retrieval-specific dataset fields. The experiment task.type question remains LOW confidence -- the pipeline currently uses `"agent"` and this appears correct.

**Primary recommendation:** Focus optimizations on features that are verified AND actionable via the Agents/Experiments REST API. Skip Gateway-only features (caching, auto-router) that don't apply to the agent pipeline's deployer/tester workflow.

---

## 1. A2A Protocol (Confidence: HIGH)

**Finding:** Orq.ai's Agents API is ALREADY built on the A2A protocol. The [agent API docs](https://docs.orq.ai/docs/agents/agent-api) state: "The Agents payloads are built on the A2A protocol, standardizing agent to agent communication."

**What this means for the pipeline:**
- The pipeline already uses A2A concepts: `team_of_agents`, `call_sub_agent`, `retrieve_agents`, task states (submitted/working/input_required/completed/failed/canceled)
- Message format uses A2A-style parts: `{ role, parts: [{ kind: "text", text: "..." }] }`
- Agent states follow A2A: Active, Inactive, Error, Approval Required
- **No new A2A-specific fields or endpoints** need to be added to the deployer

**Optimization scope:** Primarily spec-level documentation -- ensure architect and spec-generator mention A2A compliance. No deployer code changes needed.

## 2. Control Tower / Trace Automations (Confidence: MEDIUM)

**Finding:** Control Tower is Orq.ai's observability interface. Trace automations route traces to annotation queues based on rules.

- Traces are captured via OpenTelemetry instrumentation (OTLP exporter)
- Annotation queues can be populated automatically via Trace Automations
- Traces in queues can receive human reviews (rating, defects)
- Configuration is done in Orq.ai Studio, not via API

**Optimization scope:** This is a post-deploy Studio configuration, not an API-level pipeline concern. The pipeline could document it as a recommended post-deploy step but cannot automate it via current APIs.

## 3. Memory Store API (Confidence: HIGH)

**Finding:** `POST /v2/memory-stores` is confirmed. Required fields:

```json
{
  "key": "store-key",                                    // required, pattern: ^[A-Za-z]...
  "embedding_config": { "model": "provider/model-name" }, // required
  "description": "Store purpose",                         // required
  "path": "project/folder"                                // required
}
```

Optional: `ttl` (time-to-live for memory documents)

**Current pipeline state:** The deployer already handles `memory_stores` as an array field on agents (see orqai-agent-fields.md). Memory tools are documented (retrieve_memory_stores, query_memory_store, write_memory_store, delete_memory_document).

**Gap:** The deployer does NOT provision memory stores before agent deployment (unlike the KB provisioning in Phase 1.5). It assumes memory stores already exist.

**Optimization:** Add a Phase 1.6 to deployer.md for memory store provisioning, following the same pattern as KB provisioning (Phase 1.5). REST-only (no MCP tools for memory stores, same as KBs).

## 4. Structured Outputs / response_format (Confidence: HIGH)

**Finding:** Already implemented in the previous quick task (260325-r2j). The `response_format` field with `json_schema` + `strict: true` is documented in:
- `orqai-agent-fields.md` (field reference)
- `spec-generator.md` (generation guidance)
- `dataset-preparer.md` (anti-pattern note)

**Current state:** The field is documented for spec generation but NOT sent by the deployer to the agent create/update API.

**Optimization:** Ensure deployer.md includes `response_format` in the agent create payload when present in the spec. Add it to the comparison allowlist for diffing (Phase 4.2).

The `response_format` field IS accepted in `POST /v2/agents` -- confirmed by the orqai-agent-fields.md reference already in the pipeline.

## 5. Caching (Confidence: HIGH -- NOT applicable to Agents API)

**Finding:** Caching is an **AI Gateway** feature, configured per-request on `/v2/router/chat/completions`:

```json
{
  "cache": {
    "type": "exact_match",
    "ttl": 3600
  }
}
```

- TTL default: 1800s (30 min), range: 1-259200s (3 days)
- Cache key = model + messages + all parameters
- Only `exact_match` type supported

**Critical distinction:** This is Gateway/Router level caching, NOT Agent API level. The `POST /v2/agents` create endpoint does not accept a `cache` field. Caching applies when calling the Gateway directly (`/v2/router/chat/completions`), not when executing agents (`/v2/agents/{id}/execute`).

**Optimization scope:** SKIP for the deployer. Caching is not relevant to the agent deployment pipeline. Could be documented as a reference note for agents that use the Gateway directly.

## 6. Streaming (Confidence: HIGH)

**Finding:** Agent streaming is available via `POST /v2/agents/{agent_id}/stream` (already in the endpoint reference). This returns SSE with chunks following OpenAI-compatible format:

- Each chunk: `{ id, object: "chat.completion.chunk", delta: { content: "..." }, finish_reason: null|"stop"|"length"|"tool_calls" }`
- Stream enabled by default on the `/stream` endpoint

**Gateway streaming:** Also available on `/v2/router/chat/completions` with `"stream": true`.

**Current pipeline state:** The endpoint is already documented in `orqai-api-endpoints.md`. The pipeline uses `/execute` (synchronous) for testing, which is correct.

**Optimization scope:** Minimal. The `/stream` endpoint is already referenced. Could add a note to spec-generator about when streaming is recommended for agent specs.

## 7. Webhooks (Confidence: HIGH)

**Finding:** Webhooks are configured in Orq.ai Studio (Organization > Webhooks). Available events:

| Category | Events |
|----------|--------|
| Agents | `agent.created`, `agent.updated`, `agent.deleted` |
| Deployments | `deployment.created`, `deployment.updated`, `deployment.deleted`, `deployment.invoked` |
| Prompts | `prompt.created`, `prompt.updated`, `prompt.deleted` |

- Payloads use HMAC-SHA256 signing (`X-Orq-Signature` header)
- `deployment.invoked` includes execution data (response, token usage, latency, evaluation results)
- Configuration is Studio-only (no webhook CRUD API found)

**Optimization scope:** Cannot be automated by the deployer (Studio-only setup). Document as a post-deploy recommendation for monitoring setups.

## 8. Auto Router / Intelligent Model Selection (Confidence: LOW)

**Finding:** The "AI Router" (`/v2/router/`) is the unified API gateway for routing to 300+ models. It provides:
- Provider-agnostic model access
- Automatic retries and fallbacks
- Load balancing

However, there is **no documented "intelligent model selection"** feature that automatically picks the best model for a given request. The Router routes to whichever model you specify. The `fallback_models` field on agents provides failover, not intelligent selection.

**Optimization scope:** SKIP. This does not exist as an agent-level feature. The pipeline's `fallback_models` support is sufficient.

## 9. Annotations API / Feedback (Confidence: MEDIUM)

**Finding:** Feedback is submitted via the SDK:

```python
orq.feedback.create(
    field="rating",      # "rating" or "defects"
    value=["good"],      # or ["hallucination", "off_topic", etc.]
    trace_id=trace_id    # from generation response
)
```

Supported defect types: grammatical, spelling, hallucination, repetition, inappropriate, off_topic, incompleteness, ambiguity

Annotation Queues: populated via Trace Automations (Studio config), provide human review workflow.

**Gap:** No REST endpoint documented for `feedback.create()` -- only SDK method shown. Would need to find the underlying REST endpoint for curl-based usage.

**Optimization scope:** Could add to results-analyzer or hardener -- after experiments, submit feedback annotations on low-scoring traces. Requires REST endpoint investigation.

## 10. Prompt Snippets (Confidence: MEDIUM)

**Finding:** Prompt snippets are reusable text blocks:
- Created in Studio (+ button > Prompt Snippet)
- Referenced in prompts as `{{snippet.snippet_name}}`
- Snippets shown in blue when correctly loaded
- Changes propagate to all prompts using the snippet

**No API for snippet CRUD found.** Snippet creation and management appears to be Studio-only.

**Optimization scope:** Limited for the pipeline. Could be a recommendation in the spec-generator for agents that share common instruction blocks, but cannot be automated.

## 11. Experiment task.type: "agent" vs "prompt" (Confidence: MEDIUM)

**Finding:** The pipeline currently uses `task.type: "agent"` in experiment creation (see experiment-runner.md Phase 3). The experiment creation payload is:

```json
{
  "task": {
    "type": "agent",
    "agents": [{ "agent_key": "agent-key" }]
  }
}
```

No official documentation found confirming the valid values for `task.type`. The pipeline arrived at `"agent"` through iteration (previous quick task 260325-r2j). The alternative `"prompt"` would be for testing Deployments/Prompts rather than Agents.

**Current state:** Working -- experiments successfully create and run with `task.type: "agent"`.

**Optimization scope:** No change needed. Keep `"agent"` as the task type for agent experiments. Document that `"prompt"` exists as an alternative for Deployment-based experiments (not used by this pipeline).

## 12. evaluatorq SDK Status (Confidence: HIGH)

**Finding:** `@orq-ai/evaluatorq` v1.0.7 (published ~Feb 2026). It IS actively maintained as part of the orqkit monorepo. It's an open-source evaluation framework for GenAI systems.

**However:** The pipeline explicitly does NOT use evaluatorq (see experiment-runner.md anti-pattern: "Do NOT use evaluatorq SDK -- Root cause of V2.1 restructure. Causes experiment timeouts. Replaced entirely by REST API."). This decision was validated in V2.1.

**Optimization scope:** No change. The decision to avoid evaluatorq for experiment execution is validated. The REST API approach works. If evaluatorq has been fixed since V2.1, it could be re-evaluated, but this is out of scope for this task.

## 13. Multimodal Support (Confidence: HIGH)

**Finding:** Agents support file attachments in execution via the A2A message parts format:

```json
{
  "message": {
    "role": "user",
    "parts": [
      { "kind": "text", "text": "Analyze this invoice" },
      {
        "kind": "file",
        "file": {
          "bytes": "base64-encoded-content",
          "mimeType": "application/pdf",
          "name": "invoice.pdf"
        }
      }
    ]
  }
}
```

**Key rules:**
- Images: URL (`uri`) OR base64 (`bytes`)
- PDFs: base64 (`bytes`) only -- URI not supported
- Must specify `mimeType` (image/jpeg, application/pdf, etc.)
- Vision-capable model required (gpt-4o, gemini-2.5-flash, claude-sonnet-4-5)

**Current pipeline state:** Not documented in agent-fields reference or spec-generator.

**Optimization scope:** Add multimodal message format to orqai-agent-fields.md. Add guidance to spec-generator for agents processing images/PDFs. Add model selection note about vision capability requirement.

---

## RAGAS Evaluator Integration (Bonus Finding)

**Finding:** 12 RAGAS evaluators are available in the Orq.ai Hub. They require specific dataset fields:

| Field | Required? | Description |
|-------|-----------|-------------|
| `query` | Yes | User question |
| `output` | Yes | AI response |
| `model` | Yes | Evaluation LLM |
| `reference` | Optional | Ground truth answer |
| `retrievals` | Optional | Retrieved document chunks |

**Current pipeline state:** RAGAS evaluators are listed in orqai-evaluator-types.md but not used by experiment-runner's role-based evaluator selection.

**Optimization scope:** Add RAGAS-aware role: "rag" agents that use KB retrieval should get RAGAS evaluators (faithfulness, context_precision, answer_relevancy) in addition to standard evaluators. Requires dataset format changes to include `retrievals` field.

---

## Evaluator Library Updates (Bonus Finding)

**Finding:** The actual Orq.ai evaluator library differs from what's in orqai-evaluator-types.md:

**Function evaluators updated names/additions:**
- Contains All, Contains Any, Contains None, Contains Valid Link (new)
- BERT Score (new)
- Length Between, Length Greater Than, Length Less Than (replaces word_count/char_count?)

**LLM evaluators -- significantly different from current reference:**
- Age-Appropriate, Bot Detection, Grammar, Localization, Translation, Fact Checking Knowledge Base, Sentiment Classification, Summarization, Tone of Voice, PII Anonymization
- **Missing from current reference:** coherence, relevance, fluency, groundedness, completeness, conciseness, correctness, helpfulness, instruction_following

**WARNING:** The evaluator types reference may be outdated or the evaluator library page may show a different set than what's available via API. The current experiment-runner resolves evaluators by NAME via `GET /v2/evaluators` at runtime, so if names changed, experiments would silently skip missing evaluators.

**Optimization scope:** HIGH PRIORITY -- verify actual evaluator names available via API and update orqai-evaluator-types.md. The role-based evaluator selection in experiment-runner depends on exact name matching.

---

## Optimization Applicability Matrix

| # | Optimization | Applies To | Effort | Confidence |
|---|-------------|-----------|--------|------------|
| 1 | Memory store provisioning in deployer | deployer.md | MEDIUM | HIGH |
| 2 | response_format in deployer payload | deployer.md | LOW | HIGH |
| 3 | Multimodal message format docs | agent-fields.md, spec-generator.md | LOW | HIGH |
| 4 | RAGAS evaluator role for KB agents | experiment-runner.md, evaluator-types.md | MEDIUM | MEDIUM |
| 5 | Evaluator library name verification | evaluator-types.md | HIGH PRIORITY | MEDIUM |
| 6 | A2A protocol documentation | architect.md, spec-generator.md | LOW | HIGH |
| 7 | Webhook post-deploy recommendation | deployer.md (documentation note) | LOW | HIGH |
| 8 | Streaming recommendation in specs | spec-generator.md | LOW | HIGH |
| 9 | Trace automation post-deploy note | deployer.md (documentation note) | LOW | MEDIUM |
| 10 | Feedback/annotations for low scores | results-analyzer.md or hardener.md | MEDIUM | LOW |
| 11 | Prompt snippets reference | spec-generator.md (documentation note) | LOW | MEDIUM |

**Features to SKIP (not applicable to Agents API):**
- Caching (Gateway-only, not agent create/execute)
- Auto Router (no intelligent selection feature exists)
- evaluatorq SDK (validated anti-pattern, keep REST)

---

## Common Pitfalls

### Pitfall 1: Confusing Gateway features with Agent API features
**What goes wrong:** Assuming caching, auto-routing, and structured outputs work the same way on `/v2/agents` as on `/v2/router/chat/completions`.
**Prevention:** Always check whether a feature is documented for the Agents API specifically, not just the Gateway.

### Pitfall 2: Evaluator name drift
**What goes wrong:** The evaluator library UI shows different names than what `GET /v2/evaluators` returns. experiment-runner resolves by name, so mismatches cause silent failures (evaluator skipped with warning).
**Prevention:** Always resolve evaluator names via the API at runtime (which the pipeline already does). But the reference file should match reality.

### Pitfall 3: PDF URI support in agent messages
**What goes wrong:** Passing a URI for a PDF attachment -- only base64 is supported for PDFs.
**Prevention:** Document clearly in agent-fields reference that PDFs require `bytes` (base64), not `uri`.

---

## Sources

### Primary (HIGH confidence)
- [Orq.ai Agent API docs](https://docs.orq.ai/docs/agents/agent-api) - A2A protocol, message format, task states
- [Orq.ai Memory Store API](https://docs.orq.ai/reference/memory-stores/create-memory-store) - POST fields confirmed
- [Orq.ai Webhooks docs](https://docs.orq.ai/docs/webhooks/overview) - Event types, payload structure
- [Orq.ai File Support for Agents](https://docs.orq.ai/docs/file-support-for-agents) - Multimodal message format
- [Orq.ai LLM Response Caching](https://docs.orq.ai/docs/proxy/cache) - Gateway caching (confirmed not Agent API)
- [Orq.ai AI Gateway Streaming](https://docs.orq.ai/docs/ai-gateway-streaming) - SSE chunk format
- [Orq.ai Create Agent reference](https://docs.orq.ai/reference/agents/create-agent) - Agent fields confirmed

### Secondary (MEDIUM confidence)
- [Orq.ai Evaluator Library](https://docs.orq.ai/docs/evaluators/library) - Evaluator names (may differ from API)
- [Orq.ai RAGAS Evaluator](https://docs.orq.ai/docs/ragas-evaluator) - RAGAS field requirements
- [Orq.ai Prompt Snippets](https://docs.orq.ai/docs/prompt-snippets/overview) - Studio-only creation
- [Orq.ai Annotation Queue](https://docs.orq.ai/docs/administer/annotation-queue) - Trace automation routing
- [Orq.ai Feedback docs](https://docs.orq.ai/docs/capturing-feedback-with-orq) - SDK feedback.create()

### Tertiary (LOW confidence)
- Experiment task.type: "agent" -- working in practice, no official docs confirming valid values
- AI Router "intelligent selection" -- not found in docs, likely doesn't exist as described
- Annotations REST endpoint -- only SDK method documented, REST path unknown

## Metadata

**Confidence breakdown:**
- Memory Store API: HIGH - direct API doc confirmation
- A2A Protocol: HIGH - official docs explicitly state "built on A2A"
- Caching/Router: HIGH - confirmed as Gateway-only features
- Evaluator library: MEDIUM - UI listing may differ from API response
- Experiment task.type: MEDIUM - works in practice, no official schema
- Annotations API: LOW - SDK only, REST path not found

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (30 days -- Orq.ai API is relatively stable)
