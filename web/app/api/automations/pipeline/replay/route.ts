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
  /**
   * "auto" (default) auto-detects the stall type per email. "refire_coordinator"
   * skips detection and re-runs Stage 3 directly for every id — the cure for a
   * dispatcher/Stage-3 stall (email classified, then the Stage-3 call failed),
   * which the hand-off (stage-2) re-fire does NOT resolve.
   */
  mode?: "auto" | "refire_coordinator";
}

type ReplayAction =
  | "refire_stage2_handoff"
  | "refire_coordinator"
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

/**
 * v2 — re-run Stage 3 directly for a dispatcher/Stage-3 stall by re-emitting the
 * canonical `pipeline/coordinator.requested` event (the same one the Stage-2
 * resolver emits). Rebuilds the payload from the email row; `entity` is carried
 * from the email's most recent agent_run. Stage-2 customer context is NOT
 * re-resolved here (Stage 3 intent is body-driven; null is the legal no-match
 * value) — a full re-resolve is the hand-off (stage-2) path. A fresh run_id is
 * minted by the coordinator, so a fresh coordinator_run + agent_run are created.
 */
async function refireCoordinator(
  admin: ReturnType<typeof createAdminClient>,
  send: SendFn,
  swarm_type: string,
  emailId: string,
  dryRun: boolean,
): Promise<ReplayResult> {
  const { data: email } = await admin
    .schema("email_pipeline")
    .from("emails")
    .select(
      "id, subject, body_text, sender_email, mailbox, source_id, internet_message_id",
    )
    .eq("id", emailId)
    .maybeSingle();
  if (!email) return { email_id: emailId, action: "skipped_no_email" };

  const { data: arRows } = await admin
    .from("agent_runs")
    .select("entity")
    .eq("email_id", emailId)
    .order("created_at", { ascending: false })
    .limit(1);
  const entity =
    (arRows as Array<{ entity?: string | null }> | null)?.[0]?.entity ?? null;

  const event = {
    name: "pipeline/coordinator.requested",
    data: {
      swarm_type,
      email_id: email.id as string,
      automation_run_id: null,
      entity,
      entity_brand: entity,
      context_version: 1,
      subject: (email.subject as string | null) ?? "",
      body_text: (email.body_text as string | null) ?? "",
      sender_email: (email.sender_email as string | null) ?? "",
      mailbox: email.mailbox as string,
      received_at: new Date().toISOString(),
      graph_message_id:
        (email.source_id as string | null) ??
        (email.internet_message_id as string | null),
      customer_id: null,
      customer_account_id: null,
      customer_name: null,
    },
  };

  if (dryRun) return { email_id: emailId, action: "refire_coordinator", event };
  const res = (await send(event)) as { ids?: string[] };
  return {
    email_id: emailId,
    action: "refire_coordinator",
    event,
    inngest_ids: res?.ids ?? [],
  };
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
  const mode =
    body.mode === "refire_coordinator" ? "refire_coordinator" : "auto";

  const admin = createAdminClient();
  const send: SendFn = (event) => (inngest.send as unknown as SendFn)(event);

  const results: ReplayResult[] = [];

  for (const emailId of emailIds) {
    try {
      // v2 — operator forces a direct Stage-3 re-run (dispatcher-stall cure),
      // skipping the hand-off auto-detection entirely.
      if (mode === "refire_coordinator") {
        results.push(
          await refireCoordinator(admin, send, swarm_type, emailId, dryRun),
        );
        continue;
      }

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
        // Dispatcher/Stage-3 stall (reached the classifier, never produced a
        // Stage-3 event). v2 — re-run Stage 3 directly (queue-free path) so the
        // verdict + label are produced. Replaces the v1 report-only.
        results.push(
          await refireCoordinator(admin, send, swarm_type, emailId, dryRun),
        );
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
