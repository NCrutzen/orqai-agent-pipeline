// Bulk replay the remaining fire-control 405 failures.
// Excludes the two canary rows already re-emitted earlier today.
//
// Usage:
//   cd web
//   npx tsx scripts/replay-fire-control-405-bulk.ts          # dry-run
//   npx tsx scripts/replay-fire-control-405-bulk.ts --apply  # emit

import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { Inngest } from "inngest";

loadDotenv({ path: path.resolve(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY_PROD ?? process.env.INNGEST_EVENT_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE || !INNGEST_EVENT_KEY) {
  console.error("Missing env (SUPABASE_URL / SERVICE_ROLE_KEY / INNGEST_EVENT_KEY[_PROD])");
  process.exit(1);
}

const ALREADY_REPLAYED = new Set([
  "4b7ed93e-73ca-4153-8be3-147735e1de09", // canary 1, auto_reply
  "17ab7f5f-95fe-409a-a9b6-5c3f3717b5b2", // canary 2, payment_admittance
]);

const apply = process.argv.includes("--apply");
const STAGGER_MS = 3000;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});
const inngest = new Inngest({ id: "replay-fire-control-405-bulk", eventKey: INNGEST_EVENT_KEY });

type Run = {
  id: string;
  status: string;
  swarm_type: string | null;
  topic: string | null;
  error_message: string | null;
  result: Record<string, unknown> | null;
};

async function main() {
  console.log(`[bulk] mode: ${apply ? "APPLY" : "DRY-RUN"}`);

  const { data, error } = await admin
    .from("automation_runs")
    .select("id, status, swarm_type, topic, error_message, result")
    .filter("result->>source_mailbox", "eq", "administratie@fire-control.nl")
    .eq("status", "failed")
    .like("error_message", "%The OData request is not supported%")
    .order("created_at", { ascending: true })
    .returns<Run[]>();

  if (error) throw new Error(`load runs: ${error.message}`);
  const runs = (data ?? []).filter((r) => !ALREADY_REPLAYED.has(r.id));
  console.log(`[bulk] candidates: ${runs.length}`);

  let emitted = 0;
  let skipped = 0;

  for (const run of runs) {
    const result = (run.result ?? {}) as Record<string, unknown>;
    const messageId = result.message_id as string | undefined;
    const sourceMailbox = result.source_mailbox as string | undefined;
    const predictedCategory = run.topic ?? undefined;

    if (!messageId || !sourceMailbox || !predictedCategory) {
      console.warn(`[bulk] skip ${run.id} — missing message_id/source_mailbox/topic`);
      skipped++;
      continue;
    }

    const tag = `${run.id.slice(0, 8)} topic=${predictedCategory}`;
    if (!apply) {
      console.log(`[bulk] would emit ${tag}`);
      continue;
    }

    const { error: resetErr, count } = await admin
      .from("automation_runs")
      .update({ status: "pending", error_message: null, completed_at: null }, { count: "exact" })
      .eq("id", run.id)
      .eq("status", "failed");
    if (resetErr) {
      console.error(`[bulk] reset ${tag} failed: ${resetErr.message}`);
      skipped++;
      continue;
    }
    if (count === 0) {
      console.warn(`[bulk] reset ${tag} matched 0 rows (state shifted) — skipping`);
      skipped++;
      continue;
    }

    const send = await inngest.send({
      name: "classifier/verdict.recorded",
      data: {
        automation_run_id: run.id,
        swarm_type: run.swarm_type ?? "debtor-email",
        decision: "approve",
        message_id: messageId,
        source_mailbox: sourceMailbox,
        predicted_category: predictedCategory,
        override_category: null,
      },
    });
    console.log(`[bulk] emitted ${tag} event=${send.ids?.[0] ?? "?"}`);
    emitted++;

    await new Promise((r) => setTimeout(r, STAGGER_MS));
  }

  console.log(`[bulk] done. emitted=${emitted} skipped=${skipped}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
