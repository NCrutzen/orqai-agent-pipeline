// One-shot probe — verify the live info@smeba.nl email was actually
// categorized + archived after the Zap ingested it 2026-05-21.
//
// Usage:  cd web && npx tsx scripts/probe-info-smeba-archive.ts
//
// Reads tokens from web/.env.local. Writes nothing — read-only Graph calls.

import { getMessageMeta } from "../lib/outlook";

const MAILBOX = "info@smeba.nl";
const MESSAGE_ID =
  "AAkALgAAAAAAHYQDEapmEc2byACqAC-EWg0AOkENgZYFrEyYazJA0KJWBQACl69jgAAA";

async function main() {
  console.log(`Probing ${MAILBOX} for message ${MESSAGE_ID.slice(0, 40)}…\n`);

  let meta;
  try {
    meta = await getMessageMeta(MAILBOX, MESSAGE_ID);
  } catch (err) {
    console.error("getMessageMeta failed:", String(err));
    process.exit(1);
  }

  console.log(`Subject:    ${meta.subject}`);
  console.log(`From:       ${meta.from}`);
  console.log(`Received:   ${meta.receivedAt}`);
  console.log(`Categories: ${JSON.stringify(meta.categories ?? [])}`);

  console.log("\nVerdict:");
  const cats = meta.categories ?? [];
  const hasSpamCategory = cats.some((c) => c.toLowerCase().includes("spam"));
  console.log(`  Has "Spam" category:    ${hasSpamCategory ? "YES ✓" : "NO ✗"}`);
  if (!hasSpamCategory && cats.length > 0) {
    console.log(`  Other categories seen:  ${cats.join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
