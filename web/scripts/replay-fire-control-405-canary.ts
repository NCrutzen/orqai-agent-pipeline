// One-shot canary replay for the fire-control-graph-405 debug session.
//
// Re-emits classifier/verdict.recorded for a SINGLE failed 405 row:
//   id 4b7ed93e-73ca-4153-8be3-147735e1de09
//   topic auto_reply → swarm_noise_categories row says action=categorize_archive, label=Auto-Reply
//
// Goal: verify the M365 grant + reconnect actually fixed the production path
// against one real fire-control message before replaying the other 15.
//
// Effects on production (one message):
//   - Adds "Auto-Reply" category to the message in administratie@fire-control.nl
//   - Moves the message to the Archive folder
//   - Runs registered stage1 side-effects (iController cleanup hook, etc.)
//
// Usage:
//   cd web
//   npx tsx scripts/replay-fire-control-405-canary.ts           # dry-run
//   npx tsx scripts/replay-fire-control-405-canary.ts --apply   # emit

import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { Inngest } from "inngest";

loadDotenv({ path: path.resolve(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Prefer the prod event key when present — local INNGEST_EVENT_KEY targets a
// dev branch and 401s against the prod Inngest app where the verdict-worker runs.
const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY_PROD ?? process.env.INNGEST_EVENT_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!INNGEST_EVENT_KEY) {
  console.error("Missing INNGEST_EVENT_KEY");
  process.exit(1);
}

const RUN_ID = process.env.RUN_ID ?? "4b7ed93e-73ca-4153-8be3-147735e1de09";
const apply = process.argv.includes("--apply");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});
const inngest = new Inngest({
  id: "replay-fire-control-405-canary",
  eventKey: INNGEST_EVENT_KEY,
});

async function main() {
  console.log(`[canary] mode: ${apply ? "APPLY" : "DRY-RUN"}`);

  // Load the row + verify it's still in failed state with the 405 signature.
  const { data: run, error } = await admin
    .from("automation_runs")
    .select("id, status, swarm_type, topic, error_message, result")
    .eq("id", RUN_ID)
    .maybeSingle();

  if (error) throw new Error(`load run failed: ${error.message}`);
  if (!run) throw new Error(`run ${RUN_ID} not found`);

  console.log(`[canary] run loaded:`, {
    id: run.id,
    status: run.status,
    swarm_type: run.swarm_type,
    topic: run.topic,
  });

  // Allow either 'failed' (initial state) or 'pending' (prior run reset it but
  // the event emit failed). 'pending' with null error_message is the
  // half-reset state our previous attempt left behind.
  const okFailed = run.status === "failed" && run.error_message?.includes("The OData request is not supported");
  const okPendingResumed = run.status === "pending" && !run.error_message;
  if (!okFailed && !okPendingResumed) {
    console.warn(
      `[canary] unexpected state status='${run.status}' err='${run.error_message?.slice(0, 80) ?? ""}' — aborting`,
    );
    process.exit(2);
  }

  const result = (run.result ?? {}) as Record<string, unknown>;
  const messageId = result.message_id as string | undefined;
  const sourceMailbox = result.source_mailbox as string | undefined;
  const predictedCategory = run.topic as string | undefined;

  if (!messageId || !sourceMailbox || !predictedCategory) {
    throw new Error(
      `missing required fields: message_id=${messageId} source_mailbox=${sourceMailbox} topic=${predictedCategory}`,
    );
  }

  console.log(`[canary] event payload:`, {
    automation_run_id: run.id,
    swarm_type: run.swarm_type,
    decision: "approve",
    message_id: messageId,
    source_mailbox: sourceMailbox,
    predicted_category: predictedCategory,
    override_category: null,
  });

  if (!apply) {
    console.log(`[canary] dry-run done. Re-run with --apply to emit.`);
    return;
  }

  // Reset to pending so the verdict-worker's flip-to-pending step is a no-op
  // and the UI doesn't show a half-state during processing. Guard on
  // status='failed' to prevent double-emit if someone else already kicked it.
  const { error: resetErr, count } = await admin
    .from("automation_runs")
    .update({
      status: "pending",
      error_message: null,
      completed_at: null,
    }, { count: "exact" })
    .eq("id", RUN_ID)
    .eq("status", "failed");
  if (resetErr) throw new Error(`reset failed: ${resetErr.message}`);
  if (count === 0 && run.status !== "pending") {
    console.warn(`[canary] reset matched 0 rows — row already moved out of 'failed'; aborting`);
    process.exit(2);
  }
  console.log(`[canary] reset matched ${count} row(s) (already-pending resume = 0 is fine)`);

  const send = await inngest.send({
    name: "classifier/verdict.recorded",
    data: {
      automation_run_id: run.id,
      swarm_type: run.swarm_type,
      decision: "approve",
      message_id: messageId,
      source_mailbox: sourceMailbox,
      predicted_category: predictedCategory,
      override_category: null,
    },
  });

  console.log(`[canary] event emitted:`, send);
  console.log(`[canary] watch the row:`);
  console.log(
    `[canary]   SELECT status, error_message, completed_at FROM public.automation_runs WHERE id='${RUN_ID}';`,
  );
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
