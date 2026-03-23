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
import {
  useBroadcast,
  type StepUpdatePayload,
} from "@/lib/supabase/broadcast";
import { createClient } from "@/lib/supabase/client";
import { retryPipeline } from "../../new-run/actions";
import { ApprovalHistory } from "@/components/approval/approval-history";
import { TerminalPanel } from "@/components/terminal/terminal-panel";
import type { TerminalEntry } from "@/lib/systems/types";

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

export function RunDetailClient({ run, projectId }: RunDetailClientProps) {
  const [steps, setSteps] = useState<PipelineStep[]>(run.pipeline_steps);
  const [runStatus, setRunStatus] = useState(run.status);
  const [stepsCompleted, setStepsCompleted] = useState(run.steps_completed);
  const [isRetrying, setIsRetrying] = useState(false);
  const [useCaseExpanded, setUseCaseExpanded] = useState(false);
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([]);
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
        // Also update terminal entries with approval data
        setTerminalEntries((prev) =>
          prev.map((e) =>
            e.stepName === stepName
              ? { ...e, type: "approval" as const, metadata: { approvalData } }
              : e
          )
        );
      }
    } catch {
      // Best-effort -- approval panel will show loading state
    }
  }

  // ---------------------------------------------------------------------------
  // Initialize terminal entries from pipeline steps on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const entries: TerminalEntry[] = steps.map((step) => ({
      id: step.id,
      type: step.status === "waiting" && approvalMap[step.name]
        ? "approval" as const
        : "status" as const,
      timestamp: step.started_at || step.completed_at || run.created_at,
      stepName: step.name,
      displayName: step.display_name,
      status: step.status,
      content: step.log || step.error_message || step.display_name,
      metadata: approvalMap[step.name]
        ? { approvalData: approvalMap[step.name] }
        : undefined,
    }));
    setTerminalEntries(entries);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount only

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
              // Update terminal entry with approval data
              setTerminalEntries((prev) =>
                prev.map((e) =>
                  e.stepName === step.name
                    ? { ...e, type: "approval" as const, metadata: { approvalData } }
                    : e
                )
              );
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

    // Update terminal entries
    setTerminalEntries((prev) => {
      const existing = prev.find((e) => e.stepName === payload.stepName);
      if (existing) {
        return prev.map((e) =>
          e.stepName === payload.stepName
            ? {
                ...e,
                status: payload.status,
                content: payload.log || payload.displayName,
                displayName: payload.displayName,
              }
            : e
        );
      }
      // New step not yet in entries -- append
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: "status" as const,
          timestamp: new Date().toISOString(),
          stepName: payload.stepName,
          displayName: payload.displayName,
          status: payload.status,
          content: payload.log || payload.displayName,
        },
      ];
    });

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
      // Update terminal entries with new approval status
      setTerminalEntries((prev) =>
        prev.map((e) => {
          const meta = e.metadata?.approvalData as { id?: string } | undefined;
          if (meta?.id === payload.approvalId) {
            return {
              ...e,
              metadata: {
                ...e.metadata,
                approvalData: {
                  ...meta,
                  status: payload.decision,
                  decidedBy: payload.decidedBy,
                  comment: payload.comment,
                },
              },
            };
          }
          return e;
        })
      );
    }, [])
  );

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
    <div>
      {/* Run header */}
      <div className="flex items-start justify-between px-6 pt-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">
              {run.name || "Pipeline Run"}
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
        <Card className="mx-6 mt-4">
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

      {/* Graph area + Terminal panel side-by-side */}
      <div className="relative mt-4 flex" style={{ height: 'calc(100vh - 13rem)' }}>
        {/* Graph area -- fills remaining width */}
        <div className="flex-1 min-w-0">
          <SwarmGraph runId={run.id} steps={steps} runStatus={runStatus} />
        </div>

        {/* Terminal panel -- fixed 400px right column */}
        <div className="w-[400px] shrink-0 border-l flex flex-col">
          <TerminalPanel
            runId={run.id}
            entries={terminalEntries}
            onEntriesChange={setTerminalEntries}
          />

          {/* Approval History at the bottom of terminal panel */}
          {approvalHistory.length > 0 && (
            <div className="border-t p-4">
              <ApprovalHistory entries={approvalHistory} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
