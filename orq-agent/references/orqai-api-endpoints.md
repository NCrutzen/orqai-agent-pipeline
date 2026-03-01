# Orq.ai REST API Endpoint Reference

Orq.ai REST API endpoint reference for autonomous deployment, testing, and iteration. Subagents load this to construct correct API calls without researching endpoint paths.

**Base URL:** `https://api.orq.ai/v2/`
**Authentication:** `Authorization: Bearer $ORQ_API_KEY`
**Content-Type:** `application/json`

## Agents

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v2/agents` | Create a new agent |
| GET | `/v2/agents` | List all agents |
| GET | `/v2/agents/{agent_id}` | Get agent by ID |
| PATCH | `/v2/agents/{agent_id}` | Update agent configuration |
| DELETE | `/v2/agents/{agent_id}` | Delete an agent |
| POST | `/v2/agents/{agent_id}/execute` | Execute agent synchronously |
| POST | `/v2/agents/{agent_id}/stream` | Execute agent with streaming |
| POST | `/v2/agents/{agent_id}/execute` + `task_id` | Continue a paused task |

## Tools

Supports 5 tool types: function, HTTP, code, MCP, JSON schema.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v2/tools` | Create a new tool |
| GET | `/v2/tools` | List all tools |
| GET | `/v2/tools/{tool_id}` | Get tool by ID |
| PATCH | `/v2/tools/{tool_id}` | Update tool configuration |
| DELETE | `/v2/tools/{tool_id}` | Delete a tool |

## Datasets

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v2/datasets` | Create a new dataset |
| GET | `/v2/datasets` | List all datasets |
| GET | `/v2/datasets/{dataset_id}` | Get dataset by ID |
| PATCH | `/v2/datasets/{dataset_id}` | Update dataset metadata |
| DELETE | `/v2/datasets/{dataset_id}` | Delete a dataset |
| POST | `/v2/datasets/{dataset_id}/rows` | Add rows to dataset |
| GET | `/v2/datasets/{dataset_id}/rows` | List dataset rows |
| DELETE | `/v2/datasets/{dataset_id}/rows/{row_id}` | Delete a dataset row |

## Evaluators

Supports 4 custom evaluator types: LLM, Python, HTTP, JSON.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v2/evaluators` | Create a custom evaluator |
| GET | `/v2/evaluators` | List all evaluators |
| GET | `/v2/evaluators/{evaluator_id}` | Get evaluator by ID |
| PATCH | `/v2/evaluators/{evaluator_id}` | Update evaluator configuration |
| DELETE | `/v2/evaluators/{evaluator_id}` | Delete an evaluator |

## Experiments and Deployments

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v2/experiments` | Create a new experiment |
| GET | `/v2/experiments` | List all experiments |
| GET | `/v2/experiments/{experiment_id}` | Get experiment by ID |
| POST | `/v2/experiments/{experiment_id}/run` | Run an experiment |
| GET | `/v2/experiments/{experiment_id}/results` | Get experiment results |

## Prompts

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v2/prompts` | Create a new prompt |
| GET | `/v2/prompts` | List all prompts |
| GET | `/v2/prompts/{prompt_id}` | Get prompt by ID |
| POST | `/v2/prompts/{prompt_id}/versions` | Create a prompt version |
| GET | `/v2/prompts/{prompt_id}/versions` | List prompt versions |

## Memory Stores

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v2/memory-stores` | Create a memory store |
| GET | `/v2/memory-stores` | List all memory stores |
| GET | `/v2/memory-stores/{store_id}` | Get memory store by ID |
| DELETE | `/v2/memory-stores/{store_id}` | Delete a memory store |

## Models

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v2/models` | List available models (used for API key validation) |

## Usage Notes

- **Pagination:** List endpoints support `limit` and `offset` query parameters.
- **Error responses:** Standard HTTP status codes. 401 = invalid/missing API key. 404 = resource not found. 422 = validation error.
- **Rate limits:** Respect `Retry-After` headers on 429 responses.
- **Idempotency:** Use agent `key` field for idempotent creates -- if a key already exists, use PATCH to update instead.
- **Full docs:** For request/response schemas, fetch from `https://docs.orq.ai/reference/` at runtime.
