import { createZapierSdk } from "@zapier/zapier-sdk";
import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

// Initialize Supabase — target the email_pipeline schema
const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "email_pipeline" },
});

// Initialize Zapier SDK
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

// Microsoft Graph base URL
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// Fields to select from Graph API
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

// Moyne Roberts Outlook connection (zapier@moyneroberts.com)
const OUTLOOK_CONNECTION_ID = "56014785";

async function fetchMessagesFromFolder(
  connectionId: string,
  mailbox: string,
  folder: "inbox" | "sentitems",
  direction: "incoming" | "sent"
): Promise<number> {
  // Cutoff: only fetch sent emails from 2025-01-01 onwards
  const dateFilter = direction === "sent"
    ? ` and receivedDateTime ge 2025-01-01T00:00:00Z`
    : "";

  // Resolve folder ID: try well-known name first, fall back to listing folders
  let folderPath = `mailFolders/${folder}`;
  const testRes = await zapier.fetch(
    `${GRAPH_BASE}/users/${mailbox}/mailFolders/${folder}?$select=id,displayName`,
    { method: "GET", connectionId }
  );
  if (!testRes.ok) {
    // Well-known name failed — look up by display name
    const displayName = folder === "inbox" ? "Inbox" : "Sent Items";
    console.log(`  Well-known folder "${folder}" not found, looking up "${displayName}"...`);
    const foldersRes = await zapier.fetch(
      `${GRAPH_BASE}/users/${mailbox}/mailFolders?$filter=displayName eq '${displayName}'&$select=id,displayName`,
      { method: "GET", connectionId }
    );
    if (foldersRes.ok) {
      const foldersData = await foldersRes.json() as { value: Array<{ id: string; displayName: string }> };
      if (foldersData.value?.length > 0) {
        folderPath = `mailFolders/${foldersData.value[0].id}`;
        console.log(`  Found folder ID: ${foldersData.value[0].id}`);
      } else {
        console.error(`  Folder "${displayName}" not found for ${mailbox}, skipping.`);
        return 0;
      }
    } else {
      console.error(`  Cannot list folders for ${mailbox}, skipping.`);
      return 0;
    }
  }

  let url = `${GRAPH_BASE}/users/${mailbox}/${folderPath}/messages?$select=${SELECT_FIELDS}&$filter=isDraft eq false${dateFilter}&$top=100&$orderby=receivedDateTime desc`;
  let totalFetched = 0;

  console.log(`  Fetching ${direction} emails from ${mailbox}...`);

  while (url) {
    const response = await zapier.fetch(url, {
      method: "GET",
      connectionId,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`  Error fetching ${direction} from ${mailbox}: ${response.status}`);
      console.error(`  ${errorText}`);
      break;
    }

    const data: GraphResponse = await response.json();
    const messages = data.value || [];

    if (messages.length === 0) break;

    // Transform and upsert to Supabase
    const rows = messages.map((msg) => ({
      source_id: msg.id,
      mailbox,
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

    const { error } = await supabase
      .from("emails")
      .upsert(rows, { onConflict: "source_id" });

    if (error) {
      console.error(`  Supabase upsert error: ${error.message}`);
    }

    totalFetched += messages.length;
    console.log(`  ...fetched ${totalFetched} ${direction} emails so far`);

    // Follow pagination
    url = data["@odata.nextLink"] || "";
  }

  return totalFetched;
}

async function main() {
  const mailboxes = config.mailboxes;

  if (mailboxes.length === 0) {
    console.error("No mailboxes configured. Set SHARED_MAILBOXES in .env");
    process.exit(1);
  }

  console.log(`Fetching emails from ${mailboxes.length} mailboxes...\n`);

  console.log(`Using Zapier connection: ${OUTLOOK_CONNECTION_ID}\n`);

  const results: Record<string, { incoming: number; sent: number }> = {};

  for (const mailbox of mailboxes) {
    console.log(`\n--- ${mailbox} ---`);

    const incoming = await fetchMessagesFromFolder(
      OUTLOOK_CONNECTION_ID,
      mailbox,
      "inbox",
      "incoming"
    );

    const sent = await fetchMessagesFromFolder(
      OUTLOOK_CONNECTION_ID,
      mailbox,
      "sentitems",
      "sent"
    );

    results[mailbox] = { incoming, sent };
  }

  // Summary
  console.log("\n\n=== FETCH COMPLETE ===\n");
  let totalEmails = 0;
  for (const [mailbox, counts] of Object.entries(results)) {
    console.log(`${mailbox}: ${counts.incoming} incoming, ${counts.sent} sent`);
    totalEmails += counts.incoming + counts.sent;
  }
  console.log(`\nTotal: ${totalEmails} emails stored in Supabase`);
}

main().catch(console.error);
