import { NextResponse } from "next/server";
import { listSites } from "@/lib/automations/nxt-zapier/nxt-client";
import { checkWebhookAuth } from "@/lib/automations/nxt-zapier/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const authError = checkWebhookAuth(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const env = url.searchParams.get("env") === "production" ? "production" : "acceptance";
  const customerId = Number(url.searchParams.get("customerId") ?? "");
  if (!customerId || Number.isNaN(customerId)) {
    return NextResponse.json([]);
  }

  try {
    const sites = await listSites(env, customerId);
    return NextResponse.json(
      sites.map((s) => ({
        id: s.id,
        name: `${s.name} (${s.id})`,
        siteName: s.name,
        brandId: s.brandId,
      }))
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
