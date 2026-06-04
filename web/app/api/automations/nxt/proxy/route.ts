import { NextResponse } from "next/server";
import { z } from "zod";
import { nxtRequest } from "@/lib/automations/nxt-zapier/nxt-client";
import { checkProxyAuth } from "@/lib/automations/nxt-zapier/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Generieke passthrough-proxy naar de NXT REST-API (de "verborgen" /api achter
 * de JHipster/Auth0 SPA). Token wordt server-side ge-harvest + gecached; de
 * caller ziet 'm nooit. Bedoeld voor Handler Agents / skills die rechtstreeks
 * met NXT willen praten zonder Browserless of credentials lokaal te hebben.
 *
 * Security (per teambesluit 2026-06-04):
 *   - env-gescheiden secrets: acc → AUTOMATION_WEBHOOK_SECRET,
 *     prod → NXT_PROD_WEBHOOK_SECRET (acc-only houder kan prod niet raken).
 *   - read-only prod: op productie zijn alle niet-GET calls geblokkeerd tenzij
 *     `allowWrite: true` expliciet wordt meegegeven. LET OP: NXT gebruikt POST
 *     ook voor reads (lookups), dus een prod-lookup heeft óók allowWrite nodig —
 *     de proxy kan een search-POST niet onderscheiden van een create-POST.
 *   - geen path-allowlist (bewust open): elke /api/* path mag.
 */
const BodySchema = z.object({
  env: z.enum(["acceptance", "production"]).default("acceptance"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  path: z.string().startsWith("/api/"),
  body: z.unknown().optional(),
  // Vereist op productie voor elke niet-GET call (incl. lookup-POST's).
  allowWrite: z.boolean().default(false),
});

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { env, method, path, body, allowWrite } = parsed.data;

  // Auth NA env-parse zodat we het juiste secret kiezen.
  const authError = checkProxyAuth(req, env);
  if (authError) return authError;

  // Read-only prod gate.
  if (env === "production" && method !== "GET" && !allowWrite) {
    return NextResponse.json(
      {
        error: "Prod is read-only: zet allowWrite:true voor niet-GET calls",
        hint: "NXT gebruikt POST ook voor lookups — die hebben op prod óók allowWrite nodig.",
      },
      { status: 403 }
    );
  }

  try {
    const result = await nxtRequest(env, method, path, body);
    // Relay NXT's status 1-op-1 (binnen 200..599) zodat de caller echte fouten ziet.
    const status = result.status >= 200 && result.status <= 599 ? result.status : 502;
    return NextResponse.json(
      { ok: result.ok, status: result.status, data: result.data },
      { status }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
