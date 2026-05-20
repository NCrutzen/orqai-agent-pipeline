// Spike 003 — run debtor-email's production classifier against the Smeba info@ corpus.
// Read-only. Answers: how well does the existing regex set fit the info-inbox flavour,
// and where do we have over-/under-reach?

import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

// Dynamic import — the static ESM import was unable to resolve named exports
// from a .ts file under ../../lib in this tsx + Node 24 configuration. Dynamic
// import works around the static-resolution bug.
const classifierMod: any = await import("../../lib/debtor-email/classify.ts" as string);
const classify: (i: { subject: string; from: string; bodySnippet?: string }) => {
  category: string;
  confidence: number;
  matchedRule: string;
} = classifierMod.classify;

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "email_pipeline" },
});

const MAILBOX = "info@smeba.nl";

interface Row {
  source_id: string;
  subject: string | null;
  sender_email: string | null;
  body_text: string | null;
}

async function fetchAll(): Promise<Row[]> {
  const PAGE = 1000;
  const rows: Row[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("emails")
      .select("source_id, subject, sender_email, body_text")
      .eq("mailbox", MAILBOX)
      .eq("direction", "incoming")
      .order("received_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function main() {
  const rows = await fetchAll();
  console.log(`=== Spike 003 — debtor-email classifier vs Smeba info corpus ===\n`);
  console.log(`Inbound rows: ${rows.length}\n`);

  const buckets: Record<string, Row[]> = {};
  const ruleBuckets: Record<string, number> = {};

  for (const r of rows) {
    const res = classify({
      subject: r.subject || "",
      from: r.sender_email || "",
      bodySnippet: r.body_text || "",
    });
    (buckets[res.category] = buckets[res.category] || []).push(r);
    ruleBuckets[res.matchedRule] = (ruleBuckets[res.matchedRule] || 0) + 1;
  }

  // Category breakdown
  console.log(`=== Category breakdown (debtor-email categories applied to Smeba) ===`);
  console.log(`${"category".padEnd(25)} ${"count".padStart(6)}  ${"%".padStart(5)}`);
  console.log("-".repeat(45));
  const sortedCats = Object.entries(buckets).sort((a, b) => b[1].length - a[1].length);
  for (const [cat, bucket] of sortedCats) {
    const pct = ((bucket.length / rows.length) * 100).toFixed(1);
    console.log(`${cat.padEnd(25)} ${String(bucket.length).padStart(6)}  ${pct.padStart(5)}%`);
  }
  console.log("");

  // Rule breakdown — which named rule fired
  console.log(`=== Matched rule breakdown ===`);
  const sortedRules = Object.entries(ruleBuckets).sort((a, b) => b[1] - a[1]);
  for (const [rule, n] of sortedRules) {
    const pct = ((n / rows.length) * 100).toFixed(1);
    console.log(`  ${String(n).padStart(5)}  ${pct.padStart(4)}%  ${rule}`);
  }
  console.log("");

  // Detailed look at what fell into each non-unknown category — are these correct on info-inbox?
  for (const [cat, bucket] of sortedCats) {
    if (cat === "unknown") continue;
    console.log(`\n--- ${cat} (${bucket.length}) — sample of 6 ---`);
    for (const r of bucket.slice(0, 6)) {
      const subj = (r.subject || "(no subject)").slice(0, 75);
      console.log(`  ${(r.sender_email || "?").padEnd(40)}  ${subj}`);
    }
  }

  // Cross-tab Spike 002's rules against Spike 003's category for the unknown bucket
  console.log(`\n\n=== unknown-bucket shape (1227 emails) ===`);
  const unknownBucket = buckets["unknown"] || [];
  const unknownDomains: Record<string, number> = {};
  for (const r of unknownBucket) {
    const at = (r.sender_email || "").lastIndexOf("@");
    const d = at === -1 ? "(none)" : (r.sender_email || "").slice(at + 1).toLowerCase();
    unknownDomains[d] = (unknownDomains[d] || 0) + 1;
  }
  const topUnknownDomains = Object.entries(unknownDomains).sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log(`Top 15 sender domains in 'unknown':`);
  for (const [d, n] of topUnknownDomains) {
    console.log(`  ${String(n).padStart(5)}  ${d}`);
  }
  console.log("");

  // Specifically check what happened to the own_domain_loopback emails (smeba.nl etc.) that Spike 002 flagged
  const ownDomains = new Set([
    "smeba.nl",
    "smeba-fire.be",
    "moyneroberts.com",
    "fire-control.nl",
    "berki.nl",
    "sicli-noord.be",
    "sicli-sud.be",
  ]);
  const ownLoopbackRows = rows.filter((r) => {
    const at = (r.sender_email || "").lastIndexOf("@");
    const d = at === -1 ? "" : (r.sender_email || "").slice(at + 1).toLowerCase();
    return ownDomains.has(d);
  });
  const ownClassified: Record<string, number> = {};
  for (const r of ownLoopbackRows) {
    const res = classify({
      subject: r.subject || "",
      from: r.sender_email || "",
      bodySnippet: r.body_text || "",
    });
    ownClassified[res.category] = (ownClassified[res.category] || 0) + 1;
  }
  console.log(`=== How debtor-email classifies Smeba's own-domain-loopback bucket (Spike 002: 950 rows) ===`);
  for (const [cat, n] of Object.entries(ownClassified).sort((a, b) => b[1] - a[1])) {
    const pct = ((n / ownLoopbackRows.length) * 100).toFixed(1);
    console.log(`  ${cat.padEnd(25)} ${String(n).padStart(5)}  ${pct.padStart(4)}%`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
