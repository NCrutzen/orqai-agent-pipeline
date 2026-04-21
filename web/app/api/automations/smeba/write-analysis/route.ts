import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const INTERNAL_API_KEY = process.env.SMEBA_INTERNAL_API_KEY!;

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (apiKey !== INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawText = await request.text().catch(() => "");
  console.log("[smeba/write-analysis] raw body:", rawText.slice(0, 800));
  let parsed: any = null;
  try { parsed = JSON.parse(rawText); } catch {}

  // Orq.ai may wrap arguments: { arguments: {...} } or { input: {...} } or flat
  const body = parsed?.arguments ?? parsed?.input ?? parsed ?? {};

  // email_id from Zapier = SugarCRM UUID (source_id in email_pipeline.emails)
  const sourceId = body?.email_id ?? body?.emailId;

  if (!sourceId) {
    console.log("[smeba/write-analysis] missing email_id. parsed:", JSON.stringify(parsed)?.slice(0, 400));
    return NextResponse.json({ error: "Missing email_id", received: parsed }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Resolve SugarCRM source_id → Supabase email UUID.
  // The batch-fetched emails have source_id = SugarCRM UUID.
  // For live emails (not yet in the DB), create a minimal row.
  let supabaseEmailId: string;
  const { data: existing } = await supabase
    .schema("email_pipeline")
    .from("emails")
    .select("id")
    .eq("source_id", sourceId)
    .maybeSingle();

  if (existing?.id) {
    supabaseEmailId = existing.id;
  } else {
    // New email not yet in email_pipeline.emails — insert minimal row
    const { data: inserted, error: insertError } = await supabase
      .schema("email_pipeline")
      .from("emails")
      .insert({
        source_id: sourceId,
        source: "sugarcrm",
        subject: body.subject ?? null,
        body_text: body.body ?? body.body_text ?? null,
        sender_email: body.sender_email ?? null,
        sender_name: body.sender_name ?? null,
        received_at: body.date_sent ?? null,
        direction: "inbound",
      })
      .select("id")
      .single();

    if (insertError || !inserted?.id) {
      console.error("[smeba/write-analysis] Could not resolve/create email row:", insertError);
      return NextResponse.json(
        { ok: false, error: "Could not resolve email_id to Supabase UUID", source_id: sourceId },
        { status: 500 }
      );
    }
    supabaseEmailId = inserted.id;
    console.log("[smeba/write-analysis] Created new email_pipeline row:", supabaseEmailId);
  }

  const { error } = await supabase
    .schema("sales")
    .from("email_analysis")
    .upsert(
      {
        email_id: supabaseEmailId,
        category: body.category ?? null,
        email_intent: body.email_intent ?? null,
        ai_summary: body.ai_summary ?? null,
        urgency: body.urgency ?? null,
        requires_action: body.requires_action ?? body.requires_human_review ?? false,
        draft_response: body.draft_response ?? null,
        draft_status: body.draft_status ?? "skipped",
      },
      { onConflict: "email_id", ignoreDuplicates: false }
    );

  if (error) {
    console.error("[smeba/write-analysis] Supabase error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email_id: supabaseEmailId, source_id: sourceId });
}
