import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const ZAP_SHARED_SECRET = process.env.DEBTOR_FETCH_WEBHOOK_SECRET;

export const maxDuration = 30;

/**
 * POST /api/automations/debtor/nxt-lookup/callback
 *
 * Terminal step of the NXT generic-lookup Zap. The Zap POSTs back the SQL
 * `matches` array; we UPDATE the pending debtor.nxt_lookup_requests row so
 * the original caller (waiting via Realtime) unblocks.
 *
 * Auth: `secret` field in body matches DEBTOR_FETCH_WEBHOOK_SECRET (constant-time).
 *
 * Expected body:
 *   { requestId, secret, lookup_kind, matches: [...] }
 */
export async function POST(request: NextRequest) {
  if (!ZAP_SHARED_SECRET) {
    return NextResponse.json(
      { error: "DEBTOR_FETCH_WEBHOOK_SECRET not configured" },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | (Record<string, unknown> & {
        requestId?: unknown;
        secret?: unknown;
        matches?: unknown;
      })
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

  // matches must be an array. Zapier sometimes sends a single object instead
  // of an array when the SQL step returned exactly one row — normalize.
  let matches: unknown[];
  if (Array.isArray(body.matches)) {
    matches = body.matches;
  } else if (body.matches && typeof body.matches === "object") {
    matches = [body.matches];
  } else if (body.matches == null) {
    matches = [];
  } else {
    return NextResponse.json({ error: "invalid_matches" }, { status: 400 });
  }

  // Strip auth out of stored payload.
  const { secret: _secret, ...resultPayload } = body;
  const result = { ...resultPayload, matches };

  const admin = createAdminClient();

  const { data, error } = await admin
    .schema("debtor")
    .from("nxt_lookup_requests")
    .update({
      status: "complete",
      result,
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
