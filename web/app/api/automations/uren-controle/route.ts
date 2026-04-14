import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";

const WEBHOOK_SECRET = process.env.AUTOMATION_WEBHOOK_SECRET!;

// Max payload: a typical Hour Calculation is <2 MB base64.
// Next.js default body limit is sufficient; no custom config needed.

export async function POST(request: NextRequest) {
  // Authenticate via shared secret (same pattern as prolius-report)
  const secret = request.headers.get("x-automation-secret");
  if (secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  // Accept either a pre-authenticated download URL (simpler for Zapier) or raw base64.
  // SharePoint trigger in Zapier provides a signed downloadUrl field directly.
  const hasBase64 =
    typeof body.contentBase64 === "string" && body.contentBase64.length >= 100;
  const hasUrl =
    typeof body.downloadUrl === "string" && body.downloadUrl.startsWith("http");

  if (!body.filename || (!hasBase64 && !hasUrl)) {
    return NextResponse.json(
      {
        error:
          "filename required + either downloadUrl (SharePoint signed URL) or contentBase64",
      },
      { status: 400 },
    );
  }

  // Normalize environment — default to 'acceptance' per CLAUDE.md test-first pattern
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
      // One of these will be set — Inngest function handles both
      contentBase64: hasBase64 ? body.contentBase64 : undefined,
      downloadUrl: hasUrl ? body.downloadUrl : undefined,
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
