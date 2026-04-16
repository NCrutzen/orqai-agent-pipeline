## ARCHITECTURE COMPLETE

**Swarm name:** smeba-sales-swarm
**Agent count:** 4 (orchestrator + 3 sub-agents)
**Pattern:** parallel-with-orchestrator
**Complexity justification:** Three agents are justified by two distinct complexity-gate criteria. (1) **Fundamentally different tool sets:** the classifier needs no external I/O beyond the raw email payload, while the context-retrieval step requires two independent HTTP backends (SugarCRM via Zapier SDK + Supabase pgvector via Vercel route) that can be fanned out, and the draft-generator needs only the assembled context. Merging all three into one agent would force a single model to hold 14,647-chunk KB results + full CRM history + classification logic in one context window — increasing token cost and hallucination risk. (2) **Parallel execution benefit:** SugarCRM lookup and KB search are fully independent and benefit from concurrent execution inside the context-retrieval sub-agent, cutting wall-clock latency roughly in half compared to sequential execution.

---

### Amendments v2 (16 april 2026)

Three corrections applied after verifying the actual `search_kb` function signature:

1. **`search_kb` expects a pre-computed `vector(1536)`** — not a text string. A Vercel API route (`/api/automations/smeba/search-kb`) wraps the function: it accepts email text, generates the OpenAI `text-embedding-3-small` embedding server-side, calls `sales.search_kb()` via supabase-js (service role, bypasses PostgREST schema restriction), and returns chunks. Agents pass text only.
2. **Classifier adds `requires_action` flag** — necessary to surface actionable internal emails without generating drafts for them.
3. **Internal email fast-path** — `internal` emails are classified only. If `requires_action=true`, they surface in the human review UI. If `requires_action=false`, they are logged and skipped. No drafts are generated for internal emails.

### Amendments v3 (16 april 2026)

One architectural correction after discovering the Zapier SDK requires Zapier-native infrastructure and cannot run in Vercel API routes:

4. **CRM lookup verschoven naar Zapier** — De `sugarcrm-search` Vercel route is verwijderd. In plaats daarvan haalt de Zapier Zap bij elke nieuwe email al het SugarCRM account, recente cases en offertes op, en stuurt die mee in de webhook payload naar de Cloudflare Worker. De context agent heeft daardoor geen `sugarcrm_search` tool meer nodig — CRM data zit al in de input payload van de orchestrator. Dit past in de Zapier-first aanpak en vereenvoudigt de context agent aanzienlijk.

---

### Agents

#### 1. smeba-sales-orchestrator-agent
- **Role:** Orchestrator
- **Responsibility:** Receives the raw email payload from the Cloudflare Worker (triggered by Zapier). Applies routing logic based on classifier output:
  - `auto_reply` / `spam` → UPSERT to Supabase, stop. No retrieval, no draft.
  - `internal` + `requires_action=false` → UPSERT to Supabase, stop.
  - `internal` + `requires_action=true` → UPSERT with `requires_human_review=true`, stop. No draft — but email surfaces in review UI.
  - All other categories → fan out to context-retrieval, then draft generation.
  Writes final result to `sales.email_analysis` via Supabase REST API (upsert on `email_id`).
- **Model recommendation:** `anthropic/claude-sonnet-4-6`
- **Fallback models:** `openai/gpt-4o`, `google-ai/gemini-2.5-pro`
- **Tools needed:**
  - `retrieve_agents` — discover available sub-agents in the team
  - `call_sub_agent` — invoke classifier, context-retrieval, and draft-generator sub-agents
  - HTTP function tool: `supabase_write_draft` — POST to `https://mvqjhlxfvtqqubqgdvhz.supabase.co/rest/v1/sales.email_analysis` with `Prefer: resolution=merge-duplicates` header (upsert on `email_id`). Writes fields: `email_id`, `category`, `email_intent`, `ai_summary`, `requires_action`, `draft_response`, `draft_status`, `requires_human_review`, `crm_match`.
- **Knowledge base:** none
- **KB description:** N/A — KB is in Supabase pgvector, accessed via Vercel route in the context-retrieval sub-agent
- **Receives from:** User input / Zapier webhook (via Cloudflare Worker)
- **Passes to:** smeba-sales-classifier-agent (always first), then conditionally to smeba-sales-context-agent and smeba-sales-draft-agent; writes final output to Supabase REST API

---

#### 2. smeba-sales-classifier-agent
- **Role:** Sub-agent — Email classifier and intent router
- **Responsibility:** Takes the raw email (subject, body, sender, metadata) and outputs a structured JSON object:
  - `category` — one of 11 values: `quote`, `order`, `service`, `contract`, `admin`, `finance`, `complaint`, `auto_reply`, `spam`, `internal`, `other`
  - `email_intent` — one of 31 intents (see taxonomy in system prompt)
  - `confidence` — float 0–1
  - `language` — `nl` or `en`
  - `is_auto_reply` — boolean
  - `requires_action` — boolean: does this email require a human or automated action? For `internal` emails: is someone being asked to do something? For `auto_reply`/`spam`: always false.
  - `ai_summary` — ≤50 words describing what the email is about and what action (if any) is needed
  - `urgency` — `low`, `medium`, `high`, `critical`
  Returns nothing else — no KB calls, no CRM calls. Structured output enforced via `response_format` with `json_schema` (prompt-only JSON fails 15–20% of the time per project patterns — non-negotiable).
- **Model recommendation:** `anthropic/claude-3-5-haiku-20241022`
- **Fallback models:** `openai/gpt-4o-mini`, `groq/llama-3.3-70b-versatile`
- **Tools needed:** None — classification is pure text reasoning on the email payload
- **Knowledge base:** none
- **KB description:** N/A
- **Receives from:** smeba-sales-orchestrator-agent (raw email payload: subject, body, sender, date)
- **Passes to:** smeba-sales-orchestrator-agent (structured classification JSON)

---

#### 3. smeba-sales-context-agent
- **Role:** Sub-agent — KB search
- **Responsibility:** Receives the email body text + classification output (category, email_intent). Executes one retrieval: semantic search over the Smeba KB via the `smeba_search_kb` Vercel route — POST to `/api/automations/smeba/search-kb` with `{ query: "<email body text>", intent: "...", category: "...", chunk_types: ["email_qa_pair", "outbound_template"], limit: 10 }`. The Vercel route handles OpenAI embedding generation and `sales.search_kb()` call internally. Returns array of KB chunks with `content`, `chunk_type`, `similarity`, `metadata`. CRM data (account, cases, quotes) is NOT retrieved here — it arrives pre-fetched in the orchestrator's input payload from Zapier.
- **Model recommendation:** `anthropic/claude-3-5-haiku-20241022`
- **Fallback models:** `openai/gpt-4o-mini`, `groq/llama-3.3-70b-versatile`
- **Tools needed:**
  - HTTP function tool: `smeba_search_kb` — POST to `{{AGENT_WORKFORCE_BASE_URL}}/api/automations/smeba/search-kb`. Accepts plain text query; embedding generated server-side. Returns top-10 KB chunks. **Note:** the `sales` schema is not exposed via PostgREST and `search_kb` expects a pre-computed `vector(1536)` — both handled inside the Vercel route.
- **Knowledge base:** none
- **KB description:** N/A — KB is in Supabase pgvector (`sales.kb_chunks`, 14,647 chunks). Accessed via `smeba_search_kb` Vercel route.
- **Receives from:** smeba-sales-orchestrator-agent (email body + classification JSON)
- **Passes to:** smeba-sales-orchestrator-agent (`{ kb_chunks[] }`)

---

#### 4. smeba-sales-draft-agent
- **Role:** Sub-agent — Draft response generator
- **Responsibility:** Receives the full assembled context: original email, classification (category, email_intent, language, urgency), CRM account history (or `crm_match: false`), and KB chunks (similar past Q&A pairs + outbound templates). Generates a `draft_response` in Dutch (or English if `language=en`), matching Smeba Brandbeveiliging's established tone — professional, direct, fire-safety domain expertise. Uses KB outbound templates as primary style reference and Q&A pairs for factual grounding. Also outputs:
  - `routing_decision`: `auto_handle` (high-confidence standard request, strong KB match, similarity > 0.85) or `human_review` (complaints, complex multi-intent, low KB similarity, no CRM match, urgency=critical)
  - `draft_confidence`: float 0–1
  The draft is labelled as a concept-antwoord for Andrew Cosgrove's review — no email is sent at this stage.
- **Model recommendation:** `anthropic/claude-sonnet-4-6`
- **Fallback models:** `openai/gpt-4o`, `google-ai/gemini-2.5-pro`
- **Tools needed:** None — generation is pure reasoning on the assembled context passed by the orchestrator
- **Knowledge base:** none
- **KB description:** N/A — KB chunks arrive pre-retrieved in the context payload from the orchestrator via smeba-sales-context-agent
- **Receives from:** smeba-sales-orchestrator-agent (assembled context packet)
- **Passes to:** smeba-sales-orchestrator-agent (`{ draft_response, routing_decision, draft_confidence }`)

---

### Orchestration

- **Orchestrator:** smeba-sales-orchestrator-agent
- **Agent-as-tool assignments:**
  - `smeba-sales-classifier-agent` — tool of `smeba-sales-orchestrator-agent` (always called first)
  - `smeba-sales-context-agent` — tool of `smeba-sales-orchestrator-agent` (called only for non-fast-path categories)
  - `smeba-sales-draft-agent` — tool of `smeba-sales-orchestrator-agent` (called only for non-fast-path categories, after context is assembled)

- **Data flow:**
  ```
  Zapier Zap (trigger: new email in SugarCRM)
    → Zapier haalt CRM data op (account, cases, quotes) via SugarCRM acties
    → Cloudflare Worker (bridges Zapier 15s timeout)
      → smeba-sales-orchestrator-agent (payload bevat: email + crm_account + crm_cases + crm_quotes)

          → [1] smeba-sales-classifier-agent (email body + subject + sender)
                 ← { category, email_intent, confidence, language, is_auto_reply,
                     requires_action, ai_summary, urgency }

          ROUTING (orchestrator decides):
          ├─ auto_reply / spam
          │    → UPSERT Supabase { category, requires_human_review: false }
          │    → STOP
          │
          ├─ internal + requires_action=false
          │    → UPSERT Supabase { category, email_intent, ai_summary, requires_human_review: false }
          │    → STOP
          │
          ├─ internal + requires_action=true
          │    → UPSERT Supabase { category, email_intent, ai_summary,
          │                        requires_human_review: true, draft_status: 'needs_review' }
          │    → STOP  (surfaces in Andrew's review UI — no draft)
          │
          └─ all other categories (quote, order, service, admin, contract, finance, complaint, other)
               → [2] smeba-sales-context-agent (email body + classification)
                      ← { kb_chunks[] }   ← KB only; CRM al in payload
               → [3] smeba-sales-draft-agent (email + classification + crm_data + kb_chunks)
                      ← { draft_response, routing_decision, draft_confidence }
               → UPSERT Supabase { category, email_intent, ai_summary, urgency, requires_action,
                                   draft_response, draft_status: 'pending_review',
                                   requires_human_review, crm_match }
  ```

- **Parallelism note:** Steps [1] en [2] zijn sequentieel — classificatie moet klaar zijn voordat de KB search de juiste `category` en `email_intent` filters kan meegeven. Stap [2] doet nu alleen nog de KB search (geen CRM meer). Step [3] wacht op [2].

- **Error handling:**
  - **Classifier failure:** Default to `category=other`, `email_intent=unknown`, `requires_action=true`, proceed with full flow. A degraded draft is better than silence.
  - **SugarCRM timeout/error:** Context agent returns `crm_match: false, crm_error: true`. Draft agent generates a generic (non-personalized) draft. Orchestrator sets `requires_human_review: true`.
  - **KB search failure:** Context agent returns `kb_chunks: []`. Draft agent falls back to Smeba domain knowledge in its system prompt. Orchestrator sets `requires_human_review: true`.
  - **Draft agent failure:** Orchestrator writes `draft_response: null`, `draft_status: 'error'`, `requires_human_review: true` to Supabase.
  - **Supabase write failure:** Orchestrator retries once (2s delay). On second failure, returns error to Cloudflare Worker → Zapier alert.

---

### Traffic cost profile

| Path | Categories | % of traffic | Agents used | Cost |
|------|-----------|-------------|-------------|------|
| Fast-path (skip) | auto_reply, spam | ~9% | Classifier (Haiku) | Minimal |
| Fast-path (log) | internal, requires_action=false | ~18% est. | Classifier (Haiku) | Minimal |
| Fast-path (flag) | internal, requires_action=true | ~4% est. | Classifier (Haiku) | Minimal |
| Full flow | all other | ~69% | Classifier + Context + Draft | Standard |

**~31% of traffic handled with Haiku-only cost.**

---

### Orq.ai Configuration Notes

**team_of_agents for orchestrator:**
```json
{
  "key": "smeba-sales-orchestrator-agent",
  "team_of_agents": [
    "smeba-sales-classifier-agent",
    "smeba-sales-context-agent",
    "smeba-sales-draft-agent"
  ],
  "settings": {
    "tools": [
      { "type": "retrieve_agents" },
      { "type": "call_sub_agent" },
      { "type": "function", "name": "supabase_write_draft" }
    ]
  }
}
```

**response_format enforcement (classifier):**
`smeba-sales-classifier-agent` MUST use `response_format` with `json_schema`. Not negotiable per MR project patterns.

**Vercel route to build:**
`/api/automations/smeba/search-kb` — accepts `{ query: string, intent?, category?, chunk_types?, limit? }`, generates OpenAI embedding, calls `sales.search_kb()` via supabase-js (service role). This route is a prerequisite before the swarm can be deployed.

**Timeout budget:**
- Classifier: ~3–5s
- Context retrieval (SugarCRM + KB Vercel route, approx. parallel): ~8–12s (includes ~200ms embedding generation inside route)
- Draft generation: ~10–15s
- Supabase write: ~1–2s
- **Total full path:** ~25–35s — within Cloudflare Worker headroom
- **Fast paths:** ~3–5s (classifier only)
