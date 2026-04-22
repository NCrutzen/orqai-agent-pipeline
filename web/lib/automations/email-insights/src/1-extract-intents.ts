/**
 * Step 1 — Extract atomic questions + complaints from each inbound email.
 *
 * For each mail matching the domain filter we ask the LLM (via Orq.ai Router)
 * for a JSON object {questions: [{normalized}], complaints: [{normalized}]}.
 * Auto-replies / spam / internal are either skipped (if domain.email_analysis
 * already categorized them) or return empty arrays naturally.
 *
 * Idempotent: tracks processed mails in email_insights.processed_emails.
 * Resume by re-running — already-processed mails are skipped.
 *
 * Run:
 *   npx tsx src/1-extract-intents.ts --domain=debtor [--limit=100]
 */
import { Orq } from "@orq-ai/node";
import { createClient } from "@supabase/supabase-js";
import { env } from "./config.js";
import { loadDomain, domainFromArgv } from "./load-domain.js";
import { ExtractedIntentsSchema, type EmailRow } from "./types.js";

const CONCURRENCY = 6;
const MAX_BODY_CHARS = 2500;

const systemPrompt = (outputLang: string) => `You analyze a single inbound email and extract the generalizable intents it contains.

Return JSON with exactly this shape:
{
  "questions": [{"normalized": "..."}],
  "complaints": [{"normalized": "..."}]
}

Rules:
- A "question" is any concrete request for information or action the sender expects the business to answer or perform (e.g. "when will I receive the invoice", "can we agree on a payment plan", "please resend the credit note").
- A "complaint" is any expression of dissatisfaction, frustration, or dispute (e.g. "I was charged twice", "this reminder is incorrect", "your collection agency is being aggressive").
- Extract ATOMIC intents — if one email asks three different things, return three question items. Do not merge.
- NORMALIZE each intent to its generalizable form in ${outputLang}:
    • Strip names, company names, invoice numbers, amounts, dates, case numbers, order numbers.
    • Remove greetings, signatures, quoted previous emails, disclaimers.
    • Keep only the underlying question/complaint in plain, neutral business language.
    • Aim for 5–20 words per item.
    • If the same intent appears twice, return it once.
- Auto-replies (out of office, delivery notifications, read receipts) → both arrays empty.
- Pure status/acknowledgement mails with no question or complaint → both arrays empty.
- Internal forwards between colleagues with no customer-facing content → both arrays empty.
- Return valid JSON only. No markdown, no commentary.`;

async function extract(
  orq: Orq,
  email: EmailRow,
  model: string,
  outputLang: string
) {
  let body = email.body_text || "";
  if (!body && email.body_html) {
    body = email.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const userContent = [
    `From: ${email.sender_name ?? ""} <${email.sender_email ?? ""}>`,
    `Mailbox: ${email.mailbox}`,
    `Subject: ${email.subject ?? "(no subject)"}`,
    "",
    body.slice(0, MAX_BODY_CHARS),
  ].join("\n");

  const res = await orq.router.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt(outputLang) },
      { role: "user", content: userContent },
    ],
    responseFormat: { type: "json_object" },
    temperature: 0,
    maxTokens: 500,
  });

  let raw = res.choices?.[0]?.message?.content;
  if (!raw) return { questions: [], complaints: [] };
  if (typeof raw !== "string") raw = JSON.stringify(raw);
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  return ExtractedIntentsSchema.parse(JSON.parse(cleaned));
}

async function main() {
  const domain = domainFromArgv();
  const cfg = loadDomain(domain);
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.slice("--limit=".length), 10) : undefined;

  console.log(`=== email-insights step 1: extract-intents (domain=${domain}) ===`);
  if (limit) console.log(`Sample run — limit=${limit}`);

  const orq = new Orq({ apiKey: env.orq.apiKey });
  const pipeline = createClient(env.supabase.url, env.supabase.serviceKey, {
    db: { schema: "email_pipeline" },
  });
  const insights = createClient(env.supabase.url, env.supabase.serviceKey, {
    db: { schema: "email_insights" },
  });

  // Build excluded email-id set (already processed + skip-categories).
  const skip = new Set<string>();
  {
    let offset = 0;
    while (true) {
      const { data, error } = await insights
        .from("processed_emails")
        .select("email_id")
        .eq("domain", domain)
        .range(offset, offset + 999);
      if (error) throw error;
      if (!data?.length) break;
      data.forEach((r) => skip.add(r.email_id));
      if (data.length < 1000) break;
      offset += 1000;
    }
    console.log(`Already processed: ${skip.size}`);
  }

  if (cfg.analysis_schema && cfg.skip_analyzed_categories.length > 0) {
    const a = createClient(env.supabase.url, env.supabase.serviceKey, {
      db: { schema: cfg.analysis_schema },
    });
    let offset = 0;
    let n = 0;
    while (true) {
      const { data, error } = await a
        .from("email_analysis")
        .select("email_id, category")
        .in("category", cfg.skip_analyzed_categories)
        .range(offset, offset + 999);
      if (error) {
        console.warn(`  Could not read ${cfg.analysis_schema}.email_analysis: ${error.message}`);
        break;
      }
      if (!data?.length) break;
      data.forEach((r) => {
        skip.add(r.email_id);
        n++;
      });
      if (data.length < 1000) break;
      offset += 1000;
    }
    console.log(`Skipping ${n} mails categorized as [${cfg.skip_analyzed_categories.join(", ")}]`);
  }

  // Load candidate mails.
  const candidates: EmailRow[] = [];
  let offset = 0;
  while (true) {
    let q = pipeline
      .from("emails")
      .select("id, subject, body_text, body_html, sender_email, sender_name, mailbox, direction, received_at")
      .eq("source", cfg.filter.source)
      .eq("direction", cfg.filter.direction)
      .in("mailbox", cfg.filter.mailbox_in)
      .order("received_at", { ascending: false })
      .range(offset, offset + 999);
    if (cfg.filter.received_after) q = q.gte("received_at", cfg.filter.received_after);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      if (skip.has(row.id)) continue;
      candidates.push(row as EmailRow);
      if (limit && candidates.length >= limit) break;
    }
    if (limit && candidates.length >= limit) break;
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`Candidate mails: ${candidates.length}`);
  if (candidates.length === 0) return;

  // Process in batches of CONCURRENCY.
  let done = 0;
  let qCount = 0;
  let cCount = 0;
  let fail = 0;
  const t0 = Date.now();

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const slice = candidates.slice(i, i + CONCURRENCY);
    await Promise.all(
      slice.map(async (email) => {
        try {
          const { questions, complaints } = await extract(orq, email, cfg.llm_model, cfg.output_language);
          const rows = [
            ...questions.map((q) => ({
              email_id: email.id,
              domain,
              type: "question",
              normalized: q.normalized,
            })),
            ...complaints.map((c) => ({
              email_id: email.id,
              domain,
              type: "complaint",
              normalized: c.normalized,
            })),
          ];
          if (rows.length > 0) {
            const { error } = await insights.from("extracted_intents").insert(rows);
            if (error) throw error;
          }
          await insights
            .from("processed_emails")
            .insert({ email_id: email.id, domain });
          qCount += questions.length;
          cCount += complaints.length;
        } catch (err: any) {
          fail++;
          console.error(`  err ${email.id}: ${err.message}`);
        } finally {
          done++;
        }
      })
    );
    if (done % 50 === 0 || done === candidates.length) {
      const rate = done / ((Date.now() - t0) / 1000);
      console.log(
        `  ${done}/${candidates.length}  q=${qCount} c=${cCount} fail=${fail}  (${rate.toFixed(1)}/s)`
      );
    }
  }

  console.log(`\nDone. questions=${qCount} complaints=${cCount} failed=${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
