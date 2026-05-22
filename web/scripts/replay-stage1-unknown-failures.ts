/**
 * One-off replay for the Phase 74 dispatch-break bug
 * (`stage1-unknown-no-dispatch` debug session).
 *
 * Bug: classifier-label-resolver looked up email_pipeline.emails by
 * `internet_message_id`, but outlook-zapier writes the Outlook Graph id
 * to `source_id`. Every Stage-1 LLM Pass-2 `unknown` verdict hit
 * `mark-failed-email-missing` and never reached Stage 2.
 *
 * Fix: classifier-label-resolver.ts now matches on
 * `source_id.eq.X,internet_message_id.eq.X` (consistent with
 * classifier-invoice-copy-handler.ts:237).
 *
 * **MUST RUN AFTER the fix is deployed to Vercel.** If you replay before
 * the Inngest functions on Vercel reflect the new code, the replay just
 * re-fails with the old `email row not found` error.
 *
 * Usage:
 *   cd web
 *   npx tsx scripts/replay-stage1-unknown-failures.ts          # dry-run (default)
 *   npx tsx scripts/replay-stage1-unknown-failures.ts --apply  # actually emit
 */
import { createClient } from "@supabase/supabase-js";
import { Inngest } from "inngest";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}
if (!INNGEST_EVENT_KEY) {
  console.error("Missing INNGEST_EVENT_KEY in env (needed to send Inngest events)");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});
const inngest = new Inngest({
  id: "replay-stage1-unknown",
  eventKey: INNGEST_EVENT_KEY,
});

type FailedRun = {
  id: string;
  swarm_type: string | null;
  error_message: string | null;
  created_at: string;
  // automation_runs persists the runtime payload (message_id, source_mailbox,
  // entity, subject, …) inside the `result` JSONB column. Confirmed via
  // information_schema query — there is no top-level message_id column.
  result: Record<string, unknown> | null;
};

async function main() {
  console.log(`[replay] mode: ${apply ? "APPLY" : "DRY-RUN"}`);

  const { data, error } = await admin
    .from("automation_runs")
    .select("id, swarm_type, error_message, created_at, result")
    .eq("status", "failed")
    .like("error_message", "email row not found for message_id=%")
    .gte("created_at", "2026-05-01T00:00:00Z")
    .order("created_at", { ascending: true })
    .returns<FailedRun[]>();

  if (error) {
    throw new Error(`load failed runs: ${error.message}`);
  }
  const runs = data ?? [];
  console.log(`[replay] found ${runs.length} candidate failed runs`);

  let emitted = 0;
  let skipped = 0;
  for (const run of runs) {
    const result = (run.result ?? {}) as Record<string, unknown>;
    const messageId = (result.message_id as string | undefined) ?? null;
    const sourceMailbox = (result.source_mailbox as string | undefined) ?? null;
    // Every Phase 74 dispatch-break failure was on the `unknown` swarm_dispatch
    // route — no other category_key reaches the label-resolver in production.
    const categoryKey = "unknown";
    const swarmType = run.swarm_type ?? "debtor-email";

    if (!messageId || !sourceMailbox) {
      console.warn(
        `[replay] skip ${run.id} — missing message_id or source_mailbox`,
      );
      skipped++;
      continue;
    }

    console.log(
      `[replay] ${apply ? "EMIT" : "would emit"} label-resolve.requested ` +
        `automation_run=${run.id} message_id=${messageId.slice(0, 16)}… ` +
        `mailbox=${sourceMailbox}`,
    );

    if (apply) {
      // Reset the run so the resolver's mark-failed branch can transition
      // it cleanly without confusing the retry guard.
      const { error: resetErr } = await admin
        .from("automation_runs")
        .update({
          status: "pending",
          error_message: null,
          completed_at: null,
        })
        .eq("id", run.id)
        .eq("status", "failed");
      if (resetErr) {
        console.error(`[replay] reset failed for ${run.id}: ${resetErr.message}`);
        continue;
      }

      await inngest.send({
        name: "debtor-email/stage-2.customer-resolve.requested",
        data: {
          automation_run_id: run.id,
          swarm_type: swarmType,
          category_key: categoryKey,
          message_id: messageId,
          source_mailbox: sourceMailbox,
        },
      });
      emitted++;
    }
  }

  console.log(
    `[replay] done. ${apply ? "emitted" : "would emit"}=${apply ? emitted : runs.length - skipped}, skipped=${skipped}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
