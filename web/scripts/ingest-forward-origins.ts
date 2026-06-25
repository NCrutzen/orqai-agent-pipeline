/**
 * Targeted ingest for the forward-Wilson backfill — grow N cheaply.
 *
 * The forward-Wilson backfill can only grade a forward whose ORIGINAL inbound is
 * in email_pipeline.emails. In a 180d window ~356 of 764 forwards had no inbound
 * match (the swarm only recently started ingesting info@). This script fetches
 * just those missing originals via Graph (the conversation's earliest external
 * message) and INSERTS the email row — NO pipeline run, NO LLM, NO inbox labels.
 * After it, re-run forward-wilson-backfill.ts for a larger sample.
 *
 *   npx tsx web/scripts/ingest-forward-origins.ts                 # ingest missing originals
 *   npx tsx web/scripts/ingest-forward-origins.ts --lookback-days 365 --max 800
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(__dirname, "..", ".env.local") });
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchForwardsByConversation } from "@/lib/automations/info-routing/forward-observer";
import { fetchConversationMessages } from "@/lib/outlook";

const MAILBOXES = ["info@smeba.nl", "info@fire-control.nl"];

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? parseInt(process.argv[i + 1], 10) : def;
}

async function main() {
  const admin = createAdminClient();
  const lookbackDays = arg("--lookback-days", 180);
  const max = arg("--max", 1000);
  const sinceIso = new Date(Date.now() - lookbackDays * 86400_000).toISOString();

  // 1. forwarded conversationIds per mailbox.
  const byMailbox: Array<{ mailbox: string; convs: string[] }> = [];
  const allConvs: string[] = [];
  for (const mailbox of MAILBOXES) {
    const map = await fetchForwardsByConversation(mailbox, sinceIso);
    const convs = [...map.keys()];
    byMailbox.push({ mailbox, convs });
    allConvs.push(...convs);
    console.log(`  ${mailbox}: ${convs.length} forwarded conversation(s)`);
  }

  // 2. which conversationIds already have an inbound row.
  const have = new Set<string>();
  for (let i = 0; i < allConvs.length; i += 100) {
    const chunk = allConvs.slice(i, i + 100);
    const { data } = await admin
      .schema("email_pipeline")
      .from("emails")
      .select("conversation_id")
      .in("conversation_id", chunk);
    for (const r of (data ?? []) as Array<{ conversation_id: string | null }>)
      if (r.conversation_id) have.add(r.conversation_id);
  }

  let ingested = 0,
    noOriginal = 0,
    failed = 0,
    budget = max;
  for (const { mailbox, convs } of byMailbox) {
    const lower = mailbox.toLowerCase();
    for (const conv of convs) {
      if (budget <= 0) break;
      if (have.has(conv)) continue;
      budget--;
      try {
        // Earliest message in the conversation whose sender is NOT this info@
        // box = the original external inbound. fetchConversationMessages returns
        // priors sorted desc; take the oldest external one.
        const msgs = await fetchConversationMessages(mailbox, conv, "", 15);
        const external = msgs
          .filter((m) => (m.senderEmail ?? "").toLowerCase() !== lower)
          .sort((a, b) => (a.receivedAt ?? "").localeCompare(b.receivedAt ?? ""));
        const orig = external[0];
        if (!orig || !orig.sourceMessageId) {
          noOriginal++;
          continue;
        }
        const body = orig.bodyText ?? "";
        const { error } = await admin
          .schema("email_pipeline")
          .from("emails")
          .upsert(
            {
              source_id: orig.sourceMessageId,
              source: "backfill-forward-origin",
              mailbox,
              subject: orig.subject ?? "",
              body_text: body,
              body_full_text: body,
              body_unique_text: body,
              conversation_id: conv,
              sender_email: orig.senderEmail ?? "",
              received_at: orig.receivedAt || null,
              direction: "inbound",
            },
            { onConflict: "source_id" },
          );
        if (error) {
          failed++;
          if (failed <= 5) console.warn(`  insert failed (${conv.slice(0, 12)}): ${error.message}`);
        } else ingested++;
      } catch (e) {
        failed++;
        if (failed <= 5) console.warn(`  graph failed (${conv.slice(0, 12)}): ${String(e).slice(0, 80)}`);
      }
    }
  }
  console.log(
    `\nDone. ingested=${ingested} · already-had=${[...have].length} · no-original=${noOriginal} · failed=${failed}` +
      `\nNow re-run: npx tsx web/scripts/forward-wilson-backfill.ts --lookback-days ${lookbackDays} --max-reclassify 1500`,
  );
}
main().catch((e) => {
  console.error("INGEST FAILED:", String(e));
  process.exit(1);
});
