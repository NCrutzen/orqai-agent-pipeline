import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const INTERNAL_API_KEY = process.env.SMEBA_INTERNAL_API_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const EMBEDDING_MODEL = "text-embedding-3-small";

async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000), // token safety limit
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings error ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.data[0].embedding as number[];
}

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (apiKey !== INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.query || typeof body.query !== "string") {
    return NextResponse.json(
      { error: "Missing required field: query (string)" },
      { status: 400 }
    );
  }

  const {
    query,
    intent,
    category,
    chunk_types,
    limit = 10,
  }: {
    query: string;
    intent?: string;
    category?: string;
    chunk_types?: string[];
    limit?: number;
  } = body;

  // Generate embedding server-side.
  // sales.search_kb() expects a pre-computed vector(1536) — agents pass text only.
  let embedding: number[];
  try {
    embedding = await generateEmbedding(query);
  } catch (err) {
    console.error("[smeba/search-kb] Embedding generation failed:", err);
    return NextResponse.json(
      { error: "Embedding generation failed", details: String(err) },
      { status: 502 }
    );
  }

  // Call sales.search_kb() via supabase-js service role.
  // The sales schema is not exposed via PostgREST — use .schema() to bypass.
  // pgvector literal format: "[x,y,z,...]"
  const admin = createAdminClient();
  const { data, error } = await (admin.schema("sales") as ReturnType<typeof admin.schema>)
    .rpc("search_kb", {
      query_embedding: `[${embedding.join(",")}]`,
      intent_filter: intent ?? null,
      category_filter: category ?? null,
      chunk_types: chunk_types && chunk_types.length > 0 ? chunk_types : null,
      match_count: Math.min(limit, 20),
    });

  if (error) {
    console.error("[smeba/search-kb] Supabase RPC error:", error);
    return NextResponse.json(
      { error: "KB search failed", details: error.message },
      { status: 502 }
    );
  }

  const chunks = (data ?? []).map(
    (row: {
      id: string;
      chunk_type: string;
      content: string;
      metadata: Record<string, unknown>;
      similarity: number;
    }) => ({
      id: row.id,
      chunk_type: row.chunk_type,
      content: row.content,
      similarity: row.similarity,
      metadata: row.metadata,
    })
  );

  return NextResponse.json({ chunks });
}
