import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";

const WEBHOOK_SECRET = process.env.AUTOMATION_WEBHOOK_SECRET!;

/**
 * Webhook endpoint voor Zapier: Heeren Oefeningen facturatie automation.
 *
 * Zapier stuurt een POST zodra het een oefening-orderregel detecteert
 * die verwijderd moet worden uit NXT.
 *
 * Verwacht body (Fase 1 velden — vereist):
 *   billingOrderCode:    string  — NXT order referentie (bijv. "370147")
 *   billingOrderId:      string  — interne billing order ID
 *   billingOrderLineId:  string  — interne line ID (uniek — gebruikt voor idempotency)
 *   billingItemId:       string  — artikel-ID (bijv. "6410005107")
 *   courseId:            string  — cursus-ID voor referentie
 *
 * Verwacht body (Fase 2 velden — optioneel maar vereist voor het maandelijks
 * aanmaken van nieuwe orders; records zonder deze data worden in Fase 2 gesplipt):
 *   customerId:          string  — NXT customer ID (bijv. "200007")
 *   siteId:              string  — NXT site ID (bijv. "318887")
 *   brandId:             string  — NXT brand/company ID (bijv. "SB")
 *   orderTypeId:         string  — NXT order type (bijv. "DO" voor Directe Order)
 *   quantity:            number  — hoeveelheid
 *   unitPrice:           number  — stuksprijs
 *   description:         string  — regel-beschrijving
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

  const {
    billingOrderCode,
    billingOrderId,
    billingOrderLineId,
    billingItemId,
    courseId,
    // Fase 2 velden (optioneel)
    customerId,
    siteId,
    brandId,
    orderTypeId,
    quantity,
    unitPrice,
    description,
    environment,
  } = body;

  if (!billingOrderCode || !billingOrderLineId || !billingItemId) {
    return NextResponse.json(
      { error: "billingOrderCode, billingOrderLineId en billingItemId zijn verplicht" },
      { status: 400 },
    );
  }

  // Parse numerieke velden veilig — Zapier kan ze als string sturen
  const parsedQuantity = quantity != null && quantity !== "" ? Number(quantity) : undefined;
  const parsedUnitPrice = unitPrice != null && unitPrice !== "" ? Number(unitPrice) : undefined;

  const inngestPayload = {
    triggeredBy: "zapier-webhook",
    billingOrderCode,
    billingOrderId: billingOrderId ?? "",
    billingOrderLineId,
    billingItemId,
    courseId: courseId ?? "",
    ...(customerId ? { customerId: String(customerId) } : {}),
    ...(siteId ? { siteId: String(siteId) } : {}),
    ...(brandId ? { brandId: String(brandId) } : {}),
    ...(orderTypeId ? { orderTypeId: String(orderTypeId) } : {}),
    ...(Number.isFinite(parsedQuantity) ? { quantity: parsedQuantity } : {}),
    ...(Number.isFinite(parsedUnitPrice) ? { unitPrice: parsedUnitPrice } : {}),
    ...(description ? { description: String(description) } : {}),
    ...(environment === "acceptance" || environment === "production" ? { environment } : {}),
  };

  // Dry-run: echo terug wat we ontvangen zonder Inngest/NXT te raken.
  // Handig om Zapier → Vercel payload te debuggen.
  if (body.dryRun === true || body.dryRun === "true") {
    // Deze 4 moeten van Zapier komen. quantity/unitPrice/description worden
    // tijdens Fase 1 uit NXT gescraped, dus geen Zapier-input vereist.
    const zapierFase2: string[] = [];
    for (const k of ["customerId", "siteId", "brandId", "orderTypeId"] as const) {
      if (!(k in inngestPayload)) zapierFase2.push(k);
    }
    const capturedFromNxt = ["quantity", "unitPrice", "description"];
    return NextResponse.json(
      {
        dryRun: true,
        message: "DRY RUN — geen Inngest/NXT aangeroepen",
        rawBodyKeys: Object.keys(body),
        parsedPayload: inngestPayload,
        fase1_ok: Boolean(billingOrderCode && billingOrderLineId && billingItemId),
        fase2_missing_from_zapier: zapierFase2,
        fase2_captured_from_nxt: capturedFromNxt,
        fase2_ready: zapierFase2.length === 0,
      },
      { status: 200 },
    );
  }

  await inngest.send({
    name: "automation/heeren-oefeningen.triggered",
    data: inngestPayload,
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
