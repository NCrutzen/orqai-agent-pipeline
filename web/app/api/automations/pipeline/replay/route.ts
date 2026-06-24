import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";

// Quick 260624 — durable pipeline REPLAY endpoint.
//
// Re-injects a pipeline event for a STALLED email from INSIDE the prod app, so
// the send uses the runtime's correctly-configured Inngest client/environment.
// (An EXTERNAL `inngest.send` from a local script does not reach the synced
// prod environment — confirmed 2026-06-24: the live pipeline was busy yet an
// external send produced zero trace. This endpoint is the reliable path.)
//
// Why it exists: even though the Stage-2→3 hand-off bug is fixed (#127 +
// resolver emit-ordering), ~185 historically-stalled debtor mails will never
// self-heal, and future stalls in any stage need an operator-driven re-fire.
//
// Auto-detects the stall type per email and re-fires the right seam:
//   - NO coordinator_run  → HAND-OFF stall: re-fire
//       `<swarm>/stage-2.customer-resolve.requested` so the resolver rebuilds
//       ALL downstream context (re-reads the email, re-emits
//       pipeline/coordinator.requested → Stage 3 → 3.5). v1 ACTS on this.
//   - coordinator_run but no Stage-3 event → DISPATCHER stall: detected and
//       reported as `dispatcher_stall_detected` (v2 will re-fire
//       `pipeline/predicted` from coordinator_runs.ranked_intents). NOT fired
//       in v1 — surfaced honestly rather than silently skipped.
//   - Stage-3 event already present → `skipped_not_stalled`.
//
// Safety: dry_run defaults TRUE (preview the events, fire nothing). Auth via
// the existing x-zapier-secret / ZAPIER_INGEST_SECRET (reused — no new secret).
// Operator supplies explicit email_ids (no "drain everything" mode). Batch cap
// keeps the request inside maxDuration.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// CLAUDE.md commit dae6276 — never destructure inngest.send; cast inline.
type SendFn = (p: {
  name: string;
  data: Record<string, unknown>;
}) => Promise<unknown>;

const MAX_BATCH = 50;
const VALID_SWARMS = new Set(["debtor-email", "sales-email"]);

interface ReplayBody {
  email_ids?: string[];
  swarm_type?: string;
  dry_run?: boolean;
}

type ReplayAction =
  | "refire_stage2_handoff"
  | "dispatcher_stall_detected"
  | "skipped_not_stalled"
  | "skipped_no_email"
  | "error";

interface ReplayResult {
  email_id: string;
  action: ReplayAction;
  event?: { name: string; data: Record<string, unknown> } | null;
  inngest_ids?: string[];
  reason?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.ZAPIER_INGEST_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "ZAPIER_INGEST_SECRET not configured" },
      { status: 500 },
    );
  }
  if (req.headers.get("x-zapier-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: ReplayBody;
  try {
    body = (await req.json()) as ReplayBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const swarm_type = body.swarm_type ?? "debtor-email";
  if (!VALID_SWARMS.has(swarm_type)) {
    return NextResponse.json(
      { error: `unknown swarm_type "${swarm_type}"` },
      { status: 400 },
    );
  }
  const emailIds = Array.isArray(body.email_ids) ? body.email_ids : [];
  if (emailIds.length === 0) {
    return NextResponse.json(
      { error: "email_ids[] is required" },
      { status: 400 },
    );
  }
  if (emailIds.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `too many email_ids (max ${MAX_BATCH})` },
      { status: 400 },
    );
  }
  // dry_run defaults TRUE — caller must explicitly pass false to fire.
  const dryRun = body.dry_run !== false;

  const admin = createAdminClient();
  const send: SendFn = (event) => (inngest.send as unknown as SendFn)(event);

  const results: ReplayResult[] = [];

  for (const emailId of emailIds) {
    try {
      const { data: email } = await admin
        .schema("email_pipeline")
        .from("emails")
        .select("id, source_id, internet_message_id, mailbox")
        .eq("id", emailId)
        .maybeSingle();
      if (!email) {
        results.push({ email_id: emailId, action: "skipped_no_email" });
        continue;
      }

      // Already past Stage 3? Then it's not stalled — never re-fire.
      const { data: s3 } = await admin
        .from("pipeline_events")
        .select("id")
        .eq("swarm_type", swarm_type)
        .eq("stage", 3)
        .eq("email_id", emailId)
        .limit(1);
      if (s3 && s3.length > 0) {
        results.push({ email_id: emailId, action: "skipped_not_stalled" });
        continue;
      }

      // Hand-off vs dispatcher: presence of a coordinator_run is the splitter.
      const { data: cr } = await admin
        .from("coordinator_runs")
        .select("run_id")
        .eq("email_id", emailId)
        .limit(1);
      if (cr && cr.length > 0) {
        // Dispatcher-phase stall (reached the classifier, never dispatched).
        // v2 will re-fire pipeline/predicted from coordinator_runs.ranked_intents.
        results.push({
          email_id: emailId,
          action: "dispatcher_stall_detected",
          reason:
            "has coordinator_run but no Stage-3 event — needs pipeline/predicted re-fire (not yet automated)",
        });
        continue;
      }

      // HAND-OFF stall → re-fire the Stage-2 resolver (rebuilds context).
      const { data: s2 } = await admin
        .from("pipeline_events")
        .select("automation_run_id, created_at")
        .eq("swarm_type", swarm_type)
        .eq("stage", 2)
        .eq("email_id", emailId)
        .order("created_at", { ascending: false })
        .limit(1);
      const { data: s1 } = await admin
        .from("pipeline_events")
        .select("decision, created_at")
        .eq("swarm_type", swarm_type)
        .eq("stage", 1)
        .eq("email_id", emailId)
        .order("created_at", { ascending: false })
        .limit(1);

      const messageId =
        (email.source_id as string | null) ??
        (email.internet_message_id as string | null);
      if (!messageId) {
        results.push({
          email_id: emailId,
          action: "error",
          reason: "email has neither source_id nor internet_message_id",
        });
        continue;
      }

      const event = {
        name: `${swarm_type}/stage-2.customer-resolve.requested`,
        data: {
          automation_run_id:
            (s2?.[0]?.automation_run_id as string | undefined) ?? null,
          message_id: messageId,
          source_mailbox: email.mailbox as string,
          category_key: (s1?.[0]?.decision as string | undefined) ?? "unknown",
          swarm_type,
          triggered_by: "pipeline-replay-endpoint",
        },
      };

      if (!dryRun) {
        const res = (await send(event)) as { ids?: string[] };
        results.push({
          email_id: emailId,
          action: "refire_stage2_handoff",
          event,
          inngest_ids: res?.ids ?? [],
        });
      } else {
        results.push({
          email_id: emailId,
          action: "refire_stage2_handoff",
          event,
        });
      }
    } catch (e) {
      results.push({
        email_id: emailId,
        action: "error",
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const summary = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.action] = (acc[r.action] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    dry_run: dryRun,
    swarm_type,
    count: results.length,
    summary,
    results,
  });
}
