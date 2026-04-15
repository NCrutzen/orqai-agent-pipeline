import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const debtor = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "debtor" },
});

async function main() {
  let count = 0;
  let offset = 0;
  while (true) {
    const { data } = await debtor.from("email_analysis").select("id").range(offset, offset + 999);
    if (!data || data.length === 0) break;
    count += data.length;
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`Total analyzed in debtor.email_analysis: ${count}`);
}

main();
