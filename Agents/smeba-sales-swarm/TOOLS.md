# Tools: smeba-sales-swarm

## Swarm Tool Landscape

> All capabilities needed across the swarm. Each mapped to an Orq.ai tool type with rationale.

| Capability | Tool Type | Tool | Agents | Rationale |
|-----------|-----------|------|--------|-----------|
| Discover and invoke sub-agents | built-in | `retrieve_agents` + `call_sub_agent` | smeba-sales-orchestrator-agent | Orq.ai native multi-agent orchestration — zero config, no external dependency |
| Semantic KB search (sales emails + templates) | function | `smeba_search_kb` | smeba-sales-context-agent | `sales.search_kb()` requires a pre-computed `vector(1536)` and is in a schema not exposed via PostgREST. The Vercel route handles OpenAI embedding generation + supabase-js service-role call internally. The function tool type gives us a typed interface; the agent passes text only. |
| Persist analysis + draft to Supabase | http | `supabase_write_draft` | smeba-sales-orchestrator-agent | The `sales.email_analysis` table is directly accessible via Supabase REST API (correct grants in place). No intermediary layer needed — direct HTTP upsert is the simplest, most reliable path. |
| Email classification and intent routing | — | none | smeba-sales-classifier-agent | Pure text reasoning on the raw email payload. No external I/O needed. Structured output enforced via `response_format` with `json_schema` at the Orq.ai agent level. |
| Draft response generation | — | none | smeba-sales-draft-agent | Pure generation on assembled context (email + classification + CRM data from Zapier payload + KB chunks). No tools required. |
| SugarCRM account + history lookup | — | none (Zapier) | — | **Verschoven naar Zapier Zap (v3).** De Zapier SDK vereist Zapier-native infrastructuur en kan niet vanuit Vercel draaien. De Zap haalt account, cases en quotes op bij de trigger en stuurt die mee in de webhook payload. De orchestrator geeft CRM data rechtstreeks door aan de draft agent — geen agent tool nodig. |

> **Alternatives considered:**
> - `smeba_search_kb`: Could be a direct Supabase RPC `http` tool, but `sales` schema is not exposed via PostgREST and the vector parameter cannot be generated inside an HTTP tool config — the Vercel route is mandatory.
> - `sugarcrm_search` (removed in v3): Originally a Vercel proxy to Zapier SDK, but Zapier SDK requires Zapier-native auth that is unavailable outside Zapier infrastructure. Moved to Zapier Zap as a pre-fetch step before the webhook fires.

---

## Shared Tools

No tools are shared across multiple agents in this swarm. `smeba_search_kb` is exclusive to the context agent; `supabase_write_draft`, `retrieve_agents`, and `call_sub_agent` are exclusive to the orchestrator. The classifier and draft agents have no tools. CRM data is pre-fetched by the Zapier Zap and arrives in the orchestrator payload — no agent tool needed.

---

## Per-Agent Tool Assignments

### smeba-sales-orchestrator-agent

**Built-in:**

```json
[
  { "type": "retrieve_agents" },
  { "type": "call_sub_agent" }
]
```

**MCP:** Not applicable for this agent.

**Function:** Not applicable for this agent.

**HTTP — `supabase_write_draft`:**

Upserts the analysis result and draft response into `sales.email_analysis`. Uses `Prefer: resolution=merge-duplicates` for upsert behaviour on `email_id`.

```json
{
  "type": "http",
  "blueprint": {
    "url": "https://mvqjhlxfvtqqubqgdvhz.supabase.co/rest/v1/sales.email_analysis",
    "method": "POST",
    "headers": {
      "apikey": "{{SUPABASE_SERVICE_ROLE_KEY}}",
      "Authorization": "Bearer {{SUPABASE_SERVICE_ROLE_KEY}}",
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates"
    },
    "body": {
      "email_id": "{{email_id}}",
      "category": "{{category}}",
      "email_intent": "{{email_intent}}",
      "ai_summary": "{{ai_summary}}",
      "urgency": "{{urgency}}",
      "requires_action": "{{requires_action}}",
      "draft_response": "{{draft_response}}",
      "draft_status": "{{draft_status}}",
      "requires_human_review": "{{requires_human_review}}",
      "crm_match": "{{crm_match}}"
    }
  }
}
```

**Code:** Not applicable for this agent.

---

### smeba-sales-classifier-agent

**Built-in:** Not applicable for this agent — classification is pure text reasoning; no external I/O.

**MCP:** Not applicable for this agent.

**Function:** Not applicable for this agent.

**HTTP:** Not applicable for this agent.

**Code:** Not applicable for this agent.

> This agent uses zero tools. Structured output is enforced via `response_format` with `json_schema` at the Orq.ai agent configuration level (not a tool). The output schema is:
>
> ```json
> {
>   "type": "object",
>   "properties": {
>     "category": {
>       "type": "string",
>       "enum": ["quote", "order", "service", "contract", "admin", "finance", "complaint", "auto_reply", "spam", "internal", "other"]
>     },
>     "email_intent": { "type": "string" },
>     "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
>     "language": { "type": "string", "enum": ["nl", "en"] },
>     "is_auto_reply": { "type": "boolean" },
>     "requires_action": { "type": "boolean" },
>     "ai_summary": { "type": "string", "description": "Max 50 words — what the email is about and what action (if any) is needed" },
>     "urgency": { "type": "string", "enum": ["low", "medium", "high", "critical"] }
>   },
>   "required": ["category", "email_intent", "confidence", "language", "is_auto_reply", "requires_action", "ai_summary", "urgency"]
> }
> ```

---

### smeba-sales-context-agent

**Built-in:** Not applicable for this agent.

**MCP:** Not applicable for this agent.

> **Note (v3):** SugarCRM lookup is handled by the Zapier Zap before the webhook fires. CRM data (account, cases, quotes) arrives pre-fetched in the orchestrator payload. This agent only performs KB search.

**Function — `smeba_search_kb`:**

Semantic search over the Smeba sales knowledge base (14,647 chunks: email Q&A pairs + outbound templates). Passes plain text to the Vercel route, which generates the OpenAI `text-embedding-3-small` embedding server-side and calls `sales.search_kb(vector(1536), ...)` in Supabase via supabase-js (service role). Direct Supabase RPC from the agent is impossible — the `sales` schema is not exposed via PostgREST and the function expects a pre-computed vector.

```json
{
  "type": "function",
  "function": {
    "name": "smeba_search_kb",
    "description": "Semantic search over the Smeba Brandbeveiliging sales knowledge base (14,647 chunks). Pass the email body text as the query; embedding generation happens server-side. Returns the top matching chunks ranked by similarity. Use chunk_types to filter by email Q&A pairs or outbound templates. Do NOT call Supabase RPC directly — always call this function.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "The email body text to search against. Do not pre-process or truncate — pass the full body. Embedding is generated server-side."
        },
        "intent": {
          "type": "string",
          "description": "Optional. The email_intent value from the classifier output (e.g. 'quote_request', 'complaint_service'). Used to bias search results."
        },
        "category": {
          "type": "string",
          "description": "Optional. The category value from the classifier output (e.g. 'quote', 'service'). Used to filter or bias results."
        },
        "chunk_types": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": ["email_qa_pair", "outbound_template"]
          },
          "description": "Optional. Filter results to specific chunk types. Omit to return all types. Use ['outbound_template'] when looking for style references, ['email_qa_pair'] when looking for factual Q&A grounding."
        },
        "limit": {
          "type": "integer",
          "description": "Optional. Maximum number of chunks to return. Default: 10. Max recommended: 20.",
          "default": 10,
          "minimum": 1,
          "maximum": 20
        }
      },
      "required": ["query"]
    }
  }
}
```

> **Backend handler:** `POST {{AGENT_WORKFORCE_BASE_URL}}/api/automations/smeba/search-kb`
> Headers: `Content-Type: application/json`, `x-api-key: {{SMEBA_INTERNAL_API_KEY}}`
> Body: `{ "query": "...", "intent": "...", "category": "...", "chunk_types": [...], "limit": 10 }`
>
> Expected response shape:
> ```json
> {
>   "chunks": [
>     {
>       "id": "uuid",
>       "chunk_type": "email_qa_pair",
>       "content": "Q: ... A: ...",
>       "similarity": 0.91,
>       "metadata": { "source": "...", "category": "...", "intent": "..." }
>     }
>   ]
> }
> ```

**HTTP:** Not applicable for this agent.

**Code:** Not applicable for this agent.

---

### smeba-sales-draft-agent

**Built-in:** Not applicable for this agent — all required context (email, classification, CRM data, KB chunks) arrives pre-assembled in the input payload from the orchestrator.

**MCP:** Not applicable for this agent.

**Function:** Not applicable for this agent.

**HTTP:** Not applicable for this agent.

**Code:** Not applicable for this agent.

> This agent uses zero tools. It generates the draft response by reasoning over the full context packet. Its structured output fields (`draft_response`, `routing_decision`, `draft_confidence`) are returned to the orchestrator for the Supabase write.

---

## Setup Instructions

### Supabase (supabase_write_draft HTTP tool)

**Service:** Supabase REST API — direct table write, no intermediary.

1. Obtain the `SUPABASE_SERVICE_ROLE_KEY` from `web/.env.local` in the agent-workforce repo (or from Vercel project environment variables).
2. Confirm that the `sales.email_analysis` table exists and the service role key has INSERT and UPDATE privileges on it.
3. In Orq.ai Studio, navigate to the `smeba-sales-orchestrator-agent` settings and add the HTTP tool with the config JSON from the Per-Agent section above.
4. Replace `{{SUPABASE_SERVICE_ROLE_KEY}}` with the actual service role key in both the `apikey` and `Authorization` headers.
5. Verify by running a test POST from Orq.ai Studio or curl to confirm upsert behaviour (the `Prefer: resolution=merge-duplicates` header triggers upsert on `email_id` — ensure `email_id` has a UNIQUE constraint).

> **Note on `Prefer` header:** The `resolution=merge-duplicates` strategy requires a unique or primary key constraint on `email_id`. If the table uses a different conflict target, adjust the `Prefer` header to `resolution=merge-duplicates,on-conflict=email_id` or add an explicit upsert parameter depending on your Supabase PostgREST version.

---

### Zapier Zap — SugarCRM pre-fetch (vervangt sugarcrm_search tool)

**Status (v3):** CRM lookup is verschoven van een Vercel route naar de Zapier Zap. De Zapier SDK vereist Zapier-native infrastructuur.

De Zap voert deze stappen uit voordat de webhook naar de Cloudflare Worker gaat:
1. **Trigger:** New Email in SugarCRM (Emails module, team: Smeba Brandbeveiliging BV)
2. **Action:** Search Accounts — zoek op sender email domain
3. **Action:** Find Cases — gefilterd op account ID uit stap 2
4. **Action:** Find Quotes — gefilterd op account ID uit stap 2
5. **Webhook:** Stuur alles naar Cloudflare Worker met payload:
   ```json
   {
     "email_id": "...",
     "subject": "...",
     "body": "...",
     "sender_email": "...",
     "sender_name": "...",
     "crm_account": { ... },
     "crm_cases": [ ... ],
     "crm_quotes": [ ... ],
     "crm_match": true
   }
   ```

Vraag Sam Cody voor de exacte Zapier action/field configuratie voor de SugarCRM stappen.

---

### Vercel Route — smeba-search-kb (smeba_search_kb function tool)

**Route:** `POST /api/automations/smeba/search-kb`

**Status (as of blueprint v2, 16 april 2026):** This route is a prerequisite before the swarm can be deployed. It wraps `sales.search_kb(vector(1536), ...)` which is not accessible via PostgREST.

1. Build the route at `web/app/api/automations/smeba/search-kb/route.ts`.
2. Implement server-side:
   - Accept `{ query, intent?, category?, chunk_types?, limit? }`
   - Generate `text-embedding-3-small` embedding via OpenAI SDK (use `OPENAI_API_KEY` env var)
   - Call `sales.search_kb(embedding, ...)` via supabase-js with the service role key (bypasses PostgREST schema restriction)
   - Return `{ chunks: [{ id, chunk_type, content, similarity, metadata }] }`
3. Secure the route with `x-api-key` header check against `{{SMEBA_INTERNAL_API_KEY}}` (same key as the CRM route).
4. Deploy. Confirm `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are set in Vercel.
5. Assign the `smeba_search_kb` function tool to `smeba-sales-context-agent` in Orq.ai Studio, noting the tool ID.

---

### Environment Variables Required

| Variable | Used By | Status | Purpose |
|----------|---------|--------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Orchestrator HTTP tool + Vercel search-kb route | Al in Vercel (27 dagen) | Supabase writes + supabase-js service role calls |
| `SMEBA_INTERNAL_API_KEY` | Vercel search-kb route | Toegevoegd aan Vercel + `.env.local` | Authenticeer agent calls naar interne Vercel route |
| `OPENAI_API_KEY` | Vercel search-kb route | Toegevoegd aan Vercel + in `.env.local` | `text-embedding-3-small` embedding generatie |
| `AGENT_WORKFORCE_BASE_URL` | Orq.ai agent variabele op context agent | Nog in te stellen in Orq.ai Studio | Base URL voor Vercel route (bijv. `https://agent-workforce.vercel.app`) |
