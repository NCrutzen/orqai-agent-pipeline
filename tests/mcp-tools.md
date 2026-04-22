# MCP Tools Test Manifest (DIST-06)

Required MCP tools expected from the `orq-workspace` server. Availability is a live check — this file is the contract downstream skills rely on.

| Tool | Consumed by | Phase |
|------|-------------|-------|
| `list_traces` | traces, trace-failure-analysis | 36, 38 |
| `list_spans` | trace-failure-analysis | 38 |
| `get_span` | trace-failure-analysis, datasets (promote-trace) | 38, 39 |
| `list_models` | models, observability | 36, 37 |
| `search_entities` | workspace, kb (retrieval test) | 36, 40 |
| `search_directories` | workspace | 36 |
| `get_analytics_overview` | analytics | 36 |
| `query_analytics` | analytics | 36 |
| `list_registry_keys` | workspace (inventory) | 36 |
| `list_registry_values` | workspace | 36 |
| `list_datapoints` | datasets | 39 |
| `list_experiment_runs` | test, iterate, compare-frameworks | V2.1, 41 |
| `create_prompt_version` | prompt-optimization | 41 |
| `create_datapoints` | datasets (promote-trace) | 39 |
| `create_dataset` | datasets | V2.1, 39 |
| `create_llm_eval` / `create_python_eval` | harden, evaluator-validator | V2.1, 42 |

MCP registration lives in `./.mcp.json` (single source of truth — cross-IDE loaders consume it directly).

Smoke verification:

```bash
# Requires ORQ_API_KEY in env; invokes a single read-only tool as a liveness probe.
npx @orq-ai/mcp-server --self-check 2>&1 | grep -q "OK"
```
