# Orq.ai Model Catalog

Model recommendations for Orq.ai agents. Categorized by use case, not exhaustive listing. Orq.ai supports 300+ models across 17+ providers.

> **NOTE: This file is a FORMAT REFERENCE ONLY — it shows provider/model-name patterns and use-case categories.** It is NOT used for model selection or validation. All model selection and validation MUST go through the MCP `models-list` tool, which returns the actual models enabled in your workspace. Do not use this file to pick or validate model IDs.

**Format reference only.** For live model availability, use the MCP `models-list` tool.

> **WARNING: `models-list` returns ALL models.** The MCP `models-list` tool and `GET /v2/models` endpoint return every model across all providers (300+), NOT just models enabled in your workspace. There is no API to check enable/disable status. After selecting a model, **verify it is enabled in Orq.ai Studio** (Models page) before deploying. An agent configured with a disabled model will fail at execution time with no clear error.

## Provider Format

All model IDs use `provider/model-name` format.

| Provider | Format Pattern | Example |
|----------|---------------|---------|
| OpenAI | `openai/model-name` | `openai/gpt-4o` |
| Anthropic | `anthropic/model-name` | `anthropic/claude-sonnet-4-5` |
| Google AI | `google-ai/model-name` | `google-ai/gemini-2.5-pro` |
| AWS Bedrock | `aws/provider.model` | `aws/anthropic.claude-3-5-haiku-20241022-v1:0` |
| Azure | `azure/model-name` | `azure/gpt-4o` |
| Groq | `groq/model-name` | `groq/llama-3.3-70b-versatile` |
| DeepSeek | `deepseek/model-name` | `deepseek/deepseek-chat` |
| Mistral | `mistral/model-name` | `mistral/mistral-large-latest` |
| Cohere | `cohere/model-name` | `cohere/command-r-08-2024` |
| Cerebras | `cerebras/model-name` | `cerebras/llama-3.3-70b` |
| Perplexity | `perplexity/model-name` | `perplexity/sonar-pro` |
| Together AI | `togetherai/path/model` | `togetherai/meta-llama/Llama-3.3-70B-Instruct-Turbo` |
| Alibaba | `alibaba/model-name` | `alibaba/qwen-max` |
| Minimax | `minimax/model-name` | `minimax/minimax-m2.5` |

## Recommended Models by Use Case

### Reasoning and Complex Tasks

For architectural decisions, multi-step analysis, and tasks requiring deep understanding.

| Model | Strengths |
|-------|-----------|
| `anthropic/claude-sonnet-4-5` | Strong reasoning, excellent instruction following, large context |
| `openai/o3` | Advanced reasoning with chain-of-thought |
| `google-ai/gemini-2.5-pro` | Large context window, strong analytical capability |

### Classification and Extraction

For categorizing inputs, extracting structured data, and routing decisions.

| Model | Strengths |
|-------|-----------|
| `openai/gpt-4o-mini` | Fast, cheap, accurate for structured tasks |
| `anthropic/claude-3-5-haiku-20241022` | Low latency, cost-effective, reliable extraction |
| `groq/llama-3.3-70b-versatile` | Very fast inference, good for high-throughput classification |

### Generation and Creative

For writing content, generating documentation, and creative tasks.

| Model | Strengths |
|-------|-----------|
| `anthropic/claude-sonnet-4-5` | High-quality writing, nuanced tone control |
| `openai/gpt-4o` | Versatile generation, good at following style guides |

### Fast and Cost-Effective

For high-volume, latency-sensitive, or budget-constrained tasks.

| Model | Strengths |
|-------|-----------|
| `groq/llama-3.3-70b-versatile` | Fastest inference speeds |
| `cerebras/llama-3.3-70b` | Ultra-fast, competitive quality |
| `deepseek/deepseek-chat` | Strong performance at low cost |

### Vision and Multimodal

For tasks involving images, screenshots, or visual content.

| Model | Strengths |
|-------|-----------|
| `openai/gpt-4o` | Robust image understanding |
| `google-ai/gemini-2.5-flash` | Fast multimodal processing |
| `anthropic/claude-sonnet-4-5` | Strong visual reasoning |

## Capable Tier Lookup

<!-- Phase 35 MSEL-01: capable-first seed table for researcher.md §Model Selection Policy. -->
<!-- This is a STATIC SEED. Live model availability MUST be validated via MCP `models-list` -->
<!-- before any spec is deployed. See the WARNING at the top of this file. -->

Researcher starts every Model Recommendation with the capable-tier primary for the task category. Use this table as the default lookup; override via `--model` flag, discussion input, or MCP `models-list` output when the listed snapshot is not enabled in the user's workspace.

| Task category | Capable-tier Primary (illustrative; validate via MCP `models-list`) | Alternative Primary (same tier, different provider) |
|---|---|---|
| Chat-heavy / conversational | `anthropic/claude-sonnet-4-5-20250929` | `openai/gpt-4o-2024-11-20` |
| Tool-calling / agentic | `anthropic/claude-sonnet-4-5-20250929` | `openai/gpt-4o-2024-11-20` |
| Code / RAG synthesis | `anthropic/claude-opus-4-20250514` | `openai/gpt-4o-2024-11-20` |
| Fast triage (NOT a default — only cascade cheap tier) | `anthropic/claude-haiku-4-5-20251001` | `google-ai/gemini-2-5-flash` |

**Why these IDs are dated snapshots:** Phase 35 MSEL-02 (snapshot-pinning) requires every emitted `model:` field to pin to a dated snapshot. The lookup table therefore seeds dated snapshots; floating aliases (`claude-sonnet-4-5`, `gpt-4o`) appear elsewhere in this file ONLY as provider/format-pattern examples, NOT as recommendations.

**How to use the table:**

1. Read the agent's role from the architect blueprint.
2. Map the role to one of the four task categories above (Chat-heavy, Tool-calling, Code/RAG, Fast triage).
3. Pick the Capable-tier Primary as your recommendation starting point.
4. Call MCP `models-list` to confirm the dated snapshot is enabled in the workspace.
   - If enabled → use it as Primary.
   - If not enabled → use the Alternative Primary column; if that is also not enabled, pick the closest capable-tier option from the MCP output and flag `Confidence: MEDIUM — capable-tier substitute applied`.
5. NEVER substitute a Fast-triage model as the Primary unless the discussion explicitly requested a cost cascade (see researcher.md §Cascade Pattern for when Fast triage is a legitimate choice).

**Relationship to this file's other sections:**

- `## Recommended Models by Use Case` (above) is a broader listing of options by strength.
- `## Capable Tier Lookup` (this section) is the prescriptive subset enforcing MSEL-01 capable-first ordering.
- `## Fallback Model Strategy` (below) handles the `fallback_models` array shape; use the Alternative Primary column from this table as the first fallback entry when the Primary is chosen.

## How to Choose

1. **Start with task complexity.** Simple classification does not need a reasoning model. Complex analysis does not belong on a fast/cheap model.
2. **Consider latency requirements.** User-facing agents need fast responses (Groq, Cerebras, Haiku). Background processing can use slower, higher-quality models.
3. **Factor in cost sensitivity.** High-volume tasks (thousands of invocations) should use cost-effective models. Low-volume critical decisions justify premium models.
4. **Check multimodal needs.** If the agent processes images or visual content, only vision-capable models qualify.
5. **Match provider availability.** Verify the model is available in your Orq.ai workspace before specifying it in a spec.
6. **Consider the AI Router.** Orq.ai's AI Router (`/v2/router/`) provides a unified gateway to all 300+ models with automatic retries and fallbacks. The `fallback_models` field on agents provides basic failover. For more sophisticated routing (weighted load balancing across models), use the `model.parameters.load_balancer` configuration in agent specs. See `orqai-agent-fields.md` Model Parameters section.

## Fallback Model Strategy

The `fallback_models` array provides resilience. When the primary model is unavailable, Orq.ai tries fallbacks in order.

**Rules for choosing fallbacks:**

- Pick models at the **same capability tier** from a **different provider**
- Ensure fallbacks support the same features (e.g., if primary needs vision, fallbacks must too)
- Order by preference: quality first, then speed

**Example:**

```json
{
  "model": "anthropic/claude-sonnet-4-5",
  "fallback_models": [
    "openai/gpt-4o",
    "google-ai/gemini-2.5-pro"
  ]
}
```

**For cost-sensitive agents:**

```json
{
  "model": "groq/llama-3.3-70b-versatile",
  "fallback_models": [
    "cerebras/llama-3.3-70b",
    "openai/gpt-4o-mini"
  ]
}
```
