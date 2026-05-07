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

_(filled in at Task 2 execution)_

## Result

_(PASS / FAIL — filled in at Task 2 execution)_

## A1 (response_format json_schema strict)

_(PASS / FAIL + evidence — filled in at Task 2 execution)_

## A2 (fallback_models accepted)

_(PASS / FAIL + evidence — HTTP 400 mentioning "fallback_models" → FAIL)_

## A3 (Bedrock-prefixed model ID resolves)

_(PASS / FAIL + latency_ms — filled in at Task 2 execution)_

## Raw request body

```json
(captured at Task 2 execution)
```

## Raw response body

```json
(captured at Task 2 execution)
```

## Decision

_(Wave 1+ proceed (PASS) | escalate (FAIL — describe required CONTEXT.md amendment))_
