import { NextResponse } from "next/server";
import { searchItems } from "@/lib/automations/nxt-zapier/nxt-client";
import { checkWebhookAuth } from "@/lib/automations/nxt-zapier/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const authError = checkWebhookAuth(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const env = url.searchParams.get("env") === "production" ? "production" : "acceptance";
  const q = (url.searchParams.get("q") ?? "").trim();

  if (!q) {
    return NextResponse.json([]);
  }

  try {
    // NXT's items/search matcht op zowel artikelnummer als omschrijving
    const items = await searchItems(env, q);
    return NextResponse.json(
      items.map((i) => ({
        id: i.id,
        name: `${i.id} — ${i.description}`,
        description: i.description,
        salesPackagePrice: i.salesPackagePrice,
      }))
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
