import { Orq } from "@orq-ai/node";
import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";
import { writeFileSync } from "fs";

const orq = new Orq({ apiKey: config.orq.apiKey });
const pipeline = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "email_pipeline" },
});

const MODEL = "anthropic/claude-haiku-4-5-20251001";
const FALLBACKS = [
  "anthropic/claude-sonnet-4-6",
  "openai/gpt-4.1-mini",
  "google/gemini-2.5-flash",
];
const CONCURRENCY = 8;

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

const COPY_TERMS = [
  "kopie", "kopy", "duplicaat", "afschrift",
  "nogmaals toe", "nogmaals sturen", "opnieuw sturen", "opnieuw toe",
  "copy of", "duplicate", "resend", "re-send", "please send",
];
const COPY_REGEX = new RegExp(COPY_TERMS.map((t) => t.replace(/\s+/g, "\\s+")).join("|"), "i");
const NOISE = /kopie\s+voor\s+referentie|nieuwe\s+inkooporder|automatische\s+melding|do-?not-?reply|noreply/i;

type Email = {
  id: string;
  subject: string | null;
  body_text: string | null;
  sender_email: string | null;
  mailbox: string | null;
  direction: string | null;
  received_at: string | null;
};

const SYSTEM_PROMPT = `<role>
You classify inbound customer emails for a Dutch/Belgian fire-safety company (Moyne Roberts / Smeba / Sicli / Berki).
The goal: identify emails where the SENDER asks to receive a COPY of a specific business document — so we can automate retrieval from NXT (SQL + S3).
</role>

<task>
Read one email. Decide:
1. Is this a genuine request from the sender to RECEIVE a document copy? (NOT: they're attaching one, NOT: a system-generated "kopie voor referentie" PO notice, NOT: a reply thread where no one asks for anything).
2. Which document type is being requested?
3. Any specific document reference (invoice number, work order number, quote number, contract number) the sender identifies?
</task>

<constraints>
- A reply thread where the sender thanks / complains / pays but does NOT ask for a document → is_copy_request: false.
- "Kopie voor referentie" / "Nieuwe inkooporder" automated PO notifications → is_copy_request: false.
- If sender asks for multiple doc types, pick the PRIMARY one (what they most want).
- Dutch keywords: kopie, duplicaat, afschrift, nogmaals, opnieuw. English: copy, duplicate, resend, please send.
- Document types you must distinguish:
  * invoice (factuur, facturen)
  * credit_note (creditnota, creditfactuur)
  * work_order (werkbon, werkorder, work order — the service/job report)
  * quote (offerte, offertes, quotation)
  * contract (contract, onderhoudscontract, overeenkomst)
  * certificate (certificaat, keuringscertificaat, NEN-certificaat)
  * location_sheet (locatiestaat, locatielijst, location sheet — list of equipment per location)
  * delivery_note (afleverbon, pakbon, delivery note, packing slip)
  * order_confirmation (orderbevestiging)
  * statement (rekeningoverzicht, openstaande posten)
  * other (anything else — specify in other_doc_hint)
- Extract the document reference EXACTLY as written (e.g. "17006798", "SMEQ79923", "WRK510701").
</constraints>

<output_format>
Return ONLY valid JSON, no markdown:
{
  "is_copy_request": true | false,
  "document_type": "invoice" | "credit_note" | "work_order" | "quote" | "contract" | "certificate" | "location_sheet" | "delivery_note" | "order_confirmation" | "statement" | "other" | null,
  "document_reference": "string" | null,
  "other_doc_hint": "string" | null,
  "confidence": "high" | "medium" | "low",
  "language": "nl" | "fr" | "en" | "de" | "other",
  "reasoning": "one short sentence"
}
</output_format>`;

async function classify(email: Email): Promise<any | null> {
  const userMessage = [
    `Mailbox: ${email.mailbox}`,
    `From: ${email.sender_email}`,
    `Subject: ${email.subject || "(no subject)"}`,
    `Body:\n${(email.body_text || "").slice(0, 2500)}`,
  ].join("\n");

  try {
    const response = await orq.router.chat.completions.create({
      model: MODEL,
      fallbackModels: FALLBACKS,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      responseFormat: { type: "json_object" },
      temperature: 0,
      maxTokens: 400,
    });
    let content = response.choices?.[0]?.message?.content;
    if (!content) return null;
    if (typeof content === "string") {
      content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    }
    return JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
  } catch (err: any) {
    console.error(`  [${email.id}] ${err.message || err}`);
    return null;
  }
}

async function fetchByKeywordInMailbox(column: "subject" | "body_text", term: string, mailbox: string): Promise<Email[]> {
  const out: Email[] = [];
  let from = 0;
  const pageSize = 500;
  while (true) {
    const { data, error } = await pipeline
      .from("emails")
      .select("id, subject, body_text, sender_email, mailbox, direction, received_at")
      .ilike(column, `%${term}%`)
      .in("direction", ["incoming", "inbound"])
      .eq("mailbox", mailbox)
      .range(from, from + pageSize - 1);
    if (error) {
      console.error(`  [${term}/${column}/${mailbox}] ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function getCandidates(): Promise<Email[]> {
  const seen = new Map<string, Email>();
  for (const term of COPY_TERMS) {
    for (const col of ["subject", "body_text"] as const) {
      for (const mb of SCOPE_MAILBOXES) {
        const rows = await fetchByKeywordInMailbox(col, term, mb);
        for (const r of rows) if (!seen.has(r.id)) seen.set(r.id, r);
      }
    }
  }
  // Filter: must have copy keyword match and not be automated noise
  return [...seen.values()].filter((e) => {
    const subj = e.subject || "";
    if (NOISE.test(subj)) return false;
    return COPY_REGEX.test(`${subj}\n${e.body_text || ""}`);
  });
}

async function getControlSample(size: number, excludeIds: Set<string>): Promise<Email[]> {
  // Random inbound emails NOT in candidate set — to measure false-negatives
  const out: Email[] = [];
  for (const mb of SCOPE_MAILBOXES) {
    const { data } = await pipeline
      .from("emails")
      .select("id, subject, body_text, sender_email, mailbox, direction, received_at")
      .in("direction", ["incoming", "inbound"])
      .eq("mailbox", mb)
      .limit(400);
    if (!data) continue;
    for (const r of data) if (!excludeIds.has(r.id)) out.push(r);
  }
  // Shuffle + take
  out.sort(() => Math.random() - 0.5);
  return out.slice(0, size);
}

async function runInBatches<T, R>(items: T[], worker: (x: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function run() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
      if ((i + 1) % 25 === 0) console.log(`  progress: ${i + 1}/${items.length}`);
    }
  }
  await Promise.all(Array(concurrency).fill(0).map(() => run()));
  return results;
}

function mailboxCategory(mb: string | null): "debtor" | "sales" | "other" {
  if (!mb) return "other";
  const m = mb.toLowerCase();
  if (m.includes("debiteur") || m.includes("facturation")) return "debtor";
  if (m.includes("verkoop") || m.startsWith("smeba brandbeveiliging") || m.includes("info@smeba") || m.includes("send to verkoop"))
    return "sales";
  return "other";
}

async function main() {
  console.log("Step 1: fetching candidates...");
  const candidates = await getCandidates();
  console.log(`  ${candidates.length} copy-candidate emails\n`);

  console.log("Step 2: fetching control sample (200 non-candidate inbound)...");
  const control = await getControlSample(200, new Set(candidates.map((c) => c.id)));
  console.log(`  ${control.length} control emails\n`);

  const tagged = [
    ...candidates.map((e) => ({ email: e, source: "candidate" as const })),
    ...control.map((e) => ({ email: e, source: "control" as const })),
  ];

  console.log(`Step 3: classifying ${tagged.length} emails with ${MODEL}...`);
  const results = await runInBatches(
    tagged,
    async ({ email, source }) => {
      const r = await classify(email);
      return {
        id: email.id,
        mailbox: email.mailbox,
        mailbox_category: mailboxCategory(email.mailbox),
        sender: email.sender_email,
        subject: email.subject,
        received_at: email.received_at,
        source,
        classification: r,
      };
    },
    CONCURRENCY,
  );

  writeFileSync(
    "/tmp/copy-requests-classified.json",
    JSON.stringify(results, null, 2),
  );
  console.log(`\nWrote ${results.length} results to /tmp/copy-requests-classified.json`);

  // Aggregate
  const candidateResults = results.filter((r) => r.source === "candidate" && r.classification);
  const controlResults = results.filter((r) => r.source === "control" && r.classification);

  const truePositives = candidateResults.filter((r) => r.classification.is_copy_request === true);
  const falsePositives = candidateResults.filter((r) => r.classification.is_copy_request === false);
  const missedInControl = controlResults.filter((r) => r.classification.is_copy_request === true);

  console.log("\n=== CLASSIFICATION RESULTS ===");
  console.log(`Candidates classified: ${candidateResults.length}`);
  console.log(`  true copy-requests:  ${truePositives.length}`);
  console.log(`  false positives:     ${falsePositives.length}`);
  console.log(`Control classified:    ${controlResults.length}`);
  console.log(`  missed copy-requests in control (recall gap): ${missedInControl.length}`);
  console.log(`  estimated recall: ${(truePositives.length / (truePositives.length + missedInControl.length * (7947 / 200))).toFixed(2)} (rough)`);

  // By document type + mailbox category
  const byDoc = new Map<string, { debtor: number; sales: number; other: number; withRef: number }>();
  for (const r of truePositives) {
    const doc = r.classification.document_type || "unknown";
    const cur = byDoc.get(doc) || { debtor: 0, sales: 0, other: 0, withRef: 0 };
    cur[r.mailbox_category as "debtor" | "sales" | "other"]++;
    if (r.classification.document_reference) cur.withRef++;
    byDoc.set(doc, cur);
  }

  console.log("\n=== BY DOCUMENT TYPE (true copy-requests only) ===");
  console.log("type                   total  debtor  sales  other  with_ref");
  for (const [doc, c] of [...byDoc.entries()].sort((a, b) => (b[1].debtor + b[1].sales + b[1].other) - (a[1].debtor + a[1].sales + a[1].other))) {
    const total = c.debtor + c.sales + c.other;
    console.log(`  ${doc.padEnd(22)} ${String(total).padStart(4)}   ${String(c.debtor).padStart(4)}   ${String(c.sales).padStart(4)}   ${String(c.other).padStart(4)}   ${String(c.withRef).padStart(4)}`);
  }

  // Volume per month
  const byMonth = new Map<string, number>();
  for (const r of truePositives) {
    const ym = (r.received_at || "").slice(0, 7);
    if (!ym) continue;
    byMonth.set(ym, (byMonth.get(ym) || 0) + 1);
  }
  console.log("\n=== VOLUME PER MONTH (true copy-requests) ===");
  for (const [ym, n] of [...byMonth.entries()].sort()) {
    console.log(`  ${ym}: ${n}`);
  }

  // Language mix
  const byLang = new Map<string, number>();
  for (const r of truePositives) {
    const l = r.classification.language || "unknown";
    byLang.set(l, (byLang.get(l) || 0) + 1);
  }
  console.log("\n=== LANGUAGE ===");
  for (const [l, n] of [...byLang.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${l}: ${n}`);
  }

  // Reference extraction rate by type — drives automation-readiness
  console.log("\n=== AUTOMATION-READINESS (doc reference extracted) ===");
  for (const [doc, c] of [...byDoc.entries()].sort((a, b) => (b[1].debtor + b[1].sales + b[1].other) - (a[1].debtor + a[1].sales + a[1].other))) {
    const total = c.debtor + c.sales + c.other;
    const pct = total > 0 ? ((c.withRef / total) * 100).toFixed(0) : "0";
    console.log(`  ${doc.padEnd(22)} ${pct}% have a reference (${c.withRef}/${total})`);
  }

  // Show 5 false-positive examples so user can eyeball
  console.log("\n=== SAMPLE FALSE POSITIVES (keyword hit but LLM says not a copy-request) ===");
  for (const r of falsePositives.slice(0, 5)) {
    console.log(`  ${r.mailbox} | ${(r.subject || "").slice(0, 100)}`);
    console.log(`    reasoning: ${r.classification?.reasoning}`);
  }

  // Show 5 control false-negatives (missed by keyword filter)
  console.log("\n=== SAMPLE CONTROL HITS (keyword filter missed these) ===");
  for (const r of missedInControl.slice(0, 5)) {
    console.log(`  ${r.mailbox} | ${(r.subject || "").slice(0, 100)}`);
    console.log(`    doc_type: ${r.classification?.document_type}, ref: ${r.classification?.document_reference}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
