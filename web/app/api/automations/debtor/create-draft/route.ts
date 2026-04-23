import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createIcontrollerDraft,
  type CreateDraftInput,
  type IControllerEnv,
} from "@/lib/automations/debtor-email/drafter";

const WEBHOOK_SECRET = process.env.AUTOMATION_WEBHOOK_SECRET;

// Browser automation needs room: login (if session stale) + navigate +
// attach + save. 300 s matches the cleanup route.
export const maxDuration = 300;

/**
 * POST /api/automations/debtor/create-draft
 *
 * Creates an iController draft reply to `messageId` with a PDF attached.
 * Does NOT send the email — operator review happens inside iController.
 *
 * Auth: `Authorization: Bearer <AUTOMATION_WEBHOOK_SECRET>` (or legacy
 * `x-automation-secret: <secret>` header, matching the cleanup route).
 */
export async function POST(request: NextRequest) {
  if (!WEBHOOK_SECRET) {
    return NextResponse.json(
      { success: false, reason: "save_failed", details: "AUTOMATION_WEBHOOK_SECRET not configured" },
      { status: 500 },
    );
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const legacy = request.headers.get("x-automation-secret");
  if (bearer !== WEBHOOK_SECRET && legacy !== WEBHOOK_SECRET) {
    return NextResponse.json({ success: false, reason: "save_failed", details: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | (Record<string, unknown> & { env?: string })
    | null;

  if (!body) {
    return NextResponse.json(
      { success: false, reason: "save_failed", details: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const env: IControllerEnv = body.env === "production" ? "production" : "acceptance";
  const mode = body.mode === "new" ? "new" : "reply";

  if (!body.pdfBase64 || typeof body.pdfBase64 !== "string") {
    return NextResponse.json(
      { success: false, reason: "save_failed", details: "Missing required field: pdfBase64" },
      { status: 400 },
    );
  }
  if (!body.filename || typeof body.filename !== "string") {
    return NextResponse.json(
      { success: false, reason: "save_failed", details: "Missing required field: filename" },
      { status: 400 },
    );
  }

  let input: CreateDraftInput;
  let logMessageId: string;
  if (mode === "new") {
    if (!body.to || typeof body.to !== "string" || !body.subject || typeof body.subject !== "string") {
      return NextResponse.json(
        {
          success: false,
          reason: "save_failed",
          details: "mode=new requires: to, subject, bodyHtml, pdfBase64, filename",
        },
        { status: 400 },
      );
    }
    input = {
      mode: "new",
      to: body.to,
      subject: body.subject,
      bodyHtml: typeof body.bodyHtml === "string" ? body.bodyHtml : "",
      pdfBase64: body.pdfBase64,
      filename: body.filename,
      env,
    };
    logMessageId = `new:${body.to}`;
  } else {
    if (!body.messageId) {
      return NextResponse.json(
        {
          success: false,
          reason: "save_failed",
          details: "mode=reply requires: messageId, pdfBase64, filename",
        },
        { status: 400 },
      );
    }
    input = {
      mode: "reply",
      messageId: String(body.messageId),
      bodyHtml: typeof body.bodyHtml === "string" ? body.bodyHtml : "",
      pdfBase64: body.pdfBase64,
      filename: body.filename,
      env,
    };
    logMessageId = String(body.messageId);
  }

  const result = await createIcontrollerDraft(input);

  // Log to automation_runs for observability (mirrors cleanup route).
  const admin = createAdminClient();
  await admin
    .from("automation_runs")
    .insert({
      automation: "debtor-email-drafter",
      status: result.success ? "completed" : "failed",
      result: result.success
        ? {
            env,
            mode,
            messageId: logMessageId,
            filename: input.filename,
            draftUrl: result.draftUrl,
            bodyInjectionPath: result.bodyInjectionPath,
            screenshots: {
              beforeSave: result.screenshots.beforeSave.path,
              afterSave: result.screenshots.afterSave.path,
            },
          }
        : {
            env,
            mode,
            messageId: logMessageId,
            filename: input.filename,
            reason: result.reason,
            screenshot: result.screenshot?.path ?? null,
          },
      error_message: result.success ? null : result.details,
      triggered_by: "debtor-swarm:create-draft",
      completed_at: new Date().toISOString(),
    })
    .then(
      () => null,
      (err) => console.warn(`[create-draft] automation_runs log failed (non-fatal): ${err}`),
    );

  if (result.success) {
    return NextResponse.json(
      {
        success: true,
        draftUrl: result.draftUrl,
        screenshots: {
          beforeSave: result.screenshots.beforeSave.url ?? result.screenshots.beforeSave.path,
          afterSave: result.screenshots.afterSave.url ?? result.screenshots.afterSave.path,
        },
      },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      success: false,
      reason: result.reason,
      screenshot: result.screenshot?.url ?? result.screenshot?.path ?? null,
      details: result.details,
    },
    { status: 500 },
  );
}
