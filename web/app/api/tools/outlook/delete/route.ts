import { NextRequest, NextResponse } from "next/server";
import { deleteEmail } from "@/lib/outlook";

const WEBHOOK_SECRET = process.env.AUTOMATION_WEBHOOK_SECRET!;

/**
 * POST /api/tools/outlook/delete
 * Delete an email (moves to Deleted Items).
 *
 * Body: { mailbox: string, messageId: string }
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-automation-secret");
  if (secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.mailbox || !body?.messageId) {
    return NextResponse.json(
      { error: "Missing required fields: mailbox, messageId" },
      { status: 400 },
    );
  }

  const result = await deleteEmail(body.mailbox, body.messageId);
  return NextResponse.json(result, { status: result.success ? 200 : 422 });
}
