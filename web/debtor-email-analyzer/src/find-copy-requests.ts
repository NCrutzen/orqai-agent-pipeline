import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

// Goal: find incoming emails in sales + debtor mailboxes that request a COPY of a specific document.
// Strategy:
//  1) Cast wide net by keyword (NL + EN)
//  2) Only incoming
//  3) Classify each hit by document type using regex heuristics
//  4) Report totals per document type + per mailbox category (debtor vs sales)

const pipeline = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "email_pipeline" },
});

// Copy-intent keywords (NL dominant, some EN)
const COPY_TERMS = [
  "kopie",
  "kopy",
  "duplicaat",
  "afschrift",
  "nogmaals toe",
  "nogmaals sturen",
  "opnieuw sturen",
  "opnieuw toe",
  "copy of",
  "duplicate",
  "resend",
  "re-send",
  "please send",
];

// Document-type classifiers — order matters (first match wins)
const DOC_TYPES: { label: string; pattern: RegExp }[] = [
  { label: "invoice (factuur)", pattern: /\b(factu|factuur|facturen|invoice|invoices)\b/i },
  { label: "work order / werkbon", pattern: /\b(werkbon|werkbonnen|werk\s*bon|work\s*order|workorder)\b/i },
  { label: "location sheet / locatiestaat", pattern: /\b(locatiestaat|location\s*sheet|locatie\s*staat|locatielijst)\b/i },
  { label: "packing slip / pakbon", pattern: /\b(pakbon|packing\s*slip|leverbon)\b/i },
  { label: "quote / offerte", pattern: /\b(offerte|offertes|quote|quotation)\b/i },
  { label: "certificate / certificaat", pattern: /\b(certificaat|certificaten|certificate|certificaten\s*nen-?2535)\b/i },
  { label: "contract / overeenkomst", pattern: /\b(contract|contracten|overeenkomst)\b/i },
  { label: "credit note / creditnota", pattern: /\b(creditnota|credit\s*nota|credit\s*note|creditfactuur)\b/i },
  { label: "order confirmation / orderbevestiging", pattern: /\b(orderbevestiging|order\s*confirmation)\b/i },
  { label: "delivery note / afleverbon", pattern: /\b(afleverbon|delivery\s*note)\b/i },
  { label: "reminder / herinnering / aanmaning", pattern: /\b(aanmaning|herinnering|reminder)\b/i },
  { label: "statement / overzicht", pattern: /\b(rekeningoverzicht|openstaande\s*posten|statement)\b/i },
];

type Email = {
  id: string;
  subject: string | null;
  body_text: string | null;
  sender_email: string | null;
  mailbox: string | null;
  direction: string | null;
  received_at: string | null;
};

const COPY_REGEX = new RegExp(
  COPY_TERMS.map((t) => t.replace(/\s+/g, "\\s+")).join("|"),
  "i",
);

function classifyMailbox(mailbox: string | null): "debtor" | "sales" | "other" {
  if (!mailbox) return "other";
  const m = mailbox.toLowerCase();
  if (m.includes("debiteur") || m.includes("debtor") || m.includes("facturation")) return "debtor";
  if (
    m.includes("verkoop") ||
    m.includes("sales") ||
    m.includes("info@smeba") ||
    m.startsWith("smeba brandbeveiliging") ||
    m.includes("send to verkoop")
  )
    return "sales";
  return "other";
}

function classifyDocument(text: string): string[] {
  const hits: string[] = [];
  for (const { label, pattern } of DOC_TYPES) {
    if (pattern.test(text)) hits.push(label);
  }
  return hits;
}

// Prefer subject. Fall back to body.
function primaryDocType(subject: string, body: string): string | null {
  // 1) If subject has both a copy keyword AND a doc term, pick by priority order (DOC_TYPES order)
  if (COPY_REGEX.test(subject)) {
    const subjHits = classifyDocument(subject);
    if (subjHits.length > 0) return subjHits[0];
  }
  // 2) Fallback: in body, find doc term closest to copy keyword
  const bodyCopy = COPY_REGEX.exec(body);
  if (bodyCopy) {
    const copyIdx = bodyCopy.index;
    let best: { label: string; distance: number } | null = null;
    for (const { label, pattern } of DOC_TYPES) {
      const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(body)) !== null) {
        const d = Math.abs(m.index - copyIdx);
        if (!best || d < best.distance) best = { label, distance: d };
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }
    if (best && best.distance <= 60) return best.label;
  }
  // 3) Last resort: subject doc term even without subject copy keyword
  const subjHits = classifyDocument(subject);
  if (subjHits.length > 0) return subjHits[0];
  return null;
}

const SCOPE_MAILBOXES = [
  "debiteuren@smeba.nl",
  "debiteuren@sicli-noord.be",
  "debiteuren@berki.nl",
  "debiteuren@smeba-fire.be",
  "facturations@sicli-sud.be",
  "verkoop@smeba.nl",
  "Smeba Brandbeveiliging BV",
  "INFO@Smeba New Cases, Smeba Brandbeveiliging BV",
];

async function fetchAll(column: "subject" | "body_text", term: string): Promise<Email[]> {
  const out: Email[] = [];
  // Scope per mailbox to avoid statement-timeout on full-table ilike
  for (const mb of SCOPE_MAILBOXES) {
    let from = 0;
    const pageSize = 500;
    while (true) {
      const { data, error } = await pipeline
        .from("emails")
        .select("id, subject, body_text, sender_email, mailbox, direction, received_at")
        .ilike(column, `%${term}%`)
        .in("direction", ["incoming", "inbound"])
        .eq("mailbox", mb)
        .range(from, from + pageSize - 1);
      if (error) {
        console.error(`  [${term} / ${column} / ${mb}] ${error.message}`);
        break;
      }
      if (!data || data.length === 0) break;
      out.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
  }
  return out;
}

async function main() {
  // 0) Show distinct mailboxes so we know the label universe
  const { data: mailboxRows } = await pipeline
    .from("emails")
    .select("mailbox")
    .not("mailbox", "is", null)
    .limit(50000);
  const mailboxes = new Map<string, number>();
  for (const r of mailboxRows || []) {
    const mb = r.mailbox || "(null)";
    mailboxes.set(mb, (mailboxes.get(mb) || 0) + 1);
  }
  console.log("=== Mailboxes (count) ===");
  for (const [mb, n] of [...mailboxes.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${mb}: ${n}  [${classifyMailbox(mb)}]`);
  }
  console.log();

  // 1) Pull candidate emails via copy terms
  const seen = new Map<string, Email>();
  for (const term of COPY_TERMS) {
    for (const col of ["subject", "body_text"] as const) {
      const rows = await fetchAll(col, term);
      for (const r of rows) if (!seen.has(r.id)) seen.set(r.id, r);
      console.log(`"${term}" in ${col}: +${rows.length} (unique so far ${seen.size})`);
    }
  }
  const candidates = [...seen.values()];
  console.log(`\nCandidates (incoming, any mailbox): ${candidates.length}`);

  // 2) Filter to debtor + sales mailboxes
  const scoped = candidates.filter((e) => {
    const cat = classifyMailbox(e.mailbox);
    return cat === "debtor" || cat === "sales";
  });
  console.log(`Scoped to debtor/sales mailboxes: ${scoped.length}`);

  // 3) Require the email to actually mention copy-intent, and exclude automated "kopie voor referentie" PO notices
  const NOISE = /kopie\s+voor\s+referentie|nieuwe\s+inkooporder|automatische\s+melding|do-?not-?reply|noreply/i;
  const copyFiltered = scoped.filter((e) => {
    const subj = e.subject || "";
    const text = `${subj}\n${e.body_text || ""}`;
    if (NOISE.test(subj)) return false;
    return COPY_REGEX.test(text);
  });
  console.log(`With copy-intent keyword match: ${copyFiltered.length}`);

  // 4) Classify each by PRIMARY document type (one label per email, nearest to copy-keyword)
  const byDoc = new Map<string, Email[]>();
  const byDocCat = new Map<string, { debtor: number; sales: number }>();
  const byCat = { debtor: 0, sales: 0 };
  const unclassified: Email[] = [];
  for (const e of copyFiltered) {
    const cat = classifyMailbox(e.mailbox) as "debtor" | "sales";
    byCat[cat]++;
    const doc = primaryDocType(e.subject || "", e.body_text || "");
    if (!doc) {
      unclassified.push(e);
      continue;
    }
    if (!byDoc.has(doc)) byDoc.set(doc, []);
    byDoc.get(doc)!.push(e);
    if (!byDocCat.has(doc)) byDocCat.set(doc, { debtor: 0, sales: 0 });
    byDocCat.get(doc)![cat]++;
  }

  console.log("\n=== Totals ===");
  console.log(`Debtor mailboxes: ${byCat.debtor}`);
  console.log(`Sales mailboxes:  ${byCat.sales}`);
  console.log(`TOTAL:            ${byCat.debtor + byCat.sales}`);
  console.log(`  of which matched a document type: ${copyFiltered.length - unclassified.length}`);
  console.log(`  unclassified (copy-intent but no doc term near keyword): ${unclassified.length}`);

  console.log("\n=== By PRIMARY document type (each email counted once) ===");
  for (const [doc, list] of [...byDoc.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const c = byDocCat.get(doc)!;
    console.log(`  ${doc}: ${list.length}  (debtor ${c.debtor} / sales ${c.sales})`);
  }

  console.log("\n=== Sample subjects per doc type (first 3) ===");
  for (const [doc, list] of [...byDoc.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n[${doc}]`);
    for (const e of list.slice(0, 3)) {
      console.log(`  ${e.received_at?.slice(0, 10)} | ${e.mailbox} | ${e.sender_email}`);
      console.log(`  SUBJ: ${(e.subject || "").slice(0, 140)}`);
    }
  }

  console.log("\n=== Unclassified samples (subjects, first 10) ===");
  for (const e of unclassified.slice(0, 10)) {
    console.log(`  ${e.mailbox} | ${(e.subject || "").slice(0, 140)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
