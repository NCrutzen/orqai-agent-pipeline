# KB vs Memory Decision Rule (KBM-04)

Single-consumer resource for `/orq-agent:kb` and `memory-store-generator` subagent. Documents the decision rule that prevents docs-in-memory and conversation-in-KB anti-patterns.

## The Rule (Lint-Anchored — Exact Phrasing)

- **KB (static reference data):** Docs, FAQs, product catalogs, policies, structured knowledge. Chunked + embedded + queried by similarity.
- **Memory Store (dynamic user context):** Session history, preferences, per-user facts. Keyed + written at runtime by agent decisions.
- **Block:** Memory for docs/FAQs → use KB. KB for conversation context → use Memory Store.

## Decision Matrix

| User Intent | Correct Tool | Rationale |
|-------------|--------------|-----------|
| "Store our return policy so the agent can cite it" | **KB** | Static reference, chunkable, retrieval-by-similarity |
| "Remember this user's shipping address across sessions" | **Memory Store** | Dynamic per-user, keyed write, runtime update |
| "Give the agent access to our product catalog" | **KB** | Static reference, chunkable by SKU/category |
| "Track what this user asked about last session" | **Memory Store** | Dynamic per-user, temporal context |
| "Store FAQ content" | **KB** | Static reference; common mistake to put in memory |
| "Keep last-N conversation turns for the LLM" | **Memory Store** | Dynamic per-session; common mistake to put in KB |

## Blocked Patterns

These requests MUST trigger a STOP + redirect in the slash command / subagent:

1. "Store product catalog in memory" → Block. Redirect to `/orq-agent:kb --mode kb`.
2. "Use KB for last-N user turns" → Block. Redirect to `/orq-agent:kb --mode memory`.
3. "Use memory for FAQ" → Block. Redirect to `/orq-agent:kb --mode kb`.
4. "Store user preferences as a KB" → Block. Redirect to `/orq-agent:kb --mode memory`.

## Why This Matters

KBs are chunked + embedded at ingestion time. Writing user-specific data into a KB means every new datapoint triggers a re-embedding cycle — prohibitively expensive.

Memory stores have no similarity search. Putting docs into memory forces exact-key lookups, which means the LLM has to guess the right key instead of querying by natural language.

The rule is not stylistic — violating it breaks either cost or retrieval quality.

## Related

- `/orq-agent:kb` "KB-vs-Memory Decision Rule" section
- `orq-agent/agents/memory-store-generator.md` embedded rule
- `orq-agent/agents/kb-generator.md` Constraints (NEVER use memory-style stores for static reference data)
