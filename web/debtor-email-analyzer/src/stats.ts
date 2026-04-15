import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "email_pipeline" },
});

async function main() {
  // Total emails per mailbox and direction
  const { data: emails, error } = await supabase
    .from("emails")
    .select("mailbox, direction");

  if (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }

  if (!emails || emails.length === 0) {
    console.log("No emails in database yet. Run: npm run fetch");
    return;
  }

  // Aggregate
  const stats: Record<string, { incoming: number; sent: number }> = {};
  for (const e of emails) {
    if (!stats[e.mailbox]) stats[e.mailbox] = { incoming: 0, sent: 0 };
    stats[e.mailbox][e.direction as "incoming" | "sent"]++;
  }

  console.log("=== Email Statistics ===\n");
  let total = 0;
  for (const [mailbox, counts] of Object.entries(stats)) {
    console.log(`${mailbox}`);
    console.log(`  Incoming: ${counts.incoming}`);
    console.log(`  Sent:     ${counts.sent}`);
    console.log(`  Threads:  (run thread analysis for details)`);
    total += counts.incoming + counts.sent;
  }
  console.log(`\nTotal emails: ${total}`);

  // Top senders
  const senderCounts: Record<string, number> = {};
  for (const e of emails) {
    if (e.direction === "incoming" && e.sender_email) {
      // We only have mailbox/direction from the select above
      // For a full stats script, select more fields
    }
  }
}

main().catch(console.error);
