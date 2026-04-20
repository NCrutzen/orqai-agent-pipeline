import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";

const WEBHOOK_SECRET = process.env.AUTOMATION_WEBHOOK_SECRET!;

/**
 * Webhook endpoint voor Zapier: Heeren Oefeningen facturatie automation.
 *
 * Zapier stuurt een POST zodra het een oefening-orderregel detecteert
 * die verwijderd moet worden uit NXT.
 *
 * Verwacht body:
 *   billingOrderCode:    string  — NXT order referentie (bijv. "370147")
 *   billingOrderId:      string  — interne billing order ID
 *   billingOrderLineId:  string  — interne line ID (uniek — gebruikt voor idempotency)
 *   billingItemId:       string  — artikel-ID (bijv. "6410005107")
 *   courseId:            string  — cursus-ID voor referentie
 */
function isAuthorized(request: NextRequest): boolean {
  // Optie 1: x-automation-secret header
  if (request.headers.get("x-automation-secret") === WEBHOOK_SECRET) return true;

  // Optie 2: Basic Auth (secret als username of password)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
    const [username, ...rest] = decoded.split(":");
    const password = rest.join(":");
    if (username === WEBHOOK_SECRET || password === WEBHOOK_SECRET) return true;
  }

  return false;
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  if (body.webhookSecret?.trim() !== WEBHOOK_SECRET?.trim()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { billingOrderCode, billingOrderId, billingOrderLineId, billingItemId, courseId } = body;

  if (!billingOrderCode || !billingOrderLineId || !billingItemId) {
    return NextResponse.json(
      { error: "billingOrderCode, billingOrderLineId en billingItemId zijn verplicht" },
      { status: 400 },
    );
  }

  await inngest.send({
    name: "automation/heeren-oefeningen.triggered",
    data: {
      triggeredBy: "zapier-webhook",
      billingOrderCode,
      billingOrderId: billingOrderId ?? "",
      billingOrderLineId,
      billingItemId,
      courseId: courseId ?? "",
    },
  });

  return NextResponse.json(
    {
      message: "Heeren Oefeningen automation gestart",
      billingOrderCode,
      billingOrderLineId,
    },
    { status: 202 },
  );
}
