/**
 * Phase 71-02 — POST /api/automations/debtor-email/override.
 *
 * Auth-gated, zod-validated route that fan-outs to the
 * `debtor-email/override-handler` Inngest function. The route NEVER writes
 * directly to pipeline_events — that lives behind the step.run boundary in
 * the handler so it stays replay-safe (Phase 65 dae6276 / dd2583a).
 *
 * Trust-boundary contract:
 *   - D-13: operator_id is server-stamped from `auth.getUser().id`. Any
 *     client-supplied `operator_id` is silently ignored — the zod schema
 *     does not even include the field, so it cannot enter `parsed.data`.
 *   - D-14: `reason` is capped at 1000 characters via zod `.max(1000)`.
 *   - D-03: `axis` is a closed enum (zod) matching the OverrideAxis literal-union.
 *   - Pitfall 3: inngest.send is invoked through a SendFn cast — never
 *     destructured — so `this` binding survives.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const OverridePayload = z.object({
  axis: z.enum([
    "stage_1_category",
    "stage_2_customer",
    "stage_3_intent",
    "stage_4_handler_output",
  ]),
  email_id: z.string().uuid(),
  original_event_id: z.string().uuid(),
  original_decision: z.string(),
  decision: z.string(),
  decision_details: z.record(z.string(), z.unknown()).optional(),
  eval_type: z.enum(["capability", "regression"]),
  reason: z.string().max(1000).optional(),
  re_run_downstream: z.boolean().optional(),
});

type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;

export async function POST(req: NextRequest): Promise<NextResponse> {
  // D-13: server-side auth — never trust client-supplied operator_id.
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // D-14 (max-length) + D-03 (closed axis vocab) + payload validation.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = OverridePayload.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  // Pitfall 3 / D-13: dispatch via Inngest. operator_id is server-stamped here,
  // not from the client. The zod schema does not include operator_id, so the
  // spread of parsed.data cannot smuggle a fake.
  try {
    await (inngest.send as unknown as SendFn)({
      name: "debtor-email/override.submitted",
      data: { ...parsed.data, operator_id: user.id },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[override-route] inngest.send failed", msg);
    return NextResponse.json(
      { error: `inngest dispatch failed: ${msg}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
