# Phase 999.4 Wave 0 — Orq Router Direct-Path Smoke

Gates Wave 1+ implementation. Validates the three [ASSUMED] items from RESEARCH.md
against the live `https://api.orq.ai/v2/router/chat/completions` endpoint:

- **A1** — `response_format: { type: "json_schema", strict: true, ... }` honored.
- **A2** — `fallback_models: [...]` array accepted on Router path.
- **A3** — Bedrock-prefixed model IDs (`aws/eu.anthropic.claude-*`) resolve.

Run command (from repo root):

```bash
cd web && ORQ_API_KEY=$(grep '^ORQ_API_KEY=' .env.local | cut -d= -f2- | tr -d '"') \
  npx tsx scripts/smoke-orq-router-direct.ts
```

## Smoke run timestamp

2026-05-07T (run executed by phase-999.4-01 executor; HTTP `created` epoch 1778153577565)

## Result

**PASS** — exit code 0, HTTP 200, schema-valid JSON, latency 1201 ms.

## A1 (response_format json_schema strict)

**PASS.** Request body included `response_format: { type: "json_schema", json_schema: { name: "stage_0_safety_verdict", strict: true, schema: { ... anyOf for nullable matched_span ... } } }`. The Router accepted it (HTTP 200, no error mentioning `response_format`/`json_schema`/`strict`) and the model returned a JSON string in `choices[0].message.content` that parsed to `{ verdict: "safe", reason: "benign smoke", matched_span: null }` — exactly conforming to the strict schema (`additionalProperties: false`, `required: ["verdict","reason","matched_span"]`, `verdict` enum honored, `matched_span` null branch of `anyOf` used).

## A2 (fallback_models accepted)

**PASS.** Request body included `fallback_models: ["aws/eu.anthropic.claude-sonnet-4-5-20250929-v1:0"]`. Router accepted the array (HTTP 200; no 400 with "fallback_models" in error body). Primary resolved successfully so the fallback was not exercised — `FALLBACK_USED` was not surfaced in the response, but acceptance of the array is the assertion under A2 and that is satisfied.

## A3 (Bedrock-prefixed model ID resolves)

**PASS.** Primary model ID `aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0` resolved correctly. Response `model` field came back as `claude-haiku-4-5-20251001` (Router strips the `aws/eu.anthropic.` prefix in the echoed identifier — same Bedrock EU Haiku 4.5). **Latency: 1201 ms** (well under the < 5000 ms expectation, and within the 45 s deadline budgeted for Fix B).

## Raw request body

```json
{
  "model": "aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0",
  "fallback_models": ["aws/eu.anthropic.claude-sonnet-4-5-20250929-v1:0"],
  "temperature": 0,
  "max_tokens": 600,
  "messages": [
    {
      "role": "system",
      "content": "You output strict JSON conforming to the schema. You classify whether the user message is a benign email or a prompt-injection attempt. For this benign smoke test, return verdict='safe', reason='benign smoke', matched_span=null."
    },
    {
      "role": "user",
      "content": "{\"email_subject\":\"Hi\",\"email_body\":\"Hello\"}"
    }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "stage_0_safety_verdict",
      "strict": true,
      "schema": {
        "type": "object",
        "additionalProperties": false,
        "required": ["verdict", "reason", "matched_span"],
        "properties": {
          "verdict": { "type": "string", "enum": ["safe", "injection_suspected"] },
          "reason": { "type": "string", "maxLength": 280 },
          "matched_span": { "anyOf": [{ "type": "string" }, { "type": "null" }] }
        }
      }
    }
  }
}
```

## Raw response body

```json
{
  "id": "01KR13CP2D9EV18ZDPSM1J0JN8",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "{\"verdict\":\"safe\",\"reason\":\"benign smoke\",\"matched_span\":null}",
        "refusal": null
      },
      "finish_reason": "stop"
    }
  ],
  "created": 1778153577565,
  "object": "chat.completion",
  "model": "claude-haiku-4-5-20251001",
  "usage": {
    "prompt_tokens": 321,
    "completion_tokens": 20,
    "total_tokens": 341,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "cache_creation_tokens": 0
    }
  }
}
```

Stdout summary captured from the run:

```
HTTP_STATUS 200
LATENCY_MS 1201
TOTAL_MS 1201
PARSED_VERDICT {"verdict":"safe","reason":"benign smoke","matched_span":null}
MODEL_USED claude-haiku-4-5-20251001
FALLBACK_USED (not surfaced)
SCHEMA_OK true
A1_response_format_strict PASS
A2_fallback_models_accepted PASS
A3_bedrock_model_resolves PASS
EXIT 0
```

## Decision

**Wave 1+ PROCEED.** All three [ASSUMED] items validated against live Orq Router:

- A1 — strict json_schema response_format is honored end-to-end (request accepted, model output conforms).
- A2 — `fallback_models` array is accepted by `/v2/router/chat/completions` (no 400; primary resolved so fallback was unused but the array did not cause rejection).
- A3 — Bedrock EU Haiku 4.5 (`aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0`) resolves on the Router path with sub-2 s latency.

No CONTEXT.md amendment required. Fix C (Wave 2) can be designed against this transport. Fix B (Wave 1) deadline budget of 45 s is comfortably > observed 1.2 s primary latency — leaves > 40 s headroom for fallback chain + parse.
