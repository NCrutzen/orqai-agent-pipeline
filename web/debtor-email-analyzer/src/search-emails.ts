import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const pipeline = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "email_pipeline" },
});

const terms = process.argv.slice(2);
if (terms.length === 0) {
  console.log("Usage: npx tsx src/search-emails.ts <term1> [term2] ...");
  process.exit(1);
}

async function main() {
  console.log(`Searching for: ${terms.join(", ")}\n`);

  let total = 0;
  for (const term of terms) {
    // Search in subject
    const { data: subjectHits } = await pipeline
      .from("emails")
      .select("id, subject, body_text, sender_email, mailbox, direction, received_at")
      .ilike("subject", `%${term}%`)
      .limit(500);

    // Search in body
    const { data: bodyHits } = await pipeline
      .from("emails")
      .select("id, subject, body_text, sender_email, mailbox, direction, received_at")
      .ilike("body_text", `%${term}%`)
      .limit(500);

    // Dedupe
    const seen = new Set<string>();
    const all = [...(subjectHits || []), ...(bodyHits || [])].filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

    console.log(`"${term}": ${all.length} emails found`);
    total += all.length;

    // Show first 5
    for (const e of all.slice(0, 5)) {
      console.log(`  [${e.direction}] ${e.mailbox} | ${e.received_at?.slice(0, 10)} | ${e.sender_email}`);
      console.log(`  SUBJ: ${e.subject?.slice(0, 100)}`);
      console.log(`  BODY: ${(e.body_text || "").slice(0, 150)}`);
      console.log();
    }
    if (all.length > 5) console.log(`  ... and ${all.length - 5} more\n`);
  }

  console.log(`\nTotal across all terms (may overlap): ${total}`);
}

main();
