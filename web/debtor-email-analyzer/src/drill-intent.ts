import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const pipeline = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "email_pipeline" },
});
const debtor = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "debtor" },
});

const intent = process.argv[2] || "invoice_correction";

async function main() {
  console.log(`=== DRILL INTO INTENT: ${intent} ===\n`);

  // Get all analysis rows for this intent
  const analyses: any[] = [];
  let offset = 0;
  while (true) {
    const { data } = await debtor
      .from("email_analysis")
      .select("email_id, debtor_name, invoice_numbers, tags, suggested_response, urgency")
      .eq("email_intent", intent)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    analyses.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  console.log(`Total emails with intent "${intent}": ${analyses.length}\n`);

  // Get the email details for these
  const emailIds = analyses.map((a) => a.email_id);
  const emails: any[] = [];
  // Fetch in chunks of 100 (Supabase IN filter limit)
  for (let i = 0; i < emailIds.length; i += 100) {
    const chunk = emailIds.slice(i, i + 100);
    const { data } = await pipeline
      .from("emails")
      .select("id, subject, body_text, sender_email, mailbox, received_at")
      .in("id", chunk);
    if (data) emails.push(...data);
  }

  const emailMap = new Map(emails.map((e) => [e.id, e]));

  // Tag frequency
  const tagCounts: Record<string, number> = {};
  for (const a of analyses) {
    for (const t of a.tags || []) {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
  }

  console.log("--- TAGS ---");
  for (const [t, n] of Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${n.toString().padStart(5)}  ${t}`);
  }

  // Urgency breakdown
  const urgCounts: Record<string, number> = {};
  for (const a of analyses) {
    urgCounts[a.urgency] = (urgCounts[a.urgency] || 0) + 1;
  }
  console.log("\n--- URGENCY ---");
  for (const [u, n] of Object.entries(urgCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(5)}  ${u}`);
  }

  // Per mailbox
  const mbCounts: Record<string, number> = {};
  for (const a of analyses) {
    const e = emailMap.get(a.email_id);
    if (e) mbCounts[e.mailbox] = (mbCounts[e.mailbox] || 0) + 1;
  }
  console.log("\n--- PER MAILBOX ---");
  for (const [m, n] of Object.entries(mbCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(5)}  ${m}`);
  }

  // Sample emails
  console.log("\n--- SAMPLE EMAILS (20) ---");
  const samples = analyses.slice(0, 20);
  for (const a of samples) {
    const e = emailMap.get(a.email_id);
    if (!e) continue;
    console.log(`\n  FROM: ${e.sender_email}`);
    console.log(`  MAILBOX: ${e.mailbox}`);
    console.log(`  DATE: ${e.received_at?.slice(0, 10)}`);
    console.log(`  SUBJ: ${e.subject?.slice(0, 100)}`);
    console.log(`  BODY: ${(e.body_text || "").slice(0, 200)}`);
    console.log(`  TAGS: ${(a.tags || []).join(", ")}`);
    console.log(`  SUGGESTED: ${a.suggested_response?.slice(0, 150) || "-"}`);
    console.log(`  ---`);
  }
}

main();
