import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSalesOrder,
  searchItems,
  determinePrice,
  type CreateSalesOrderInput,
} from "@/lib/automations/nxt-zapier/nxt-client";

export const maxDuration = 60;
export const runtime = "nodejs";

const LineSchema = z.object({
  itemId: z.string().min(1),
  itemDescription: z.string().optional(),
  quantity: z.number().positive(),
  // Prijs is optioneel — als leeg of 0 dan haalt de route hem op via
  // /api/prices/determine, exact zoals het NXT-frontend dat doet.
  price: z.number().nonnegative().optional(),
  discount: z.number().nonnegative().default(0),
  transferToUsage: z.boolean().default(true),
});

const BodySchema = z.object({
  env: z.enum(["acceptance", "production"]).default("acceptance"),
  customerId: z.coerce.number().int().positive(),
  siteId: z.string().min(1),
  brandId: z.string().min(1),
  orderTypeId: z.string().min(1),
  lines: z.array(LineSchema).min(1),
  references: z
    .object({
      reference1: z.string().optional(),
      reference2: z.string().optional(),
      reference3: z.string().optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  const expected = process.env.AUTOMATION_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const provided = req.headers.get("x-webhook-secret")?.trim() ?? "";
  if (provided !== expected.trim()) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        // Geen secrets terug -- alleen lengte als debug-hint
        debug: {
          providedLength: provided.length,
          expectedLength: expected.trim().length,
          match: false,
        },
      },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  // Vul ontbrekende item-descriptions + prices aan via NXT lookups
  const lines: CreateSalesOrderInput["lines"] = [];
  for (const l of parsed.data.lines) {
    let description = l.itemDescription;
    if (!description) {
      const items = await searchItems(parsed.data.env, l.itemId);
      const match = items.find((i) => i.id === l.itemId) ?? items[0];
      if (!match) {
        return NextResponse.json(
          { error: `Item niet gevonden: ${l.itemId}` },
          { status: 422 }
        );
      }
      description = match.description;
    }

    // Prijs niet meegegeven? Laat NXT de standaardprijs bepalen
    // (zelfde call als het frontend bij het invullen van een item doet).
    let price = l.price;
    if (price === undefined) {
      const determined = await determinePrice(
        parsed.data.env,
        parsed.data.customerId,
        parsed.data.siteId,
        l.itemId,
        l.quantity
      );
      price = determined.price;
    }

    lines.push({
      itemId: l.itemId,
      itemDescription: description,
      quantity: l.quantity,
      price,
      discount: l.discount,
      transferToUsage: l.transferToUsage,
    });
  }

  try {
    const result = await createSalesOrder({
      env: parsed.data.env,
      customerId: parsed.data.customerId,
      siteId: parsed.data.siteId,
      brandId: parsed.data.brandId,
      orderTypeId: parsed.data.orderTypeId,
      lines,
      references: parsed.data.references,
    });
    const baseUrl =
      parsed.data.env === "production" ? "https://sb.n-xt.org" : "https://acc.sb.n-xt.org";
    return NextResponse.json({
      ok: true,
      id: result.id,
      internalId: result.internalId,
      orderStatusId: result.orderStatusId,
      url: `${baseUrl}/#/orders/filter/list/detail/${result.id}`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
