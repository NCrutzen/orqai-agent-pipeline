import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const ZAP_SHARED_SECRET = process.env.SUPPORT_CLICKUP_ZAP_SECRET;

export const maxDuration = 30;

/**
 * POST /api/automations/support-tickets/clickup-create/callback
 *
 * Terminal step of the ClickUp create-task Zap. The Zap POSTs back the
 * clickup_task_id and clickup_task_url; we UPDATE the pending
 * public.support_clickup_create_requests row so the original caller
 * (waiting via Supabase Realtime) unblocks.
 *
 * Auth: `auth` field in body matches SUPPORT_CLICKUP_ZAP_SECRET (constant-time).
 *
 * Expected body:
 *   { requestId, auth, clickup_task_id, clickup_task_url }
 *
 * Mirrors /api/automations/debtor/nxt-lookup/callback/route.ts.
 */
export async function POST(request: NextRequest) {
  if (!ZAP_SHARED_SECRET) {
    return NextResponse.json(
      { error: "SUPPORT_CLICKUP_ZAP_SECRET not configured" },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | (Record<string, unknown> & {
        requestId?: unknown;
        auth?: unknown;
        clickup_task_id?: unknown;
        clickup_task_url?: unknown;
      })
    | null;

  if (!body) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Constant-time secret comparison (mirrors nxt callback)
  const suppliedAuth = typeof body.auth === "string" ? body.auth : "";
  if (!constantTimeEqual(suppliedAuth, ZAP_SHARED_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
    return NextResponse.json({ error: "invalid_request_id" }, { status: 400 });
  }

  // Tolerate Zapier string serialization for task_id and task_url
  const clickup_task_id = typeof body.clickup_task_id === "string"
    ? body.clickup_task_id.trim()
    : null;
  const clickup_task_url = typeof body.clickup_task_url === "string"
    ? body.clickup_task_url.trim()
    : null;

  if (!clickup_task_id || !clickup_task_url) {
    return NextResponse.json(
      { error: "missing_task_fields", details: "clickup_task_id and clickup_task_url are required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("support_clickup_create_requests")
    .update({
      status: "done",
      clickup_task_id,
      clickup_task_url,
      updated_at: new Date().toISOString(),
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
