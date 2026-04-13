import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";

const WEBHOOK_SECRET = process.env.AUTOMATION_WEBHOOK_SECRET!;

/**
 * Zapier webhook: SharePoint "New File" -> (base64 body) -> this route -> Inngest.
 *
 * Body contract:
 *   {
 *     filename: string;           // Hour_Calculation_YYYY-MM.xlsx
 *     contentBase64: string;      // Base64-encoded file content (Zapier provides it)
 *     environment?: 'production'|'acceptance'|'test';  // default: 'acceptance'
 *     triggeredAt?: string;       // ISO timestamp (optional — default: now)
 *     sourceUrl?: string;         // SharePoint URL — metadata only, never downloaded
 *     triggeredBy?: string;       // default: "zapier-sharepoint-webhook"
 *   }
 *
 * Auth: shared secret header `x-automation-secret` (same as prolius-report).
 * The file is NOT re-downloaded from SharePoint — Zapier owns that auth boundary.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-automation-secret");
  if (secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    filename?: string;
    contentBase64?: string;
    environment?: string;
    triggeredAt?: string;
    sourceUrl?: string;
    triggeredBy?: string;
  };

  if (!body.filename || !body.contentBase64) {
    return NextResponse.json(
      { error: "filename and contentBase64 required" },
      { status: 400 },
    );
  }

  if (
    typeof body.contentBase64 !== "string" ||
    body.contentBase64.length < 100
  ) {
    return NextResponse.json(
      { error: "contentBase64 too small to be a valid Excel file" },
      { status: 400 },
    );
  }

  // Environment default: 'acceptance' per CLAUDE.md test-first pattern.
  // Production requires explicit "environment":"production" from the Zap body.
  const environment: "production" | "acceptance" | "test" =
    body.environment === "production"
      ? "production"
      : body.environment === "test"
        ? "test"
        : "acceptance";

  await inngest.send({
    name: "automation/uren-controle.triggered",
    data: {
      filename: body.filename,
      contentBase64: body.contentBase64,
      environment,
      triggeredBy: body.triggeredBy ?? "zapier-sharepoint-webhook",
      triggeredAt: body.triggeredAt ?? new Date().toISOString(),
      sourceUrl: body.sourceUrl,
    },
  });

  return NextResponse.json(
    { message: "Uren controle triggered", environment },
    { status: 202 },
  );
}
