# Retrieval Quality Test Template (KBM-01)

Single-consumer resource for `/orq-agent:kb` Step 7.6. Provides sample queries and pass criteria for the post-chunking retrieval quality test that gates wire-up.

## Pass Criterion

**Default threshold:** 70% of sample queries return a chunk that semantically matches the intended source document.

**Configurable:** `--retrieval-threshold <N>` flag on `/orq-agent:kb` (integer 0-100).

**Judgment method:** LLM-judge with binary Pass/Fail per query, OR explicit user confirmation in interactive mode.

## Sample Query Generation

Generate 5-10 natural questions per KB from document headings. Examples:

| Source Heading | Generated Query |
|----------------|-----------------|
| `### Refund Policy` | "How do I get a refund?" |
| `## Billing FAQ` | "Where do I update my credit card?" |
| `### Shipping Times` | "When will my order arrive?" |
| `## Account Setup` | "How do I create an account?" |
| `### Password Reset` | "I forgot my password, what now?" |
| `## API Rate Limits` | "How many requests can I make per minute?" |

Use a capable LLM (the project's current spec-generator model) to synthesize the queries. Prompt shape:

    Given the heading "{heading}" from a {kb_name} document, generate ONE natural question a user would ask whose answer would be found in that section. Keep it to 10 words or fewer. Do not include the heading text literally.

## Test Execution

For each query:

1. Call MCP `search_entities` with `type=knowledge_chunks, knowledge_id=$KB_ID, query=$QUERY`. Fall back to REST `POST /v2/knowledge/$KB_ID/search`.
2. Take the top-1 chunk returned.
3. LLM-judge: "Does this chunk answer the query `{query}`? Respond PASS or FAIL only."
4. Record result.

## Failure Remediation (Surface on Threshold Miss)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► KB — Retrieval Quality Test Failed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Retrieval quality: <X>% passed (threshold: <N>%).

KB NOT wired to deployment.

Remediation options:
  1. Reduce chunk_size (try 256 for sentence / 512 for recursive)
  2. Switch chunking strategy (sentence ↔ recursive)
  3. Re-ingest with cleaner source files (remove boilerplate)
  4. Lower threshold explicitly via --retrieval-threshold <N>
```

## Output Format

Store results at `{swarm-dir}/kb-content/{kb-name}/retrieval-test.json`:

    {
      "kb_name": "<kb-name>",
      "threshold": 70,
      "passed": 8,
      "failed": 2,
      "pass_rate": 0.80,
      "queries": [
        {"query": "How do I get a refund?", "top_chunk": "...", "judge": "PASS"},
        ...
      ],
      "wire_up": "allowed" | "refused"
    }

## Related

- `/orq-agent:kb` Step 7.6 (retrieval quality test)
- `chunking-strategies.md` (chunk choice directly impacts retrieval quality)
- `kb-vs-memory.md` (retrieval test only applies to KBs, not memory stores)
