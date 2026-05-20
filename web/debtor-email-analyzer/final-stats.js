import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase_pipeline = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { db: { schema: "email_pipeline" } }
);

const supabase_debtor = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { db: { schema: "debtor" } }
);

async function main() {
  console.log("=== FINAL CORPUS STATISTICS ===\n");

  // Overall stats
  const { count: emailCount } = await supabase_pipeline
    .from("emails")
    .select("*", { count: "exact", head: true });

  const { count: analyzedCount } = await supabase_debtor
    .from("email_analysis")
    .select("*", { count: "exact", head: true });

  console.log(`Total emails in corpus: ${emailCount}`);
  console.log(`Analyzed emails: ${analyzedCount}`);
  console.log(`Coverage: ${((analyzedCount / emailCount) * 100).toFixed(2)}%\n`);

  // Get detailed breakdown by intent
  const { data: allAnalysis } = await supabase_debtor
    .from("email_analysis")
    .select("email_intent, language, category");

  const intentCounts = {};
  const langCounts = { nl: 0, fr: 0, en: 0, de: 0 };
  const catCounts = {};

  for (const r of allAnalysis || []) {
    intentCounts[r.email_intent] = (intentCounts[r.email_intent] || 0) + 1;
    langCounts[r.language] = (langCounts[r.language] || 0) + 1;
    catCounts[r.category] = (catCounts[r.category] || 0) + 1;
  }

  console.log("Categories:");
  for (const [cat, cnt] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${cnt}`);
  }

  console.log("\nLanguages:");
  for (const [lang, cnt] of Object.entries(langCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${lang}: ${cnt}`);
  }

  console.log("\nKey intents:");
  const keyIntents = ["auto_reply", "payment_confirmation", "payment_dispute", "address_change", "payment_plan", "invoice_request"];
  for (const intent of keyIntents) {
    const cnt = intentCounts[intent] || 0;
    console.log(`  ${intent}: ${cnt}`);
  }
}

main().catch(console.error);
