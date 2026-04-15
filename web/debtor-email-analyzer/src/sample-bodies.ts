import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "email_pipeline" },
});

async function main() {
  // Sample incoming emails per mailbox — body_text preview
  const mailboxes = [
    "debiteuren@sicli-noord.be",
    "debiteuren@smeba-fire.be",
    "debiteuren@berki.nl",
    "facturations@sicli-sud.be",
  ];

  for (const mb of mailboxes) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`MAILBOX: ${mb} — INCOMING SAMPLES`);
    console.log(`${"=".repeat(80)}`);

    const { data } = await supabase
      .from("emails")
      .select("subject, sender_email, body_text, received_at")
      .eq("mailbox", mb)
      .eq("direction", "incoming")
      .order("received_at", { ascending: false })
      .limit(10);

    if (!data || data.length === 0) {
      console.log("  (no incoming emails)");
      continue;
    }

    for (const e of data) {
      console.log(`\n  FROM: ${e.sender_email}`);
      console.log(`  DATE: ${e.received_at}`);
      console.log(`  SUBJ: ${e.subject}`);
      console.log(`  BODY: ${(e.body_text || "").slice(0, 200)}`);
      console.log(`  ---`);
    }
  }

  // Also sample outbound from smeba.nl to understand the automated sends
  console.log(`\n${"=".repeat(80)}`);
  console.log(`MAILBOX: debiteuren@smeba.nl — SENT SAMPLES (automated?)`);
  console.log(`${"=".repeat(80)}`);

  const { data: sentSmeba } = await supabase
    .from("emails")
    .select("subject, sender_email, body_text, received_at, recipients")
    .eq("mailbox", "debiteuren@smeba.nl")
    .eq("direction", "sent")
    .order("received_at", { ascending: false })
    .limit(10);

  if (sentSmeba) {
    for (const e of sentSmeba) {
      console.log(`\n  TO: ${JSON.stringify(e.recipients?.to?.[0] || {})}`);
      console.log(`  DATE: ${e.received_at}`);
      console.log(`  SUBJ: ${e.subject}`);
      console.log(`  BODY: ${(e.body_text || "").slice(0, 200)}`);
      console.log(`  ---`);
    }
  }
}

main().catch(console.error);
