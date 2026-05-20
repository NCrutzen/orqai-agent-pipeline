// Spike 001 — baseline stats for info@smeba.nl 90-day corpus.
// Read-only against email_pipeline.emails.

import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "email_pipeline" },
});

const MAILBOX = "info@smeba.nl";

interface Row {
  direction: string;
  subject: string | null;
  sender_email: string | null;
  sender_name: string | null;
  received_at: string;
  has_attachments: boolean | null;
  is_read: boolean | null;
  conversation_id: string | null;
}

function domainOf(email: string | null): string {
  if (!email) return "(none)";
  const at = email.lastIndexOf("@");
  return at === -1 ? "(invalid)" : email.slice(at + 1).toLowerCase();
}

async function main() {
  // Page through all rows to dodge default 1000-row limit.
  const PAGE_SIZE = 1000;
  const rows: Row[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("emails")
      .select("direction, subject, sender_email, sender_name, received_at, has_attachments, is_read, conversation_id")
      .eq("mailbox", MAILBOX)
      .order("received_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("Query error:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  console.log(`=== Spike 001 — info@smeba.nl baseline stats ===\n`);
  console.log(`Total rows: ${rows.length}`);

  // Date range
  if (rows.length === 0) return;
  const first = rows[0].received_at;
  const last = rows[rows.length - 1].received_at;
  const days = Math.max(
    1,
    Math.round((new Date(last).getTime() - new Date(first).getTime()) / 86_400_000)
  );
  console.log(`Date range: ${first.slice(0, 10)} → ${last.slice(0, 10)}  (${days} days)`);
  console.log(`Avg daily volume: ${(rows.length / days).toFixed(1)}/day\n`);

  // Direction split
  const byDir: Record<string, number> = {};
  for (const r of rows) byDir[r.direction] = (byDir[r.direction] || 0) + 1;
  console.log(`Direction split:`);
  for (const [d, n] of Object.entries(byDir)) console.log(`  ${d}: ${n}`);
  console.log("");

  const incoming = rows.filter((r) => r.direction === "incoming");

  // Attachment + read-state on inbound
  const withAttach = incoming.filter((r) => r.has_attachments).length;
  const read = incoming.filter((r) => r.is_read).length;
  console.log(`Inbound flags:`);
  console.log(`  with attachments: ${withAttach}  (${((withAttach / incoming.length) * 100).toFixed(1)}%)`);
  console.log(`  is_read=true:     ${read}  (${((read / incoming.length) * 100).toFixed(1)}%)`);
  console.log("");

  // Top 20 sender domains
  const domainCount: Record<string, number> = {};
  for (const r of incoming) {
    const d = domainOf(r.sender_email);
    domainCount[d] = (domainCount[d] || 0) + 1;
  }
  const topDomains = Object.entries(domainCount).sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log(`Top 20 sender domains (inbound):`);
  for (const [d, n] of topDomains) {
    console.log(`  ${String(n).padStart(5)}  ${((n / incoming.length) * 100).toFixed(1).padStart(4)}%  ${d}`);
  }
  console.log("");

  // Top 20 sender addresses
  const senderCount: Record<string, number> = {};
  for (const r of incoming) {
    const s = (r.sender_email || "(none)").toLowerCase();
    senderCount[s] = (senderCount[s] || 0) + 1;
  }
  const topSenders = Object.entries(senderCount).sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log(`Top 20 sender addresses (inbound):`);
  for (const [s, n] of topSenders) {
    console.log(`  ${String(n).padStart(5)}  ${s}`);
  }
  console.log("");

  // Subject prefix patterns
  const subjectPrefix: Record<string, number> = {};
  for (const r of incoming) {
    const subj = (r.subject || "").trim();
    // Capture leading bracketed prefixes like [SPAM], [EXT], [Phishing]
    const bracketMatch = subj.match(/^(\[[^\]]+\])/);
    if (bracketMatch) {
      subjectPrefix[bracketMatch[1].toUpperCase()] = (subjectPrefix[bracketMatch[1].toUpperCase()] || 0) + 1;
    }
    // Reply / forward prefixes
    const replyMatch = subj.match(/^(re:|fw:|fwd:|antw:|antwoord:|aw:|wg:|tr:|rv:)/i);
    if (replyMatch) {
      const key = replyMatch[1].toUpperCase();
      subjectPrefix[key] = (subjectPrefix[key] || 0) + 1;
    }
    // Automatic / OoO markers
    const autoMatch = subj.match(/(automatisch antwoord|automatic reply|out of office|afwezigheidsbericht|undeliverable|delivery (status notification|failure)|message not delivered|read:)/i);
    if (autoMatch) {
      const key = `~${autoMatch[1].toLowerCase()}`;
      subjectPrefix[key] = (subjectPrefix[key] || 0) + 1;
    }
  }
  const sortedPrefix = Object.entries(subjectPrefix).sort((a, b) => b[1] - a[1]).slice(0, 25);
  console.log(`Subject prefix / marker frequency (inbound):`);
  for (const [p, n] of sortedPrefix) {
    console.log(`  ${String(n).padStart(5)}  ${p}`);
  }
  console.log("");

  // Conversation thread density
  const convCount: Record<string, number> = {};
  for (const r of rows) {
    if (r.conversation_id) convCount[r.conversation_id] = (convCount[r.conversation_id] || 0) + 1;
  }
  const threads = Object.keys(convCount).length;
  const singletons = Object.values(convCount).filter((n) => n === 1).length;
  const maxThread = Math.max(...Object.values(convCount));
  console.log(`Threads:`);
  console.log(`  unique conversations:  ${threads}`);
  console.log(`  single-message threads: ${singletons}  (${((singletons / threads) * 100).toFixed(1)}%)`);
  console.log(`  max thread length:     ${maxThread}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
