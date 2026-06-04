// Plan 05-02 (OUTBOUND-01) — POST /api/automations/support-tickets/clickup-webhook
//
// Thin inbound ClickUp webhook receiver. Validates a shared body secret,
// normalises the ClickUp payload, and fires ONE typed Inngest event
// ("support-tickets/clickup-status.received"). The route is purely
// validate-and-fan-out — it does NOT write support_tickets directly. All
// replay-safe DB writes are owned by the Plan 05-03 Inngest function (step.run).
//
// OPERATOR-SHIM NOTE (threat model T-05-02-01):
//   ClickUp's native webhook supports an X-Signature HMAC header, but this
//   route uses a body-carried `auth` field following the team standard
//   (CLAUDE.md: Zapier Catch Hook field pickers cannot reliably surface custom
//   headers). The operator must front the ClickUp webhook with a Zapier/
//   automation shim (configured in Plan 05-05, Task 1) that injects the
//   `auth` field before forwarding the payload here. Never send the secret
//   via ClickUp's native X-Signature without the shim; this route rejects
//   requests that do not carry the body field.
//
// Auth: SUPPORT_CLICKUP_WEBHOOK_SECRET (env var; must be set in Vercel before
//   Plan 05-05 live smoke). Fail-closed 500 if unset; 401 on mismatch.
//   Constant-time compare via node:crypto.timingSafeEqual (T-05-02-01).
//
// inngest.send binding-safety: NEVER destructure inngest.send — CLAUDE.md
//   commit dae6276. Cast via the inline SendFn pattern.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { inngest } from "@/lib/inngest/client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── Type helpers ─────────────────────────────────────────────────────────────

type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;

interface WebhookResponse {
  action?: string;
  clickup_task_id?: string;
  error?: string;
}

// ── Constant-time secret compare ─────────────────────────────────────────────
//
// Mirrors the pattern in stage-0-safety.ts: wrap timingSafeEqual in try/catch
// so a length mismatch does not throw, and the work is comparable in both
// branches (T-05-02-01 mitigation). Never log body.auth; log only
// clickup_task_id + event_type (T-05-02-05).

function constantTimeCompare(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

// ── Task-id normalization ─────────────────────────────────────────────────────
//
// ClickUp varies the task id location across webhook versions:
//   - v1 (most events): top-level `task_id` string
//   - v2/nested: `payload.task.id`
// We tolerate both shapes and normalise to one `clickup_task_id`.

function extractTaskId(body: Record<string, unknown>): string | null {
  if (typeof body.task_id === "string" && body.task_id.length > 0) {
    return body.task_id;
  }
  const payload = body.payload;
  if (
    payload !== null &&
    typeof payload === "object" &&
    !Array.isArray(payload)
  ) {
    const task = (payload as Record<string, unknown>).task;
    if (task !== null && typeof task === "object" && !Array.isArray(task)) {
      const id = (task as Record<string, unknown>).id;
      if (typeof id === "string" && id.length > 0) return id;
    }
  }
  return null;
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
): Promise<NextResponse<WebhookResponse>> {
  // (1) Fail-closed if env var is not configured — operators must set this in
  //     Vercel before Plan 05-05 live smoke (T-05-02-01).
  const secret = process.env.SUPPORT_CLICKUP_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      "[clickup-webhook] SUPPORT_CLICKUP_WEBHOOK_SECRET is not configured",
    );
    return NextResponse.json(
      { error: "SUPPORT_CLICKUP_WEBHOOK_SECRET not configured" },
      { status: 500 },
    );
  }

  // (2) Parse body — must be valid JSON.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // (3) Constant-time secret validation (T-05-02-01).
  //     Never log body.auth (T-05-02-05).
  const provided = typeof body.auth === "string" ? body.auth : "";
  if (!constantTimeCompare(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // (4) Normalize payload — extract clickup_task_id (required).
  const clickup_task_id = extractTaskId(body);
  if (!clickup_task_id) {
    return NextResponse.json(
      { error: "task id required" },
      { status: 400 },
    );
  }

  const event_type =
    typeof body.event === "string" ? body.event : "unknown";
  const history_items = Array.isArray(body.history_items)
    ? (body.history_items as Array<Record<string, unknown>>)
    : [];
  const received_at = new Date().toISOString();

  // (5) Fan-out to Inngest. Unlike the ingest route (where an existing
  //     support_tickets row absorbs a dispatch failure gracefully), here the
  //     ClickUp webhook has no pre-existing row to fall back on — an Inngest
  //     failure should surface as 500 so ClickUp retries (at-least-once
  //     delivery is desirable for status change tracking).
  //
  //     CLAUDE.md binding-safety: NEVER destructure inngest.send (commit
  //     dae6276). Use the inline SendFn cast instead.
  try {
    await (inngest.send as unknown as SendFn)({
      name: "support-tickets/clickup-status.received",
      data: {
        clickup_task_id,
        event_type,
        history_items,
        received_at,
      },
    });
  } catch (err) {
    console.error(
      `[clickup-webhook] inngest.send failed for task ${clickup_task_id} (${event_type}):`,
      String(err),
    );
    return NextResponse.json(
      { error: `inngest.send failed: ${String(err)}` },
      { status: 500 },
    );
  }

  console.info(
    `[clickup-webhook] dispatched clickup-status.received for task ${clickup_task_id} (${event_type})`,
  );

  return NextResponse.json({
    action: "clickup_status_dispatched",
    clickup_task_id,
  });
}
