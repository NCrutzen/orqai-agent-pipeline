/**
 * Pipeline durable function: Inngest function with step-per-stage execution.
 *
 * Each pipeline stage runs as an individual Inngest step.run(), giving:
 * - Independent retry per step (3 retries)
 * - Memoization of completed steps within the same function run
 * - Resume-from-failed-step via DB state check on re-trigger
 *
 * CRITICAL Inngest patterns followed:
 * - All side effects (DB writes, API calls) inside step.run()
 * - Large outputs stored in Supabase, only references returned from step.run()
 * - Admin client used (no request context in Inngest functions)
 * - Non-streaming Claude API calls (streaming incompatible with Inngest steps)
 */

import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { runPromptAdapter } from "@/lib/pipeline/adapter";
import { PIPELINE_STAGES, AUTOMATION_STAGES } from "@/lib/pipeline/stages";
import { toPlainEnglish } from "@/lib/pipeline/errors";
import { broadcastStepUpdate, broadcastRunUpdate, broadcastChatMessage } from "@/lib/supabase/broadcast";
import { detectAutomationNeeds } from "@/lib/pipeline/automation-detector";
import { analyzeScreenshots } from "@/lib/pipeline/vision-adapter";
import { runConversationTurn } from "@/lib/pipeline/conversation-agent";
import type { PipelineAction } from "@/lib/pipeline/conversation-agent";
import { saveChatMessage, getChatMessages } from "@/lib/supabase/chat-messages";
import { extractAgentsFromOutput } from "@/lib/pipeline/extract-agents";

/**
 * Context keys expected by each pipeline stage.
 * Used to assemble the correct context object from previous step results.
 */
const STAGE_CONTEXT_MAP: Record<string, (results: Record<string, string>, useCase: string) => Record<string, string>> = {
  architect: (_results, useCase) => ({ useCase }),
  "tool-resolver": (results, useCase) => ({
    useCase,
    blueprint: results.architect || "",
  }),
  researcher: (results, useCase) => ({
    useCase,
    blueprint: results.architect || "",
  }),
  "spec-generator": (results, useCase) => ({
    useCase,
    blueprint: results.architect || "",
    tools: results["tool-resolver"] || "",
    researchBrief: results.researcher || "",
  }),
  "orchestration-generator": (results, useCase) => ({
    useCase,
    blueprint: results.architect || "",
    agentSpecs: results["spec-generator"] || "",
  }),
  "dataset-generator": (results, useCase) => ({
    useCase,
    blueprint: results.architect || "",
    agentSpecs: results["spec-generator"] || "",
  }),
  "readme-generator": (results, useCase) => ({
    useCase,
    blueprint: results.architect || "",
    agentSpecs: results["spec-generator"] || "",
  }),
};

export const executePipeline = inngest.createFunction(
  {
    id: "pipeline/execute",
    retries: 3,
    onFailure: async ({ event, error }) => {
      const admin = createAdminClient();
      const { runId } = event.data.event.data;

      // Find the last running step
      const { data: failedStep } = await admin
        .from("pipeline_steps")
        .select("id, name, display_name")
        .eq("run_id", runId)
        .eq("status", "running")
        .single();

      if (failedStep) {
        await admin
          .from("pipeline_steps")
          .update({
            status: "failed",
            error_message: toPlainEnglish(error),
            completed_at: new Date().toISOString(),
          })
          .eq("id", failedStep.id);
      }

      await admin
        .from("pipeline_runs")
        .update({ status: "failed" })
        .eq("id", runId);

      // Broadcast failure to real-time subscribers
      await broadcastStepUpdate(runId, {
        stepName: failedStep?.name || "unknown",
        status: "failed",
        displayName: failedStep?.display_name || failedStep?.name || "Unknown Step",
        runStatus: "failed",
      });
      await broadcastRunUpdate(runId, {
        runId,
        status: "failed",
        stepsCompleted: 0,
      });
    },
  },
  { event: "pipeline/run.started" },
  async ({ event, step }) => {
    const { runId, useCase } = event.data;

    // Step: Mark run as running
    await step.run("mark-run-running", async () => {
      const admin = createAdminClient();
      await admin
        .from("pipeline_runs")
        .update({
          status: "running",
          started_at: new Date().toISOString(),
        })
        .eq("id", runId);

      // Broadcast run started
      await broadcastRunUpdate(runId, {
        runId,
        status: "running",
        stepsCompleted: 0,
      });

      return { started: true };
    });

    // Accumulate stage result references (step IDs for DB lookup)
    // These are loaded from DB on resume, not from Inngest state
    const stageResults: Record<string, string> = {};

    // =========================================================================
    // Conversation agent — single AI that handles all user interaction
    // Like Claude Code: one AI talks to user, orchestrates pipeline stages
    // =========================================================================

    let enrichedUseCase = useCase;

    // Helper: load conversation history from DB (survives Inngest retries)
    async function loadConversationHistory(): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
      try {
        const messages = await getChatMessages(runId);
        return messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));
      } catch {
        return [];
      }
    }

    // Helper: run one conversation turn (stream to user, get action)
    async function converse(
      phase: string,
      stageOutput?: string,
      completedStage?: string,
    ): Promise<PipelineAction> {
      // Always reload history from DB — survives retries
      const history = await loadConversationHistory();
      const msgId = crypto.randomUUID();
      const result = await runConversationTurn(
        runId,
        history,
        { phase, stageOutput, completedStage, discussionTurns: history.filter(m => m.role === "user").length },
        msgId,
      );
      return result.action;
    }

    // Helper: wait for user message, add to history
    async function waitForUserMessage(waitStepId: string): Promise<string> {
      await step.run(`${waitStepId}-mark-waiting`, async () => {
        const admin = createAdminClient();
        await admin.from("pipeline_runs").update({ status: "waiting" }).eq("id", runId);
        await broadcastStepUpdate(runId, { stepName: "discussion", status: "waiting", displayName: "Waiting for your response", runStatus: "waiting" });
      });

      const userEvent = await step.waitForEvent(waitStepId, {
        event: "pipeline/chat.message",
        timeout: "1h",
        if: `async.data.runId == "${runId}"`,
      });

      if (!userEvent) return ""; // Timeout

      const msg = userEvent.data.message;
      // User message is already saved to DB by the conversation-action server action
      // No need to push to in-memory array — converse() loads from DB

      await step.run(`${waitStepId}-mark-running`, async () => {
        const admin = createAdminClient();
        await admin.from("pipeline_runs").update({ status: "running" }).eq("id", runId);
        await broadcastStepUpdate(runId, { stepName: "discussion", status: "running", displayName: "Discussing your use case", runStatus: "running" });
      });

      return msg;
    }

    // --- Discussion phase ---
    if (!event.data.resumeFromStep) {
      // Save initial use case as the first user message (if not already saved)
      await step.run("discussion-seed", async () => {
        const existing = await getChatMessages(runId);
        if (existing.length === 0) {
          const msgId = await saveChatMessage(runId, "user", useCase, "discussion");
          await broadcastChatMessage(runId, { id: msgId, role: "user", content: useCase });
        }
      });

      for (let turn = 0; turn < 8; turn++) {
        // Conversation agent streams response to user
        const action = await converse("discussion");

        if (action.type === "discussion_complete") break;
        if (action.type !== "wait") break; // Unexpected action, proceed

        // Wait for user response
        const userMsg = await waitForUserMessage(`discussion-wait-${turn}`);
        if (!userMsg) break; // Timeout
      }

      // Build enriched use case from full conversation (load from DB)
      const allMessages = await loadConversationHistory();
      const userMessages = allMessages
        .filter((m) => m.role === "user")
        .slice(1); // Skip the initial use case message
      if (userMessages.length > 0) {
        enrichedUseCase = `${useCase}\n\nUser clarifications:\n${userMessages.map(m => m.content).join("\n")}`;
      }

      // Mark discussion as complete
      await step.run("discussion-complete", async () => {
        await broadcastStepUpdate(runId, { stepName: "discussion", status: "complete", displayName: "Discussion complete", runStatus: "running" });
      });
    }

    // Execute each stage as a separate Inngest step
    for (const stage of PIPELINE_STAGES) {
      if (stage.name === "discussion") continue; // Handled above
      const stepRef = await step.run(stage.name, async () => {
        const admin = createAdminClient();
        const startTime = Date.now();

        // Check for resume skip: if step already complete, return stored result
        const { data: existingStep } = await admin
          .from("pipeline_steps")
          .select("id, status, result")
          .eq("run_id", runId)
          .eq("name", stage.name)
          .single();

        if (existingStep?.status === "complete" && existingStep.result !== null) {
          // Step already completed (retry-from-failed-step scenario)
          return {
            skipped: true,
            stepId: existingStep.id,
            output: (existingStep.result as { output?: string })?.output || "",
          };
        }

        // Update status to running
        if (existingStep) {
          await admin
            .from("pipeline_steps")
            .update({
              status: "running",
              started_at: new Date().toISOString(),
            })
            .eq("id", existingStep.id);

          // Broadcast step running
          await broadcastStepUpdate(runId, {
            stepName: stage.name,
            status: "running",
            displayName: stage.displayName,
            runStatus: "running",
          });
        }

        // Build context from previous stage results (enrichedUseCase includes discussion clarifications)
        const contextBuilder = STAGE_CONTEXT_MAP[stage.name];
        const context = contextBuilder
          ? contextBuilder(stageResults, enrichedUseCase)
          : { useCase: enrichedUseCase };

        // Call prompt adapter (non-streaming Claude API call)
        const result = await runPromptAdapter(stage.name, context);

        const durationMs = Date.now() - startTime;

        // Store result in Supabase (large output stays in DB, not Inngest state)
        if (existingStep) {
          await admin
            .from("pipeline_steps")
            .update({
              status: "complete",
              result: { output: result },
              completed_at: new Date().toISOString(),
              duration_ms: durationMs,
              log: `Completed ${stage.displayName} in ${Math.round(durationMs / 1000)}s`,
            })
            .eq("id", existingStep.id);
        }

        // Update run progress (increment steps_completed)
        const { data: currentRun } = await admin
          .from("pipeline_runs")
          .select("steps_completed")
          .eq("id", runId)
          .single();
        await admin
          .from("pipeline_runs")
          .update({ steps_completed: (currentRun?.steps_completed || 0) + 1 })
          .eq("id", runId);

        // Broadcast step complete (include result for architect so graph populates live)
        await broadcastStepUpdate(runId, {
          stepName: stage.name,
          status: "complete",
          displayName: stage.displayName,
          durationMs,
          stepsCompleted: (currentRun?.steps_completed || 0) + 1,
          runStatus: "running",
          log: `Completed ${stage.displayName} in ${Math.round(durationMs / 1000)}s`,
          ...(stage.name === "architect" ? { result: { output: result } } : {}),
        });

        // Return a reference, NOT the full output (Pitfall 6)
        return {
          skipped: false,
          stepId: existingStep?.id || "",
          output: result,
        };
      });

      // Store the output for downstream stages to use
      stageResults[stage.name] = stepRef.output;

      // After architect: extract agents as structured JSON using AI (not regex)
      if (stage.name === "architect" && stepRef.output && !stepRef.skipped) {
        await step.run("architect-extract-agents", async () => {
          const agents = await extractAgentsFromOutput(stepRef.output);
          if (agents.length > 0) {
            const admin = createAdminClient();
            const { data: existingStep } = await admin
              .from("pipeline_steps")
              .select("id, result")
              .eq("run_id", runId)
              .eq("name", "architect")
              .single();
            if (existingStep) {
              // Store agents JSON alongside the raw output
              const currentResult = (existingStep.result as Record<string, unknown>) ?? {};
              await admin.from("pipeline_steps").update({
                result: { ...currentResult, agents },
              }).eq("id", existingStep.id);
            }
          }
        });
      }

      // Template chat messages for silent stages (no extra API call)
      if (stage.templateMessage) {
        await step.run(`${stage.name}-template-msg`, async () => {
          const tmplId = crypto.randomUUID();
          await saveChatMessage(runId, "assistant", stage.templateMessage!, stage.name);
          await broadcastChatMessage(runId, { id: tmplId, role: "assistant", content: stage.templateMessage!, stageName: stage.name });
        });
      }

      // Conversation agent review for stages that need it (architect, spec-generator)
      if (stage.needsNarration && stepRef.output && !stepRef.skipped) {
        const reviewPhase = stage.name === "architect" ? "architect-review" : "spec-review";

        // Conversation agent streams summary + asks user (OUTSIDE step.run for streaming)
        let action = await converse(reviewPhase, stepRef.output, stage.name);

        // If agent asks user to confirm/give feedback → wait for response
        // Loop allows multiple rounds of feedback
        for (let reviewTurn = 0; reviewTurn < 3; reviewTurn++) {
          if (action.type === "continue") break; // User confirmed
          if (action.type !== "wait" && action.type !== "feedback") break; // Unexpected

          if (action.type === "feedback") {
            // Re-run stage with AI-extracted feedback
            const rerunRef = await step.run(`${stage.name}-rerun-${reviewTurn}`, async () => {
              const admin = createAdminClient();
              const contextBuilder = STAGE_CONTEXT_MAP[stage.name];
              const baseContext = contextBuilder
                ? contextBuilder(stageResults, enrichedUseCase)
                : { useCase: enrichedUseCase };
              const result = await runPromptAdapter(stage.name, {
                ...baseContext,
                userFeedback: (action as { type: "feedback"; summary: string }).summary,
              });
              const { data: existingStep } = await admin
                .from("pipeline_steps")
                .select("id")
                .eq("run_id", runId)
                .eq("name", stage.name)
                .single();
              if (existingStep) {
                await admin.from("pipeline_steps").update({ result: { output: result } }).eq("id", existingStep.id);
              }
              return { output: result };
            });
            stageResults[stage.name] = rerunRef.output;

            // Re-converse with updated output
            action = await converse(reviewPhase, rerunRef.output, stage.name);
            continue;
          }

          // action.type === "wait" — agent asked a question, wait for user
          const userMsg = await waitForUserMessage(`${stage.name}-review-wait-${reviewTurn}`);
          if (!userMsg) { action = { type: "continue" }; break; } // Timeout → proceed

          // Let conversation agent process the user's response
          action = await converse(reviewPhase, stepRef.output, stage.name);
        }

        // Resume running
        await step.run(`${stage.name}-narration-resume`, async () => {
          const admin = createAdminClient();
          await admin.from("pipeline_runs").update({ status: "running" }).eq("id", runId);
          await broadcastStepUpdate(runId, { stepName: stage.name, status: "complete", displayName: stage.displayName, runStatus: "running" });
        });
      }

      // HITL Approval Gate: if stage needs approval and produced a diff
      if (stage.needsApproval && stepRef.output && !stepRef.skipped) {
        // Step A: Create approval request in DB (dual-write pattern -- before waitForEvent)
        const approvalId = await step.run(`${stage.name}-create-approval`, async () => {
          const { createApprovalRequest } = await import("@/lib/pipeline/approval");
          const admin = createAdminClient();

          // Parse the stage output for diff content
          // Convention: stage output contains <approval_*> tags with old and new content
          const oldMatch = stepRef.output.match(/<approval_old>([\s\S]*?)<\/approval_old>/);
          const newMatch = stepRef.output.match(/<approval_new>([\s\S]*?)<\/approval_new>/);
          const explanationMatch = stepRef.output.match(/<approval_explanation>([\s\S]*?)<\/approval_explanation>/);

          const oldContent = oldMatch ? oldMatch[1].trim() : "";
          const newContent = newMatch ? newMatch[1].trim() : stepRef.output;
          const explanation = explanationMatch ? explanationMatch[1].trim() : "Proposed changes to agent prompt.";

          const id = await createApprovalRequest({
            runId,
            stepName: stage.name,
            oldContent,
            newContent,
            explanation,
          });

          // Update step status to "waiting"
          const { data: existingStep } = await admin
            .from("pipeline_steps")
            .select("id")
            .eq("run_id", runId)
            .eq("name", stage.name)
            .single();

          if (existingStep) {
            await admin
              .from("pipeline_steps")
              .update({ status: "waiting" })
              .eq("id", existingStep.id);
          }

          // Update run status to "waiting"
          await admin
            .from("pipeline_runs")
            .update({ status: "waiting" })
            .eq("id", runId);

          // Broadcast "waiting" status to real-time subscribers
          await broadcastStepUpdate(runId, {
            stepName: stage.name,
            status: "waiting",
            displayName: stage.displayName,
            runStatus: "waiting",
            approvalId: id,
          });

          // Send email notification (best-effort)
          try {
            const { sendApprovalEmail } = await import("@/lib/email/approval-notification");

            // Fetch user email and project name
            const { data: runData } = await admin
              .from("pipeline_runs")
              .select("created_by, project_id, projects(name)")
              .eq("id", runId)
              .single();

            if (runData?.created_by) {
              const { data: userData } = await admin.auth.admin.getUserById(runData.created_by);
              if (userData?.user?.email) {
                await sendApprovalEmail({
                  runId,
                  approvalId: id,
                  recipientEmail: userData.user.email,
                  projectName: (runData as any).projects?.name || "Unknown Project",
                  projectId: runData.project_id,
                  stepName: stage.displayName,
                });
              }
            }
          } catch (emailError) {
            console.error("[pipeline] Email notification failed (non-blocking):", emailError);
          }

          return id;
        });

        // Step B: Wait for approval event (with 7-day timeout)
        const approvalEvent = await step.waitForEvent(`${stage.name}-wait-approval`, {
          event: "pipeline/approval.decided",
          timeout: "7d",
          if: `async.data.approvalId == "${approvalId}"`,
        });

        // Step C: Handle approval result
        await step.run(`${stage.name}-handle-approval`, async () => {
          const admin = createAdminClient();

          if (!approvalEvent) {
            // Timeout -- mark as expired
            await admin
              .from("approval_requests")
              .update({ status: "expired" })
              .eq("id", approvalId);

            throw new Error("Approval timed out after 7 days");
          }

          const { data: stepRow } = await admin
            .from("pipeline_steps")
            .select("id")
            .eq("run_id", runId)
            .eq("name", stage.name)
            .single();

          if (approvalEvent.data.decision === "rejected") {
            // Rejected: revert step to "complete" with original output, continue pipeline
            if (stepRow) {
              await admin
                .from("pipeline_steps")
                .update({ status: "complete" })
                .eq("id", stepRow.id);
            }
            await admin
              .from("pipeline_runs")
              .update({ status: "running" })
              .eq("id", runId);

            await broadcastStepUpdate(runId, {
              stepName: stage.name,
              status: "complete",
              displayName: stage.displayName,
              runStatus: "running",
              log: "Changes rejected -- using original prompt.",
            });
          } else {
            // Approved: update step to "complete", continue pipeline with new content
            if (stepRow) {
              await admin
                .from("pipeline_steps")
                .update({ status: "complete" })
                .eq("id", stepRow.id);
            }
            await admin
              .from("pipeline_runs")
              .update({ status: "running" })
              .eq("id", runId);

            await broadcastStepUpdate(runId, {
              stepName: stage.name,
              status: "complete",
              displayName: stage.displayName,
              runStatus: "running",
              log: "Changes approved -- applying proposed prompt.",
            });
          }
        });
      }
    }

    // ============================================================
    // Automation Detection Branch (Phase 40)
    // ============================================================
    // Check if any designed agents target browser-automation systems
    const automationResult = await step.run("automation-detector", async () => {
      const admin = createAdminClient();

      const tasks = await detectAutomationNeeds(
        event.data.projectId,
        stageResults.architect || "",
        stageResults["spec-generator"] || ""
      );

      if (tasks.length === 0) return { tasks: [] as typeof tasks, needed: false };

      // Write automation_tasks to DB
      for (const task of tasks) {
        await admin.from("automation_tasks").insert({
          run_id: runId,
          agent_name: task.agentName,
          system_name: task.systemName,
          system_id: task.systemId,
          detected_reason: task.reason,
          status: "pending",
        });
      }

      // Broadcast detection result
      await broadcastStepUpdate(runId, {
        stepName: "automation-detector",
        status: "complete",
        displayName: AUTOMATION_STAGES[0].displayName,
        runStatus: "running",
        log: `Detected ${tasks.length} system(s) needing browser automation: ${tasks.map(t => t.systemName).join(", ")}`,
      });

      return { tasks, needed: true };
    });

    if (automationResult.needed) {
      // Process each automation task
      for (const task of automationResult.tasks) {
        // Fetch the task ID from DB
        const taskRow = await step.run(`fetch-task-${task.systemName}`, async () => {
          const admin = createAdminClient();
          const { data } = await admin
            .from("automation_tasks")
            .select("id")
            .eq("run_id", runId)
            .eq("system_name", task.systemName)
            .single();
          return data;
        });

        if (!taskRow) continue;
        const taskId = taskRow.id;

        // SOP Upload: set status to uploading, wait for user
        await step.run(`sop-upload-prepare-${task.systemName}`, async () => {
          const admin = createAdminClient();
          await admin
            .from("automation_tasks")
            .update({ status: "uploading" })
            .eq("id", taskId);

          await broadcastStepUpdate(runId, {
            stepName: "sop-upload",
            status: "waiting",
            displayName: `Upload SOP for ${task.systemName}`,
            runStatus: "waiting",
          });
        });

        // Wait for SOP upload event
        const sopEvent = await step.waitForEvent(`sop-upload-wait-${task.systemName}`, {
          event: "automation/sop.uploaded",
          timeout: "7d",
          if: `async.data.taskId == "${taskId}"`,
        });

        if (!sopEvent) {
          // Timeout -- mark as skipped
          await step.run(`sop-upload-timeout-${task.systemName}`, async () => {
            const admin = createAdminClient();
            await admin
              .from("automation_tasks")
              .update({ status: "skipped" })
              .eq("id", taskId);
          });
          continue;
        }

        // SOP Analyzer: analyze SOP + screenshots via Orq.ai vision
        const analysisResult = await step.run(`sop-analyzer-${task.systemName}`, async () => {
          const admin = createAdminClient();

          // Update status
          await admin
            .from("automation_tasks")
            .update({
              status: "analyzing",
              sop_text: sopEvent.data.sopText,
            })
            .eq("id", taskId);

          await broadcastStepUpdate(runId, {
            stepName: "sop-analyzer",
            status: "running",
            displayName: `Analyzing SOP for ${task.systemName}`,
            runStatus: "running",
          });

          // Download screenshots from Supabase Storage as base64
          const screenshots: Array<{ base64: string; label: string; mediaType: string }> = [];
          for (const path of sopEvent.data.screenshotPaths) {
            const { data } = await admin.storage
              .from("automation-assets")
              .download(path);
            if (data) {
              const buffer = Buffer.from(await data.arrayBuffer());
              const ext = path.split(".").pop()?.toLowerCase();
              const mediaType = ext === "png" ? "image/png" : "image/jpeg";
              screenshots.push({
                base64: buffer.toString("base64"),
                label: path.split("/").pop() || path,
                mediaType,
              });
            }
          }

          // Run vision analysis
          const result = await analyzeScreenshots(
            sopEvent.data.sopText,
            screenshots
          );

          // Store result in DB
          await admin
            .from("automation_tasks")
            .update({
              status: "reviewing",
              analysis_result: result as unknown as Record<string, unknown>,
            })
            .eq("id", taskId);

          await broadcastStepUpdate(runId, {
            stepName: "sop-analyzer",
            status: "complete",
            displayName: `Analysis complete for ${task.systemName}`,
            runStatus: "waiting",
            log: `Identified ${result.steps.length} automation steps. ${result.missingScreenshots.length > 0 ? `Missing screenshots: ${result.missingScreenshots.join(", ")}` : "All screenshots matched."}`,
          });

          // Return reference only (not full analysis)
          return { taskId, stepCount: result.steps.length, missingCount: result.missingScreenshots.length };
        });

        // Wait for annotation confirmation (Plan 04 UI sends this event)
        await step.run(`annotation-review-prepare-${task.systemName}`, async () => {
          await broadcastStepUpdate(runId, {
            stepName: "annotation-review",
            status: "waiting",
            displayName: `Review automation steps for ${task.systemName}`,
            runStatus: "waiting",
          });
        });

        const confirmEvent = await step.waitForEvent(`annotation-confirm-wait-${task.systemName}`, {
          event: "automation/annotation.confirmed",
          timeout: "7d",
          if: `async.data.taskId == "${taskId}"`,
        });

        if (confirmEvent) {
          await step.run(`annotation-confirmed-${task.systemName}`, async () => {
            const admin = createAdminClient();
            await admin
              .from("automation_tasks")
              .update({
                status: "confirmed",
                confirmed_steps: confirmEvent.data.confirmedSteps as unknown as Record<string, unknown>[],
              })
              .eq("id", taskId);

            await broadcastStepUpdate(runId, {
              stepName: "annotation-review",
              status: "complete",
              displayName: `Automation steps confirmed for ${task.systemName}`,
              runStatus: "running",
              log: `${confirmEvent.data.confirmedSteps.length} steps confirmed for ${task.systemName}`,
            });
          });
        }
      }
    }

    // All stages complete: mark run as complete
    await step.run("mark-run-complete", async () => {
      const admin = createAdminClient();
      await admin
        .from("pipeline_runs")
        .update({
          status: "complete",
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);

      // Broadcast pipeline completion
      await broadcastStepUpdate(runId, {
        stepName: "pipeline-complete",
        status: "complete",
        displayName: "Pipeline Complete",
        runStatus: "complete",
        stepsCompleted: PIPELINE_STAGES.length,
      });
      await broadcastRunUpdate(runId, {
        runId,
        status: "complete",
        stepsCompleted: PIPELINE_STAGES.length,
      });

      return { completed: true };
    });

    return { runId, status: "complete" };
  }
);
