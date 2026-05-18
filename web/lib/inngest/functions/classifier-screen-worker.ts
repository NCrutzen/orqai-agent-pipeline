// Phase 74 Plan 04 — classifier-screen-worker.
//
// Stage 0 → Stage 1 seam consumer. Listens on `classifier/screen.requested`
// (emitted by stage-0/safety-worker) and produces a Stage-1 verdict via
// registry-driven regex-then-LLM classification.
//
// D-16 step ordering:
//   1. load-swarm-row     — swarms + swarm_noise_categories for event.data.swarm_type
//   2. regex              — dynamic-import swarms.stage1_regex_module (D-03/D-04)
//                           and call its `classify({subject, from, bodySnippet})`.
//                           Skipped (regex outcome 'unknown') when stage1_regex_module
//                           is null (sales-email per D-03).
//   3. llm-call           — only when regex returned 'unknown'. Invokes the
//                           cross-cutting Orq agent `stage-1-category-classifier`
//                           with the call-time closed-category list (D-07).
//                           Persists agent_runs row INSIDE step.run with a
//                           UUID generated INSIDE step.run (Phase 65 replay-
//                           safety learning, CLAUDE.md). Errors caught and
//                           coerced to ('unknown','low') with status='failed'
//                           (D-11). retries:0 — no cascading retries.
//   4. emit-pipeline-event — Phase 70 dual-write of one canonical Stage-1 row.
//   5. emit-verdict        — `classifier/verdict.recorded` via the SendFn cast
//                            pattern from classifier-label-resolver.ts:34
//                            (CLAUDE.md commit dae6276 — NEVER destructure
//                            inngest.send).
//
// REQ-6: ZERO `swarm_type === 'X'` literal branches. Everything is registry-
// driven via swarms + swarm_noise_categories. The static-check test in
// classifier-screen-worker.test.ts enforces this with a regex grep.
//
// Pitfall 6: empty categories list short-circuits to 'unknown' BEFORE the
// LLM call so Orq isn't invoked with an empty <categories> block.
//
// retries:0 — same rationale as Phase 65 workers. Failures surface via
// status='failed' on agent_runs and via predicted_category='unknown' on the
// verdict event; downstream verdict-worker routes 'unknown' through the
// existing label-resolver / manual_review chain.

import { z } from "zod";
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm, loadSwarmNoiseCategories } from "@/lib/swarms/registry";
import { emitPipelineEvent } from "@/lib/pipeline-events/emit";
import { numericConfidence } from "@/lib/pipeline-events/types";
import { invokeOrqAgent } from "@/lib/automations/orq-agents/client";
import { classify as debtorEmailClassify } from "@/lib/debtor-email/classify";
// Phase 82.2 Plan 06 D-A — debtor-email category dispatch logic, moved
// from the synchronous ingest route. RFC: Stage 1 = noise filter only
// (docs/agentic-pipeline/stage-1-regex.md). The whitelist below is a subset
// of swarm_noise_categories matchedRule keys — the hard-separation rule
// (a row exists in EXACTLY ONE of swarm_noise_categories OR swarm_intents)
// is preserved.
import { readWhitelist } from "@/lib/classifier/cache";
import { categorizeEmail, archiveEmail, getMessageMeta } from "@/lib/outlook";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";

// Static dispatch map for stage-1 regex modules. The DB column
// `swarms.stage1_regex_module` selects which module runs; this map
// resolves the string to a statically-imported handler so the bundler
// (Webpack/Turbopack on Vercel) can include it in the build. A fully
// dynamic `await import(swarmRow.stage1_regex_module)` throws
// "Cannot find module as expression is too dynamic" at runtime — Vite
// is the only bundler that resolves that pattern, and Vercel is not Vite.
// Onboarding a new swarm: add an INSERT to `swarms.stage1_regex_module`
// AND a new line to this map. CI keeps them in sync via the codegen check.
type Stage1ClassifyFn = (input: {
  subject: string;
  from: string;
  bodySnippet?: string;
}) => { category: string; matchedRule: string | null };
const STAGE1_REGEX_MODULES: Record<string, { classify: Stage1ClassifyFn }> = {
  "@/lib/debtor-email/classify": { classify: debtorEmailClassify as Stage1ClassifyFn },
};

// D-06 output shape. `reasoning` allowed nullable for telemetry-only field.
const Stage1OutputSchema = z.object({
  category_key: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  reasoning: z.string().nullable(),
});

// CLAUDE.md commit dae6276 — never destructure inngest.send; we cast inline
// per call to widen past the strict EventSchemas union.
type SendFn = (p: {
  name: string;
  data: Record<string, unknown>;
}) => Promise<unknown>;

// ─── Phase 82.2 Plan 06 D-A — debtor-email dispatch constants ─────────────
// Moved from web/app/api/automations/debtor-email/ingest/route.ts (pre-thin).
// These are intentionally local to the debtor-email branch below — other
// swarms keep the registry-driven dispatch via swarm_noise_categories.action
// (verdict-worker). Hard separation per stage-1-regex.md: this is the
// noise-filter auto-action gate, NOT intent classification.
const DEBTOR_CATEGORY_LABEL: Record<string, string> = {
  auto_reply: "Auto-Reply",
  ooo_temporary: "OoO — Temporary",
  ooo_permanent: "OoO — Permanent",
  payment_admittance: "Payment Admittance",
};
const DEBTOR_MR_LABELS = new Set(Object.values(DEBTOR_CATEGORY_LABEL));
const DEBTOR_LEGACY_ICONTROLLER_COMPANY = "smebabrandbeveiliging";

interface DebtorLabelingSettings {
  source_mailbox: string;
  entity: string | null;
  icontroller_company: string | null;
  ingest_enabled: boolean;
  auto_label_enabled: boolean;
  triage_shadow_mode: boolean;
}

export const classifierScreenWorker = inngest.createFunction(
  { id: "classifier/screen-worker", retries: 0 },
  { event: "classifier/screen.requested" },
  async ({ event, step }) => {
    const {
      automation_run_id,
      email_id,
      message_id,
      source_mailbox,
      subject,
      body_text,
      swarm_type,
      entity,
      // Phase 82.2 Plan 07 D-A passthrough fields — used by the debtor-email
      // dispatch block below (Plan 06) to populate iController-cleanup
      // automation_runs.result without a DB lookup.
      mailbox_id: mailboxIdFromEvent,
      from: fromFromEvent,
      fromName: fromNameFromEvent,
      receivedAt: receivedAtFromEvent,
    } = event.data as {
      automation_run_id: string;
      email_id: string;
      message_id: string;
      source_mailbox: string;
      subject: string;
      body_text: string;
      swarm_type: string;
      entity?: string | null;
      mailbox_id?: number | null;
      from?: string | null;
      fromName?: string | null;
      receivedAt?: string | null;
    };

    if (!swarm_type) {
      // Registry-driven principle: a missing swarm_type is a Stage 0 emit-site
      // bug, not a silent default. Throw so the caller observes it.
      throw new Error(
        "classifier-screen-worker: event.data.swarm_type is required",
      );
    }

    const admin = createAdminClient();

    // ───── Step 1: load swarm row + categories (D-16.1) ────────────────
    const { swarmRow, categories } = await step.run(
      "load-swarm-row",
      async () => {
        const sw = await loadSwarm(admin, swarm_type);
        if (!sw) {
          throw new Error(`swarms row not found for ${swarm_type}`);
        }
        const cats = await loadSwarmNoiseCategories(admin, swarm_type);
        return { swarmRow: sw, categories: cats };
      },
    );

    // ───── Step 2: regex (D-16.2, D-03, D-04) ─────────────────────────
    // Skipped when stage1_regex_module is null (sales-email per D-03).
    const regexOutcome = await step.run("regex", async () => {
      if (!swarmRow.stage1_regex_module) {
        return {
          invoked: false,
          category: "unknown" as string,
          matchedRule: null as string | null,
        };
      }
      // D-04: registry-keyed static dispatch. The DB string selects the
      // module; STAGE1_REGEX_MODULES resolves it to a statically-imported
      // handler so Webpack/Turbopack can bundle it. Errors throw → run
      // fails (D-12).
      const mod = STAGE1_REGEX_MODULES[swarmRow.stage1_regex_module];
      if (!mod) {
        throw new Error(
          `stage1_regex_module not registered: "${swarmRow.stage1_regex_module}" — add it to STAGE1_REGEX_MODULES`,
        );
      }
      const result = mod.classify({
        subject: subject ?? "",
        // sender_email is not on the classifier/screen.requested payload
        // post-Plan-02. The debtor regex's auto_reply / OOO / payment
        // patterns are subject + body driven; a missing `from` doesn't
        // affect classification quality for those branches.
        from: "",
        bodySnippet: (body_text ?? "").slice(0, 2000),
      });
      return {
        invoked: true,
        category: result.category,
        matchedRule: result.matchedRule,
      };
    });

    let finalCategoryKey: string = regexOutcome.category;
    let llmInvoked = false;
    let llmConfidence: "low" | "medium" | "high" | null = null;
    let llmReasoning: string | null = null;
    let llmError: string | null = null;
    let llmCategoryKey: string | null = null;
    let agentRunId: string | null = null;

    // ───── Step 3: LLM call only on regex='unknown' (D-16.3, D-10, D-11) ─
    if (regexOutcome.category === "unknown") {
      // Pitfall 6: empty registry → coerce to 'unknown' BEFORE the LLM call.
      // Filtering `enabled` here also handles the case where every category
      // is disabled mid-flight. registry helpers already filter enabled=true,
      // but we double-check defensively against fixture-supplied rows.
      const enabledCategories = categories.filter((c) => c.enabled !== false);

      if (enabledCategories.length === 0) {
        finalCategoryKey = "unknown";
      } else {
        const llmResult = await step.run("llm-call", async () => {
          // Phase 65 replay-id learning (CLAUDE.md): non-deterministic
          // values used as DB keys MUST be generated INSIDE step.run.
          const id = crypto.randomUUID();
          const inngestRunId = event.id ?? `local-${message_id}`;
          try {
            const result = await invokeOrqAgent(
              "stage-1-category-classifier",
              {
                subject: subject ?? "",
                body_text: body_text ?? "",
                categories: enabledCategories.map((c) => ({
                  category_key: c.category_key,
                  display_label: c.display_label,
                })),
              },
            );
            const parsed = Stage1OutputSchema.parse(result.raw);
            // Phase 999.8 D-01 / D-10 supersedes the prior 'low → unknown'
            // coercion: instead of dropping low-confidence predictions into
            // the unknown bucket here (which would auto-archive via the
            // verdict path), we preserve the predicted category and let the
            // Step 5 gate route medium/low to `classifier/screen.requires_review`
            // so the row stays at status='predicted' for human review.
            const finalKey = parsed.category_key;

            const insertSuccess = await admin.from("agent_runs").insert({
              id,
              swarm_type,
              automation_run_id: automation_run_id ?? null,
              email_id,
              inngest_run_id: inngestRunId,
              entity: entity ?? null,
              status: "predicted",
              confidence: parsed.confidence,
              reasoning: parsed.reasoning,
              tool_outputs: {
                stage1_category: parsed.category_key,
                gated_to: finalKey,
              },
            });
            if (insertSuccess.error) {
              // Log + throw so the catch block writes a 'failed' agent_runs
              // row AND surfaces the schema/CHECK violation in the Inngest
              // run log instead of silently no-op'ing.
              console.error(
                `[classifier-screen-worker] agent_runs insert failed:`,
                insertSuccess.error,
              );
              throw new Error(
                `agent_runs insert failed: ${insertSuccess.error.message}`,
              );
            }

            return {
              id,
              category_key: parsed.category_key,
              confidence: parsed.confidence,
              reasoning: parsed.reasoning,
              finalKey,
              error: null as string | null,
            };
          } catch (err) {
            // D-11: coerce to ('unknown', 'low'); persist error_message
            // AND tool_outputs.error. Do NOT rethrow — the run continues
            // through pipeline_events emit + verdict emit.
            const msg = err instanceof Error ? err.message : String(err);
            const failureInsert = await admin.from("agent_runs").insert({
              id,
              swarm_type,
              automation_run_id: automation_run_id ?? null,
              email_id,
              inngest_run_id: inngestRunId,
              entity: entity ?? null,
              status: "failed",
              confidence: "low",
              reasoning: null,
              error_message: msg,
              tool_outputs: { error: msg },
            });
            if (failureInsert.error) {
              // Even the failure-path INSERT failed — log loudly so the
              // Inngest run log shows the underlying schema issue. Do NOT
              // re-throw (D-11: pipeline must continue to emit verdict).
              console.error(
                `[classifier-screen-worker] failure-path agent_runs insert ALSO failed:`,
                failureInsert.error,
              );
            }
            return {
              id,
              category_key: "unknown",
              confidence: "low" as const,
              reasoning: null,
              finalKey: "unknown",
              error: msg,
            };
          }
        });

        llmInvoked = true;
        agentRunId = llmResult.id;
        llmConfidence = llmResult.confidence;
        llmReasoning = llmResult.reasoning;
        llmError = llmResult.error;
        llmCategoryKey = llmResult.category_key;
        finalCategoryKey = llmResult.finalKey;
      }
    }

    // ───── Step 4: pipeline_events dual-write (D-16.4) ────────────────
    await step.run("emit-pipeline-event", async () => {
      await emitPipelineEvent(admin, {
        swarm_type,
        stage: 1,
        email_id,
        decision: finalCategoryKey,
        confidence: numericConfidence(llmConfidence ?? null),
        decision_details: {
          regex: regexOutcome,
          llm_invoked: llmInvoked,
          llm_category_key: llmCategoryKey,
          llm_confidence: llmConfidence,
          llm_reasoning: llmReasoning,
          llm_error: llmError,
          final_category_key: finalCategoryKey,
          entity: entity ?? null,
          // Phase 999.8 D-11 — denormalize predictor for chip-strip filter
          // without a JOIN. 'llm_2nd_pass' when the LLM was actually invoked
          // (regex abstained → unknown → LLM Pass 2). 'regex' when the regex
          // matched a noise key. Mirrors the logic in recordVerdict (Plan
          // 05) — both code paths derive predictor from the same
          // llm_invoked flag, never from regex.matchedRule.
          predictor: llmInvoked ? "llm_2nd_pass" : "regex",
        },
        agent_run_id: agentRunId,
        automation_run_id: automation_run_id ?? null,
        triggered_by: "pipeline",
      });
    });

    // ───── Step 4.5: Phase 82.2 Plan 06 D-A — debtor-email dispatch ──────
    // Owner of post-Stage-0 dispatch logic that previously lived in
    // web/app/api/automations/debtor-email/ingest/route.ts. The block fires
    // ONLY for debtor-email with a loaded labeling_settings row. Other
    // swarms (sales-email, future swarms) fall through to the existing
    // Step 5 emit-verdict path, which delegates to verdict-worker for the
    // registry-driven action dispatch.
    //
    // RFC alignment: Stage 1 = noise filter only (stage-1-regex.md). The
    // whitelist below is a subset of regex matchedRule keys in the
    // swarm_noise_categories registry; no swarm_intents (Stage 3) crossing.
    //
    // Replay-safety (CLAUDE.md): every side-effect lives in its own
    // step.run. The MR_LABEL pre-check guards categorize on Outlook side.
    //
    // REQ-6 compliance: no `swarm_type === 'X'` literal branch. The gate
    // is the registry-keyed stage1_regex_module — the debtor-email regex
    // module is the only one with promoted-rule whitelist mechanics today.
    // Onboarding a future swarm with auto-action dispatch will need to
    // register here and extend DEBTOR_CATEGORY_LABEL accordingly.
    const DEBTOR_REGEX_MODULE_KEY = "@/lib/debtor-email/classify";
    if (swarmRow.stage1_regex_module === DEBTOR_REGEX_MODULE_KEY) {
      const settings = await step.run(
        "load-debtor-labeling-settings",
        async (): Promise<DebtorLabelingSettings | null> => {
          const res = await admin
            .schema("debtor")
            .from("labeling_settings")
            .select(
              "source_mailbox, entity, icontroller_company, ingest_enabled, auto_label_enabled, triage_shadow_mode",
            )
            .eq("source_mailbox", source_mailbox)
            .maybeSingle();
          if (!res.data) return null;
          const d = res.data as DebtorLabelingSettings;
          return {
            source_mailbox: d.source_mailbox,
            entity: d.entity,
            icontroller_company: d.icontroller_company,
            ingest_enabled: d.ingest_enabled,
            auto_label_enabled: d.auto_label_enabled,
            triage_shadow_mode: d.triage_shadow_mode,
          };
        },
      );

      if (settings) {
        // 1. Idempotency pre-check — if Outlook already carries one of our
        //    MR_LABELS, the auto-action ran on a prior delivery. Skip.
        //    Mirrors L272–281 of the pre-deletion ingest route.
        const idempotencyCheck = await step.run(
          "idempotency-precheck",
          async () => {
            try {
              const meta = await getMessageMeta(source_mailbox, message_id);
              const labeled = (meta.categories ?? []).filter((c: string) =>
                DEBTOR_MR_LABELS.has(c),
              );
              return { alreadyLabeled: labeled.length > 0, labels: labeled };
            } catch {
              // 404 / Graph error — fall through to dispatch; the cleanup
              // worker will surface the failure if Outlook is missing.
              return { alreadyLabeled: false, labels: [] as string[] };
            }
          },
        );

        const isoNow = new Date().toISOString();
        const mailboxId = mailboxIdFromEvent ?? null;

        if (idempotencyCheck.alreadyLabeled) {
          await step.run("write-skipped-idempotent-audit", async () => {
            await admin.from("automation_runs").insert({
              automation: "debtor-email-review",
              status: "completed",
              swarm_type: "debtor-email",
              topic: finalCategoryKey === "unknown" ? null : finalCategoryKey,
              entity: settings.entity,
              mailbox_id: mailboxId,
              result: {
                stage: "zapier_ingest_classify",
                message_id,
                source_mailbox,
                entity: settings.entity,
                subject,
                from: fromFromEvent ?? null,
                action: "skipped_idempotent",
                already_labeled: idempotencyCheck.labels,
              },
              triggered_by: "stage-1-worker",
              completed_at: isoNow,
            });
          });
          await step.run("emit-stale-skipped-idempotent", async () => {
            await emitAutomationRunStale(admin, "debtor-email-review");
          });
          return {
            ok: true,
            regex_category: regexOutcome.category,
            llm_invoked: llmInvoked,
            final_category_key: finalCategoryKey,
            dispatch: "skipped_idempotent",
          };
        }

        // 2. Whitelist + auto-action gate.
        const whitelist = await step.run(
          "load-whitelist",
          async () => Array.from(await readWhitelist(admin, "debtor-email")),
        );
        const whitelistSet = new Set(whitelist);
        const matchedRule = regexOutcome.matchedRule ?? "";
        const isWhitelistMatch = whitelistSet.has(matchedRule);
        const autoActionAllowed =
          isWhitelistMatch && settings.auto_label_enabled;

        // 3. Bulk-review branch: !autoActionAllowed → status='predicted'.
        //    Mirrors L402–423 of the pre-deletion ingest route. The
        //    stage_0_safety_pending placeholder is NOT re-created here —
        //    Plan 07 thin-ingest already inserts it BEFORE Stage 0 runs.
        //
        // 2026-05-18 fix: `unknown` MUST NOT enter this branch. The seed
        // registry row for `unknown` has action='swarm_dispatch' →
        // `debtor-email/label-resolve.requested` → Stage 2 (entity resolution).
        // The pre-82.2-06 ingest route emitted the verdict for unknowns; the
        // refactor's catch-all `if (!autoActionAllowed)` swallowed them into
        // bulk-review and returned early, silently dropping the Stage 2
        // handoff. Step 5's comment ("`finalCategoryKey === 'unknown'`
        // short-circuits to the verdict path on purpose") was already the
        // intended contract — this guard restores it.
        if (!autoActionAllowed && finalCategoryKey !== "unknown") {
          await step.run("write-predicted-bulk-review", async () => {
            await admin.from("automation_runs").insert({
              automation: "debtor-email-review",
              status: "predicted",
              swarm_type: "debtor-email",
              topic:
                finalCategoryKey === "unknown" ? null : finalCategoryKey,
              entity: settings.entity,
              mailbox_id: mailboxId,
              result: {
                stage: "zapier_ingest_classify",
                message_id,
                source_mailbox,
                entity: settings.entity,
                subject,
                from: fromFromEvent ?? null,
                predicted: {
                  category: finalCategoryKey,
                  rule: regexOutcome.matchedRule,
                },
                action:
                  isWhitelistMatch && !settings.auto_label_enabled
                    ? "skipped_disabled"
                    : "skipped_not_whitelisted",
              },
              triggered_by: "stage-1-worker",
              completed_at: isoNow,
            });
          });
          await step.run("emit-stale-predicted", async () => {
            await emitAutomationRunStale(admin, "debtor-email-review");
          });
          return {
            ok: true,
            regex_category: regexOutcome.category,
            llm_invoked: llmInvoked,
            final_category_key: finalCategoryKey,
            dispatch:
              isWhitelistMatch && !settings.auto_label_enabled
                ? "skipped_disabled"
                : "skipped_not_whitelisted",
          };
        }

        // 4. Auto-action branch — categorize+archive+audit+cleanup queue.
        //    Each Outlook side-effect lives in its own step.run; replay
        //    dedupes per (run_id, step_name). categorize is additionally
        //    guarded by the idempotency-precheck above so a repeated
        //    delivery does not double-tag.
        const label = DEBTOR_CATEGORY_LABEL[finalCategoryKey];
        if (!label) {
          // Whitelisted match for an unknown category — defensive bail-out.
          // Should not happen because whitelist keys map to known categories
          // by construction, but we surface it rather than fire Outlook.
          await step.run("write-no-label-failure", async () => {
            await admin.from("automation_runs").insert({
              automation: "debtor-email-review",
              status: "failed",
              swarm_type: "debtor-email",
              topic: finalCategoryKey,
              entity: settings.entity,
              mailbox_id: mailboxId,
              result: {
                stage: "categorize",
                message_id,
                source_mailbox,
                entity: settings.entity,
              },
              error_message: `no Outlook label for category ${finalCategoryKey}`,
              triggered_by: "stage-1-worker",
              completed_at: isoNow,
            });
          });
          return {
            ok: false,
            regex_category: regexOutcome.category,
            llm_invoked: llmInvoked,
            final_category_key: finalCategoryKey,
            dispatch: "failed_no_label",
          };
        }

        const catRes = await step.run("categorize", async () =>
          categorizeEmail(source_mailbox, message_id, label),
        );
        if (!catRes.success) {
          await step.run("write-categorize-failure", async () => {
            await admin.from("automation_runs").insert({
              automation: "debtor-email-review",
              status: "failed",
              swarm_type: "debtor-email",
              topic: finalCategoryKey,
              entity: settings.entity,
              mailbox_id: mailboxId,
              result: {
                stage: "categorize",
                message_id,
                source_mailbox,
                entity: settings.entity,
                category: label,
              },
              error_message: catRes.error ?? null,
              triggered_by: "stage-1-worker",
              completed_at: isoNow,
            });
          });
          await step.run("emit-stale-categorize-failed", async () => {
            await emitAutomationRunStale(admin, "debtor-email-review");
          });
          return {
            ok: false,
            regex_category: regexOutcome.category,
            llm_invoked: llmInvoked,
            final_category_key: finalCategoryKey,
            dispatch: "failed_categorize",
          };
        }

        const arcRes = await step.run("archive", async () =>
          archiveEmail(source_mailbox, message_id),
        );
        if (!arcRes.success) {
          await step.run("write-archive-failure", async () => {
            await admin.from("automation_runs").insert({
              automation: "debtor-email-review",
              status: "failed",
              swarm_type: "debtor-email",
              topic: finalCategoryKey,
              entity: settings.entity,
              mailbox_id: mailboxId,
              result: {
                stage: "archive",
                message_id,
                source_mailbox,
                entity: settings.entity,
                category: label,
              },
              error_message: arcRes.error ?? null,
              triggered_by: "stage-1-worker",
              completed_at: isoNow,
            });
          });
          await step.run("emit-stale-archive-failed", async () => {
            await emitAutomationRunStale(admin, "debtor-email-review");
          });
          return {
            ok: false,
            regex_category: regexOutcome.category,
            llm_invoked: llmInvoked,
            final_category_key: finalCategoryKey,
            dispatch: "failed_archive",
          };
        }

        // Success audit + iController-cleanup queue.
        const icontrollerCompany =
          settings.icontroller_company ?? DEBTOR_LEGACY_ICONTROLLER_COMPANY;
        await step.run("write-auto-action-audit", async () => {
          await admin.from("automation_runs").insert({
            automation: "debtor-email-review",
            status: "completed",
            swarm_type: "debtor-email",
            topic: finalCategoryKey,
            entity: settings.entity,
            mailbox_id: mailboxId,
            result: {
              stage: "categorize+archive",
              message_id,
              source_mailbox,
              entity: settings.entity,
              applied_category: label,
              decision: "approve",
              triggered_by: "stage-1-worker",
              predicted: {
                category: finalCategoryKey,
                rule: regexOutcome.matchedRule,
              },
            },
            triggered_by: "stage-1-worker",
            completed_at: isoNow,
          });
        });
        await step.run("emit-stale-auto-action", async () => {
          await emitAutomationRunStale(admin, "debtor-email-review");
        });
        await step.run("queue-icontroller-cleanup", async () => {
          await admin.from("automation_runs").insert({
            automation: "debtor-email-cleanup",
            status: "pending",
            swarm_type: "debtor-email",
            topic: finalCategoryKey,
            entity: settings.entity,
            mailbox_id: mailboxId,
            result: {
              stage: "icontroller_delete",
              message_id,
              source_mailbox,
              entity: settings.entity,
              company: icontrollerCompany,
              icontroller: "pending",
              from: fromFromEvent ?? null,
              subject,
              received_at: receivedAtFromEvent ?? isoNow,
            },
            triggered_by: "stage-1-worker",
            completed_at: isoNow,
          });
        });
        await step.run("emit-stale-cleanup", async () => {
          await emitAutomationRunStale(admin, "debtor-email-cleanup");
        });

        // Suppress fromName lint warning — passed through event but only used
        // by the Outlook display in downstream cleanup-worker (which today
        // reads from the row directly). Keep the reference for clarity.
        void fromNameFromEvent;

        return {
          ok: true,
          regex_category: regexOutcome.category,
          llm_invoked: llmInvoked,
          final_category_key: finalCategoryKey,
          dispatch: "labeled",
        };
      }
      // Settings missing — fall through to Step 5 emit-verdict so the
      // existing verdict-worker registry dispatch still runs (defensive
      // path for non-ingest-originated events).
    }

    // ───── Step 5: emit verdict OR requires_review (D-16.5, D-01, D-10) ─
    // Phase 999.8 confidence gate. When the LLM 2nd-pass returned a non-
    // 'unknown' category at medium/low confidence, we emit
    // `classifier/screen.requires_review` INSTEAD of
    // `classifier/verdict.recorded`. The new event has no subscriber by
    // design (D-10), so automation_runs.status stays 'predicted' and the
    // Stage 1 row list (page.tsx:587) surfaces it for human review with
    // NO Outlook side effects.
    //
    // Motivating incident (NOTES.md): Therese Hendriks `FW: Invoice
    // 17338747` got auto-archived at confidence='medium' before this
    // gate existed — the worst-case "LLM auto-archives an invoice
    // correction request" is what this branch stops.
    //
    // `finalCategoryKey === 'unknown'` short-circuits to the verdict
    // path on purpose: the seed category's action='manual_review' /
    // 'reject' is the existing label-only-skip escape valve — no
    // archive, no Outlook label — so the gate has nothing to add.
    //
    // CLAUDE.md commit dae6276 — inline cast, NEVER destructure
    // inngest.send. decision='approve' matches the existing
    // classifier-verdict-worker contract: verdict-worker dispatches via
    // swarm_noise_categories.action, not via decision; preserve those
    // semantics.
    const gateClearsForAutoArchive =
      !llmInvoked ||
      llmConfidence === "high" ||
      finalCategoryKey === "unknown";

    if (gateClearsForAutoArchive) {
      await step.run("emit-verdict", async () =>
        (inngest.send as unknown as SendFn)({
          name: "classifier/verdict.recorded",
          data: {
            automation_run_id,
            swarm_type,
            decision: "approve",
            message_id,
            source_mailbox,
            predicted_category: finalCategoryKey,
            override_category: null,
          },
        }),
      );
    } else {
      await step.run("emit-requires-review", async () =>
        (inngest.send as unknown as SendFn)({
          name: "classifier/screen.requires_review",
          data: {
            automation_run_id,
            agent_run_id: agentRunId,
            email_id,
            message_id,
            source_mailbox,
            swarm_type,
            entity: entity ?? null,
            llm_category_key: llmCategoryKey ?? finalCategoryKey,
            llm_confidence: llmConfidence as "medium" | "low",
            final_category_key: finalCategoryKey,
          },
        }),
      );
    }

    return {
      ok: true,
      regex_category: regexOutcome.category,
      llm_invoked: llmInvoked,
      final_category_key: finalCategoryKey,
    };
  },
);
