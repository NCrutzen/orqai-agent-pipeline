# debtor-intent-agent: drop `maxItems` uit json_schema (primary 400't, elke call draait op fallback)

**Ontdekt:** 2026-06-11, tijdens Phase 113 sales go-live werk (trace `01KTTRPTN3KS6W6VVD3VE27RKR`).

**Probleem:** de primary van `debtor-intent-agent` (`anthropic/claude-sonnet-4-5-20250929`, Anthropic-direct) faalt op élke call met:

```
400 invalid_request_error — output_config.format.schema: For 'array' type, property 'maxItems' is not supported
```

De `ranked` array in `debtor-intent-agent-output-v3` heeft `maxItems: 5`. Anthropic structured outputs (én Bedrock) ondersteunen `maxItems` niet op arrays. Elke call valt daardoor stil terug op fallback #1 (`aws/eu.anthropic.claude-sonnet-4-5-20250929-v1:0`, Bedrock EU — zelfde modelfamilie, dus kwaliteitsimpact beperkt), maar:

- elke run betaalt een 400 + fallback-hop (latency);
- de primary-keuze is de facto dood — model-routing klopt niet meer met wat er draait;
- als fallback #1 ooit hapert, schuift het door naar `openai/gpt-4o`.

**Fix (zelfde als sales, commit `d30e206a`-reeks):** verwijder `maxItems: 5` uit de `ranked` array in de agent json_schema (agent PATCH + evt. `orq_agents.output_schema` + `intent-schema-registry.ts` waar van toepassing). De 1–5 bound blijft afgedwongen door de prompt + de server-side Zod-gate (`.max(5)`).

**Let op:** debtor Stage-3 routing is LIVE (niet gegate) — schema-wijziging raakt productie-dispatch direct. Operator-moment kiezen; na de PATCH één trace verifiëren (geen `span.fallback_selected` meer).

**Referentie:** sales-equivalent gefixt 2026-06-11 op `sales-intent-agent` v2.0.1 (Bedrock Haiku primary gaf identieke 400; alle 39 dry-run verdicts draaiden op `gpt-4.1-mini` fallback). Learning `96464ef4`.
