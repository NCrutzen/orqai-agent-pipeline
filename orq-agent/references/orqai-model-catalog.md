# Orq.ai Model Catalog

Model recommendations for Orq.ai agents. Categorized by use case, not exhaustive listing. Orq.ai supports 300+ models across 17+ providers.

> **NOTE: This file is a FORMAT REFERENCE ONLY — it shows provider/model-name patterns and use-case categories.** It is NOT used for model selection or validation. All model selection and validation MUST go through the MCP `models-list` tool, which returns the actual models enabled in your workspace. Do not use this file to pick or validate model IDs.

**Format reference only.** For live model availability, use the MCP `models-list` tool.

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

## How to Choose

1. **Start with task complexity.** Simple classification does not need a reasoning model. Complex analysis does not belong on a fast/cheap model.
2. **Consider latency requirements.** User-facing agents need fast responses (Groq, Cerebras, Haiku). Background processing can use slower, higher-quality models.
3. **Factor in cost sensitivity.** High-volume tasks (thousands of invocations) should use cost-effective models. Low-volume critical decisions justify premium models.
4. **Check multimodal needs.** If the agent processes images or visual content, only vision-capable models qualify.
5. **Match provider availability.** Verify the model is available in your Orq.ai workspace before specifying it in a spec.

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
