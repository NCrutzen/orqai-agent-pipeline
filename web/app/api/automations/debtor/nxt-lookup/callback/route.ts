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

  // matches normalization. Zapier serializes complex values as
  // `Object.to_json(...)` strings when mapped from an SQL step — accept
  // string-encoded JSON arrays/objects as well as native arrays/objects.
  let raw: unknown = body.matches;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") {
      raw = [];
    } else {
      try {
        raw = JSON.parse(trimmed);
      } catch {
        return NextResponse.json(
          { error: "invalid_matches", details: "matches string is not JSON" },
          { status: 400 },
        );
      }
    }
  }
  // Zapier wraps SQL step output as either:
  //   { rows: [...] }                                 (object)
  //   [{ rows: [...], _zap_search_was_found_status }] (array of step wrappers)
  // Recursively unwrap any object whose only meaningful key is `rows`.
  // Drop Zapier-internal keys that leak into individual rows.
  const ZAPIER_INTERNAL_KEYS = new Set([
    "_zap_search_was_found_status",
    "_zap_search_success_on_miss",
    "_zap_search_multiple_results",
  ]);
  const stripZapInternals = (obj: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!ZAPIER_INTERNAL_KEYS.has(k)) out[k] = v;
    }
    return out;
  };
  const flattenRows = (val: unknown): unknown[] => {
    if (Array.isArray(val)) return val.flatMap(flattenRows);
    if (val && typeof val === "object") {
      const obj = val as Record<string, unknown>;
      if (Array.isArray(obj.rows)) return flattenRows(obj.rows);
      return [stripZapInternals(obj)];
    }
    return [];
  };
  if (
    (raw && typeof raw === "object") ||
    Array.isArray(raw)
  ) {
    raw = flattenRows(raw);
  }
  let matches: unknown[];
  if (Array.isArray(raw)) {
    matches = raw;
  } else if (raw && typeof raw === "object") {
    matches = [raw];
  } else if (raw == null) {
    matches = [];
  } else {
    // Diagnostic: surface what we received so the caller can debug Zapier's
    // serialization. Safe to expose since this endpoint is auth-gated.
    const sample =
      typeof body.matches === "string"
        ? `string len=${body.matches.length} head="${body.matches.slice(0, 80)}"`
        : `type=${typeof body.matches} value=${JSON.stringify(body.matches)?.slice(0, 200)}`;
    return NextResponse.json(
      { error: "invalid_matches", details: sample },
      { status: 400 },
    );
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
