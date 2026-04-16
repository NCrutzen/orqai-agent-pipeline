/**
 * Discovery pass: sample SugarCRM sales emails and let the LLM
 * freely classify them without a fixed taxonomy.
 * Output: a summary of discovered intents, categories, and patterns.
 */
import { Orq } from "@orq-ai/node";
import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const orq = new Orq({ apiKey: config.orq.apiKey });

const pipeline = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "email_pipeline" },
});

const SAMPLE_SIZE = 200;
const BATCH_SIZE = 5;
const MODEL = "anthropic/claude-haiku-4-5-20251001";

const DISCOVERY_PROMPT = `You are analyzing emails from a Dutch fire protection company (Smeba Brandbeveiliging BV). Your job is to freely classify this email — do NOT use a predefined list. Instead, describe what you observe.

Return a JSON object:
{
  "intent": "A short, specific label for what this email is about (e.g. 'quote follow-up', 'maintenance scheduling', 'spam newsletter', 'internal task delegation'). Be specific, not generic.",
  "category": "A broad grouping (e.g. 'sales', 'service', 'admin', 'spam', 'internal'). Use your judgment.",
  "is_actionable": true/false (does someone need to do something?),
  "is_automated": true/false (is this a system-generated email like auto-reply, notification, reminder?),
  "key_entities": ["List any company names, product types, reference numbers, or people mentioned"],
  "one_line_summary": "One sentence summary of the email in its original language"
}

Return ONLY valid JSON.`;

interface EmailRow {
  id: string;
  subject: string | null;
  body_text: string | null;
  sender_email: string | null;
  sender_name: string | null;
  mailbox: string;
  direction: string;
}

interface DiscoveryResult {
  email_id: string;
  direction: string;
  intent: string;
  category: string;
  is_actionable: boolean;
  is_automated: boolean;
  key_entities: string[];
  one_line_summary: string;
}

async function classifyEmail(email: EmailRow): Promise<DiscoveryResult | null> {
  const userMessage = [
    `Direction: ${email.direction}`,
    `From: ${email.sender_name} <${email.sender_email}>`,
    `Subject: ${email.subject || "(no subject)"}`,
    `Body:\n${(email.body_text || "").slice(0, 1500)}`,
  ].join("\n");

  try {
    const response = await orq.router.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: DISCOVERY_PROMPT },
        { role: "user", content: userMessage },
      ],
      responseFormat: { type: "json_object" },
      temperature: 0,
      maxTokens: 300,
    });

    let content = response.choices?.[0]?.message?.content;
    if (!content) return null;

    if (typeof content === "string") {
      content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    }

    const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
    return {
      email_id: email.id,
      direction: email.direction,
      ...parsed,
    };
  } catch (err: any) {
    console.error(`  Error for ${email.id}: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log("=== SALES EMAIL INTENT DISCOVERY ===\n");

  // Get total count of SugarCRM emails
  const { count } = await pipeline
    .from("emails")
    .select("id", { count: "exact", head: true })
    .eq("source", "sugarcrm");

  console.log(`Total SugarCRM emails in DB: ${count || 0}`);

  if (!count || count === 0) {
    console.log("No emails to sample yet. Wait for fetch to complete.");
    return;
  }

  // Sample evenly: ~40% inbound, ~40% outbound, ~20% internal
  const sampleCounts = {
    inbound: Math.round(SAMPLE_SIZE * 0.4),
    outbound: Math.round(SAMPLE_SIZE * 0.4),
    internal: SAMPLE_SIZE - Math.round(SAMPLE_SIZE * 0.4) * 2,
  };

  const samples: EmailRow[] = [];
  for (const [dir, n] of Object.entries(sampleCounts)) {
    // Get total for this direction
    const { count: dirCount } = await pipeline
      .from("emails")
      .select("id", { count: "exact", head: true })
      .eq("source", "sugarcrm")
      .eq("direction", dir);

    if (!dirCount || dirCount === 0) {
      console.log(`  No ${dir} emails yet, skipping`);
      continue;
    }

    // Random sample: pick random offsets
    const step = Math.max(1, Math.floor(dirCount / n));
    for (let i = 0; i < n && i * step < dirCount; i++) {
      const offset = i * step;
      const { data } = await pipeline
        .from("emails")
        .select("id, subject, body_text, sender_email, sender_name, mailbox, direction")
        .eq("source", "sugarcrm")
        .eq("direction", dir)
        .order("received_at", { ascending: true })
        .range(offset, offset);

      if (data?.[0]) samples.push(data[0]);
    }
    console.log(`  Sampled ${Math.min(n, Math.ceil(dirCount / step))} ${dir} emails`);
  }

  console.log(`\nTotal sample: ${samples.length} emails\n`);

  // Classify all samples
  const results: DiscoveryResult[] = [];
  let processed = 0;

  for (let i = 0; i < samples.length; i += BATCH_SIZE) {
    const batch = samples.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((email) => classifyEmail(email))
    );

    for (const r of batchResults) {
      if (r.status === "fulfilled" && r.value) {
        results.push(r.value);
      }
    }

    processed += batch.length;
    console.log(`  Classified ${processed}/${samples.length}`);
  }

  // --- Analyze results ---
  console.log(`\n${"=".repeat(60)}`);
  console.log(`DISCOVERY RESULTS (${results.length} emails classified)`);
  console.log(`${"=".repeat(60)}\n`);

  // Intent distribution
  const intents: Record<string, number> = {};
  const categories: Record<string, number> = {};
  const intentsByDirection: Record<string, Record<string, number>> = {};
  let actionable = 0;
  let automated = 0;

  for (const r of results) {
    const intent = r.intent?.toLowerCase().trim() || "unknown";
    const category = r.category?.toLowerCase().trim() || "unknown";

    intents[intent] = (intents[intent] || 0) + 1;
    categories[category] = (categories[category] || 0) + 1;

    if (!intentsByDirection[r.direction]) intentsByDirection[r.direction] = {};
    intentsByDirection[r.direction][intent] =
      (intentsByDirection[r.direction][intent] || 0) + 1;

    if (r.is_actionable) actionable++;
    if (r.is_automated) automated++;
  }

  console.log("--- DISCOVERED INTENTS (sorted by frequency) ---\n");
  for (const [intent, n] of Object.entries(intents).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${n.toString().padStart(4)}  ${intent}`);
  }

  console.log("\n--- DISCOVERED CATEGORIES ---\n");
  for (const [cat, n] of Object.entries(categories).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${n.toString().padStart(4)}  ${cat}`);
  }

  console.log("\n--- INTENTS BY DIRECTION ---\n");
  for (const [dir, dirIntents] of Object.entries(intentsByDirection)) {
    console.log(`  ${dir.toUpperCase()}:`);
    for (const [intent, n] of Object.entries(dirIntents)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)) {
      console.log(`    ${n.toString().padStart(4)}  ${intent}`);
    }
    console.log("");
  }

  console.log("--- ACTIONABILITY ---\n");
  console.log(`  Actionable: ${actionable} (${((actionable / results.length) * 100).toFixed(1)}%)`);
  console.log(`  Automated:  ${automated} (${((automated / results.length) * 100).toFixed(1)}%)`);
  console.log(`  Human-only: ${actionable - automated} emails need human attention`);

  // Dump raw results for further analysis
  const outputPath = new URL("../discovery-results.json", import.meta.url).pathname;
  const fs = await import("fs");
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nRaw results saved to: ${outputPath}`);
}

main().catch(console.error);
