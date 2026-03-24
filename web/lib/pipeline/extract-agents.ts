/**
 * Extract structured agent data from architect output using AI.
 *
 * Instead of fragile regex parsing, we ask the AI to extract the agents
 * as structured JSON. This works regardless of the architect's output format.
 */

const ORQ_ROUTER_URL = "https://api.orq.ai/v2/router/chat/completions";

export interface ExtractedAgent {
  name: string;
  role: string;
  model: string;
  tools: string[];
}

const EXTRACTION_PROMPT = `Extract all AI agents from the following architect output. Return ONLY a JSON array with this exact structure, no other text:

[
  {
    "name": "agent-key-name",
    "role": "Short role description",
    "model": "model/id or 'default'",
    "tools": ["tool1", "tool2"]
  }
]

Rules:
- Include ONLY actual agents (not orchestration patterns, references, or metadata)
- Use the agent key/name exactly as defined (kebab-case with -agent suffix)
- If tools are "none"/"geen" or empty, use an empty array []
- If model is not specified, use "default"
- Keep role descriptions short (under 10 words)`;

/**
 * Call Orq.ai to extract agents as structured JSON from architect output.
 * Returns parsed agent array, or empty array if extraction fails.
 */
export async function extractAgentsFromOutput(architectOutput: string): Promise<ExtractedAgent[]> {
  const apiKey = process.env.ORQ_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await fetch(ORQ_ROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "anthropic/claude-haiku-3-5",
        max_tokens: 1024,
        messages: [
          { role: "system", content: EXTRACTION_PROMPT },
          { role: "user", content: architectOutput },
        ],
      }),
    });

    if (!response.ok) return [];

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content ?? "";

    // Extract JSON from response (may be wrapped in ```json blocks)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const agents: ExtractedAgent[] = JSON.parse(jsonMatch[0]);

    // Validate structure
    return agents.filter(
      (a) =>
        typeof a.name === "string" &&
        typeof a.role === "string" &&
        a.name.length > 0
    );
  } catch {
    return [];
  }
}
