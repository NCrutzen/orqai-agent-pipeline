import { NextResponse } from "next/server";
import { searchCustomers } from "@/lib/automations/nxt-zapier/nxt-client";
import { checkWebhookAuth } from "@/lib/automations/nxt-zapier/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const authError = checkWebhookAuth(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const env = url.searchParams.get("env") === "production" ? "production" : "acceptance";
  const q = (url.searchParams.get("q") ?? "").trim();

  try {
    // NXT vereist een searchTerm; lege string geeft 400. Als q leeg is geven we
    // een instructie terug zodat Zapier-builders weten dat ze moeten typen.
    if (!q) {
      return NextResponse.json([]);
    }
    const results = await searchCustomers(env, q);
    return NextResponse.json(
      results.map((c) => ({
        id: c.id,
        // 'name' wordt in Zapier de label van de dropdown-optie
        name: `${c.name} (${c.id})`,
        customerName: c.name,
        brandId: c.brandId,
      }))
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
