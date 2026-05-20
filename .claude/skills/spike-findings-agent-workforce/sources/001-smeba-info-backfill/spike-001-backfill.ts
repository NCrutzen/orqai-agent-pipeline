// Spike 001 — bounded 90-day backfill of info@smeba.nl into email_pipeline.emails.
// Idempotent: upserts on source_id. Mirrors fetch-emails.ts logic but scoped to one mailbox + 90d window.

import { createZapierSdk } from "@zapier/zapier-sdk";
import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "email_pipeline" },
});

const zapier = createZapierSdk(
  config.zapier.clientId
    ? {
        credentials: {
          clientId: config.zapier.clientId,
          clientSecret: config.zapier.clientSecret!,
        },
      }
    : undefined
);

const CONNECTION_ID = "56014785"; // zapier@moyneroberts.com
const MAILBOX = "info@smeba.nl";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const LOOKBACK_DAYS = 90;

const SELECT_FIELDS = [
  "id",
  "subject",
  "bodyPreview",
  "body",
  "from",
  "toRecipients",
  "ccRecipients",
  "receivedDateTime",
  "hasAttachments",
  "isRead",
  "importance",
  "conversationId",
  "internetMessageId",
  "isDraft",
].join(",");

interface GraphMessage {
  id: string;
  subject: string;
  body: { contentType: string; content: string };
  bodyPreview: string;
  from: { emailAddress: { name: string; address: string } };
  toRecipients: Array<{ emailAddress: { name: string; address: string } }>;
  ccRecipients: Array<{ emailAddress: { name: string; address: string } }>;
  receivedDateTime: string;
  hasAttachments: boolean;
  isRead: boolean;
  importance: string;
  conversationId: string;
  internetMessageId: string;
  isDraft: boolean;
}

interface GraphResponse {
  value: GraphMessage[];
  "@odata.nextLink"?: string;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function backfillFolder(
  folder: "inbox" | "sentitems",
  direction: "incoming" | "sent",
  sinceIso: string
): Promise<{ fetched: number; upserted: number; errors: number }> {
  const dateFilter = `receivedDateTime ge ${sinceIso} and isDraft eq false`;
  let url = `${GRAPH_BASE}/users/${MAILBOX}/mailFolders/${folder}/messages?$select=${SELECT_FIELDS}&$filter=${encodeURIComponent(dateFilter)}&$top=100&$orderby=receivedDateTime desc`;

  let fetched = 0;
  let upserted = 0;
  let errors = 0;
  let page = 0;

  console.log(`  [${folder}] starting from ${sinceIso}`);

  while (url) {
    page += 1;
    const response = await zapier.fetch(url, { method: "GET", connectionId: CONNECTION_ID });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`  [${folder}] page ${page} HTTP ${response.status}: ${errorText.slice(0, 300)}`);
      errors += 1;
      break;
    }

    const data: GraphResponse = await response.json();
    const messages = data.value || [];
    if (messages.length === 0) break;

    const rows = messages.map((msg) => ({
      source_id: msg.id,
      mailbox: MAILBOX,
      direction,
      subject: msg.subject,
      body_text: msg.bodyPreview,
      body_html: msg.body?.contentType === "html" ? msg.body.content : null,
      sender_email: msg.from?.emailAddress?.address,
      sender_name: msg.from?.emailAddress?.name,
      recipients: {
        to: msg.toRecipients?.map((r) => r.emailAddress) || [],
        cc: msg.ccRecipients?.map((r) => r.emailAddress) || [],
      },
      received_at: msg.receivedDateTime,
      has_attachments: msg.hasAttachments,
      is_read: msg.isRead,
      importance: msg.importance,
      conversation_id: msg.conversationId,
      internet_message_id: msg.internetMessageId,
      raw_json: msg,
    }));

    const { error } = await supabase.from("emails").upsert(rows, { onConflict: "source_id" });
    if (error) {
      console.error(`  [${folder}] page ${page} upsert error: ${error.message}`);
      errors += 1;
    } else {
      upserted += rows.length;
    }

    fetched += messages.length;
    if (page % 5 === 0) {
      console.log(`  [${folder}] page ${page}: fetched=${fetched} upserted=${upserted}`);
    }

    url = data["@odata.nextLink"] || "";
  }

  console.log(`  [${folder}] done: fetched=${fetched} upserted=${upserted} errors=${errors}`);
  return { fetched, upserted, errors };
}

async function main() {
  const since = isoDaysAgo(LOOKBACK_DAYS);
  console.log(`Backfilling ${MAILBOX} since ${since}\n`);

  const inbox = await backfillFolder("inbox", "incoming", since);
  const sent = await backfillFolder("sentitems", "sent", since);

  console.log("\n=== BACKFILL COMPLETE ===");
  console.log(`  inbox:  fetched=${inbox.fetched}  upserted=${inbox.upserted}  errors=${inbox.errors}`);
  console.log(`  sent:   fetched=${sent.fetched}   upserted=${sent.upserted}   errors=${sent.errors}`);
  console.log(`  total fetched: ${inbox.fetched + sent.fetched}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
