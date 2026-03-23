"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, RotateCcw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StepStatusBadge, type StepStatus } from "@/components/step-status-badge";
import { ApprovalPanel } from "@/components/approval/approval-panel";

export interface PipelineStep {
  id: string;
  run_id: string;
  name: string;
  display_name: string;
  status: StepStatus;
  step_order: number;
  result: unknown;
  log: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  approvalData?: {
    id: string;
    oldContent: string;
    newContent: string;
    explanation: string;
    status: "pending" | "approved" | "rejected" | "expired";
    decidedBy?: string;
    decidedAt?: string;
    comment?: string | null;
  };
}

interface StepLogPanelProps {
  step: PipelineStep;
  onRetry?: () => void;
  isLast?: boolean;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function StepLogPanel({ step, onRetry, isLast }: StepLogPanelProps) {
  const [expanded, setExpanded] = useState(
    step.status === "failed" || step.status === "running" || step.status === "waiting"
  );

  return (
    <div className="relative flex gap-3">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div
          className={`mt-1 size-2.5 shrink-0 rounded-full border-2 ${
            step.status === "complete"
              ? "border-green-500 bg-green-500"
              : step.status === "running"
                ? "border-blue-500 bg-blue-500"
                : step.status === "waiting"
                  ? "border-amber-500 bg-amber-500 animate-pulse"
                  : step.status === "failed"
                    ? "border-destructive bg-destructive"
                    : "border-muted-foreground/30 bg-transparent"
          }`}
        />
        {!isLast && (
          <div className="w-px flex-1 bg-border" />
        )}
      </div>

      {/* Step content */}
      <div className="min-w-0 flex-1 pb-6">
        {/* Collapsed header -- clickable */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">{step.display_name}</span>
          <StepStatusBadge status={step.status} />
          {step.status === "complete" && step.duration_ms != null && (
            <span className="ml-auto text-xs text-muted-foreground">
              {formatDuration(step.duration_ms)}
            </span>
          )}
        </button>

        {/* Expanded content */}
        {expanded && (
          <div className="mt-2 ml-5">
            {/* Waiting for approval state */}
            {step.status === "waiting" && step.approvalData && (
              <ApprovalPanel approval={step.approvalData} />
            )}

            {/* Decided approval (read-only) */}
            {step.status === "complete" && step.approvalData && step.approvalData.status !== "pending" && (
              <ApprovalPanel approval={step.approvalData} />
            )}

            {/* Log output */}
            {step.log && (
              <pre className="max-h-64 overflow-auto rounded-md bg-muted/50 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                {step.log}
              </pre>
            )}

            {/* Failed state */}
            {step.status === "failed" && step.error_message && (
              <div className="mt-2 flex flex-col gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <p className="text-sm text-destructive">{step.error_message}</p>
                </div>
                {onRetry && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRetry}
                    className="w-fit"
                  >
                    <RotateCcw className="size-3.5" />
                    Retry from this step
                  </Button>
                )}
              </div>
            )}

            {/* Complete state with duration */}
            {step.status === "complete" && step.duration_ms != null && !step.log && (
              <p className="text-xs text-muted-foreground">
                Completed in {formatDuration(step.duration_ms)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
