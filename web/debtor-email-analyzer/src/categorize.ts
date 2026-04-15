import { Orq } from "@orq-ai/node";
import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const orq = new Orq({ apiKey: config.orq.apiKey });

const pipeline = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "email_pipeline" },
});
const debtor = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "debtor" },
});

const BATCH_SIZE = 5; // concurrent LLM calls
const MODEL = "anthropic/claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are an email categorization system for a fire protection and safety equipment company (Moyne Roberts group: Smeba, Berki, Sicli-Noord, Sicli-Sud, Smeba-Fire). These companies handle debtor/accounts receivable emails.

Analyze the incoming email and return a JSON object with these fields:

{
  "debtor_name": "Company or person name of the debtor (extract from email body/signature, null if unclear)",
  "debtor_reference": "Any customer/debtor reference number mentioned (null if none)",
  "invoice_numbers": ["Array of invoice numbers mentioned, e.g. 17304080, 33052146"],
  "amounts_mentioned": [Array of monetary amounts as numbers, e.g. 1250.00],
  "currency": "EUR or other currency if mentioned",
  "email_intent": "One of: payment_confirmation, payment_dispute, invoice_request, invoice_correction, address_change, peppol_request, credit_request, payment_plan, payment_delay, auto_reply, general_inquiry, complaint, legal_escalation, delivery_issue, other",
  "is_forwarded_internal": true/false (was this email forwarded by an internal colleague into the debtor mailbox?),
  "urgency": "One of: low, medium, high, critical",
  "language": "nl, fr, en, or de",
  "requires_action": true/false (does a human debtor manager need to act on this?),
  "suggested_response": "Brief suggested response approach in the same language as the email (1-2 sentences, null for auto-replies)",
  "category": "One of: payment, invoice, admin, dispute, legal, auto_reply, other",
  "tags": ["Array of relevant tags, e.g. peppol, credit_note, missing_po, duplicate_payment, address_update"]
}

Rules:
- Auto-replies (out of office, delivery confirmations, mailbox notifications) are category "auto_reply", urgency "low", requires_action false
- Legal escalations (advocaat, mise en demeure, dossier IMS#) are urgency "critical"
- Payment confirmations are urgency "low", requires_action false (just log)
- Disputes and complaints are urgency "high"
- Always extract invoice numbers when present (formats: 17XXXXXX, 33XXXXXX, 30XXXXXX)
- Forwarded emails: if an email was forwarded by an internal colleague (e.g. from info@sicli.be, info@sicli-noord.be, verkoop@sicli-noord.be, gwenda@smeba.nl, or similar internal addresses), set is_forwarded_internal to true BUT still classify the email_intent and category based on the ACTUAL CONTENT of the forwarded message, not the forwarding action itself
- Return ONLY valid JSON, no markdown or explanation`;

interface EmailRow {
  id: string;
  subject: string | null;
  body_text: string | null;
  sender_email: string | null;
  sender_name: string | null;
  mailbox: string;
}

interface AnalysisResult {
  debtor_name: string | null;
  debtor_reference: string | null;
  invoice_numbers: string[];
  amounts_mentioned: number[];
  currency: string;
  email_intent: string;
  is_forwarded_internal: boolean;
  urgency: string;
  language: string;
  requires_action: boolean;
  suggested_response: string | null;
  category: string;
  tags: string[];
}

async function categorizeEmail(email: EmailRow): Promise<AnalysisResult | null> {
  const userMessage = [
    `Mailbox: ${email.mailbox}`,
    `From: ${email.sender_name} <${email.sender_email}>`,
    `Subject: ${email.subject || "(no subject)"}`,
    `Body:\n${(email.body_text || "").slice(0, 1500)}`,
  ].join("\n");

  try {
    const response = await orq.router.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      responseFormat: { type: "json_object" },
      temperature: 0,
      maxTokens: 500,
    });

    let content = response.choices?.[0]?.message?.content;
    if (!content) return null;

    // Handle markdown-wrapped JSON responses
    if (typeof content === "string") {
      content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    }

    return JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
  } catch (err: any) {
    console.error(`  LLM error for ${email.id}: ${err.message}`);
    return null;
  }
}

async function processBatch(emails: EmailRow[]): Promise<number> {
  const results = await Promise.allSettled(
    emails.map(async (email) => {
      const analysis = await categorizeEmail(email);
      if (!analysis) return null;

      const { error } = await debtor.from("email_analysis").upsert(
        {
          email_id: email.id,
          debtor_name: analysis.debtor_name,
          debtor_reference: analysis.debtor_reference,
          invoice_numbers: analysis.invoice_numbers,
          amounts_mentioned: analysis.amounts_mentioned,
          currency: analysis.currency,
          email_intent: analysis.email_intent,
          is_forwarded_internal: analysis.is_forwarded_internal ?? false,
          urgency: analysis.urgency,
          language: analysis.language,
          requires_action: analysis.requires_action,
          suggested_response: analysis.suggested_response,
          category: analysis.category,
          tags: analysis.tags,
        },
        { onConflict: "email_id" }
      );

      if (error) {
        console.error(`  DB error for ${email.id}: ${error.message}`);
        return null;
      }
      return analysis;
    })
  );

  return results.filter(
    (r) => r.status === "fulfilled" && r.value !== null
  ).length;
}

async function main() {
  console.log("=== DEBTOR EMAIL CATEGORIZATION ===\n");

  // Get already-analyzed email IDs
  const analyzed = new Set<string>();
  let aOffset = 0;
  while (true) {
    const { data } = await debtor
      .from("email_analysis")
      .select("email_id")
      .range(aOffset, aOffset + 999);
    if (!data || data.length === 0) break;
    data.forEach((r) => analyzed.add(r.email_id));
    if (data.length < 1000) break;
    aOffset += 1000;
  }
  console.log(`Already analyzed: ${analyzed.size} emails`);

  // Get all incoming emails
  const allIncoming: EmailRow[] = [];
  let offset = 0;
  while (true) {
    const { data } = await pipeline
      .from("emails")
      .select("id, subject, body_text, sender_email, sender_name, mailbox")
      .eq("direction", "incoming")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allIncoming.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  // Filter out already analyzed
  const todo = allIncoming.filter((e) => !analyzed.has(e.id));
  console.log(`Total incoming: ${allIncoming.length}`);
  console.log(`To categorize: ${todo.length}\n`);

  if (todo.length === 0) {
    console.log("All emails already categorized.");
    return;
  }

  // Process in batches
  let processed = 0;
  let succeeded = 0;
  const startTime = Date.now();

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    const count = await processBatch(batch);
    succeeded += count;
    processed += batch.length;

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed;
    const remaining = (todo.length - processed) / rate;

    console.log(
      `  ${processed}/${todo.length} (${succeeded} ok) — ` +
        `${rate.toFixed(1)}/s — ~${Math.ceil(remaining / 60)}min remaining`
    );
  }

  console.log(`\n=== DONE ===`);
  console.log(`Categorized: ${succeeded}/${todo.length}`);

  // Quick summary of categories
  const { data: summary } = await debtor
    .from("email_analysis")
    .select("category, email_intent, urgency, requires_action");

  if (summary) {
    const cats: Record<string, number> = {};
    const intents: Record<string, number> = {};
    const urgencies: Record<string, number> = {};
    let actionRequired = 0;

    for (const r of summary) {
      cats[r.category] = (cats[r.category] || 0) + 1;
      intents[r.email_intent] = (intents[r.email_intent] || 0) + 1;
      urgencies[r.urgency] = (urgencies[r.urgency] || 0) + 1;
      if (r.requires_action) actionRequired++;
    }

    console.log(`\n--- CATEGORIES ---`);
    for (const [c, n] of Object.entries(cats).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n.toString().padStart(5)}  ${c}`);
    }

    console.log(`\n--- INTENTS ---`);
    for (const [c, n] of Object.entries(intents).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n.toString().padStart(5)}  ${c}`);
    }

    console.log(`\n--- URGENCY ---`);
    for (const [c, n] of Object.entries(urgencies).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n.toString().padStart(5)}  ${c}`);
    }

    console.log(`\n--- ACTION REQUIRED ---`);
    console.log(`  ${actionRequired} emails need human action`);
    console.log(`  ${summary.length - actionRequired} can be auto-handled`);
  }
}

main().catch(console.error);
