// Plan 02-05 Task 2 — embedAndSearchSimilar via Orq.ai SDK + support.match_tickets RPC.
//
// CLAUDE.md compliance: NO direct OpenAI SDK — embeddings flow through the
// `@orq-ai/node` SDK's Router (`openai/text-embedding-3-small`, 1536 dims).
// Pattern mirrors `app/api/automations/smeba/search-kb/route.ts`.
//
// The RPC was created in Plan 02-01's migration (B-3 consolidation); we DO NOT
// ship migrations here.
//
// "Empty path is happy path" — when `support.ticket_embeddings` has no rows
// (dev state), the RPC returns `[]` and this function returns `{ similar: [] }`
// WITHOUT throwing. Stage 2 caller folds that into PipelineStageContext as
// `similar_tickets: []` + `decision_details.similar_tickets_empty: true`.
//
// Cost: text-embedding-3-small is $0.02 / 1M tokens (~0.0002¢ per call at
// 100-token inputs). numeric(10,4) precision via quantizeCost.

import { z } from "zod";

import {
  similarTicketSchema,
  type SimilarTicket,
} from "./pipeline-stage-context";

const EMBED_MODEL = "openai/text-embedding-3-small" as const;
const EXPECTED_DIM = 1536;
const DEFAULT_TOP_K = 5;
export const MAX_TOP_K = 10;
const MIN_TOP_K = 1;
const TIMEOUT_MS = 45_000;
// $0.02 per 1M tokens (text-embedding-3-small, 2026-05).
const EMBED_USD_PER_TOKEN = 0.02 / 1_000_000;
const USD_TO_CENTS = 100;
// Conservative ceiling for one embedding call (0.5¢) — used as floor when
// usage is missing so cost is never reported as exactly 0 (which would
// mislead the cost-ceiling accumulator into thinking the call was free).
const FALLBACK_COST_CENTS = 0.0002;

export class EmbedSearchError extends Error {
  readonly code: string;
  readonly http_status: number | null;
  constructor(
    code: string,
    opts?: { cause?: unknown; http_status?: number | null; message?: string },
  ) {
    super(opts?.message ?? code, { cause: opts?.cause });
    this.name = "EmbedSearchError";
    this.code = code;
    this.http_status = opts?.http_status ?? null;
  }
}

export interface EmbedAndSearchArgs {
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { schema: (name: string) => { rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> } };
  env: { ORQ_API_KEY?: string };
  topK?: number;
}

export interface EmbedAndSearchResult {
  similar: SimilarTicket[];
  cost_cents: number;
}

function quantizeCost(cents: number): number {
  return Math.round(cents * 10_000) / 10_000;
}

function clampTopK(k: number | undefined): number {
  const v = k ?? DEFAULT_TOP_K;
  return Math.min(Math.max(v, MIN_TOP_K), MAX_TOP_K);
}

const rpcRowsSchema = z.array(similarTicketSchema);

export async function embedAndSearchSimilar(
  args: EmbedAndSearchArgs,
): Promise<EmbedAndSearchResult> {
  const apiKey = args.env.ORQ_API_KEY;
  if (!apiKey) {
    throw new EmbedSearchError("missing_orq_api_key");
  }
  const topK = clampTopK(args.topK);

  // ---- (1) Generate embedding via @orq-ai/node SDK ----
  // (Mirrors smeba/search-kb/route.ts pattern. Lazy dynamic import keeps unit
  // tests fast — the SDK ships its own fetch + auth + retry plumbing.)
  let embedding: number[];
  let tokens = 0;
  try {
    const { Orq } = await import("@orq-ai/node");
    const orq = new Orq({ apiKey });
    const res = await orq.router.embeddings.create({
      model: EMBED_MODEL,
      input: args.text.slice(0, 8000),
    });
    const emb = (res as { data?: Array<{ embedding?: number[] | string }> }).data?.[0]?.embedding;
    if (typeof emb === "string") {
      throw new EmbedSearchError("orq_embedding_unexpected_base64");
    }
    if (!Array.isArray(emb)) {
      throw new EmbedSearchError("embedding_missing_in_response");
    }
    embedding = emb;
    const usage = (res as { usage?: { prompt_tokens?: number } }).usage;
    tokens = usage?.prompt_tokens ?? 0;
  } catch (cause) {
    if (cause instanceof EmbedSearchError) throw cause;
    throw new EmbedSearchError("orq_embedding_request_failed", { cause });
  }

  if (embedding.length !== EXPECTED_DIM) {
    throw new EmbedSearchError("embedding_dim_mismatch", {
      message: `expected ${EXPECTED_DIM}-dim, got ${embedding.length}`,
    });
  }

  const computed = tokens * EMBED_USD_PER_TOKEN * USD_TO_CENTS;
  const cost_cents =
    computed > 0 ? quantizeCost(computed) : FALLBACK_COST_CENTS;

  // ---- (2) Call public.match_support_tickets RPC ----
  // Public wrapper around support.match_tickets — PostgREST only exposes
  // `public` schema by default, so the wrapper avoids any Dashboard config.
  // pgvector requires the literal string format "[x,y,z,...]" — passing a JS
  // array via PostgREST will be JSON-encoded and rejected by the column type.
  const embeddingLiteral = `[${embedding.join(",")}]`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpcRes = await (args.supabase as any)
    .rpc("match_support_tickets", { query_embedding: embeddingLiteral, top_k: topK });

  if (rpcRes.error) {
    const msg = (rpcRes.error as { message?: string }).message ?? "unknown";
    throw new EmbedSearchError("match_tickets_rpc_failed", {
      message: `support.match_tickets RPC failed: ${msg}`,
    });
  }

  const rows = rpcRes.data ?? [];
  const safe = rpcRowsSchema.safeParse(rows);
  if (!safe.success) {
    throw new EmbedSearchError("match_tickets_row_schema_invalid", {
      cause: safe.error,
    });
  }

  return { similar: safe.data, cost_cents };
}
