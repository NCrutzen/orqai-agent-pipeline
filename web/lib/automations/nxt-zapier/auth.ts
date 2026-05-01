import { NextResponse } from "next/server";

/**
 * Shared auth-check voor alle /api/automations/nxt/* routes.
 * Geeft een NextResponse 401 terug bij mismatch, of null bij succes.
 */
export function checkWebhookAuth(req: Request): NextResponse | null {
  const expected = process.env.AUTOMATION_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const provided = req.headers.get("x-webhook-secret")?.trim() ?? "";
  if (provided !== expected.trim()) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        debug: {
          providedLength: provided.length,
          expectedLength: expected.trim().length,
          match: false,
        },
      },
      { status: 401 }
    );
  }
  return null;
}
