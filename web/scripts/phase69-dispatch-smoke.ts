// Phase 69 Wave 6 manual smoke — dispatches `debtor-email/invoice-copy.requested`
// for email 3949cc35-0583-4714-a730-c57085f3f2c9 (Smeba mailbox, "Kopie factuur
// graag", invoice 33052208) so the production Vercel handler runs end-to-end
// against the post-Wave-5 PATCHed Orq prompt.
//
// Effects on production:
//   - Creates one new `automation_runs` row (id printed below).
//   - Triggers `classifier-invoice-copy-handler` on Vercel.
//   - Handler invokes the live Orq agent (~$0.01 LLM cost).
//   - Handler attempts to create an iController draft. The April 23 attempt
//     failed with `message_not_found`; expect the same outcome unless the
//     Outlook message is still threaded.
//
// Usage:
//   tsx web/scripts/phase69-dispatch-smoke.ts
// (env loaded from web/.env.local automatically via the dotenv import below)

import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { Inngest } from "inngest";
import { createClient } from "@supabase/supabase-js";

// Local web/.env.local has stale ORQ + INNGEST keys (rejected by prod).
// /tmp/phase-66-vercel-prod.env was pulled from Vercel earlier today and has
// production-tier keys. Load that first; fall back to .env.local for anything
// missing (e.g. NEXT_PUBLIC_SUPABASE_URL — same value in both).
loadDotenv({ path: "/tmp/phase-66-vercel-prod.env" });
loadDotenv({ path: path.resolve(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !INNGEST_EVENT_KEY) {
  throw new Error(
    "Missing one of NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / INNGEST_EVENT_KEY",
  );
}

const EMAIL_ID = "3949cc35-0583-4714-a730-c57085f3f2c9";
const SOURCE_MAILBOX = "debiteuren@smeba.nl";
const CATEGORY_KEY = "invoice_copy_request";
const SWARM_TYPE = "debtor-email";

async function main() {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 1) Create a fresh automation_runs row so the handler can update it.
  const { data: arRow, error: arErr } = await admin
    .from("automation_runs")
    .insert({
      swarm_type: SWARM_TYPE,
      automation: "classifier-invoice-copy",
      topic: EMAIL_ID,
      status: "predicted",
      triggered_by: "phase69-smoke-script",
    })
    .select("id")
    .single();
  if (arErr) throw new Error(`automation_runs insert failed: ${arErr.message}`);

  const automation_run_id = (arRow as { id: string }).id;
  console.log(`[smoke] automation_runs.id=${automation_run_id}`);

  // 2) Send the Inngest event. Production Vercel will pick it up.
  const inngest = new Inngest({
    id: "agent-workforce",
    eventKey: INNGEST_EVENT_KEY,
  });

  const sendResult = await inngest.send({
    name: "debtor-email/invoice-copy.requested",
    data: {
      automation_run_id,
      swarm_type: SWARM_TYPE,
      category_key: CATEGORY_KEY,
      message_id: EMAIL_ID,
      source_mailbox: SOURCE_MAILBOX,
    },
  });

  console.log(`[smoke] inngest.send → ${JSON.stringify(sendResult)}`);
  console.log(
    `[smoke] watch with: SELECT * FROM agent_runs WHERE email_id='${EMAIL_ID}' ORDER BY created_at DESC LIMIT 3;`,
  );
}

main().catch((e) => {
  console.error(`[smoke] FAILED: ${(e as Error).message}`);
  process.exit(1);
});
