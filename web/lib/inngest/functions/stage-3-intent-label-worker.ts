// Phase 117 Plan 02 Task 2 (OUTLOOK-CAT-01..05, D-2 / D-3 / D-4) —
// swarm-agnostic gated Outlook intent-label writer.
//
// Listens on the shared `pipeline/intent-label.requested` event (emitted by the
// coordinator on every Stage-3 verdict-with-top-intent) and writes the top-1
// intent back onto the SOURCE Outlook message as a single `AI: <intent_key>`
// native category via Graph PATCH — for ANY onboarded Outlook swarm. The swarm
// is loaded from the registry (loadSwarm) and the worker acts uniformly:
//
//   * ZERO per-swarm equality branches — onboarding swarm #2 is a registry
//     row only (stage_3_intent_label flag). SWARM-02 / D-2.
//   * GATED (isStageBlocked(swarm, "stage_3_intent_label") === true): NO Graph
//     write, NO store write — a verified no-op. Fail-closed (missing → gated).
//     Both debtor-email + sales-email are seeded GATED, so this ships INERT
//     until an operator green-lights and flips the flag (D-3).
//   * Never-clobber (D-4.2): if the 112.5 ledger already shows an operator
//     category-edit for this email_id (a swarm_email_transitions row
//     kind='category_edited' OR a swarm_review_signals correction), the worker
//     makes NO PATCH and no store write — the operator's edit wins.
//   * Idempotency / anti-churn (D-4.1): only calls Graph when the new top-1
//     intent differs from the last-written AI: category (readWrittenCategory).
//     Replay / re-run with the same verdict = no Graph call.
//   * Strip-stale: mergeIntentCategory produces the FULL desired set (every stale
//     AI: stripped, user categories kept) which is PATCHed directly — a verdict
//     change replaces rather than accumulates AI: labels.
//   * Fail-soft: a legacy row with no source_id / mailbox returns a coded
//     decision (unresolved) rather than throwing — never dead-letters the verdict.
//
// retries: 0 — a Graph write is idempotent at the store/gate layer; failures
// surface as a returned decision, not a cascading retry.

import { inngest } from "@/lib/inngest/client";
import { recordWorkerFailure } from "@/lib/inngest/on-worker-failure";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm } from "@/lib/swarms/registry";
import { isStageBlocked } from "@/lib/pipeline-gating/dry-run-gate";
import { graphFetch } from "@/lib/outlook/client";
import { buildIntentCategory, mergeIntentCategory } from "@/lib/outlook/intent-category";
import {
  readWrittenCategory,
  recordWrittenCategory,
} from "@/lib/outlook/written-category-store";
import { emitPipelineEvent } from "@/lib/pipeline-events/emit";

const enc = encodeURIComponent;

type LabelDecision =
  | "gated"
  | "unresolved"
  | "clobber-skip"
  | "unchanged"
  | "written";

export const stage3IntentLabelWorker = inngest.createFunction(
  {
    id: "stage-3-intent-label-worker",
    // retries:3 (was 0) — handoff-resilience fix (2026-06-16). The Graph
    // GET+PATCH is idempotent at the store/gate layer (mergeIntentCategory
    // strips stale AI: labels before re-adding; the written-category store
    // makes a repeat write a no-op), so a transient Graph throw can safely
    // retry instead of silently failing to label. A terminal failure surfaces
    // via onFailure. (Follow-up: write-category already soft-returns false on a
    // non-2xx; a 429/5xx-only re-throw would let retries help those too.)
    retries: 3,
    onFailure: async ({ error, event }) => {
      await recordWorkerFailure({
        stage: 4,
        stageLabel: "stage-3-intent-label-worker",
        event,
        error,
      });
    },
  },
  { event: "pipeline/intent-label.requested" },
  async ({ event, step }) => {
    const { swarm_type, email_id, intent_key } = event.data;
    const admin = createAdminClient();

    // ---- 1) Gate (D-3) — load the swarm row, fail-closed no-op when GATED ----
    const gated = await step.run("load-swarm-row", async () => {
      const swarmRow = await loadSwarm(admin, swarm_type);
      // isStageBlocked: TRUE = gated/dry-run (no live write), MISSING = blocked.
      return isStageBlocked(swarmRow, "stage_3_intent_label");
    });
    if (gated) {
      return { decision: "gated" as LabelDecision };
    }

    // ---- 2) Resolve the Graph message id + mailbox for this email_id --------
    // email_pipeline.emails.source_id = the Graph immutable id; mailbox = the
    // source mailbox. Legacy / non-Outlook rows lacking either → fail-soft.
    const resolved = await step.run("resolve-message", async () => {
      const { data } = await admin
        .schema("email_pipeline")
        .from("emails")
        .select("source_id, mailbox")
        .eq("id", email_id)
        .maybeSingle();
      const sourceId = (data as { source_id?: string | null } | null)?.source_id ?? null;
      const mailbox =
        (data as { mailbox?: string | null } | null)?.mailbox ??
        event.data.source_mailbox ??
        null;
      return { sourceId, mailbox };
    });
    if (!resolved.sourceId || !resolved.mailbox) {
      return { decision: "unresolved" as LabelDecision };
    }
    const graphId = resolved.sourceId;
    const mailbox = resolved.mailbox;

    // ---- 3) Never-clobber (D-4.2) — operator already edited the category? ----
    const operatorEdited = await step.run("check-operator-edit", async () => {
      const { data: transition } = await admin
        .from("swarm_email_transitions")
        .select("id")
        .eq("email_id", email_id)
        .eq("kind", "category_edited")
        .limit(1)
        .maybeSingle();
      if (transition) return true;
      // A swarm_review_signals correction derived from a category edit also
      // counts as an operator touch (the 112.5 signal side of the same edit).
      const { data: signal } = await admin
        .from("swarm_review_signals")
        .select("id")
        .eq("email_id", email_id)
        .eq("transition_kind", "category_edited")
        .limit(1)
        .maybeSingle();
      return !!signal;
    });
    if (operatorEdited) {
      return { decision: "clobber-skip" as LabelDecision };
    }

    // ---- 4) Idempotency (D-4.1) — same verdict already written? -------------
    const desiredCategory = buildIntentCategory(intent_key);
    const unchanged = await step.run("check-idempotency", async () => {
      const existing = await readWrittenCategory(admin, email_id);
      return existing?.ai_category === desiredCategory;
    });
    if (unchanged) {
      return { decision: "unchanged" as LabelDecision };
    }

    // ---- 5) Write the merged category set to Graph (strip-stale AI:) --------
    // GET current categories (like categorizeEmail), compute the FULL desired
    // set via mergeIntentCategory (strips stale AI:, keeps user categories,
    // appends the single new label), PATCH it. Fail-soft on a non-ok response.
    const wrote = await step.run("write-category", async () => {
      const getRes = await graphFetch(
        `/users/${enc(mailbox)}/messages/${enc(graphId)}?$select=categories`,
      );
      if (!getRes.ok) return false;
      const msg = (await getRes.json()) as { categories?: string[] };
      const newCategories = mergeIntentCategory(msg.categories ?? [], intent_key);
      const patchRes = await graphFetch(
        `/users/${enc(mailbox)}/messages/${enc(graphId)}`,
        { method: "PATCH", body: { categories: newCategories } },
      );
      return patchRes.ok;
    });
    if (!wrote) {
      return { decision: "unresolved" as LabelDecision };
    }

    // ---- 6) Record the baseline (D-4 / D-5) ---------------------------------
    await step.run("record-baseline", async () => {
      await recordWrittenCategory(admin, {
        email_id,
        swarm_type,
        source_mailbox: mailbox,
        ai_category: desiredCategory,
      });
    });

    // ---- 7) Audit row (mirrors classifier-verdict-worker telemetry) ---------
    await step.run("emit-audit", async () => {
      try {
        await emitPipelineEvent(admin, {
          swarm_type,
          stage: 4,
          email_id,
          decision: "intent_label_written",
          decision_details: {
            ai_category: desiredCategory,
            source_stage: 3,
            written_at: new Date().toISOString(),
          },
          triggered_by: "pipeline",
        });
      } catch {
        // Audit is best-effort; a unique-violation / transient error must not
        // dead-letter a successful Graph write.
      }
    });

    return { decision: "written" as LabelDecision };
  },
);
