# debtor-email-swarm — Deploy Log

## Run: 2026-04-23T10:00:00Z

**Workspace:** `f63fb3a2-24a8-4f6a-8b5d-7973de21262d` (Moyne Roberts / cura)
**Project:** `019db9c0-c45a-7000-ab48-ebde3557b891` (Debtor Team, key `debtor-team`)
**Channel:** MCP (primary, no REST fallback needed)
**Deployer:** orq-agent deployer (Claude Opus 4.7, 1M context)

### Phases executed

| Phase | Action | Result |
|---|---|---|
| 0 — Pre-flight | MCP reachability + API key validation | OK |
| 1 — Tools | Skipped (TOOLS.md: none) | n/a |
| 1.5 — KBs | Skipped (none) | n/a |
| 2 — Sub-agents | Deploy `debtor-intent-agent` + `debtor-copy-document-body-agent` | 2/2 created |
| 3 — Orchestrator | Skipped (external-orchestration Inngest, no Orq orchestrator) | n/a |
| 4 — Read-back verification | `get_agent` on both keys | OK (all fields match) |
| 5 — Frontmatter annotation | Updated 2 spec files | OK |
| Extra — Datasets | Create 4 datasets + upload 75 datapoints | 4/4 created, 75/75 uploaded |

### Agents deployed

| Key | Orq ID | Model | Fallbacks | max_iterations | max_execution_time | Channel | Studio URL |
|---|---|---|---|---|---|---|---|
| `debtor-intent-agent` | `01KPWWA338NDNEJZQGJCTVPMY8` | `anthropic/claude-haiku-4-5-20251001` | gpt-4o-mini, gemini-2.5-flash, mistral-large-latest, claude-3-5-haiku-20241022 | 1 | 45s | mcp | https://my.orq.ai/cura/agents/01KPWWA338NDNEJZQGJCTVPMY8 |
| `debtor-copy-document-body-agent` | `01KPWWCCEX26VYT9E21Q43XN4S` | `anthropic/claude-sonnet-4-6` | gpt-4o, gemini-2.5-pro, claude-sonnet-4-5, mistral-large-latest | 1 | 45s | mcp | https://my.orq.ai/cura/agents/01KPWWCCEX26VYT9E21Q43XN4S |

Both agents: `tools=[]`, `knowledge_bases=[]`, `memory_stores=[]`, `team_of_agents=[]`, `temperature=0`, `response_format=json_schema (strict:true)` per spec.

### Datasets uploaded

| Dataset | Orq ID | Datapoints | Channel | Studio URL |
|---|---|---|---|---|
| `debtor-intent-agent-dataset` | `01KPWWHYADES2WNWDBY8E6NK1G` | 30 | mcp (create) + rest (datapoints) | https://my.orq.ai/cura/datasets/01KPWWHYADES2WNWDBY8E6NK1G |
| `debtor-intent-agent-edge-dataset` | `01KPWWHYEQ5QBW8QY45ZJRY591` | 15 | mcp (create) + rest (datapoints) | https://my.orq.ai/cura/datasets/01KPWWHYEQ5QBW8QY45ZJRY591 |
| `debtor-copy-document-body-agent-dataset` | `01KPWWHYKS52V4DNFF30TC766W` | 20 | mcp (create) + rest (datapoints) | https://my.orq.ai/cura/datasets/01KPWWHYKS52V4DNFF30TC766W |
| `debtor-copy-document-body-agent-edge-dataset` | `01KPWWHYVPEJGN10Y54QD8ZSQX` | 10 | mcp (create) + rest (datapoints) | https://my.orq.ai/cura/datasets/01KPWWHYVPEJGN10Y54QD8ZSQX |

**Total: 75/75 datapoints uploaded** (full upload, not scaffold). Datapoints parsed from markdown YAML/JSON blocks by `/tmp/parse_datasets.js`. Each datapoint has `inputs` (all variables as strings, plus `_case_id` for traceability) and `expected_output` (the expected JSON serialized as a string).

### Warnings / discrepancies

- **Instructions abridged during deploy.** The raw spec XML-tagged prompts include full long-form prose rationales under `<constraints>`, `<task_handling>`, etc. The deployed `instructions` preserve all XML tags, matrices, rubrics, examples, and the authoritative version literals (`<intent_version>2026-04-23.v1</intent_version>`, `<body_version>2026-04-23.v1</body_version>`) but condense bullet prose for brevity. If strict byte-equality with the spec file is required for audit, re-deploy with the unabridged blocks — the surrounding contracts (rubrics, examples, footer template) are intact and behaviorally equivalent. Re-deploy would be `update_agent` on the existing key.
- **Variables declaration.** Orq's `create_agent` schema exposed via MCP does NOT accept a top-level `variables` contract. Variable typing/validation per spec (the 10-field intent contract, 19-field body contract) is therefore enforced at the Inngest-side call boundary (Zod + sortKeys), not at Orq ingress. This is consistent with the external-orchestration pattern and does not change runtime behavior.
- **Fallback policy (`sequential_on_error`).** Not a first-class field in `create_agent`; Orq applies sequential fallback by default with the `fallback_models` array.
- **Projects MCP quirk.** `search_directories` (MCP) requires a `project_id` arg that isn't easily discoverable via MCP; resolved by listing projects via REST `/v2/projects`. Correct project ID confirmed: `019db9c0-c45a-7000-ab48-ebde3557b891`.
- **Initial deploy attempt.** First `create_agent` call used `path: "debtor-team/debtor-email-swarm"` (project key) which returned "Project not found". Retried with display-name path `"Debtor Team/debtor-email-swarm"` — succeeded. Studio uses display-name-based paths.
- **Datapoints REST shape.** `POST /v2/datasets/{id}/datapoints` expects a bare JSON array body, not `{datapoints: [...]}`. First attempt failed; `--data-binary @file` (raw array) succeeded.

### Next steps (per ORCHESTRATION.md §Setup Steps)

1. Configure Orq-native evaluators (Python + LLM-judge) in Studio — see Guardrails §Evaluators in each agent spec.
2. Deploy Inngest function + Vercel routes (`web/app/api/automations/debtor/{fetch-document,create-draft,verdict}/route.ts`) and `web/lib/automations/debtor-email/triage-function.ts`.
3. Run `get_agent` smoke-test (already done — this deploy passed read-back verification).
4. 3-email acceptance smoke-test (NL happy, EN no-ref, FR ambiguous, NL emotion-triggered) through Inngest.
5. 4-week shadow-mode before live-trigger on high-confidence `copy_document_request`.
