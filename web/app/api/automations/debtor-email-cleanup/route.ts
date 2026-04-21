import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteEmailFromIController,
  findAndPreviewEmail,
  type EmailIdentifiers,
  type IControllerEnv,
} from "@/lib/automations/debtor-email-cleanup/browser";

const WEBHOOK_SECRET = process.env.AUTOMATION_WEBHOOK_SECRET!;

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-automation-secret");
  if (secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const payload = body?.email ?? body;
  if (!payload?.company || !payload?.from || !payload?.subject) {
    return NextResponse.json(
      { error: "Missing required fields: company, from, subject" },
      { status: 400 },
    );
  }

  const email: EmailIdentifiers = {
    company: payload.company,
    from: payload.from,
    subject: payload.subject,
    receivedAt: payload.receivedAt || new Date().toISOString(),
  };

  const mode: "preview" | "delete" = body?.mode === "preview" ? "preview" : "delete";
  const env: IControllerEnv = body?.env === "production" ? "production" : "acceptance";

  const admin = createAdminClient();

  if (mode === "preview") {
    const result = await findAndPreviewEmail(email, env);
    await admin.from("automation_runs").insert({
      automation: "debtor-email-cleanup",
      status: result.success ? "completed" : "failed",
      result: {
        mode,
        env,
        email,
        emailFound: result.emailFound,
        rowIndex: result.rowIndex,
        rowPreview: result.rowPreview,
        screenshot: result.screenshot?.path ?? null,
      },
      error_message: result.error ?? null,
      triggered_by: `preview:${body?.category ?? "manual"}`,
      completed_at: new Date().toISOString(),
    });
    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  }

  const result = await deleteEmailFromIController(email, env);
  await admin.from("automation_runs").insert({
    automation: "debtor-email-cleanup",
    status: result.success ? "completed" : "failed",
    result: {
      mode,
      env,
      email,
      emailFound: result.emailFound,
      screenshots: {
        before: result.screenshots.before?.path ?? null,
        after: result.screenshots.after?.path ?? null,
      },
    },
    error_message: result.error ?? null,
    triggered_by: `zapier-webhook:${body?.category ?? "unknown"}`,
    completed_at: new Date().toISOString(),
  });
  return NextResponse.json(result, { status: result.success ? 200 : 422 });
}
