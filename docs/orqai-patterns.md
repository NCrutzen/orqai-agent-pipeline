# Orq.ai Patterns and Gotchas

Practical reference for agent creation, deployment, and testing on Orq.ai.
Based on lessons from Per100/eat-propper and agent-workforce projects.

---

## 1. Agent Creation via MCP

The `create_agent` MCP tool works reliably. The key requirement is completeness:
include all 18 agent fields and ALWAYS set `response_format` with `json_schema`
when you need structured output.

Relying on prompt-only JSON instructions has a 15-20% failure rate. The
`response_format` field is the only reliable way to guarantee valid JSON output.

**Key format:** `[domain]-[role]-agent` in kebab-case (e.g., `nutrition-planner-agent`).

**Model format:** `provider/model-name` (e.g., `anthropic/claude-sonnet-4-6`).

Always include 3-4 fallback models and `user_id` in metadata for cost tracking.

```json
{
  "key": "nutrition-planner-agent",
  "role": "Nutrition planning specialist",
  "description": "Plans daily meals based on user preferences and goals",
  "model": "anthropic/claude-sonnet-4-6",
  "fallback_models": [
    "openai/gpt-4o",
    "anthropic/claude-haiku-3-5",
    "google/gemini-2.0-flash"
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "meal_plan",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "meals": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": { "type": "string" },
                "calories": { "type": "number" }
              },
              "required": ["name", "calories"]
            }
          }
        },
        "required": ["meals"]
      }
    }
  },
  "metadata": {
    "user_id": "{{user_id}}"
  }
}
```

---

## 2. Agent Updates (THE CRITICAL GOTCHA)

MCP `update_agent` can silently fail. The call returns success but the agent
configuration is unchanged. This is the single most expensive mistake to debug.

**Rule: ALWAYS verify by reading the agent back after any update.**

```typescript
// Wrong — assumes update worked
await orq.agents.update(agentId, { instructions: newInstructions });

// Right — verify the update took effect
await orq.agents.update(agentId, { instructions: newInstructions });
const agent = await orq.agents.get(agentId);
if (agent.instructions !== newInstructions) {
  console.error("Update silently failed — falling back to delete + recreate");
  await orq.agents.delete(agentId);
  await orq.agents.create({ ...fullAgentConfig, instructions: newInstructions });
}
```

When changing instructions, tools, or settings, always do a full read-back.
If the update fails, delete and recreate the agent as a fallback.

---

## 3. Structured Output Configuration

Use the Orq.ai deployment config `response_format` with `json_schema`. This is the
2026 standard. Do NOT use legacy "JSON mode" — it does not enforce schema compliance.

**Schema and prompt must stay in sync.** If the schema requires a field, the prompt
must describe what that field should contain. Mismatches cause hallucinated values.

**Always validate with Zod on the client side:**

```typescript
import { z } from "zod";

const MealPlanSchema = z.object({
  meals: z.array(z.object({
    name: z.string(),
    food_ids: z.array(z.string()),
    calories: z.number(),
    protein_g: z.number(),
  })),
  total_calories: z.number(),
});

type MealPlan = z.infer<typeof MealPlanSchema>;

// After receiving Orq.ai response
const parsed = MealPlanSchema.safeParse(JSON.parse(response));
if (!parsed.success) {
  console.error("Schema validation failed:", parsed.error);
  // Handle retry or fallback
}
```

**Never trust LLM math.** If the agent returns `total_calories: 1850`, ignore it.
Calculate totals client-side from the individual meal values.

**Food ID / reference hallucination:** Use positive framing in prompts:
"Use ONLY IDs from the provided list" rather than "Do NOT invent IDs."

---

## 4. Prompt Engineering for Orq.ai

Use XML-tagged prompts for clear section boundaries:

```xml
<role>
You are a nutrition planning specialist for the Per100 app.
</role>

<task>
Create a {{meals_per_day}}-meal daily plan matching the user's calorie target
of {{calorie_target}} kcal using ONLY foods from the provided list.
</task>

<constraints>
- Use ONLY food IDs from the provided list
- Each meal must have at least one protein source
- Total calories must be within 5% of target
</constraints>

<output_format>
Return a JSON object matching the provided schema. Include food_ids as
an array of strings from the input list.
</output_format>

<examples>
Input: calorie_target=2000, meals_per_day=3
Output: {"meals": [{"name": "Breakfast", "food_ids": ["f_001", "f_042"], ...}]}
</examples>
```

**Extended thinking pattern:** Use `<thinking>` before `<answer>` tags.
Extract JSON from the `<answer>` block, falling back to raw response parsing:

```typescript
function extractAnswer(text: string): string {
  const answerMatch = text.match(/<answer>([\s\S]*?)<\/answer>/);
  if (answerMatch) return answerMatch[1].trim();
  // Fallback: try to parse the whole response as JSON
  return text.trim();
}
```

**Key principles:**
- Heuristic-first reasoning: describe step-by-step thinking process before output
- Positive framing over negative ("Use ONLY X" not "Do NOT use Y")
- Few-shot examples from real data when available
- Compact encoding with shortened keys for token efficiency in high-volume agents

---

## 5. Experiments and Testing (API, not MCP)

MCP experiment tools have issues with dataset-to-agent input mapping.
Datapoints need a `messages` field or explicit input mapping for agent experiments.
Use the REST API directly for reliable experiment workflows.

**Bulk upload datapoints:**

```bash
curl -X POST "https://api.orq.ai/v2/datasets/{dataset_id}/datapoints" \
  -H "Authorization: Bearer $ORQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "datapoints": [
      {
        "inputs": {
          "messages": [{"role": "user", "content": "Plan a 2000 kcal day"}]
        },
        "expected_output": "..."
      }
    ]
  }'
```

**Create and poll an experiment:**

```bash
# Create experiment
curl -X POST "https://api.orq.ai/v2/experiments" \
  -H "Authorization: Bearer $ORQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "planner-v2-accuracy",
    "dataset_id": "ds_abc123",
    "agent_key": "nutrition-planner-agent",
    "evaluators": ["accuracy", "schema_compliance"]
  }'

# Poll for results
curl "https://api.orq.ai/v2/experiments/{experiment_id}" \
  -H "Authorization: Bearer $ORQ_API_KEY"
```

**Testing workflow:**
1. Run 3x experiments for statistical significance.
2. Iterate on prompt/schema based on failure patterns.
3. Use a holdout dataset for final re-testing after iteration.

---

## 6. Server-Side SDK via Supabase Edge Functions

NEVER use the Orq.ai SDK client-side. API keys must stay server-side.

**Pattern:** Client -> Supabase Edge Function -> Orq.ai SDK -> Response

```typescript
// supabase/functions/generate-plan/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { Orq } from "https://esm.sh/@orq-ai/node@3.2.8?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // JWT verification
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const orq = new Orq({ apiKey: Deno.env.get("ORQ_API_KEY")! });

  const { prompt } = await req.json();
  const response = await orq.deployments.invoke({
    key: "nutrition-planner-agent",
    messages: [{ role: "user", content: prompt }],
    metadata: { user_id: user.id },
  });

  return new Response(JSON.stringify(response), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

**Client-side timeout must be 45+ seconds** to cover Orq.ai's 31-second internal
retry window. If you set a 30-second timeout, you will get false failures when
Orq.ai is retrying on a fallback model.

```typescript
const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-plan`, {
  method: "POST",
  headers: { Authorization: `Bearer ${session.access_token}` },
  body: JSON.stringify({ prompt }),
  signal: AbortSignal.timeout(45_000), // 45 seconds
});
```

---

## 7. Multi-Agent Orchestration

Three patterns, in order of preference:

1. **Single agent** -- default choice. Multi-agent must pass a complexity gate.
2. **Sequential pipeline** -- planner -> verifier -> retry loop.
3. **Parallel-with-orchestrator** -- chat agent orchestrates sub-agents via `call_sub_agent`.

**Application-layer orchestration for pipelines:**

```typescript
async function planWithVerification(input: PlanRequest): Promise<MealPlan> {
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Step 1: Plan
    const plan = await callAgent("nutrition-planner-agent", input);

    // Step 2: Verify
    const verification = await callAgent("nutrition-verifier-agent", {
      plan,
      constraints: input.constraints,
    });

    if (verification.passed) {
      return plan;
    }

    // Feed verification feedback into next attempt
    input = { ...input, feedback: verification.issues };
  }

  throw new Error("Plan failed verification after max retries");
}
```

**Key rules:**
- The verifier should NOT call the planner directly. The app layer manages retries
  (max 2 attempts).
- Independent agents (batch jobs, crons) should never have agent-to-agent calls.
  Keep them isolated and triggered by the application layer.

---

## 8. Knowledge Bases

Creating a KB-enabled agent does NOT populate the knowledge base. Document
ingestion is a separate operation that must happen before the agent can query it.

**Required tools on the agent:** `query_knowledge_base`, `retrieve_knowledge_bases`.

**Template variables in instructions** (e.g., `{{meals_per_day}}`) must be passed
in the `variables` object from the calling code:

```typescript
const response = await orq.deployments.invoke({
  key: "nutrition-planner-agent",
  messages: [{ role: "user", content: userMessage }],
  variables: {
    meals_per_day: "3",
    calorie_target: "2000",
  },
});
```

If you forget the `variables` object, the agent receives the literal string
`{{meals_per_day}}` in its instructions.

---

## 9. Orchestration: Inngest-per-step vs Orq agent-as-tool

Bij het ontwerpen van een swarm: kies per sub-taak tussen (a) een Orq-agent die zelf meerdere tools aanroept, of (b) Orq-agents die alléén LLM-reasoning doen en Inngest steps die tools uitvoeren.

### Beslisregel

- **LLM moet kiezen tussen tools op basis van semantische reasoning**
  → agent-as-tool binnen Orq (sub-agent doet zelf meerdere tool-calls)
- **Tool-volgorde is dwingend OF tool is duur/flaky (>5s latency OF retry-gevoelig)**
  → Inngest orchestreert tussen stappen; Orq.ai doet alleen LLM-calls
- **Altijd:** `variables.email_id` (of equivalent correlation key) in elke Orq-call voor cross-system trace-joinbaarheid (Orq traces ↔ Inngest timeline ↔ Supabase `agent_runs`)

### Waarom agent-as-tool faalt bij flaky/dure tools

- Orq heeft geen durable step-retry. Partial failure → hele agent-run opnieuw → dure tool-call wordt herhaald.
- HITL "wacht op human review" blokkeert een Orq-run; Inngest `step.waitForEvent` is durable en schaalbaar.
- Per-agent prompt-replay voor evals is makkelijker als elke agent standalone Orq-call is in plaats van geneste orchestrator-call.

### Concreet voorbeeld — debtor-email swarm

- `debtor-intent-agent` (Orq, geen tools) → emit classificatie
- Inngest routeert op basis van intent
- `debtor-copy-document-body-agent` (Orq, geen tools) → emit cover-HTML
- Inngest doet in code: `fetchDocument` → `createIcontrollerDraft` (beide HTTP-calls met step-retry; `fetchDocument`-resultaat gecached in step-output zodat `createDraft`-retry niet opnieuw 26s Zap-chain triggert)

### Anti-patroon

Copy-Document als één Orq-agent met 2 tool-calls: `fetchDocument` slaagt → `createDraft` faalt → hele agent-run failt → retry triggert opnieuw 26s Zap-chain voor PDF die we al hadden.

→ Cross-link: `docs/inngest-patterns.md` §step.run semantics.

---

## 10. Common Mistakes Checklist

Before shipping any Orq.ai agent, verify:

- [ ] Set `response_format` with `json_schema` (not just prompt instructions)
- [ ] Verify agent updates took effect (read back after update)
- [ ] Include fallback models (3-4)
- [ ] Include `user_id` in metadata
- [ ] Client timeout > 45s (covers Orq.ai retry window)
- [ ] Validate output with Zod
- [ ] Never trust LLM math -- calculate client-side
- [ ] Knowledge base populated (not just created)
- [ ] Variables object passed when using template variables
- [ ] Experiments via REST API (not MCP)
