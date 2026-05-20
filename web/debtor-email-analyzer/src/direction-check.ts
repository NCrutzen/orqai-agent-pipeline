import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const pipeline = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "email_pipeline" },
});

async function main() {
  const counts = new Map<string, Map<string, number>>();
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
      const dir = r.direction || "(null)";
      if (!counts.has(mb)) counts.set(mb, new Map());
      const inner = counts.get(mb)!;
      inner.set(dir, (inner.get(dir) || 0) + 1);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  for (const [mb, inner] of counts.entries()) {
    console.log(`\n${mb}`);
    for (const [dir, n] of inner.entries()) {
      console.log(`  ${dir}: ${n}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
