#!/usr/bin/env tsx
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(__dirname, "..", ".env.local") });

import { createAdminClient } from "@/lib/supabase/admin";
import { hydrateBulkReviewRow } from "@/lib/bulk-review/hydrate";

async function main() {
  const admin = createAdminClient();
  const r = await admin
    .schema("debtor")
    .from("email_labels")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(5);
  console.log("label rows:", r.data?.length ?? 0, "error:", r.error?.message ?? null);
  if (!r.data) return;
  for (const row of r.data.slice(0, 3)) {
    const h = await hydrateBulkReviewRow(admin, {
      email_label_id: row.id,
      swarm_type: "debtor-email",
    });
    console.log("hydrated", row.id, "→", h ? "OK" : "NULL");
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
