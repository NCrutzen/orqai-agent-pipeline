import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const INTERNAL_API_KEY = process.env.SMEBA_INTERNAL_API_KEY!;

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (apiKey !== INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawText = await request.text().catch(() => "");
  let parsed: any = null;
  try { parsed = JSON.parse(rawText); } catch {}
  // Log only the payload structure, never the content (GDPR — no email bodies in logs)
  const payloadKeys = parsed && typeof parsed === "object" ? Object.keys(parsed) : [];
  console.log("[smeba/write-analysis] payload keys:", payloadKeys.join(","));

  // Orq.ai may wrap arguments: { arguments: {...} } or { input: {...} } or flat
  const body = parsed?.arguments ?? parsed?.input ?? parsed ?? {};

  // email_id from Zapier = SugarCRM UUID (source_id in email_pipeline.emails)
  const sourceId = body?.email_id ?? body?.emailId;

  if (!sourceId) {
    console.log("[smeba/write-analysis] missing email_id. payload keys:", payloadKeys.join(","));
    return NextResponse.json({ error: "Missing email_id" }, { status: 400 });
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
        mailbox: "verkoop@smeba.nl",
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

  // Map agent-supplied draft_status to DB-allowed values: none | pending | approved | rejected | skipped
  const VALID_STATUSES = new Set(["none", "pending", "approved", "rejected", "skipped"]);
  const rawStatus = body.draft_status ?? "none";
  const draft_status = VALID_STATUSES.has(rawStatus)
    ? rawStatus
    : body.draft_response
    ? "pending"
    : "none";

  // Orq.ai HTTP tools reject empty-string variables, so the orchestrator passes
  // sentinel values (e.g. "-" or "n.v.t.") for missing CRM fields. Normalise those
  // back to null before writing.
  const nullish = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (s === "" || s === "-" || s.toLowerCase() === "n.v.t." || s.toLowerCase() === "n/a" || s.toLowerCase() === "null" || s.toLowerCase() === "onbekend") return null;
    return s;
  };

  const { error } = await supabase
    .schema("sales")
    .from("email_analysis")
    .upsert(
      {
        email_id: supabaseEmailId,
        category: nullish(body.category),
        email_intent: nullish(body.email_intent),
        ai_summary: nullish(body.ai_summary),
        urgency: nullish(body.urgency),
        requires_action: body.requires_action ?? body.requires_human_review ?? false,
        draft_response: nullish(body.draft_response),
        draft_status,
        language: nullish(body.language),
        customer_name: nullish(body.customer_name),
        customer_reference: nullish(body.customer_reference),
        case_number: nullish(body.case_number),
        assigned_to: nullish(body.assigned_to),
      },
      { onConflict: "email_id", ignoreDuplicates: false }
    );

  if (error) {
    console.error("[smeba/write-analysis] Supabase error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email_id: supabaseEmailId, source_id: sourceId });
}
