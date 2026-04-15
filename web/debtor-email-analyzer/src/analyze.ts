import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "email_pipeline" },
});

async function main() {
  console.log("=== DEBTOR EMAIL ANALYSIS ===\n");

  // 1. Overall stats — paginate to get all rows (Supabase default limit is 1000)
  const allEmails: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("emails")
      .select("mailbox, direction, conversation_id, sender_email, received_at, subject, is_read, has_attachments")
      .range(offset, offset + pageSize - 1);
    if (error) { console.error(error.message); break; }
    if (!data || data.length === 0) break;
    allEmails.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  if (!allEmails || allEmails.length === 0) {
    console.log("No emails found.");
    return;
  }

  console.log(`Total emails: ${allEmails.length}\n`);

  // 2. Per mailbox breakdown
  console.log("--- PER MAILBOX ---");
  const mailboxStats: Record<string, { incoming: number; sent: number; threads: Set<string> }> = {};
  for (const e of allEmails) {
    if (!mailboxStats[e.mailbox]) mailboxStats[e.mailbox] = { incoming: 0, sent: 0, threads: new Set() };
    mailboxStats[e.mailbox][e.direction as "incoming" | "sent"]++;
    if (e.conversation_id) mailboxStats[e.mailbox].threads.add(e.conversation_id);
  }
  for (const [mb, s] of Object.entries(mailboxStats)) {
    console.log(`${mb}: ${s.incoming} in, ${s.sent} out, ${s.threads.size} threads`);
  }

  // 3. Thread analysis — how many threads have both incoming AND sent?
  console.log("\n--- THREAD ANALYSIS ---");
  const threadMap: Record<string, { incoming: number; sent: number; mailbox: string }> = {};
  for (const e of allEmails) {
    if (!e.conversation_id) continue;
    const key = `${e.mailbox}::${e.conversation_id}`;
    if (!threadMap[key]) threadMap[key] = { incoming: 0, sent: 0, mailbox: e.mailbox };
    threadMap[key][e.direction as "incoming" | "sent"]++;
  }

  const threads = Object.values(threadMap);
  const threadsWithBoth = threads.filter((t) => t.incoming > 0 && t.sent > 0);
  const threadsIncomingOnly = threads.filter((t) => t.incoming > 0 && t.sent === 0);
  const threadsSentOnly = threads.filter((t) => t.incoming === 0 && t.sent > 0);

  console.log(`Total threads: ${threads.length}`);
  console.log(`Q&A threads (incoming + reply): ${threadsWithBoth.length} — usable for FAQ`);
  console.log(`Unanswered (incoming only): ${threadsIncomingOnly.length}`);
  console.log(`Outbound only (sent, no incoming): ${threadsSentOnly.length}`);

  // 4. Top senders
  console.log("\n--- TOP 20 SENDERS (incoming) ---");
  const senderCounts: Record<string, number> = {};
  for (const e of allEmails) {
    if (e.direction === "incoming" && e.sender_email) {
      senderCounts[e.sender_email] = (senderCounts[e.sender_email] || 0) + 1;
    }
  }
  const topSenders = Object.entries(senderCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  for (const [email, count] of topSenders) {
    console.log(`  ${count.toString().padStart(5)}  ${email}`);
  }

  // 5. Unread stats
  console.log("\n--- UNREAD / PENDING ---");
  const incoming = allEmails.filter((e) => e.direction === "incoming");
  const unread = incoming.filter((e) => !e.is_read);
  console.log(`Total incoming: ${incoming.length}`);
  console.log(`Unread: ${unread.length} (${((unread.length / incoming.length) * 100).toFixed(1)}%)`);

  // 6. Emails with attachments
  const withAttachments = allEmails.filter((e) => e.has_attachments);
  console.log(`\nEmails with attachments: ${withAttachments.length} (${((withAttachments.length / allEmails.length) * 100).toFixed(1)}%)`);

  // 7. Volume by month
  console.log("\n--- VOLUME BY MONTH ---");
  const monthCounts: Record<string, { incoming: number; sent: number }> = {};
  for (const e of allEmails) {
    if (!e.received_at) continue;
    const month = e.received_at.slice(0, 7); // YYYY-MM
    if (!monthCounts[month]) monthCounts[month] = { incoming: 0, sent: 0 };
    monthCounts[month][e.direction as "incoming" | "sent"]++;
  }
  const sortedMonths = Object.entries(monthCounts).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [month, counts] of sortedMonths) {
    console.log(`  ${month}: ${counts.incoming} in, ${counts.sent} out`);
  }

  // 8. Subject keyword frequency (simple word analysis)
  console.log("\n--- TOP 30 SUBJECT KEYWORDS ---");
  const stopwords = new Set([
    "de", "het", "een", "van", "in", "op", "te", "en", "is", "dat", "die",
    "voor", "met", "aan", "er", "om", "als", "bij", "tot", "uit", "werd",
    "re:", "fw:", "fwd:", "re", "fw", "fwd", "-", "–", "the", "to", "and",
    "of", "a", "your", "our", "we", "you", "has", "have", "been", "was",
    "nr", "nr.", "ref", "ref.", "//", "||", "|", ":", "e-mail", "email",
  ]);
  const wordCounts: Record<string, number> = {};
  for (const e of allEmails) {
    if (!e.subject) continue;
    const words = e.subject.toLowerCase().split(/[\s/\\|:;,.()\[\]{}]+/).filter(Boolean);
    for (const w of words) {
      if (w.length < 3 || stopwords.has(w)) continue;
      wordCounts[w] = (wordCounts[w] || 0) + 1;
    }
  }
  const topWords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);
  for (const [word, count] of topWords) {
    console.log(`  ${count.toString().padStart(5)}  ${word}`);
  }

  // 9. Sample subjects from unanswered threads
  console.log("\n--- SAMPLE UNANSWERED SUBJECTS (20) ---");
  const unansweredConvIds = new Set(
    threadsIncomingOnly.map((_, i) => {
      const key = Object.keys(threadMap).find(
        (k) => threadMap[k] === threadsIncomingOnly[i]
      );
      return key?.split("::")[1];
    }).filter(Boolean)
  );

  const unansweredEmails = allEmails
    .filter((e) => e.direction === "incoming" && unansweredConvIds.has(e.conversation_id))
    .sort((a, b) => (b.received_at || "").localeCompare(a.received_at || ""))
    .slice(0, 20);

  for (const e of unansweredEmails) {
    console.log(`  [${e.mailbox}] ${e.received_at?.slice(0, 10)} — ${e.subject?.slice(0, 80)}`);
  }
}

main().catch(console.error);
