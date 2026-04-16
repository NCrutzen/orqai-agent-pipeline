import { NextRequest, NextResponse } from "next/server";
import { categorizeEmail } from "@/lib/outlook";

const WEBHOOK_SECRET = process.env.AUTOMATION_WEBHOOK_SECRET!;

/**
 * POST /api/tools/outlook/categorize
 * Add a category label to an email.
 *
 * Body: { mailbox: string, messageId: string, category: string }
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-automation-secret");
  if (secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.mailbox || !body?.messageId || !body?.category) {
    return NextResponse.json(
      { error: "Missing required fields: mailbox, messageId, category" },
      { status: 400 },
    );
  }

  const result = await categorizeEmail(body.mailbox, body.messageId, body.category);
  return NextResponse.json(result, { status: result.success ? 200 : 422 });
}
