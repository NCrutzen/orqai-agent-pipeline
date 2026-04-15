import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const debtor = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "debtor" },
});

async function main() {
  const all: any[] = [];
  let offset = 0;
  while (true) {
    const { data } = await debtor
      .from("email_analysis")
      .select("category, email_intent, urgency, requires_action, language")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  console.log(`Total analyzed: ${all.length}\n`);

  const cats: Record<string, number> = {};
  const intents: Record<string, number> = {};
  const urgencies: Record<string, number> = {};
  const languages: Record<string, number> = {};
  let actionRequired = 0;

  for (const r of all) {
    cats[r.category] = (cats[r.category] || 0) + 1;
    intents[r.email_intent] = (intents[r.email_intent] || 0) + 1;
    urgencies[r.urgency] = (urgencies[r.urgency] || 0) + 1;
    languages[r.language] = (languages[r.language] || 0) + 1;
    if (r.requires_action) actionRequired++;
  }

  console.log("--- CATEGORIES ---");
  for (const [c, n] of Object.entries(cats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(5)}  ${c} (${((n / all.length) * 100).toFixed(1)}%)`);
  }

  console.log("\n--- INTENTS ---");
  for (const [c, n] of Object.entries(intents).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(5)}  ${c} (${((n / all.length) * 100).toFixed(1)}%)`);
  }

  console.log("\n--- URGENCY ---");
  for (const [c, n] of Object.entries(urgencies).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(5)}  ${c} (${((n / all.length) * 100).toFixed(1)}%)`);
  }

  console.log("\n--- LANGUAGES ---");
  for (const [c, n] of Object.entries(languages).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(5)}  ${c} (${((n / all.length) * 100).toFixed(1)}%)`);
  }

  console.log("\n--- ACTION REQUIRED ---");
  console.log(`  ${actionRequired} emails need human action (${((actionRequired / all.length) * 100).toFixed(1)}%)`);
  console.log(`  ${all.length - actionRequired} can be auto-handled (${(((all.length - actionRequired) / all.length) * 100).toFixed(1)}%)`);
}

main();
