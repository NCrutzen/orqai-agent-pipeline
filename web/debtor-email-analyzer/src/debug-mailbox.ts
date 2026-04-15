import { createZapierSdk } from "@zapier/zapier-sdk";
import { config } from "./config.js";

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

const CONNECTION_ID = "56014785";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const mailbox = process.argv[2] || "debiteuren@berki.nl";

async function main() {
  console.log(`Debugging mailbox: ${mailbox}\n`);

  // Check if user exists
  console.log("1. Checking user...");
  const userRes = await zapier.fetch(`${GRAPH_BASE}/users/${mailbox}`, {
    method: "GET",
    connectionId: CONNECTION_ID,
  });
  console.log(`   Status: ${userRes.status}`);
  const userData = await userRes.json();
  console.log(`   Response: ${JSON.stringify(userData, null, 2).slice(0, 500)}\n`);

  // List mail folders
  console.log("2. Listing mail folders...");
  const foldersRes = await zapier.fetch(`${GRAPH_BASE}/users/${mailbox}/mailFolders?$top=50`, {
    method: "GET",
    connectionId: CONNECTION_ID,
  });
  console.log(`   Status: ${foldersRes.status}`);
  const foldersData = await foldersRes.json();
  if (foldersData.value) {
    for (const f of foldersData.value) {
      console.log(`   - ${f.displayName} (${f.totalItemCount} items, ${f.unreadItemCount} unread)`);
    }
  } else {
    console.log(`   Response: ${JSON.stringify(foldersData, null, 2).slice(0, 500)}`);
  }

  // Try fetching messages directly
  console.log("\n3. Trying to fetch messages directly...");
  const msgRes = await zapier.fetch(`${GRAPH_BASE}/users/${mailbox}/messages?$top=5&$select=subject,receivedDateTime`, {
    method: "GET",
    connectionId: CONNECTION_ID,
  });
  console.log(`   Status: ${msgRes.status}`);
  const msgData = await msgRes.json();
  if (msgData.value) {
    for (const m of msgData.value) {
      console.log(`   - [${m.receivedDateTime}] ${m.subject}`);
    }
  } else {
    console.log(`   Response: ${JSON.stringify(msgData, null, 2).slice(0, 500)}`);
  }
}

main().catch(console.error);
