"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Clock,
  Timer,
  Layers,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  StepStatusBadge,
  type StepStatus,
} from "@/components/step-status-badge";
import { type PipelineStep } from "@/components/step-log-panel";
import { SwarmGraph } from "@/components/graph/swarm-graph";
import { useBroadcast } from "@/lib/supabase/broadcast-client";
import type { StepUpdatePayload } from "@/lib/supabase/broadcast";
import { createClient } from "@/lib/supabase/client";
import { retryPipeline } from "../../new-run/actions";
import { ChatPanel } from "@/components/chat/chat-panel";
import type { ChatMessage } from "@/lib/pipeline/chat-types";
import { sendChatMessage } from "@/lib/pipeline/conversation-action";
import { PIPELINE_STAGES } from "@/lib/pipeline/stages";
import { StageProgressBar } from "@/components/chat/stage-progress-bar";

interface PipelineRun {
  id: string;
  project_id: string;
  name: string;
  use_case: string;
  status: string;
  step_count: number;
  steps_completed: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  pipeline_steps: PipelineStep[];
}

interface RunDetailClientProps {
  run: PipelineRun;
  projectId: string;
  chatMessages: ChatMessage[];
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function formatDurationBetween(
  start: string | null,
  end: string | null
): string {
  if (!start) return "--";
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  const diffMs = endMs - startMs;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function RunDetailClient({ run, projectId, chatMessages }: RunDetailClientProps) {
  const [steps, setSteps] = useState<PipelineStep[]>(run.pipeline_steps);
  const [runStatus, setRunStatus] = useState(run.status);
  const [stepsCompleted, setStepsCompleted] = useState(run.steps_completed);
  const [isRetrying, setIsRetrying] = useState(false);
  const [useCaseExpanded, setUseCaseExpanded] = useState(false);
  const [waitingStage, setWaitingStage] = useState<string | null>(() => {
    // Check if any step is currently waiting
    const waitingStep = run.pipeline_steps.find((s) => s.status === "waiting");
    if (waitingStep) return waitingStep.name;
    // Fallback: if run status is "waiting", find the last completed step and assume it's waiting for review
    if (run.status === "waiting") {
      const completedSteps = run.pipeline_steps.filter((s) => s.status === "complete");
      const lastComplete = completedSteps.sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0)).pop();
      return lastComplete?.name ?? "discussion";
    }
    return null;
  });
  const [approvalMap, setApprovalMap] = useState<Record<string, PipelineStep["approvalData"]>>({});
  const [approvalHistory, setApprovalHistory] = useState<Array<{
    id: string;
    stepName: string;
    status: "pending" | "approved" | "rejected" | "expired";
    decidedBy?: string;
    decidedAt?: string;
    comment?: string | null;
    createdAt: string;
  }>>([]);

  // ---------------------------------------------------------------------------
  // Approval data fetching
  // ---------------------------------------------------------------------------

  const supabase = useMemo(() => createClient(), []);

  // Build stage statuses for StageProgressBar (includes output for clickable expansion)
  const stageStatuses = useMemo(() => {
    return PIPELINE_STAGES.map((stage) => {
      const step = steps.find((s) => s.name === stage.name);
      let output: string | undefined;
      if (step?.result && typeof step.result === "object") {
        const raw = (step.result as { output?: string }).output ?? "";
        // Strip tool_call/tool_response blocks — show only the actual output
        output = raw
          .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
          .replace(/<tool_response>[\s\S]*?<\/tool_response>/g, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim() || undefined;
      }
      return {
        name: stage.name,
        displayName: stage.displayName,
        status: (step?.status ?? "pending") as "pending" | "running" | "complete" | "failed" | "waiting",
        output,
        durationMs: step?.duration_ms ?? undefined,
      };
    });
  }, [steps]);

  async function fetchApprovalData(approvalId: string, stepName: string) {
    try {
      const { data } = await supabase
        .from("approval_requests")
        .select("id, old_content, new_content, explanation, status, decided_by, decided_at, comment")
        .eq("id", approvalId)
        .single();

      if (data) {
        const approvalData = {
          id: data.id,
          oldContent: data.old_content,
          newContent: data.new_content,
          explanation: data.explanation,
          status: data.status as "pending" | "approved" | "rejected" | "expired",
          decidedBy: data.decided_by || undefined,
          decidedAt: data.decided_at || undefined,
          comment: data.comment,
        };
        setApprovalMap((prev) => ({
          ...prev,
          [stepName]: approvalData,
        }));
      }
    } catch {
      // Best-effort -- approval panel will show loading state
    }
  }

  // Fetch approval data for any existing waiting steps on mount
  useEffect(() => {
    steps.forEach((step) => {
      if (step.status === "waiting") {
        supabase
          .from("approval_requests")
          .select("id, old_content, new_content, explanation, status, decided_by, decided_at, comment")
          .eq("run_id", run.id)
          .eq("step_name", step.name)
          .order("created_at", { ascending: false })
          .limit(1)
          .single()
          .then(({ data }) => {
            if (data) {
              const approvalData = {
                id: data.id,
                oldContent: data.old_content,
                newContent: data.new_content,
                explanation: data.explanation,
                status: data.status as "pending" | "approved" | "rejected" | "expired",
                decidedBy: data.decided_by || undefined,
                decidedAt: data.decided_at || undefined,
                comment: data.comment,
              };
              setApprovalMap((prev) => ({
                ...prev,
                [step.name]: approvalData,
              }));
            }
          });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Handle deep link from email (?approval= query param)
  useEffect(() => {
    const url = new URL(window.location.href);
    const approvalId = url.searchParams.get("approval");
    if (approvalId) {
      // Terminal panel is always visible -- no need to open a drawer.
      // The approval entry will be visible in the panel automatically.
      // Clean up the URL
      url.searchParams.delete("approval");
      window.history.replaceState({}, "", url.pathname);
    }
  }, []);

  // Fetch all approval requests for audit trail on mount
  useEffect(() => {
    supabase
      .from("approval_requests")
      .select("id, step_name, status, decided_by, decided_at, comment, created_at")
      .eq("run_id", run.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) {
          setApprovalHistory(
            data.map((d) => ({
              id: d.id,
              stepName: d.step_name,
              status: d.status as "pending" | "approved" | "rejected" | "expired",
              decidedBy: d.decided_by || undefined,
              decidedAt: d.decided_at || undefined,
              comment: d.comment,
              createdAt: d.created_at,
            }))
          );
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id]);

  // ---------------------------------------------------------------------------
  // Broadcast subscription for step updates
  // ---------------------------------------------------------------------------

  const handleStepUpdate = useCallback((payload: StepUpdatePayload) => {
    // Update steps (for graph compatibility)
    setSteps((prev) =>
      prev.map((step) =>
        step.name === payload.stepName
          ? {
              ...step,
              status: payload.status as StepStatus,
              log: payload.log ?? step.log,
              duration_ms: payload.durationMs ?? step.duration_ms,
              // Apply architect result so graph populates in real-time
              ...(payload.result ? { result: payload.result } : {}),
            }
          : step
      )
    );
    if (payload.stepsCompleted !== undefined) {
      setStepsCompleted(payload.stepsCompleted);
    }
    if (payload.runStatus) {
      setRunStatus(payload.runStatus);
    }

    // Track waiting stage for chat input state
    if (payload.status === "waiting") {
      setWaitingStage(payload.stepName);
    } else if (payload.status === "running" || payload.status === "complete") {
      setWaitingStage((prev) => (prev === payload.stepName ? null : prev));
    }

    // Fetch approval data when step enters waiting state
    if (payload.status === "waiting" && payload.approvalId) {
      fetchApprovalData(payload.approvalId, payload.stepName);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useBroadcast<StepUpdatePayload>(
    `run:${run.id}`,
    "step-update",
    handleStepUpdate
  );

  // Subscribe to approval-decided events for multi-user scenarios
  useBroadcast<{ approvalId: string; decision: string; decidedBy: string; comment: string | null }>(
    `run:${run.id}`,
    "approval-decided",
    useCallback((payload) => {
      setApprovalMap((prev) => {
        const updated = { ...prev };
        for (const [stepName, data] of Object.entries(updated)) {
          if (data?.id === payload.approvalId) {
            updated[stepName] = {
              ...data,
              status: payload.decision as "approved" | "rejected",
              decidedBy: payload.decidedBy,
              comment: payload.comment,
            };
          }
        }
        return updated;
      });
      // Also update approval history
      setApprovalHistory((prev) =>
        prev.map((entry) =>
          entry.id === payload.approvalId
            ? {
                ...entry,
                status: payload.decision as "pending" | "approved" | "rejected" | "expired",
                decidedBy: payload.decidedBy,
                comment: payload.comment,
              }
            : entry
        )
      );
    }, [])
  );

  // ---------------------------------------------------------------------------
  // Chat message handler -- dispatches to correct server action
  // ---------------------------------------------------------------------------

  // Single handler for all user messages — the conversation agent handles intent
  const handleSendMessage = useCallback(async (message: string) => {
    const previousWaitingStage = waitingStage;
    try {
      setWaitingStage(null); // Optimistic: disable input while AI processes
      await sendChatMessage(run.id, message);
    } catch (error) {
      console.error("Failed to send message:", error);
      setWaitingStage(previousWaitingStage);
    }
  }, [run.id, waitingStage]);

  // ---------------------------------------------------------------------------
  // Retry handler
  // ---------------------------------------------------------------------------

  async function handleRetry() {
    setIsRetrying(true);
    try {
      await retryPipeline(run.id, projectId);
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
      {/* Run header */}
      <div className="flex shrink-0 items-start justify-between px-6 pt-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">
              {run.name || "Agent Swarm"}
            </h1>
            <StepStatusBadge status={runStatus as StepStatus} />
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              Started{" "}
              {run.started_at
                ? formatRelativeTime(run.started_at)
                : formatRelativeTime(run.created_at)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Timer className="size-3.5" />
              Duration{" "}
              {formatDurationBetween(
                run.started_at ?? run.created_at,
                run.completed_at
              )}
            </span>
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3.5" />
              Steps {stepsCompleted}/{run.step_count}
            </span>
          </div>
        </div>

        {runStatus === "failed" && (
          <Button
            variant="outline"
            onClick={handleRetry}
            disabled={isRetrying}
          >
            <RotateCcw
              className={`size-4 ${isRetrying ? "animate-spin" : ""}`}
            />
            {isRetrying ? "Retrying..." : "Retry Pipeline"}
          </Button>
        )}
      </div>

      {/* Collapsible use case card */}
      {run.use_case && (
        <Card className="mx-6 mt-2 shrink-0">
          <CardContent className="py-3">
            <button
              type="button"
              onClick={() => setUseCaseExpanded(!useCaseExpanded)}
              className="flex w-full items-center gap-2 text-left text-sm text-muted-foreground"
            >
              {useCaseExpanded ? (
                <ChevronUp className="size-3.5 shrink-0" />
              ) : (
                <ChevronDown className="size-3.5 shrink-0" />
              )}
              <span className="font-medium">Use Case</span>
            </button>
            {useCaseExpanded && (
              <p className="mt-2 ml-5 whitespace-pre-wrap text-sm text-muted-foreground">
                {run.use_case}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Graph | Progress Timeline | Chat — 3-column layout, fills remaining height */}
      <div className="relative mt-2 flex flex-1 overflow-hidden">
        {/* Graph area -- fills remaining width */}
        <div className="flex-1 min-w-0 h-full">
          <SwarmGraph runId={run.id} steps={steps} runStatus={runStatus} />
        </div>

        {/* Vertical progress timeline -- narrow middle column */}
        <div className="w-[180px] shrink-0 h-full overflow-hidden">
          <StageProgressBar stages={stageStatuses} />
        </div>

        {/* Chat panel -- wider right column, h-full + overflow-hidden pins input */}
        <div className="w-[480px] shrink-0 border-l flex flex-col h-full overflow-hidden">
          <ChatPanel
            runId={run.id}
            initialMessages={chatMessages}
            isWaitingForInput={!!waitingStage}
            waitingStage={waitingStage}
            onSendMessage={handleSendMessage}
          />
        </div>
      </div>
    </div>
  );
}
