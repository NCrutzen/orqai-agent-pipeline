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
import { broadcastStepUpdate, broadcastRunUpdate } from "@/lib/supabase/broadcast";
import { detectAutomationNeeds } from "@/lib/pipeline/automation-detector";
import { analyzeScreenshots } from "@/lib/pipeline/vision-adapter";

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

    // Execute each stage as a separate Inngest step
    for (const stage of PIPELINE_STAGES) {
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

        // Build context from previous stage results
        const contextBuilder = STAGE_CONTEXT_MAP[stage.name];
        const context = contextBuilder
          ? contextBuilder(stageResults, useCase)
          : { useCase };

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

        // Broadcast step complete
        await broadcastStepUpdate(runId, {
          stepName: stage.name,
          status: "complete",
          displayName: stage.displayName,
          durationMs,
          stepsCompleted: (currentRun?.steps_completed || 0) + 1,
          runStatus: "running",
          log: `Completed ${stage.displayName} in ${Math.round(durationMs / 1000)}s`,
        });

        // Return a reference, NOT the full output (Pitfall 6)
        return {
          skipped: false,
          stepId: existingStep?.id || "",
          output: result,
        };
      });

      // Store the output for downstream stages to use
      // This is the return value from step.run() -- available across re-invocations via memoization
      stageResults[stage.name] = stepRef.output;

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
