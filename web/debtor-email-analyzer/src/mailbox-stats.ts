import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const pipeline = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "email_pipeline" },
});

async function main() {
  // Paginated distinct mailbox count
  const counts = new Map<string, { total: number; incoming: number }>();
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await pipeline
      .from("emails")
      .select("mailbox, direction")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      const mb = r.mailbox || "(null)";
      const cur = counts.get(mb) || { total: 0, incoming: 0 };
      cur.total++;
      if (r.direction === "incoming") cur.incoming++;
      counts.set(mb, cur);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  console.log("=== Mailboxes (total / incoming) ===");
  for (const [mb, c] of [...counts.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${mb}: ${c.total} total, ${c.incoming} incoming`);
  }
  const grand = [...counts.values()].reduce((a, b) => a + b.total, 0);
  console.log(`\nGRAND TOTAL: ${grand}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
