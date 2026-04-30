import { NextResponse } from "next/server";
import { listOrderTypes } from "@/lib/automations/nxt-zapier/nxt-client";
import { checkWebhookAuth } from "@/lib/automations/nxt-zapier/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const authError = checkWebhookAuth(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const env = url.searchParams.get("env") === "production" ? "production" : "acceptance";

  try {
    const types = await listOrderTypes(env);
    return NextResponse.json(
      types.map((t) => ({ id: t.id, name: t.name }))
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
