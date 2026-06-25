// Phase 132 Plan 02 Task 1 (FWD-01/02/04/05/06, D-02..D-06) — the swarm-agnostic
// Stage-4 forward worker.
//
// Listens on the dedicated `pipeline/forward.requested` event (emitted by the
// coordinator AFTER it persists the routing verdict, gated per-bucket). It reads
// the persisted verdict from coordinator_runs.decision_details.routing, applies
// the three hard skips + the per-bucket release gate + the D-02 forward-state
// idempotency guard, and — only for a routable+released verdict — forwards the
// source info@ mail to the resolved department mailbox via forwardMessage, then
// stamps the routing category back onto the source message.
//
// Mirrors the Phase-117 stage-3-intent-label-worker skeleton step-for-step:
//   * ZERO per-swarm equality branches (SWARM-02 / D-2). The swarm is loaded from
//     the registry and the worker acts uniformly; the three skips read VERDICT
//     fields, never a bucket-name literal.
//   * Gate-first + fail-closed: isForwardBucketReleased re-checked inside the
//     worker (defence-in-depth against a stale coordinator emit, T-132-08).
//   * D-02 idempotency: readForwardState short-circuits BEFORE createForward, so
//     a replay / re-process never double-forwards the irreversible outbound send.
//   * Replay-isolation: the forwardMessage call and the category-stamp PATCH live
//     in SEPARATE step.run boundaries, so a replay after a successful send but a
//     failed stamp re-runs ONLY the stamp, never re-issues the forward (D-02).
//   * Fail-soft: a legacy row missing source_id/mailbox returns a coded decision
//     (unresolved), never throws / dead-letters the verdict.
//
// retries: 0 — the forward is irreversible; a failure surfaces as a coded
// decision rather than a cascading retry that could double-send.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm } from "@/lib/swarms/registry";
import { isForwardBucketReleased } from "@/lib/pipeline-gating/dry-run-gate";
import {
  forwardMessage,
  graphFetch,
  moveMessageToFolder,
} from "@/lib/outlook/client";
import { mergeRoutingCategory } from "@/lib/outlook/routing-category";
import {
  readForwardState,
  recordForwardState,
} from "@/lib/automations/info-routing/forward-state";
import { emitPipelineEvent } from "@/lib/pipeline-events/emit";
import type { RoutingVerdict } from "@/lib/automations/info-routing/verdict";

const enc = encodeURIComponent;

type ForwardDecision =
  | "forwarded"
  | "held"
  | "skip:unrouted"
  | "skip:stays"
  | `skip:dedup:${string}`
  | "unresolved"
  | "no-verdict"
  | "forward-failed"
  | "already-sent";

export const stage4InfoRoutingForwardWorker = inngest.createFunction(
  { id: "stage-4-info-routing-forward", retries: 0 },
  { event: "pipeline/forward.requested" },
  async ({ event, step }) => {
    const { swarm_type, email_id, run_id } = event.data as {
      swarm_type: string;
      email_id: string;
      run_id: string;
    };
    const admin = createAdminClient();

    // ---- 1) Load the swarm row + the persisted verdict ----------------------
    // The verdict lives in coordinator_runs.decision_details.routing, keyed by
    // the replay-safe run_id (persisted by the coordinator's
    // persist-routing-verdict step). Both reads share one replay boundary.
    const loaded = await step.run("load-verdict-and-swarm", async () => {
      const swarmRow = await loadSwarm(admin, swarm_type);
      const { data } = await admin
        .from("coordinator_runs")
        .select("decision_details")
        .eq("run_id", run_id)
        .maybeSingle();
      const routing =
        (data as { decision_details?: { routing?: unknown } | null } | null)
          ?.decision_details?.routing ?? null;
      return { swarmRow, routing };
    });
    if (!loaded.routing) {
      return { decision: "no-verdict" as ForwardDecision };
    }
    const verdict = loaded.routing as RoutingVerdict;

    // ---- 2) The three hard skips — VERDICT-field-driven, no bucket literal --
    if (verdict.unrouted) {
      return { decision: "skip:unrouted" as ForwardDecision };
    }
    if (verdict.target_mailbox === null) {
      // algemeen / matched no-forward "stays" bucket — mail stays in info@.
      return { decision: "skip:stays" as ForwardDecision };
    }
    if (verdict.dedup.status === "already_addressed") {
      return {
        decision:
          `skip:dedup:${verdict.dedup.matched_layer}` as ForwardDecision,
      };
    }

    // ---- 3) Per-bucket release gate re-check (fail-closed, T-132-08) --------
    if (!isForwardBucketReleased(loaded.swarmRow, verdict.bucket)) {
      return { decision: "held" as ForwardDecision };
    }

    // ---- 4) Resolve the Graph message id + source mailbox + sender ----------
    // email_pipeline.emails.source_id = the Graph immutable id; mailbox = the
    // source info@ box (Pitfall 3 — forward against the SOURCE, never the target).
    // originalSender = raw_json.from.emailAddress.address with raw_json.sender
    // fallback (Pitfall 2 — the flat recipients column is NULL for info-routing).
    const resolved = await step.run("resolve-message", async () => {
      const { data } = await admin
        .schema("email_pipeline")
        .from("emails")
        .select("source_id, mailbox, raw_json")
        .eq("id", email_id)
        .maybeSingle();
      const row = data as {
        source_id?: string | null;
        mailbox?: string | null;
        raw_json?: Record<string, unknown> | null;
      } | null;
      const sourceId = row?.source_id ?? null;
      const mailbox = row?.mailbox ?? null;
      const raw = (row?.raw_json ?? {}) as {
        from?: { emailAddress?: { address?: string } };
        sender?: { emailAddress?: { address?: string } };
      };
      const originalSender =
        raw.from?.emailAddress?.address ??
        raw.sender?.emailAddress?.address ??
        "";
      return { sourceId, mailbox, originalSender };
    });
    if (!resolved.sourceId || !resolved.mailbox) {
      return { decision: "unresolved" as ForwardDecision };
    }
    const graphId = resolved.sourceId;
    const mailbox = resolved.mailbox;

    // ---- 5) D-02 idempotency short-circuit BEFORE createForward -------------
    // A replay / re-process whose forward_state is already 'sent' must NOT
    // re-issue the irreversible forward.
    const alreadySent = await step.run("check-forward-state", async () => {
      const prior = await readForwardState(admin, email_id);
      return prior?.status === "sent";
    });
    if (alreadySent) {
      return { decision: "already-sent" as ForwardDecision };
    }

    // ---- 6) The forward side-effect (its OWN step.run) ----------------------
    // forwardMessage never throws; a non-ok Graph response → { success: false }.
    // This step is ISOLATED from the category stamp below so a replay after a
    // successful send re-runs only the stamp, never the forward (D-02).
    const forwarded = await step.run("do-forward", async () => {
      const result = await forwardMessage({
        mailbox,
        messageId: graphId,
        toMailbox: verdict.target_mailbox as string,
        originalSender: resolved.originalSender,
      });
      return result.success;
    });
    if (!forwarded) {
      return { decision: "forward-failed" as ForwardDecision };
    }

    // ---- 7) Persist forward_state='sent' (D-02 guard for the next replay) ---
    await step.run("record-forward-state", async () => {
      await recordForwardState(admin, {
        email_id,
        swarm_type,
        status: "sent",
        target_mailbox: verdict.target_mailbox,
      });
    });

    // ---- 8) Stamp the routing category (SEPARATE step.run — D-02 isolation) -
    // GET current categories, strip stale AI: + append `AI: routed → <bucket>`,
    // PATCH. Best-effort: a stamp failure must not undo or re-trigger the send.
    await step.run("stamp-category", async () => {
      const getRes = await graphFetch(
        `/users/${enc(mailbox)}/messages/${enc(graphId)}?$select=categories`,
      );
      if (!getRes.ok) return;
      const msg = (await getRes.json()) as { categories?: string[] };
      const next = mergeRoutingCategory(
        msg.categories ?? [],
        "forwarded",
        verdict.bucket,
      );
      await graphFetch(`/users/${enc(mailbox)}/messages/${enc(graphId)}`, {
        method: "PATCH",
        body: { categories: next },
      });
    });

    // ---- 8b) Best-effort file the source mail into "AI Handled" -------------
    // Quick task 260625-9ll: once the forward is SENT + forward_state recorded +
    // the AI:routed category stamped, move the source info@ mail out of the
    // inbox into an "AI Handled" folder so operators see a clean inbox.
    //
    // SAFETY: this is purely cosmetic housekeeping and runs ONLY here — inside
    // the released + routable + forwarded branch, AFTER the irreversible send.
    // moveMessageToFolder never throws; we additionally swallow any error and
    // ignore the result so a move failure CANNOT affect the forward, the
    // forward_state row, the AI:routed stamp, or the returned decision. None of
    // the skip/held/dry-run/dedup/gate paths reach this step — they returned
    // earlier. Its own step.run boundary keeps a replay from re-touching the
    // forward (D-02 isolation).
    await step.run("move-to-ai-handled", async () => {
      try {
        await moveMessageToFolder({
          mailbox,
          messageId: graphId,
          folderName: "AI Handled",
        });
      } catch {
        // Best-effort only — never let a move failure surface.
      }
    });

    // ---- 9) Best-effort audit row (stage 4) ---------------------------------
    await step.run("emit-audit", async () => {
      try {
        await emitPipelineEvent(admin, {
          swarm_type,
          stage: 4,
          email_id,
          decision: "forwarded",
          decision_details: {
            bucket: verdict.bucket,
            brand: verdict.brand,
            target_mailbox: verdict.target_mailbox,
          },
          triggered_by: "pipeline",
        });
      } catch {
        // Audit is best-effort; never dead-letter a successful forward.
      }
    });

    return { decision: "forwarded" as ForwardDecision };
  },
);
