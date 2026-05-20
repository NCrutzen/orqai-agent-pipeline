// Spike 001 — probe info@smeba.nl volume before any backfill writes.
// Counts only; does NOT write to Supabase.

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

const CONNECTION_ID = "56014785"; // zapier@moyneroberts.com
const MAILBOX = "info@smeba.nl";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function countInFolder(folder: "inbox" | "sentitems", sinceIso: string): Promise<number> {
  const url = `${GRAPH_BASE}/users/${MAILBOX}/mailFolders/${folder}/messages/$count?$filter=receivedDateTime ge ${sinceIso} and isDraft eq false`;
  const res = await zapier.fetch(url, {
    method: "GET",
    connectionId: CONNECTION_ID,
    headers: { ConsistencyLevel: "eventual" },
  });
  if (!res.ok) {
    console.error(`  ${folder} count failed: ${res.status} ${await res.text()}`);
    return -1;
  }
  return parseInt(await res.text(), 10);
}

async function main() {
  const windows = [7, 30, 90, 365];
  console.log(`Probing volume for ${MAILBOX} via connection ${CONNECTION_ID}\n`);

  for (const days of windows) {
    const since = isoDaysAgo(days);
    const inbox = await countInFolder("inbox", since);
    const sent = await countInFolder("sentitems", since);
    const total = inbox >= 0 && sent >= 0 ? inbox + sent : "ERROR";
    const ratePerDay = typeof total === "number" ? (total / days).toFixed(1) : "-";
    console.log(
      `  last ${String(days).padStart(3)}d (${since.slice(0, 10)}+):  inbox=${String(inbox).padStart(5)}  sent=${String(sent).padStart(4)}  total=${total}  (~${ratePerDay}/day)`
    );
  }

  // All-time inbox count (upper bound)
  console.log("");
  const allRes = await zapier.fetch(
    `${GRAPH_BASE}/users/${MAILBOX}/mailFolders/inbox/messages/$count`,
    { method: "GET", connectionId: CONNECTION_ID, headers: { ConsistencyLevel: "eventual" } }
  );
  if (allRes.ok) {
    console.log(`  inbox all-time:  ${await allRes.text()}`);
  }
  const sentAllRes = await zapier.fetch(
    `${GRAPH_BASE}/users/${MAILBOX}/mailFolders/sentitems/messages/$count`,
    { method: "GET", connectionId: CONNECTION_ID, headers: { ConsistencyLevel: "eventual" } }
  );
  if (sentAllRes.ok) {
    console.log(`  sent  all-time:  ${await sentAllRes.text()}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
