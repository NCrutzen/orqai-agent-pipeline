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

## Knowledge Bases

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v2/knowledge` | Create a knowledge base |
| GET | `/v2/knowledge` | List all knowledge bases |
| GET | `/v2/knowledge/{knowledge_id}` | Get knowledge base by ID |
| PATCH | `/v2/knowledge/{knowledge_id}` | Update knowledge base |
| DELETE | `/v2/knowledge/{knowledge_id}` | Delete knowledge base |

### Files

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v2/files` | Upload a file (multipart/form-data, max 10MB, supports TXT/PDF/DOCX/CSV/XML) |

### Datasources

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v2/knowledge/{knowledge_id}/datasources` | Add datasource to KB |
| GET | `/v2/knowledge/{knowledge_id}/datasources` | List datasources |
| DELETE | `/v2/knowledge/{knowledge_id}/datasources/{datasource_id}` | Remove datasource |

### Chunking

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v2/knowledge/{knowledge_id}/datasources/{datasource_id}/chunks` | Chunk a datasource |
| POST | `/v2/chunking` | Preview chunking strategy |

### Search

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v2/knowledge/{knowledge_id}/search` | Search knowledge base |

### Create Payloads

**Internal KB:**
```json
{
  "key": "kb-key-from-orchestration",
  "type": "internal",
  "embedding_model": "cohere/embed-english-v3.0",
  "description": "KB description from ORCHESTRATION.md"
}
```

**External KB:**
```json
{
  "key": "kb-key-from-orchestration",
  "type": "external",
  "api_url": "https://your-vector-db.example.com",
  "api_key": "your-api-key",
  "embedding_model": "openai/text-embedding-3-small"
}
```

### Chunking Strategy Mapping

Maps ORCHESTRATION.md chunking strategy values to API `strategy` parameter values:

| ORCHESTRATION.md | API value |
|---|---|
| semantic | `semantic` |
| token | `token` |
| sentence | `sentence` |
| recursive | `recursive` |
| agentic | `agentic` |
| other/default | `fast` |

### Embedding Model Defaults

- `cohere/embed-english-v3.0` (recommended)
- `openai/text-embedding-3-small`
- `openai/text-embedding-3-large`

### Usage Notes

- **List-and-filter lookup:** KBs are NOT addressable by key directly. Use `GET /v2/knowledge?limit=200` and filter by `key` field (same pattern as tools).
- **Embedding model is immutable:** The `embedding_model` field cannot be changed via PATCH after creation. To change the embedding model, delete and re-create the KB.

## Models

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v2/models` | List available models (used for API key validation) |

## SDK Method Mapping

Key SDK methods used by subagents and their REST API equivalents. Use these when the `@orq-ai/node` SDK is unavailable or for manual debugging.

| SDK Method | REST Equivalent | Used By |
|------------|----------------|---------|
| `client.agents.responses.create({ agent_id, messages })` | `POST /v2/agents/{agent_id}/execute` with `{ messages: [...] }` body | tester.md (Step 7.1) |
| `client.datasets.create({ name, ... })` | `POST /v2/datasets` | tester.md (Step 5) |
| `client.datasets.addRows({ dataset_id, rows })` | `POST /v2/datasets/{dataset_id}/rows` | tester.md (Step 5) |

## Usage Notes

- **Pagination:** List endpoints support `limit` and `offset` query parameters.
- **Error responses:** Standard HTTP status codes. 401 = invalid/missing API key. 404 = resource not found. 422 = validation error.
- **Rate limits:** Respect `Retry-After` headers on 429 responses.
- **Idempotency:** Use agent `key` field for idempotent creates -- if a key already exists, use PATCH to update instead.
- **Full docs:** For request/response schemas, fetch from `https://docs.orq.ai/reference/` at runtime.

## Common Pitfalls

Hard-won lessons from running experiments on the Orq.ai platform. Avoid these mistakes:

### Pitfall 1: Using evaluator names instead of IDs in experiment creation

The `POST /v2/experiments` endpoint requires evaluator IDs in the `evaluators` array, not display names:

```json
// WRONG -- causes 422 validation error
{ "evaluators": [{ "name": "coherence" }] }

// CORRECT -- resolve IDs first via GET /v2/evaluators
{ "evaluators": [{ "id": "01JXXXXXXXXXXXXXX" }] }
```

Always resolve evaluator names to platform IDs by calling `GET /v2/evaluators?limit=200` first, then matching by `name` field to extract the `id`.

### Pitfall 2: Nesting messages inside inputs for dataset rows

The experiment engine reads `messages` as a **top-level field** on the datapoint, not nested inside `inputs`:

```json
// WRONG -- experiment runs but evaluator scores are null (silent failure)
{ "inputs": { "messages": [{ "role": "user", "content": "..." }] } }

// CORRECT -- messages is top-level alongside inputs
{
  "inputs": { "text": "...", "category": "..." },
  "messages": [{ "role": "user", "content": "..." }],
  "expected_output": "..."
}
```

This is a silent failure -- the experiment completes but all evaluator scores come back null because the agent never received the input messages.

### Pitfall 3: Using /invoke instead of /execute for agent execution

The correct endpoint for synchronous agent execution is `/execute`, not `/invoke`:

```
WRONG:  POST /v2/agents/{agent_id}/invoke
CORRECT: POST /v2/agents/{agent_id}/execute
```

The `/invoke` endpoint does not exist in the v2 API. Use `POST /v2/agents/{agent_id}/execute` for synchronous execution or `POST /v2/agents/{agent_id}/stream` for streaming.
