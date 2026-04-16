import { Orq } from "@orq-ai/node";
import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const orq = new Orq({ apiKey: config.orq.apiKey });

const pipeline = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "email_pipeline" },
});
const sales = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "sales" },
});

const BATCH_SIZE = 5; // concurrent LLM calls
const MODEL = "anthropic/claude-haiku-4-5-20251001";

// Taxonomy derived from discovery pass on 160 sampled emails (2026-04-15)
// Categories: service 46%, sales 38%, internal 8%, admin 4%, finance 3%
const SYSTEM_PROMPT = `You are an email categorization system for Smeba Brandbeveiliging BV, a Dutch fire protection and safety equipment company. Part of the Moyne Roberts / Walker Fire group. Smeba sells, installs, and maintains fire extinguishers, fire hose reels, alarm systems, sprinklers, and related safety equipment to businesses across the Netherlands and Belgium.

The sales team (verkoop@smeba.nl) handles quotes, orders, customer inquiries, complaints, and account management.

Analyze the email and return a JSON object with these fields:

{
  "customer_name": "Company or person name of the customer (extract from email body/signature/subject, null if unclear)",
  "customer_reference": "Any customer or relation number mentioned (e.g. relatienr 464750, null if none)",
  "quote_numbers": ["Array of quote/offerte numbers, e.g. SB012378, SMEQ97790"],
  "case_number": "SugarCRM case number if present (e.g. 749254, extracted from [CASE:XXXXXX])",
  "order_numbers": ["Array of order/werkorder numbers, e.g. WO 1544665, SL250296"],
  "amounts_mentioned": [Array of monetary amounts as numbers, e.g. 1250.00],
  "currency": "EUR unless another currency is explicitly mentioned",
  "email_intent": "One of: quote_request, quote_followup, quote_reminder, quote_acceptance, quote_rejection, quote_revision, appointment_scheduling, appointment_change, maintenance_request, inspection_order, no_show_report, order_placement, order_confirmation, order_change, delivery_inquiry, contract_termination, contract_takeover, contract_inquiry, contact_update, location_closure, data_correction, invoice_inquiry, payment_reminder, credit_request, billing_correction, auto_reply, spam, internal_delegation, complaint, general_inquiry, other",
  "is_forwarded_internal": true/false (was this forwarded by an internal Smeba colleague to another colleague?),
  "urgency": "One of: low, medium, high, critical",
  "language": "nl, fr, en, or de",
  "requires_action": true/false (does someone on the sales team need to act on this?),
  "suggested_response": "Brief suggested response approach in the same language as the email (1-2 sentences, null for auto-replies/spam)",
  "ai_summary": "2-3 sentence summary of what this email is about and what action is needed (in the email's language)",
  "category": "One of: quote, order, service, contract, admin, finance, complaint, auto_reply, spam, internal, other",
  "tags": ["Array of relevant tags, e.g. offerte, brandblusser, keuring, brandslanghaspel, AED, alarm, sprinkler, herstelwerk, noodverlichting, EHBO, Gamma, Karwei"],
  "assigned_to": "If the email mentions or is addressed to a specific Smeba employee, their name (null otherwise)"
}

Rules:
- Auto-replies (out of office, delivery notifications, read receipts) → category "auto_reply", urgency "low", requires_action false
- Spam → category "spam", urgency "low", requires_action false
- Automated quote reminders (Herinnering offerte SB...) → email_intent "quote_reminder", category "quote", urgency "low"
- Internal forwards (Smeba employee forwarding to colleague) → is_forwarded_internal true, classify based on the ACTUAL forwarded content, not the forwarding action
- Internal delegation (colleague assigns task to another colleague) → email_intent "internal_delegation", category "internal"
- Escalations (urgent, critical safety issues) → urgency "high" or "critical"
- Extract case numbers from [CASE:XXXXXX] patterns in subjects
- Extract quote numbers: SB + digits, SMEQ + digits
- Extract order/werkorder numbers: WO + digits, SL + digits, INK + digits
- Complaints → urgency "high", category "complaint"
- Contract terminations → category "contract", urgency "medium"
- Appointment scheduling/changes → category "service"
- For internal emails, try to identify who should handle it based on content (assigned_to)
- Return ONLY valid JSON, no markdown or explanation`;

interface EmailRow {
  id: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  sender_email: string | null;
  sender_name: string | null;
  mailbox: string;
  direction: string;
}

async function categorizeEmail(email: EmailRow): Promise<any | null> {
  // Use body_text, fall back to stripped body_html
  let bodyContent = email.body_text || "";
  if (!bodyContent && email.body_html) {
    bodyContent = email.body_html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const userMessage = [
    `Direction: ${email.direction}`,
    `Mailbox/Team: ${email.mailbox}`,
    `From: ${email.sender_name} <${email.sender_email}>`,
    `Subject: ${email.subject || "(no subject)"}`,
    `Body:\n${bodyContent.slice(0, 2000)}`,
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
      maxTokens: 600,
    });

    let content = response.choices?.[0]?.message?.content;
    if (!content) return null;

    if (typeof content === "string") {
      content = content
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    }

    return JSON.parse(
      typeof content === "string" ? content : JSON.stringify(content)
    );
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

      const { error } = await sales.from("email_analysis").upsert(
        {
          email_id: email.id,
          customer_name: analysis.customer_name,
          customer_reference: analysis.customer_reference,
          quote_numbers: analysis.quote_numbers || [],
          case_number: analysis.case_number,
          order_numbers: analysis.order_numbers || [],
          amounts_mentioned: analysis.amounts_mentioned || [],
          currency: analysis.currency,
          email_intent: analysis.email_intent,
          is_forwarded_internal: analysis.is_forwarded_internal ?? false,
          urgency: analysis.urgency,
          language: analysis.language,
          requires_action: analysis.requires_action,
          suggested_response: analysis.suggested_response,
          ai_summary: analysis.ai_summary,
          category: analysis.category,
          tags: analysis.tags || [],
          assigned_to: analysis.assigned_to,
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
  console.log("=== SALES EMAIL CATEGORIZATION ===\n");

  // Get already-analyzed email IDs
  const analyzed = new Set<string>();
  let aOffset = 0;
  while (true) {
    const { data } = await sales
      .from("email_analysis")
      .select("email_id")
      .range(aOffset, aOffset + 999);
    if (!data || data.length === 0) break;
    data.forEach((r) => analyzed.add(r.email_id));
    if (data.length < 1000) break;
    aOffset += 1000;
  }
  console.log(`Already analyzed: ${analyzed.size} emails`);

  // Get all SugarCRM emails (all directions)
  const allEmails: EmailRow[] = [];
  let offset = 0;
  while (true) {
    const { data } = await pipeline
      .from("emails")
      .select(
        "id, subject, body_text, body_html, sender_email, sender_name, mailbox, direction"
      )
      .eq("source", "sugarcrm")
      .order("received_at", { ascending: true })
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allEmails.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  // Filter out already analyzed
  const todo = allEmails.filter((e) => !analyzed.has(e.id));
  console.log(`Total SugarCRM emails: ${allEmails.length}`);
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

  // Summary
  const { data: summary } = await sales
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

    console.log(`\n--- TOP INTENTS ---`);
    for (const [c, n] of Object.entries(intents)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)) {
      console.log(`  ${n.toString().padStart(5)}  ${c}`);
    }

    console.log(`\n--- URGENCY ---`);
    for (const [c, n] of Object.entries(urgencies).sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`  ${n.toString().padStart(5)}  ${c}`);
    }

    console.log(`\n--- ACTION REQUIRED ---`);
    console.log(`  ${actionRequired} emails need human action`);
    console.log(`  ${summary.length - actionRequired} can be auto-handled`);
  }
}

main().catch(console.error);
