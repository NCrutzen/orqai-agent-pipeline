import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteEmailFromIController, type EmailIdentifiers } from "@/lib/automations/debtor-email-cleanup/browser";

const WEBHOOK_SECRET = process.env.AUTOMATION_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-automation-secret");
  if (secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.company || !body?.from || !body?.subject) {
    return NextResponse.json(
      { error: "Missing required fields: company, from, subject" },
      { status: 400 },
    );
  }

  const email: EmailIdentifiers = {
    company: body.company,
    from: body.from,
    subject: body.subject,
    receivedAt: body.receivedAt || new Date().toISOString(),
  };

  const result = await deleteEmailFromIController(email);

  // Log to automation_runs for audit trail
  const admin = createAdminClient();
  await admin.from("automation_runs").insert({
    automation: "debtor-email-cleanup",
    status: result.success ? "completed" : "failed",
    result: {
      email,
      emailFound: result.emailFound,
      screenshots: {
        before: result.screenshots.before?.path ?? null,
        after: result.screenshots.after?.path ?? null,
      },
    },
    error_message: result.error ?? null,
    triggered_by: `zapier-webhook:${body.category ?? "unknown"}`,
    completed_at: new Date().toISOString(),
  });

  return NextResponse.json(result, { status: result.success ? 200 : 422 });
}
