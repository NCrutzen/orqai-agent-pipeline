import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

/**
 * Migration: Replace forwarded_internal intent with is_forwarded_internal metadata flag
 *
 * 1. Adds is_forwarded_internal boolean column to debtor.email_analysis
 * 2. Sets is_forwarded_internal=true for all rows where email_intent='forwarded_internal'
 * 3. Re-queues those rows for re-analysis (sets email_intent to null so they get re-processed)
 *
 * Run the SQL below in the Supabase SQL Editor first, then run this script to verify.
 */

const SQL = `
-- Step 1: Add the new metadata column
ALTER TABLE debtor.email_analysis
ADD COLUMN IF NOT EXISTS is_forwarded_internal boolean DEFAULT false;

-- Step 2: Mark existing forwarded_internal rows
UPDATE debtor.email_analysis
SET is_forwarded_internal = true
WHERE email_intent = 'forwarded_internal';

-- Step 3: Check how many rows will be re-analyzed
SELECT count(*) as forwarded_count
FROM debtor.email_analysis
WHERE email_intent = 'forwarded_internal';
`;

const debtor = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "debtor" },
});

async function main() {
  console.log("=== MIGRATION: forwarded_internal → is_forwarded_internal ===\n");

  // Check current forwarded_internal count
  const { data, error } = await debtor
    .from("email_analysis")
    .select("id, email_id, email_intent")
    .eq("email_intent", "forwarded_internal");

  if (error) {
    console.error("Error querying:", error.message);
    return;
  }

  console.log(`Found ${data?.length ?? 0} emails with intent 'forwarded_internal'\n`);

  if (!data || data.length === 0) {
    console.log("Nothing to migrate.");
    return;
  }

  console.log("Run this SQL in the Supabase SQL Editor:\n");
  console.log(SQL);
  console.log("\nAfter running the SQL, re-run the categorization with:");
  console.log("  npx tsx src/categorize.ts");
  console.log("\nThe updated prompt will classify forwarded emails by their actual content");
  console.log("while preserving the is_forwarded_internal metadata flag.");
}

main().catch(console.error);
