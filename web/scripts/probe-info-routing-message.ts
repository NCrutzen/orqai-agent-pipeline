// Reusable Outlook probe for info-routing messages.
//
// Usage:
//   cd web && npx tsx scripts/probe-info-routing-message.ts <mailbox> <messageId>
//
// Reads tokens from web/.env.local. Read-only Graph call.

import { getMessageMeta } from "../lib/outlook";

const [, , mailbox, messageId] = process.argv;
if (!mailbox || !messageId) {
  console.error("Usage: probe-info-routing-message.ts <mailbox> <messageId>");
  process.exit(2);
}

async function main(mb: string, mid: string) {
  console.log(`Probing ${mb} for message ${mid.slice(0, 40)}…\n`);
  let meta;
  try {
    meta = await getMessageMeta(mb, mid);
  } catch (err) {
    console.error("getMessageMeta failed:", String(err));
    process.exit(1);
  }

  console.log(`Subject:    ${meta.subject}`);
  console.log(`From:       ${meta.from}`);
  console.log(`Received:   ${meta.receivedAt}`);
  console.log(`Categories: ${JSON.stringify(meta.categories ?? [])}`);
}

main(mailbox, messageId).catch((err) => {
  console.error(err);
  process.exit(1);
});
