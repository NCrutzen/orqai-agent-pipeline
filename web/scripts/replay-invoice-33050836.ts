/**
 * One-off replay for invoice 33050836 (Protest factuur — debiteuren@smeba.nl).
 *
 * Re-runs Stage 2 (label-resolver → NXT identifier_lookup → tests the Zap
 * SQL fix) and Stage 3 (coordinator → ranked intent) for the email
 * fdd6490d-d997-45d1-a6fe-09dfb237ea67.
 *
 * Two automation_runs exist (one per entity that ingested the email):
 *   - a5f4d1c3-5460-42dd-ba5b-5d8989ef0def  (smeba)
 *   - 509f4ce5-46ac-42c4-baa8-8b573c17fbaf  (smeba-fire)
 *
 * Usage:
 *   cd web
 *   npx tsx scripts/replay-invoice-33050836.ts          # dry-run
 *   npx tsx scripts/replay-invoice-33050836.ts --apply  # actually emit
 */
import { createClient } from "@supabase/supabase-js";
import { Inngest } from "inngest";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INNGEST_EVENT_KEY =
  process.env.INNGEST_EVENT_KEY_PROD ?? process.env.INNGEST_EVENT_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!INNGEST_EVENT_KEY) {
  console.error(
    "Missing INNGEST_EVENT_KEY_PROD (or INNGEST_EVENT_KEY) — production replay needs the prod key",
  );
  process.exit(1);
}
console.log(
  `[replay] inngest event key source: ${process.env.INNGEST_EVENT_KEY_PROD ? "INNGEST_EVENT_KEY_PROD" : "INNGEST_EVENT_KEY"}`,
);

const apply = process.argv.includes("--apply");
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});
const inngest = new Inngest({
  id: "replay-invoice-33050836",
  eventKey: INNGEST_EVENT_KEY,
});

const EMAIL_ID = "fdd6490d-d997-45d1-a6fe-09dfb237ea67";
const SOURCE_ID =
  "AAkALgAAAAAAHYQDEapmEc2byACqAC-EWg0AfVu6ColRQ0Cue2Zmzx_SzAACgjd4PgAA";

const TARGETS: Array<{
  automation_run_id: string;
  source_mailbox: string;
}> = [
  {
    automation_run_id: "a5f4d1c3-5460-42dd-ba5b-5d8989ef0def",
    source_mailbox: "debiteuren@smeba.nl",
  },
  {
    automation_run_id: "509f4ce5-46ac-42c4-baa8-8b573c17fbaf",
    source_mailbox: "debiteuren@smeba-fire.be",
  },
];

type SendFn = (payload: {
  name: string;
  data: Record<string, unknown>;
}) => Promise<unknown>;

async function main() {
  console.log(`[replay] mode: ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`[replay] email_id: ${EMAIL_ID}`);
  console.log(`[replay] targets: ${TARGETS.length}`);

  for (const t of TARGETS) {
    console.log(
      `[replay] ${apply ? "EMIT" : "would emit"} label-resolve.requested ` +
        `automation_run=${t.automation_run_id} mailbox=${t.source_mailbox}`,
    );

    if (!apply) continue;

    // Reset run so the resolver retry guard doesn't short-circuit.
    const { error: resetErr } = await admin
      .from("automation_runs")
      .update({
        status: "pending",
        error_message: null,
        completed_at: null,
      })
      .eq("id", t.automation_run_id);
    if (resetErr) {
      console.error(
        `[replay] reset failed for ${t.automation_run_id}: ${resetErr.message}`,
      );
      continue;
    }

    await (inngest.send as unknown as SendFn)({
      name: "debtor-email/stage-2.customer-resolve.requested",
      data: {
        automation_run_id: t.automation_run_id,
        swarm_type: "debtor-email",
        category_key: "unknown",
        message_id: SOURCE_ID,
        source_mailbox: t.source_mailbox,
      },
    });
    console.log(`[replay] emitted for ${t.automation_run_id}`);
  }

  console.log("[replay] done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
