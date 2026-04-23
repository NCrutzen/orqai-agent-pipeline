import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const ZAP_SHARED_SECRET = process.env.DEBTOR_FETCH_WEBHOOK_SECRET;

export const maxDuration = 30;

/**
 * POST /api/automations/debtor/fetch-document/callback
 *
 * Terminal step of the Zap — posts back the hydrated pdf_url + NXT metadata.
 *
 * Auth: the `secret` field in the body must match DEBTOR_FETCH_WEBHOOK_SECRET
 * (constant-time compare). This route is NOT behind AUTOMATION_WEBHOOK_SECRET.
 */
export async function POST(request: NextRequest) {
  if (!ZAP_SHARED_SECRET) {
    return NextResponse.json(
      { error: "DEBTOR_FETCH_WEBHOOK_SECRET not configured" },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | (Record<string, unknown> & { requestId?: unknown; secret?: unknown })
    | null;

  if (!body) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const suppliedSecret = typeof body.secret === "string" ? body.secret : "";
  if (!constantTimeEqual(suppliedSecret, ZAP_SHARED_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
    return NextResponse.json({ error: "invalid_request_id" }, { status: 400 });
  }

  // Strip `secret` out of the stored payload.
  const { secret: _secret, ...resultPayload } = body;

  const admin = createAdminClient();

  // UPDATE ... RETURNING to tell missing-row from existing-row.
  const { data, error } = await admin
    .schema("debtor")
    .from("fetch_requests")
    .update({
      status: "complete",
      result: resultPayload,
      completed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "update_failed", details: error.message },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: "unknown_request" }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
