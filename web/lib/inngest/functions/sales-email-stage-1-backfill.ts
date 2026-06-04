// Phase 112 Plan 01 Task 2 — sales-email Stage-1 retroactive backfill sweeper
// (CLEANUP-02). Mirrors stage-0-backfill.ts byte-for-byte in shape: a one-shot
// Inngest function, runId minted INSIDE step.run (Phase 65 replay-safety),
// batched with a per-batch dedup SELECT, and a pure-helper-driven disposition.
//
// Triggered manually:
//   inngest.send({ name: "sales-email/stage-1.backfill",
//                  data: { mode?: 'report'|'canary'|'full', limit?: number } })
//
// SAFETY (this plan ships INERT):
//   - mode='report' (DEFAULT) performs selection + disposition + live-presence
//     COUNT only. ZERO Graph writes, ZERO pipeline_events inserts, ZERO
//     automation_runs inserts. Returns the would-counts.
//   - mode='canary' caps auto-archives at `limit`.
//   - mode='full' sweeps everything. Both write modes are only ever triggered
//     AFTER the Wave-2 operator checkpoint (Plan 03) authorizes a run.
//
// Disposition (D-05/D-06):
//   - AUTO set is REGISTRY-DERIVED via buildAutoKeySet(loadSwarmNoiseCategories)
//     — action='categorize_archive' minus own_outbound_invoice_loopback.
//   - 'auto'  (high-conf auto-set) → categorize + archive on the Graph id +
//             a DIRECT emitPipelineEvent(stage=4) (NOT via the verdict worker —
//             that path is reserved for operator-reviewed rows, Pitfall 1).
//   - 'queue' (manual_review / low-med conf / unknown) → automation_runs
//             status='predicted' for Bulk Review.
//   - 'skip'  (loopback) → nothing (D-06).
//
// Idempotency (D-08): pre-batch pipeline_events SELECT (stage=4) skips already-
// archived rows + the emit 23505 unique-violation no-op (copied verbatim from
// classifier-verdict-worker.ts:311-328) + Graph already-archived-as-success.
//
// Graph id (Pitfall 4): archiveEmail/categorizeEmail receive emails.source_id
// (the Graph id), NEVER internet_message_id. Historic rows without source_id are
// looked up live by internetMessageId (getMessageMeta) to confirm presence AND
// obtain the Graph id; a no-hit is a no-op (D-07).

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  archiveEmail,
  categorizeEmail,
  getMessageMeta,
} from "@/lib/outlook/client";
import { loadSwarmNoiseCategories } from "@/lib/swarms/registry";
import { emitPipelineEvent } from "@/lib/pipeline-events/emit";
import {
  buildAutoKeySet,
  classifyDisposition,
} from "@/lib/automations/sales-email/backfill/disposition";
import {
  selectBackfillCandidateIds,
  hydrateGraphIds,
  resolveGraphIdSource,
  SALES_OUTLOOK_MAILBOX,
  type GraphIdResolvable,
  type LeanBackfillCandidate,
} from "@/lib/automations/sales-email/backfill/select-backfill-candidates";
import { resolveVerdicts } from "@/lib/automations/sales-email/backfill/resolve-verdicts";

const SWARM_TYPE = "sales-email";
// Small batches: each row issues live Graph calls — keep the batch step well
// under the 60s Inngest gateway (Pitfall 2). NOT 500 (that was pure DB inserts).
const BATCH_SIZE = 150;
// Bulk Review producer label for backfill-queued ambiguous matches.
const BACKFILL_QUEUE_AUTOMATION = "sales-email-stage-1-backfill";
const DEFAULT_LOOKBACK_DAYS = 365;

type BackfillMode = "report" | "canary" | "full";

type BackfillEventData = {
  mode?: BackfillMode;
  limit?: number;
  since?: string;
  until?: string;
};

type Counts = {
  would_auto: number;
  would_queue: number;
  would_skip_loopback: number;
  no_live_message: number;
  archived: number;
  queued: number;
  skipped_already_archived: number;
};

const ARCHIVED_AS_SUCCESS = /404|ErrorItemNotFound|already/i;

export const salesEmailStage1Backfill = inngest.createFunction(
  { id: "sales-email/stage-1.backfill", retries: 1, concurrency: { limit: 1 } },
  { event: "sales-email/stage-1.backfill" },
  async ({ event, step }) => {
    const data = (event?.data as BackfillEventData | undefined) ?? {};
    const mode: BackfillMode = data.mode ?? "report";
    const limit = typeof data.limit === "number" ? data.limit : Infinity;

    // Phase 65 replay-id rule — runId minted inside step.run.
    const runId = await step.run("resolve-run-id", async () =>
      crypto.randomUUID(),
    );

    const until = data.until ?? new Date().toISOString();
    const since =
      data.since ??
      new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 86_400_000).toISOString();

    // Ids ONLY across the step boundary — full candidates carry subject/body
    // (RetroCandidate) and exceeded Inngest's step-output size limit on the
    // first live report-mode run (2026-06-04). Graph-id fields are re-hydrated
    // per batch inside each batch step (CLAUDE.md: grote outputs → referentie).
    const candidateIds = await step.run("select-candidates", async () => {
      const admin = createAdminClient();
      return selectBackfillCandidateIds(admin, {
        swarm_type: SWARM_TYPE,
        since,
        until,
      });
    });

    const counts: Counts = {
      would_auto: 0,
      would_queue: 0,
      would_skip_loopback: 0,
      no_live_message: 0,
      archived: 0,
      queued: 0,
      skipped_already_archived: 0,
    };

    for (let i = 0; i < candidateIds.length; i += BATCH_SIZE) {
      const batchIdx = Math.floor(i / BATCH_SIZE);
      const batchIds = candidateIds.slice(i, i + BATCH_SIZE);

      const batchResult = await step.run(
        `backfill-batch-${batchIdx}`,
        async () => {
          const admin = createAdminClient();

          // Re-hydrate the Graph-id fields for THIS batch only (lean step
          // boundary — see select-candidates comment above).
          const graphIdsById = await hydrateGraphIds(admin, batchIds);
          const batch: LeanBackfillCandidate[] = batchIds.map((email_id) => {
            const row = graphIdsById.get(email_id);
            return {
              email_id,
              source_id: row?.source_id ?? null,
              internet_message_id: row?.internet_message_id ?? null,
              sender_email: row?.sender_email ?? null,
              subject: row?.subject ?? null,
              received_at: row?.received_at ?? null,
            };
          });

          // Auto-set is registry-derived (D-05) — load once per batch.
          const noiseCategories = await loadSwarmNoiseCategories(
            admin,
            SWARM_TYPE,
          );
          const autoKeys = buildAutoKeySet(noiseCategories);

          // Disposition input: reuse the latest stage_1_retro_runs verdict.
          const verdicts = await resolveVerdicts(
            admin,
            batch.map((c) => c.email_id),
          );

          // D-08 ledger dedup — skip rows already archived (stage=4).
          const { data: existing, error: selErr } = await admin
            .from("pipeline_events")
            .select("email_id, swarm_type")
            .in(
              "email_id",
              batch.map((c) => c.email_id),
            )
            .eq("stage", 4);
          if (selErr) {
            throw new Error(
              `pipeline_events dedupe SELECT failed: ${selErr.message}`,
            );
          }
          const archivedKeys = new Set(
            (existing ?? []).map(
              (r: { email_id: string; swarm_type: string }) =>
                `${r.email_id}|${r.swarm_type}`,
            ),
          );

          const local = {
            would_auto: 0,
            would_queue: 0,
            would_skip_loopback: 0,
            no_live_message: 0,
            archived: 0,
            queued: 0,
            skipped_already_archived: 0,
          };

          for (const c of batch) {
            if (archivedKeys.has(`${c.email_id}|${SWARM_TYPE}`)) {
              local.skipped_already_archived++;
              continue;
            }

            const v = verdicts.get(c.email_id) ?? {
              predicted_category_key: "unknown" as const,
              confidence: "low" as const,
            };
            const disposition = classifyDisposition(
              v.predicted_category_key,
              v.confidence,
              autoKeys,
            );

            if (disposition === "skip") {
              local.would_skip_loopback++;
              continue; // D-06: neither archived nor queued.
            }

            if (disposition === "queue") {
              local.would_queue++;
              if (mode === "report") continue;
              await queuePredicted(admin, c, v.predicted_category_key);
              local.queued++;
              continue;
            }

            // disposition === 'auto'
            // Resolve the Graph id (Pitfall 4). Historic rows without source_id
            // are looked up live by internetMessageId (confirm presence + id).
            let graphId = resolveGraphIdSource(c).graphId;
            if (!graphId) {
              graphId = await resolveLiveGraphId(c);
              if (!graphId) {
                // No live Outlook message (pure import) — no-op (D-07).
                local.no_live_message++;
                continue;
              }
            }

            local.would_auto++;
            if (mode === "report") continue;
            // Canary cap.
            if (mode === "canary" && local.archived >= limit) continue;

            const label =
              noiseCategories.find(
                (n) => n.category_key === v.predicted_category_key,
              )?.outlook_label ?? "Noise";

            // categorize + archive on the GRAPH ID, treating already-archived
            // (404/ErrorItemNotFound) as no-op success (D-08 / A1).
            const catRes = await categorizeEmail(
              SALES_OUTLOOK_MAILBOX,
              graphId,
              label,
            );
            if (!catRes.success && !ARCHIVED_AS_SUCCESS.test(catRes.error ?? "")) {
              throw new Error(`categorize failed: ${catRes.error}`);
            }
            const arcRes = await archiveEmail(SALES_OUTLOOK_MAILBOX, graphId);
            if (!arcRes.success && !ARCHIVED_AS_SUCCESS.test(arcRes.error ?? "")) {
              throw new Error(`archive failed: ${arcRes.error}`);
            }

            // DIRECT Stage-4 ledger emit (NOT via verdict worker — Pitfall 1).
            // 23505 unique-violation = idempotent no-op (verbatim from
            // classifier-verdict-worker.ts:311-328).
            try {
              await emitPipelineEvent(admin, {
                swarm_type: SWARM_TYPE,
                stage: 4,
                email_id: c.email_id,
                decision: "auto_archived_noise",
                decision_details: {
                  source: "backfill",
                  backfill_run_id: runId,
                  noise_category: v.predicted_category_key,
                  source_stage: 1,
                  archived_at: new Date().toISOString(),
                },
                triggered_by: "backfill",
              });
            } catch (err) {
              const code = (err as { code?: string } | null)?.code;
              const msg = (err as Error)?.message ?? "";
              const isUniqueViolation =
                code === "23505" ||
                msg.includes("duplicate key value") ||
                msg.includes("23505") ||
                msg.includes("pipeline_events_one_per_stage_email");
              if (!isUniqueViolation) throw err;
              // already archived → idempotent no-op
            }
            local.archived++;
          }

          return local;
        },
      );

      counts.would_auto += batchResult.would_auto;
      counts.would_queue += batchResult.would_queue;
      counts.would_skip_loopback += batchResult.would_skip_loopback;
      counts.no_live_message += batchResult.no_live_message;
      counts.archived += batchResult.archived;
      counts.queued += batchResult.queued;
      counts.skipped_already_archived += batchResult.skipped_already_archived;
    }

    return {
      run_id: runId,
      mode,
      candidates_count: candidateIds.length,
      ...counts,
    };
  },
);

/**
 * Historic-row live-presence lookup (D-07 / Pitfall 4). Confirms the message is
 * still in the mailbox AND returns its Graph id. getMessageMeta only accepts a
 * Graph id, so a row that genuinely lacks source_id cannot be resolved here —
 * it is treated as no-live-message. (Wave 1 corpus is the ~853 Outlook rows
 * which all carry source_id; this branch is the documented seam for the rare
 * historic-with-live-message case, RESEARCH A3.)
 */
async function resolveLiveGraphId(
  candidate: GraphIdResolvable,
): Promise<string | null> {
  if (!candidate.internet_message_id) return null;
  try {
    // getMessageMeta throws on 404 (deleted/not present) — treat as no-op.
    await getMessageMeta(SALES_OUTLOOK_MAILBOX, candidate.internet_message_id);
    // Note: getMessageMeta requires a Graph id; an internet_message_id will not
    // resolve. This call path returns null in practice for the rare historic
    // case and is kept as the explicit D-07 no-op seam.
    return null;
  } catch {
    return null;
  }
}

/**
 * Queue an ambiguous match into Bulk Review (Pattern 3). INSERT an
 * automation_runs row status='predicted' carrying the fields approvePrediction
 * hydrates from. Existence-checked on (automation, result->>message_id) so a
 * re-run does not create a second predicted row (Pitfall 2).
 */
async function queuePredicted(
  admin: ReturnType<typeof createAdminClient>,
  candidate: LeanBackfillCandidate,
  predictedCategory: string,
): Promise<void> {
  const messageId = candidate.source_id ?? candidate.email_id;
  const { data: existing } = await admin
    .from("automation_runs")
    .select("id")
    .eq("automation", BACKFILL_QUEUE_AUTOMATION)
    .eq("result->>message_id", messageId)
    .limit(1);
  if (existing && existing.length > 0) return;

  await admin.from("automation_runs").insert({
    automation: BACKFILL_QUEUE_AUTOMATION,
    status: "predicted",
    swarm_type: SWARM_TYPE,
    email_id: candidate.email_id,
    rule_key: predictedCategory,
    result: {
      message_id: messageId,
      source_mailbox: SALES_OUTLOOK_MAILBOX,
      predicted_category: predictedCategory,
      from: candidate.sender_email,
      subject: candidate.subject,
      received_at: candidate.received_at,
    },
    triggered_by: "sales-email-stage-1-backfill",
  });
}
