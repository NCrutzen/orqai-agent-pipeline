import { NextResponse } from "next/server";
import { listBrands } from "@/lib/automations/nxt-zapier/nxt-client";
import { checkWebhookAuth } from "@/lib/automations/nxt-zapier/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const authError = checkWebhookAuth(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const env = url.searchParams.get("env") === "production" ? "production" : "acceptance";

  try {
    const brands = await listBrands(env);
    return NextResponse.json(
      brands.map((b) => ({ id: b.id, name: b.name }))
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
