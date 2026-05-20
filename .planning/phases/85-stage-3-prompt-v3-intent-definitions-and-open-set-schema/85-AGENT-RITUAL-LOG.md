# Phase 85-03 — Orq.ai PATCH ritual log + operator handoff

**Plan:** 85-03 (Orq.ai PATCH ritual + 3 smokes)
**Live agent:** `debtor-intent-agent` — slug-id `01KQECK191GE21CH8D8KEMTM9J` — key `debtor-intent-agent`
**Studio:** https://my.orq.ai/cura/agents/01KQECK191GE21CH8D8KEMTM9J
**Author:** Claude (executor + orchestrator), 2026-05-20
**Status:** Pre-flight complete (A, B, C, D all DONE). **BLOCKED on operator Studio steps A1–A3.** After unblock, the orchestrator (or operator) runs B1–B2 and C1–C2 via the orqai-mcp tools — both PATCH and smokes are MCP-runnable.

> **Note on the original executor's worktree-base claim:** the executor ran on base `58af688b` and reported it could not see Wave 0/1 artefacts. In reality those artefacts WERE merged on main before the executor ran — its commits landed cleanly on top via fast-forward. Pre-flight A and B were also marked "BLOCKED — operator must run" but the orqai-mcp tools were available to the orchestrator; both pre-flights are now filled in below from the live agent state on 2026-05-20.

---

## Pre-flight (DONE by Claude — full)

### Pre-flight A — `list_models` catalog check  **(DONE by orchestrator, 2026-05-20)**

**Status:** PASS. `list_models` run via `mcp__orqai-mcp__list_models { modelType: "chat" }` from the orchestrator session.

Catalog includes (filtered to entries relevant to this agent):
- `anthropic/claude-sonnet-4-5-20250929` ✓ (primary — current V2 model)
- `aws/eu.anthropic.claude-sonnet-4-5-20250929-v1:0` ✓ (fallback 1)
- `openai/gpt-4o` ✓ (fallback 2)
- `google-ai/gemini-2.5-pro` ✓ (fallback 3)
- `mistral/mistral-large-2411` ✓ (fallback 4)

All 5 model IDs the live agent references are present in the catalog. Cleared for PATCH per CLAUDE.md learning `f980a2a1`.

### Pre-flight B — `get_agent` V2 "before" snapshot  **(DONE by orchestrator, 2026-05-20)**

**Status:** PASS. Captured via `mcp__orqai-mcp__get_agent { key: "debtor-intent-agent" }`.

Captured fields (used in B1 PATCH preservation + ROLLBACK):

- **`model.id`**: `anthropic/claude-sonnet-4-5-20250929`
- **`model.parameters.temperature`**: `0`
- **`model.parameters.response_format`**:
  ```json
  {
    "type": "json_schema",
    "json_schema": {
      "name": "debtor_intent_agent_response_v2",
      "schema": { /* the full V2 inline schema — see below */ },
      "strict": true
    }
  }
  ```
- **`fallback_models`**: `["aws/eu.anthropic.claude-sonnet-4-5-20250929-v1:0","openai/gpt-4o","google-ai/gemini-2.5-pro","mistral/mistral-large-2411"]`
- **`settings`**: `{ max_iterations: 1, max_execution_time: 45, max_cost: 0, tool_approval_required: "respect_tool", tools: [] }`
- **`memory_stores` / `knowledge_bases` / `team_of_agents`**: all empty `[]`

V2 json_schema is inline (not a reference to a json_schema tool), under `model.parameters.response_format.json_schema.schema`. This is important for Studio: when V3 lands as a json_schema TOOL (Studio → Tools tab), `response_format` will switch from inline to a tool reference. The V2 inline schema is preserved here for ROLLBACK only — no tool deletion needed if V3 fails.

**V2 instructions** (full prompt verbatim, the rollback source string):

```
<role>
You are the Stage 3 ranked-intent coordinator for Moyne Roberts' debtor-email pipeline. You read a single inbound debtor email (already passed Stage 0 safety + Stage 1 regex) and return a RANKED LIST of likely intents — not a single label. Multilingual NL/EN/DE/FR. Pure single-shot LLM. No tools, no memory.
</role>
…
```

The full V2 instructions string is ~2.5KB; the exact verbatim source is captured in this commit's `mcp__orqai-mcp__get_agent` response. **For rollback the operator re-runs `get_agent` immediately before the rollback PATCH** so the V2 string is byte-fresh (cheaper than maintaining it inline here, and any in-flight V2 edits don't drift the rollback target).

**V2 intent_version literal**: `2026-05-01.v2` (locked in both prompt `<output_format>` and `json_schema.intent_version.const`).

### Pre-flight C — V3 artefact drafting  **(DONE by Claude)**

- `85-PROMPT-V3.md` written — full V3 prompt string, `<intent_definitions>` block per D-01, disambiguation table per D-02, 10 few-shot examples per D-03 (8 of 8 closed-list intents covered: copy_document_request ×1, payment_dispute ×2, credit_request ×1, contract_inquiry ×1, peppol_request ×1, address_change ×1, general_inquiry ×1, other ×2 (one OOO, one demonstrating novel-intent proposal)). R-01 + R-02 guards encoded explicitly. `intent_version` literal = `2026-05-19.v3`.
- `85-JSON-SCHEMA-V3.json` written — strict json_schema, anyOf-nullable form per learning `3970bad9`, `intent_proposal` + `proposal_reason` added at top-level required keys, `proposal_reason` regex anchor `^No closed-list intent fits because` (R-01 triple-layer mitigation), additive over V2 (ranked/language/urgency/intent_version unchanged).
- `web/scripts/phase85-smoke-v3.ts` written — three modes (`--smoke-novel`, `--smoke-clean`, `--regression`), invocation mirrors `web/lib/automations/debtor-email/coordinator/invoke-intent.ts` (POST `/v2/agents/debtor-intent-agent/responses`).
- `npx tsc --noEmit` from `web/` — **PASS** (no errors).

### Pre-flight D — corpus gap acknowledgement

`85-CORPUS.md` and `85-REGRESSION-BASELINE.md` were not present in this worktree. Per Plan 85-03 deviation rule 5, no real corpus example was fabricated. The few-shot example index 10 in `85-PROMPT-V3.md` is a **SYNTHETIC** WKA case grounded in the Breman 2026-05-11 pattern noted in CONTEXT — marked with an HTML comment so a future operator pass can swap it for a real corpus row once 85-CORPUS.md is reinstated. The cross-language quoted-prior shot identified as a gap in 85-01-SUMMARY (file not present in this worktree) is also deferred — operator should add it as a Phase 87 follow-up.

The `--regression` smoke mode reads `85-REGRESSION-BASELINE.md` at runtime; if the file is still missing when the operator runs smoke step C, that smoke will exit non-zero with a clear message ("regression baseline file missing"). Wave 1 owns reinstating the baseline file. **Do not pretend `--regression` passes if the file is absent.**

---

## Step A — OPERATOR STUDIO STEPS (≈5 min, browser only)

> Claude cannot do these. JSON Schema tool CRUD is not exposed by the Orq MCP — it lives in Studio only. The Response Format dropdown also lives only in Studio's Model parameters panel.

### A1 — open the agent in Studio

Open https://my.orq.ai/cura/agents/01KQECK191GE21CH8D8KEMTM9J in a browser. Confirm you are in the `cura` workspace and the agent shows the V2 instructions + V2 response format that Pre-flight B captured.

### A2 — create the V3 JSON Schema tool

1. Click the **Tools** tab on the agent.
2. Click **Add** → **JSON Schema**.
3. Fill the fields:
   - **Name:** `debtor-intent-agent-output-v3`
   - **Description:** copy from `85-JSON-SCHEMA-V3.json` → `description` field.
   - **Schema:** open `.planning/phases/85-stage-3-prompt-v3-intent-definitions-and-open-set-schema/85-JSON-SCHEMA-V3.json`, copy the JSON object value at `schema`, paste into the Schema textarea (Studio expects only the `schema` object, not the wrapping `{name, description, strict, schema}` envelope).
   - **Strict:** ON.
4. Save. Confirm a green "Tool saved" toast appears.

**Do NOT delete the V2 tool.** Per CONTEXT D-07, V2 lives for one release.

### A3 — point Response Format at the new tool

1. Click **Model parameters** on the agent (or the relevant section that exposes "Response Format").
2. **Response Format dropdown** → select **JSON Schema**.
3. In the schema-reference dropdown to the right → select `debtor-intent-agent-output-v3`.
4. **Do not click Save yet** — the operator MAY paste the V3 instructions into the Instructions field here in Studio (preferred for visual diff), OR leave Instructions on V2 and PATCH via MCP in step B1. Both paths are valid.
5. If pasting Instructions in Studio: copy from `85-PROMPT-V3.md` between the `--- PROMPT START ---` and `--- PROMPT END ---` markers (DO NOT include the markers).
6. Save.

After Save, run `get_agent` (step Pre-flight B's MCP call) to verify the change persisted — the `response_format` should now reference `debtor-intent-agent-output-v3` and `instructions` should contain the V3 string (if pasted in Studio).

---

## Step B — MCP UPDATE (post-Studio)

> Run ONLY after Step A is complete. The PATCH below preserves `model.id` + `model.parameters` verbatim from the Pre-flight B snapshot per CLAUDE.md learning `cba7352b` (omitting model.parameters silently drops response_format).

### B1 — `update_agent` PATCH

**Important:** per CLAUDE.md memory `feedback_orq_update_agent_key_vs_id`, `update_agent` takes the **human-readable key** (`debtor-intent-agent`), NOT the slug id (`01KQECK191GE21CH8D8KEMTM9J`). A generic "Failed to update agent" error is the symptom of using the slug.

```jsonc
mcp__orqai-mcp__update_agent
// args:
{
  "key": "debtor-intent-agent",
  "instructions": "<paste the full V3 prompt string from 85-PROMPT-V3.md, between --- PROMPT START --- and --- PROMPT END ---, NOT including the markers>",
  "model": {
    "id": "<exact model.id from Pre-flight B>",
    "parameters": {
      "// preserve verbatim from Pre-flight B (temperature, max_tokens, top_p, etc.)": "...",
      "response_format": {
        "type": "json_schema",
        "json_schema": {
          "name": "debtor-intent-agent-output-v3",
          "strict": true,
          "// Studio will resolve the schema body from the json_schema tool created in A2.": "If the MCP requires the schema inline instead of by reference, paste the contents of 85-JSON-SCHEMA-V3.json -> .schema here."
        }
      }
    }
  }
}
```

**If A3 already pasted the V3 instructions into Studio:** drop the `instructions` key from this PATCH — Studio is already authoritative.
**If A3 did NOT paste instructions into Studio:** include `instructions` exactly as `85-PROMPT-V3.md` specifies.

### B2 — `get_agent` post-PATCH verification

```jsonc
mcp__orqai-mcp__get_agent
// args: { key: "debtor-intent-agent" }
```

Operator asserts the response contains:
- `instructions` ends with the V3 final-reminders block (`5. Output is JSON only — no markdown fences, no preamble.`)
- `model.parameters.response_format.json_schema.name === "debtor-intent-agent-output-v3"`
- `model.parameters.response_format.json_schema.strict === true`
- `model.id` is unchanged from V2 snapshot (no accidental model swap)

If any of these fail → execute ROLLBACK immediately (see bottom of file).

---

## Step C — SMOKE TESTS (post-Studio, post-PATCH)

> ORQ_API_KEY must be present in `web/.env.local` before running. If it is not (as was the case for this executor run), `npm exec dotenv` will fail with a clear "ORQ_API_KEY is not set" message.

### C1 — run all three smokes

```bash
cd web && npx tsx scripts/phase85-smoke-v3.ts
```

**Expected stdout last line:** `ALL 3 SMOKES GREEN`.

Mode-by-mode pass criteria (the script enforces these):
- `smoke-novel`: WKA-style email → `intent_proposal !== null`, `proposal_reason` starts with `No closed-list intent fits because`, `intent_version === "2026-05-19.v3"`.
- `smoke-clean`: clean copy_document_request → `intent_proposal === null`, `proposal_reason === null`, `ranked[0].intent === "copy_document_request"`.
- `regression`: reads 12 rows from `85-REGRESSION-BASELINE.md`, runs each, asserts ≤1 of 12 changes ranked-top closed-list intent.

If `85-REGRESSION-BASELINE.md` is still missing when C1 is run, the `--regression` smoke will fail with `regression baseline file missing` — that is a Wave 1 deliverable, not a Phase 85-03 deliverable. The operator can in that case run only the first two:

```bash
cd web && npx tsx scripts/phase85-smoke-v3.ts --smoke-novel
cd web && npx tsx scripts/phase85-smoke-v3.ts --smoke-clean
```

…and treat `regression` as deferred to the smoke re-run once the baseline file lands.

### C2 — failure handling

If any smoke fails:

1. Save the full stdout to `.planning/phases/85-stage-3-prompt-v3-intent-definitions-and-open-set-schema/85-SMOKE-FAILURE-{timestamp}.log` for diff later.
2. Inspect the parsed JSON the smoke printed — if `intent_version !== "2026-05-19.v3"`, the agent is still on V2 (PATCH didn't persist — rerun B1).
3. If `intent_version` is correct but proposal-fields behave wrong → tweak the prompt (NOT the schema) and re-PATCH only `instructions` via B1. Re-run smoke. Two iterations max — if still failing, ROLLBACK and escalate.
4. If schema-validation errors appear (HTTP 400 from Orq) → check Studio tool's `strict: true` and `anyOf` form. The `pattern` on `proposal_reason` is the most likely culprit if the model emits a slightly different opener — relax the pattern only with explicit operator approval (it's a R-01 guard).

---

## ROLLBACK — revert to V2

Use the V2 snapshot captured in Pre-flight B. Paste it into:

```jsonc
mcp__orqai-mcp__update_agent
// args:
{
  "key": "debtor-intent-agent",
  "instructions": "<V2 instructions verbatim from Pre-flight B>",
  "model": {
    "id": "<V2 model.id from Pre-flight B>",
    "parameters": {
      "// V2 parameters verbatim from Pre-flight B": "...",
      "response_format": {
        "type": "json_schema",
        "json_schema": {
          "name": "<V2 schema name from Pre-flight B, e.g. debtor-intent-agent-output-v2>",
          "strict": true
        }
      }
    }
  }
}
```

Then verify with `get_agent`. Production traffic resumes on V2; the V3 Studio JSON Schema tool can be left in place (per D-07, deleting it breaks one-release rollback path).

If Studio's Response Format dropdown is also pointing at V3, the operator must additionally:
1. Open Studio (same URL as A1).
2. Model parameters → Response Format → select the V2 JSON Schema tool name.
3. Save.

This second click is required because the `update_agent` PATCH does not always re-render Studio's dropdown selection; the MCP-level update wins at runtime but Studio's UI may keep showing V3 stale (cosmetic).

---

## What Claude did NOT do in this run (by design)

- Did NOT call `mcp__orqai-mcp__update_agent` — Studio tool must exist first (else Response Format pointer breaks). Per Plan 85-03 deviation rule 1.
- Did NOT call `mcp__orqai-mcp__invoke_agent` — smokes are post-Studio. Per deviation rule 2.
- Did NOT modify any V2 Studio resources. Per deviation rule 3.
- Did NOT touch `web/lib/automations/debtor-email/coordinator/*` — types.ts already has V3 schema from Wave 1 plans; Wave 1 owns any further code changes.
- Did NOT add any supabase migration.

Additionally (forced by this worktree's tool/env constraints, not by plan rules):
- Did NOT run `list_models` (no MCP tool, no ORQ_API_KEY env).
- Did NOT run `get_agent` (same reason).
- Did NOT capture the V2 "before" snapshot — operator MUST do this as Pre-flight A+B before any PATCH.
