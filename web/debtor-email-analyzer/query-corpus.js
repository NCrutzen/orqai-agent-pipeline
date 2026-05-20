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
  console.log("=== CORPUS OVERVIEW ===\n");

  // 1. Total email count
  console.log("1. EMAIL CORPUS SIZE");
  const { count: emailCount } = await supabase_pipeline
    .from("emails")
    .select("*", { count: "exact", head: true });
  console.log(`Total emails: ${emailCount}\n`);

  // 2. Emails by direction
  console.log("2. BY DIRECTION");
  const { data: directionData } = await supabase_pipeline
    .from("emails")
    .select("direction")
    .order("direction");
  
  const dirCounts = {};
  for (const e of directionData || []) {
    dirCounts[e.direction] = (dirCounts[e.direction] || 0) + 1;
  }
  for (const [dir, cnt] of Object.entries(dirCounts)) {
    console.log(`${dir}: ${cnt}`);
  }
  console.log("");

  // 3. Analyzed email count
  console.log("3. ANALYZED EMAILS");
  const { count: analyzedCount } = await supabase_debtor
    .from("email_analysis")
    .select("*", { count: "exact", head: true });
  console.log(`Analyzed: ${analyzedCount}\n`);

  // 4. Category distribution
  console.log("4. CATEGORY DISTRIBUTION");
  const { data: categories } = await supabase_debtor
    .from("email_analysis")
    .select("category");
  
  const catCounts = {};
  for (const r of categories || []) {
    catCounts[r.category] = (catCounts[r.category] || 0) + 1;
  }
  for (const [cat, cnt] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`${cat}: ${cnt} (${((cnt / (categories?.length || 1)) * 100).toFixed(1)}%)`);
  }
  console.log("");

  // 5. Email intent distribution
  console.log("5. EMAIL INTENT DISTRIBUTION");
  const { data: intents } = await supabase_debtor
    .from("email_analysis")
    .select("email_intent");
  
  const intentCounts = {};
  for (const r of intents || []) {
    intentCounts[r.email_intent] = (intentCounts[r.email_intent] || 0) + 1;
  }
  for (const [intent, cnt] of Object.entries(intentCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`${intent}: ${cnt} (${((cnt / (intents?.length || 1)) * 100).toFixed(1)}%)`);
  }
  console.log("");

  // 6. Language distribution
  console.log("6. LANGUAGE DISTRIBUTION");
  const { data: langs } = await supabase_debtor
    .from("email_analysis")
    .select("language");
  
  const langCounts = {};
  for (const r of langs || []) {
    langCounts[r.language] = (langCounts[r.language] || 0) + 1;
  }
  for (const [lang, cnt] of Object.entries(langCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`${lang}: ${cnt} (${((cnt / (langs?.length || 1)) * 100).toFixed(1)}%)`);
  }
  console.log("");

  // 7. Sample auto_reply emails
  console.log("7. AUTO_REPLY SAMPLES (first 10)");
  const { data: autoReplies } = await supabase_debtor
    .from("email_analysis")
    .select("email_id, category, email_intent")
    .eq("email_intent", "auto_reply")
    .limit(10);
  
  if (autoReplies && autoReplies.length > 0) {
    // Get the actual email details
    const emailIds = autoReplies.map((a) => a.email_id);
    const { data: emailDetails } = await supabase_pipeline
      .from("emails")
      .select("id, sender_email, subject, body_text")
      .in("id", emailIds)
      .limit(10);
    
    for (const e of emailDetails || []) {
      console.log(`\nFrom: ${e.sender_email}`);
      console.log(`Subject: ${e.subject?.substring(0, 80)}`);
      console.log(`Body (first 200): ${(e.body_text || "").substring(0, 200)}`);
    }
  }
}

main().catch(console.error);
