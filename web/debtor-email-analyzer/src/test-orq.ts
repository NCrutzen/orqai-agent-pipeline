import { Orq } from "@orq-ai/node";
import { config } from "./config.js";

const orq = new Orq({ apiKey: config.orq.apiKey });

async function main() {
  console.log("Testing Orq AI routing...");

  const response = await orq.router.chat.completions.create({
    model: "anthropic/claude-haiku-4-5-20251001",
    messages: [
      { role: "system", content: "Return only valid JSON." },
      { role: "user", content: 'Categorize: "Beste, wij hebben uw factuur 17304080 betaald. Mvg, Jan" — return {"category": "...", "language": "..."}' },
    ],
    responseFormat: { type: "json_object" },
    temperature: 0,
    maxTokens: 100,
  });

  console.log("Response:", JSON.stringify(response.choices?.[0]?.message, null, 2));
}

main().catch(console.error);
