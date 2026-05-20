// Spike 002 — apply candidate noise rules to the info@smeba.nl 90d corpus and report cluster sizes.
// Read-only. First-match-wins, ordered by specificity.

import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "email_pipeline" },
});

const MAILBOX = "info@smeba.nl";

interface Row {
  source_id: string;
  subject: string | null;
  sender_email: string | null;
  sender_name: string | null;
  body_text: string | null;
  received_at: string;
}

interface Rule {
  key: string;
  match: (r: Row) => boolean;
}

function domainOf(email: string | null): string {
  if (!email) return "";
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}

function local(email: string | null): string {
  if (!email) return "";
  const at = email.lastIndexOf("@");
  return at === -1 ? email.toLowerCase() : email.slice(0, at).toLowerCase();
}

// Smeba's own domains + sibling Moyne Roberts brands (cross-tenant own-domain loopback).
const OWN_DOMAINS = new Set([
  "smeba.nl",
  "smeba-fire.be",
  "moyneroberts.com",
  "fire-control.nl",
  "berki.nl",
  "sicli-noord.be",
  "sicli-sud.be",
]);

// Rules ordered by specificity. First match wins.
const RULES: Rule[] = [
  {
    key: "m365_spam_tag",
    match: (r) => /^\s*\[SPAM\]/i.test(r.subject || ""),
  },
  {
    key: "delivery_failure",
    match: (r) =>
      /(undeliverable|delivery (status notification|failure)|message not delivered|niet bestelbaar|niet bezorgd|mailer-daemon|postmaster)/i.test(
        (r.subject || "") + " " + local(r.sender_email)
      ),
  },
  {
    key: "auto_reply_ooo",
    match: (r) =>
      /(automatisch antwoord|automatic reply|automatische reply|out of office|afwezigheidsbericht|^read: |^gelezen: )/i.test(
        r.subject || ""
      ),
  },
  {
    key: "meta_facebook_notification",
    match: (r) => {
      const d = domainOf(r.sender_email);
      return (
        d === "business.facebook.com" ||
        d === "facebookmail.com" ||
        d.endsWith(".facebook.com") ||
        /^\[(meta|facebook)/i.test(r.subject || "")
      );
    },
  },
  {
    key: "noreply_notification",
    match: (r) => {
      const l = local(r.sender_email);
      return /^(noreply|no-reply|donotreply|do-not-reply|dontreply|notifications?|notify|alerts?|automated|mailer|postmaster|info-noreply)/i.test(
        l
      ) || /^(noreply|no-reply|notifications?)\./i.test(l);
    },
  },
  {
    key: "marketing_newsletter",
    match: (r) => {
      const l = local(r.sender_email);
      const d = domainOf(r.sender_email);
      // Local part markers
      if (/(newsletter|nieuwsbrief|marketing|news@|^news[-_.]|mailing|campaign|broadcast|^promo|^offers?|^deals?)/i.test(l)) return true;
      // Domain-based newsletter hints
      if (/^(mail|email|mailing|newsletter|news)\.|\.(mailchimp|sendgrid|mandrill|hubspot|constantcontact)\./i.test(d)) return true;
      return false;
    },
  },
  {
    key: "own_domain_loopback",
    match: (r) => OWN_DOMAINS.has(domainOf(r.sender_email)),
  },
];

async function fetchAll(): Promise<Row[]> {
  const PAGE = 1000;
  const rows: Row[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("emails")
      .select("source_id, subject, sender_email, sender_name, body_text, received_at")
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

function classify(r: Row): string {
  for (const rule of RULES) {
    if (rule.match(r)) return rule.key;
  }
  return "unknown";
}

async function main() {
  const rows = await fetchAll();
  console.log(`=== Spike 002 — info@smeba.nl noise clustering ===\n`);
  console.log(`Inbound rows: ${rows.length}\n`);

  const buckets: Record<string, Row[]> = {};
  for (const r of rows) {
    const k = classify(r);
    (buckets[k] = buckets[k] || []).push(r);
  }

  const order = [...RULES.map((r) => r.key), "unknown"];
  console.log(`Cluster sizes (first-match-wins, ordered by rule specificity):`);
  console.log(`${"key".padEnd(30)} ${"count".padStart(6)}  ${"%".padStart(5)}`);
  console.log("-".repeat(50));
  let totalClassified = 0;
  for (const key of order) {
    const n = (buckets[key] || []).length;
    if (n === 0) continue;
    const pct = ((n / rows.length) * 100).toFixed(1);
    console.log(`${key.padEnd(30)} ${String(n).padStart(6)}  ${pct.padStart(5)}%`);
    if (key !== "unknown") totalClassified += n;
  }
  console.log("-".repeat(50));
  const noisePct = ((totalClassified / rows.length) * 100).toFixed(1);
  console.log(`${"noise total (excl. unknown)".padEnd(30)} ${String(totalClassified).padStart(6)}  ${noisePct.padStart(5)}%`);
  console.log("");

  // Sample each cluster
  for (const key of order) {
    const bucket = buckets[key] || [];
    if (bucket.length === 0) continue;
    console.log(`\n--- ${key} (${bucket.length}) — sample subjects + senders ---`);
    const sample = bucket.slice(0, 8);
    for (const r of sample) {
      const subj = (r.subject || "(no subject)").slice(0, 80);
      console.log(`  ${(r.sender_email || "?").padEnd(45)}  ${subj}`);
    }
  }

  // Within the `unknown` bucket, surface the top sender domains so Spike 003 + the doc can reason about it
  const unknownDomainCounts: Record<string, number> = {};
  for (const r of buckets["unknown"] || []) {
    const d = domainOf(r.sender_email) || "(none)";
    unknownDomainCounts[d] = (unknownDomainCounts[d] || 0) + 1;
  }
  const unknownDomains = Object.entries(unknownDomainCounts).sort((a, b) => b[1] - a[1]).slice(0, 25);
  console.log(`\n--- 'unknown' bucket — top 25 sender domains ---`);
  for (const [d, n] of unknownDomains) {
    console.log(`  ${String(n).padStart(5)}  ${d}`);
  }

  // Within `unknown`, top sender addresses
  const unknownSenders: Record<string, number> = {};
  for (const r of buckets["unknown"] || []) {
    const s = (r.sender_email || "(none)").toLowerCase();
    unknownSenders[s] = (unknownSenders[s] || 0) + 1;
  }
  const topUnknownSenders = Object.entries(unknownSenders).sort((a, b) => b[1] - a[1]).slice(0, 25);
  console.log(`\n--- 'unknown' bucket — top 25 sender addresses ---`);
  for (const [s, n] of topUnknownSenders) {
    console.log(`  ${String(n).padStart(5)}  ${s}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
