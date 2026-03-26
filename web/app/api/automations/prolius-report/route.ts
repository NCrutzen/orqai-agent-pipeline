import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";

const WEBHOOK_SECRET = process.env.AUTOMATION_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  // Authenticate via shared secret
  const secret = request.headers.get("x-automation-secret");
  if (secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  await inngest.send({
    name: "automation/prolius-report.triggered",
    data: {
      triggeredBy: "zapier-webhook",
      emailSubject: body.emailSubject,
    },
  });

  return NextResponse.json(
    { message: "Prolius report automation triggered" },
    { status: 202 },
  );
}
