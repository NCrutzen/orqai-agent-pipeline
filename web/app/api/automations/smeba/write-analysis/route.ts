import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const INTERNAL_API_KEY = process.env.SMEBA_INTERNAL_API_KEY!;

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (apiKey !== INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawText = await request.text().catch(() => "");
  console.log("[smeba/write-analysis] raw body:", rawText.slice(0, 500));
  let body: any = null;
  try { body = JSON.parse(rawText); } catch {}
  if (!body?.email_id) {
    console.log("[smeba/write-analysis] missing email_id, body keys:", body ? Object.keys(body) : "null");
    return NextResponse.json({ error: "Missing email_id", received: body }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("sales")
    .from("email_analysis")
    .upsert(
      {
        email_id: body.email_id,
        category: body.category ?? null,
        email_intent: body.email_intent ?? null,
        ai_summary: body.ai_summary ?? null,
        urgency: body.urgency ?? null,
        requires_action: body.requires_human_review ?? false,
        draft_response: body.draft_response ?? null,
        draft_status: body.draft_status ?? "skipped",
      },
      { onConflict: "email_id", ignoreDuplicates: false }
    );

  if (error) {
    console.error("[smeba/write-analysis] Supabase error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email_id: body.email_id });
}
