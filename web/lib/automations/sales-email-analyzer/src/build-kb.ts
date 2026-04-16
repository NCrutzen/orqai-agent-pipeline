/**
 * build-kb.ts — Knowledge Base builder voor Smeba Brandbeveiliging sales emails
 *
 * Leest 34K emails + analyses uit Supabase, maakt Q&A paren via conversation_id threading,
 * embedt via Orq.ai Router (of OpenAI direct als fallback), en upsertt naar sales.kb_chunks.
 *
 * Run: npx tsx src/build-kb.ts
 *
 * Embedding volgorde:
 *   1. Orq.ai Router (ORQ_API_KEY — al in env, preferred)
 *   2. OpenAI direct (OPENAI_API_KEY — fallback)
 *
 * Idempotent: safe to re-run — upsertt op source_key
 *
 * Threading strategie:
 *   SugarCRM parent_id → opgeslagen als conversation_id in email_pipeline.emails
 *   Emails met dezelfde conversation_id horen bij hetzelfde CRM object (case/contact)
 *   Per thread: koppel elke inbound → dichtstbijzijnde outbound erna = Q&A pair
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

// ---- Embedding provider detectie ----
const ORQ_API_KEY = process.env.ORQ_API_KEY || config.orq?.apiKey;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!ORQ_API_KEY && !OPENAI_API_KEY) {
  console.error("ERROR: Geen embedding API key gevonden.");
  console.error("Voeg ORQ_API_KEY (voorkeur) of OPENAI_API_KEY toe aan web/.env.local");
  process.exit(1);
}

const USE_ORQ = Boolean(ORQ_API_KEY);
console.log(`Embedding provider: ${USE_ORQ ? "Orq.ai Router (openai/text-embedding-3-small)" : "OpenAI direct (text-embedding-3-small)"}`);

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_BODY_CHARS = 2000; // trim long bodies for consistent embedding quality
const EMBED_BATCH_SIZE = 100; // OpenAI allows up to 2048 inputs per call
const UPSERT_BATCH_SIZE = 50;
const PAGE_SIZE = 1000;

// ---- Supabase clients ----
const pipeline = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "email_pipeline" },
});
const sales = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "sales" },
});

// ---- Types ----
interface EmailRow {
  id: string;
  source_id: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  direction: "inbound" | "outbound" | "internal";
  received_at: string | null;
  conversation_id: string | null; // = SugarCRM parent_id
  sender_name: string | null;
}

interface AnalysisRow {
  email_id: string;
  category: string | null;
  email_intent: string | null;
  customer_name: string | null;
  case_number: string | null;
  ai_summary: string | null;
}

interface Chunk {
  chunk_type: "email_qa_pair" | "email_outbound" | "email_inbound" | "document_chunk";
  source_type: "email" | "document";
  source_key: string;
  content: string;
  metadata: Record<string, unknown>;
}

// ---- Helpers ----
function extractBody(email: EmailRow): string {
  const body =
    email.body_text ||
    (email.body_html
      ? email.body_html.replace(/<[^>]+>/g, " ").replace(/&\w+;/g, " ")
      : "");
  return body.replace(/\s+/g, " ").trim().slice(0, MAX_BODY_CHARS);
}

function formatQAPair(inbound: EmailRow, outbound: EmailRow): string {
  const q = extractBody(inbound);
  const a = extractBody(outbound);
  if (!q && !a) return "";
  return [
    `KLANT:`,
    inbound.subject || "",
    "",
    q,
    "",
    "---",
    "",
    `SMEBA:`,
    outbound.subject || "",
    "",
    a,
  ]
    .join("\n")
    .trim();
}

function formatOutbound(email: EmailRow): string {
  const body = extractBody(email);
  if (!body) return "";
  return [`SMEBA REACTIE:`, email.subject || "", "", body].join("\n").trim();
}

// ---- Embeddings via Orq.ai Router of OpenAI direct ----
async function embedBatch(texts: string[]): Promise<number[][]> {
  // Orq.ai proxied OpenAI embeddings (preferred — ORQ_API_KEY al in env)
  if (USE_ORQ) {
    const res = await fetch("https://api.orq.ai/v2/openai/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ORQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    });

    if (res.ok) {
      const data = await res.json();
      return (data.data as { index: number; embedding: number[] }[])
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
    }

    // Als Orq.ai embeddings niet ondersteunt: fallback naar OpenAI
    const errText = await res.text();
    if (res.status === 404 || res.status === 400) {
      console.warn(`\n  Orq.ai embeddings niet beschikbaar (${res.status}) — fallback naar OpenAI direct`);
      if (!OPENAI_API_KEY) {
        throw new Error("Orq.ai ondersteunt geen embeddings en OPENAI_API_KEY ontbreekt. Voeg toe aan .env.local");
      }
      return embedViaOpenAI(texts);
    }
    throw new Error(`Orq.ai embeddings error ${res.status}: ${errText.slice(0, 300)}`);
  }

  return embedViaOpenAI(texts);
}

async function embedViaOpenAI(texts: string[]): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings error ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  return (data.data as { index: number; embedding: number[] }[])
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

// ---- Fetch all pages from a Supabase query ----
async function fetchAll<T>(
  queryFn: (offset: number) => Promise<{ data: T[] | null; error: any }>,
  label: string
): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await queryFn(offset);
    if (error) throw new Error(`${label}: ${error.message}`);
    if (!data || data.length === 0) break;
    results.push(...data);
    process.stdout.write(`\r  ${label}: ${results.length}...`);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  console.log(`\r  ${label}: ${results.length} ✓`);
  return results;
}

// ---- Main ----
async function main() {
  console.log("=== Sales KB Builder — Smeba Brandbeveiliging ===\n");
  console.log(`Model: ${EMBEDDING_MODEL} (1536 dims)`);

  // 1. Fetch emails
  console.log("\n[1/5] Fetching SugarCRM emails...");
  const emails = await fetchAll<EmailRow>(
    (offset) =>
      pipeline
        .from("emails")
        .select(
          "id, source_id, subject, body_text, body_html, direction, received_at, conversation_id, sender_name"
        )
        .eq("source", "sugarcrm")
        .range(offset, offset + PAGE_SIZE - 1)
        .order("received_at"),
    "emails"
  );

  // 2. Fetch analyses
  console.log("\n[2/5] Fetching analyses...");
  const analyses = await fetchAll<AnalysisRow>(
    (offset) =>
      sales
        .from("email_analysis")
        .select("email_id, category, email_intent, customer_name, case_number, ai_summary")
        .range(offset, offset + PAGE_SIZE - 1),
    "analyses"
  );

  const analysisMap = new Map(analyses.map((a) => [a.email_id, a]));

  // 3. Build chunks
  console.log("\n[3/5] Building chunks...");

  // Group emails with a conversation_id by thread
  const byThread = new Map<string, EmailRow[]>();
  const threadlessOutbound: EmailRow[] = [];

  for (const email of emails) {
    if (email.conversation_id) {
      if (!byThread.has(email.conversation_id)) byThread.set(email.conversation_id, []);
      byThread.get(email.conversation_id)!.push(email);
    } else if (email.direction === "outbound") {
      threadlessOutbound.push(email);
    }
  }

  const chunks: Chunk[] = [];
  let pairCount = 0;
  let standaloneCount = 0;

  // Q&A pairs from threaded emails
  for (const [, group] of byThread) {
    const sorted = group.sort((a, b) =>
      (a.received_at || "").localeCompare(b.received_at || "")
    );
    const inbounds = sorted.filter((e) => e.direction === "inbound");
    const outbounds = sorted.filter((e) => e.direction === "outbound");
    const usedOutbounds = new Set<string>();

    for (const inbound of inbounds) {
      // Nearest outbound sent after this inbound
      const reply = outbounds.find(
        (o) => !usedOutbounds.has(o.id) && (o.received_at || "") > (inbound.received_at || "")
      );

      if (reply) {
        usedOutbounds.add(reply.id);
        const content = formatQAPair(inbound, reply);
        if (content.length < 30) continue;

        const inboundAnalysis = analysisMap.get(inbound.id);
        chunks.push({
          chunk_type: "email_qa_pair",
          source_type: "email",
          source_key: `pair:${inbound.source_id}:${reply.source_id}`,
          content,
          metadata: {
            intent: inboundAnalysis?.email_intent ?? null,
            category: inboundAnalysis?.category ?? null,
            customer_name: inboundAnalysis?.customer_name ?? null,
            case_number: inboundAnalysis?.case_number ?? null,
            inbound_id: inbound.id,
            outbound_id: reply.id,
            date: inbound.received_at,
            summary: inboundAnalysis?.ai_summary ?? null,
          },
        });
        pairCount++;
      }
    }

    // Remaining unmatched outbounds → standalone
    for (const out of outbounds) {
      if (!usedOutbounds.has(out.id)) {
        const content = formatOutbound(out);
        if (content.length < 30) continue;
        const analysis = analysisMap.get(out.id);
        chunks.push({
          chunk_type: "email_outbound",
          source_type: "email",
          source_key: `outbound:${out.source_id}`,
          content,
          metadata: {
            intent: analysis?.email_intent ?? null,
            category: analysis?.category ?? null,
            customer_name: analysis?.customer_name ?? null,
            outbound_id: out.id,
            date: out.received_at,
          },
        });
        standaloneCount++;
      }
    }
  }

  // Threadless outbound emails
  for (const email of threadlessOutbound) {
    const content = formatOutbound(email);
    if (content.length < 30) continue;
    const analysis = analysisMap.get(email.id);
    chunks.push({
      chunk_type: "email_outbound",
      source_type: "email",
      source_key: `outbound:${email.source_id}`,
      content,
      metadata: {
        intent: analysis?.email_intent ?? null,
        category: analysis?.category ?? null,
        customer_name: analysis?.customer_name ?? null,
        outbound_id: email.id,
        date: email.received_at,
      },
    });
    standaloneCount++;
  }

  console.log(`  Q&A pairs:          ${pairCount}`);
  console.log(`  Standalone outbound: ${standaloneCount}`);
  console.log(`  Total chunks:        ${chunks.length}`);

  if (chunks.length === 0) {
    console.error("\nNo chunks generated — aborting.");
    process.exit(1);
  }

  // 4. Embed in batches
  console.log("\n[4/5] Generating embeddings via OpenAI...");

  const embedded: (Chunk & { embedding: number[] })[] = [];
  let done = 0;

  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    let embeddings: number[][];

    try {
      embeddings = await embedBatch(batch.map((c) => c.content));
    } catch (err: any) {
      console.error(`\n  Embed batch failed at offset ${i}: ${err.message}`);
      // Retry once after 5s
      await new Promise((r) => setTimeout(r, 5000));
      embeddings = await embedBatch(batch.map((c) => c.content));
    }

    for (let j = 0; j < batch.length; j++) {
      embedded.push({ ...batch[j], embedding: embeddings[j] });
    }

    done += batch.length;
    process.stdout.write(`\r  ${done}/${chunks.length} embedded...`);

    // Gentle rate-limit pause (text-embedding-3-small: 3000 RPM on Tier 1)
    if (i + EMBED_BATCH_SIZE < chunks.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  console.log(`\r  ${done}/${chunks.length} embedded ✓`);

  // 5. Upsert to Supabase
  console.log("\n[5/5] Upserting to sales.kb_chunks...");

  let upserted = 0;

  for (let i = 0; i < embedded.length; i += UPSERT_BATCH_SIZE) {
    const batch = embedded.slice(i, i + UPSERT_BATCH_SIZE).map((c) => ({
      chunk_type: c.chunk_type,
      source_type: c.source_type,
      source_key: c.source_key,
      content: c.content,
      embedding: `[${c.embedding.join(",")}]`, // pgvector literal format
      metadata: c.metadata,
    }));

    const { error } = await sales
      .from("kb_chunks")
      .upsert(batch, { onConflict: "source_key" });

    if (error) {
      console.error(`\n  Upsert error at offset ${i}: ${error.message}`);
      throw error;
    }

    upserted += batch.length;
    process.stdout.write(`\r  ${upserted}/${embedded.length} upserted...`);
  }

  console.log(`\r  ${upserted}/${embedded.length} upserted ✓`);

  console.log("\n✓ KB build complete!");
  console.log(`  ${pairCount} Q&A pairs`);
  console.log(`  ${standaloneCount} standalone outbound templates`);
  console.log(`  Table: sales.kb_chunks`);
  console.log(`  Search: SELECT * FROM sales.search_kb('<embedding>', null, null, null, 5);`);
}

main().catch((err) => {
  console.error("\nFATAL:", err.message || err);
  process.exit(1);
});
