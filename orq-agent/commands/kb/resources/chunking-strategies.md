# Chunking Strategies (KBM-03)

Single-consumer resource for `/orq-agent:kb` and `kb-generator` subagent. Documents the content-type-driven chunking decision rule.

## Decision Rule

| Content Type | Indicators | Strategy | Chunk Size | Overlap | Reason |
|--------------|-----------|----------|------------|---------|--------|
| Prose | `.md` with few H2s (< 5 per 1000 lines), `.txt`, `.pdf` narrative | **sentence** | 512 | 50 | Preserves sentence boundaries; retrieval returns complete thoughts |
| Structured | `.md` with many H2s/H3s (≥ 5 per 1000 lines), `.html`, `.json`, code (`.py`, `.ts`, `.js`) | **recursive** | 1024 | 100 | Respects heading/block boundaries; retrieval returns coherent sections |

## Detection Heuristic (bash)

    H2_COUNT=$(grep -cE '^##? ' "$source_file" 2>/dev/null || echo 0)
    LINE_COUNT=$(wc -l < "$source_file")
    DENSITY=$(echo "scale=4; $H2_COUNT * 1000 / $LINE_COUNT" | bc)
    if [[ "$ext" =~ ^(html|json|py|ts|js)$ ]] || (( $(echo "$DENSITY >= 5" | bc -l) )); then
      strategy="recursive"
    else
      strategy="sentence"
    fi

## Why These Defaults

- **Sentence 512/50:** Cohere + OpenAI embedding models have 512-token sweet spot for prose recall; 50 overlap preserves cross-sentence context.
- **Recursive 1024/100:** Structured docs benefit from larger chunks that capture full heading blocks; higher overlap prevents boundary cuts at H3 transitions.

## Override Guidance

Users can override via `--chunking <strategy>:<size>:<overlap>` flag on `/orq-agent:kb`. Override is logged in KB metadata with `reason: "user-override"`.

## Examples

- **Policies handbook** (`.md`, 15 H2s in 3000 lines) → density 5.0 → **recursive**, 1024/100
- **FAQ page** (`.md`, 3 H2s in 1500 lines) → density 2.0 → **sentence**, 512/50
- **API reference** (`.json`) → structured by extension → **recursive**, 1024/100
- **Product brochure** (`.pdf`) → prose by extension → **sentence**, 512/50

## Related

- `/orq-agent:kb` Step 7.1.5 (chunking picker)
- `orq-agent/agents/kb-generator.md` "Chunking Strategy Policy" section
- `retrieval-test-template.md` (next file — chunking directly impacts retrieval quality)
