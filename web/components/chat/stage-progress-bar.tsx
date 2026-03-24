"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check, Loader2, AlertCircle, Clock, ChevronDown, ChevronRight, X } from "lucide-react";

interface StageStatus {
  name: string;
  displayName: string;
  status: "pending" | "running" | "complete" | "failed" | "waiting";
  output?: string;
  durationMs?: number;
}

interface StageProgressBarProps {
  stages: StageStatus[];
}

/**
 * Vertical stage progress timeline. Sits between the graph and chat panel.
 * Completed stages are clickable — expands to show the stage output.
 */
export function StageProgressBar({ stages }: StageProgressBarProps) {
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-none px-3 pt-4 pb-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Progress
        </h3>
      </div>

      {/* Timeline list */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <div className="relative flex flex-col gap-0">
          {stages.map((stage, i) => {
            const isLast = i === stages.length - 1;
            const isClickable = stage.status === "complete" || stage.status === "failed";
            const isExpanded = expandedStage === stage.name;
            const durationSec = stage.durationMs ? Math.round(stage.durationMs / 1000) : null;

            return (
              <div key={stage.name} className="relative">
                <div
                  className={cn(
                    "relative flex items-start gap-2.5 pb-3",
                    isClickable && "cursor-pointer hover:bg-muted/50 -mx-1 px-1 rounded"
                  )}
                  onClick={isClickable ? () => setExpandedStage(isExpanded ? null : stage.name) : undefined}
                >
                  {/* Vertical connecting line */}
                  {!isLast && (
                    <div
                      className={cn(
                        "absolute left-[9px] top-[18px] h-full w-px",
                        stage.status === "complete" ? "bg-green-300 dark:bg-green-700" : "bg-border"
                      )}
                    />
                  )}
                  {/* Status icon */}
                  <div
                    className={cn(
                      "relative z-10 flex size-[18px] shrink-0 items-center justify-center rounded-full",
                      stage.status === "complete" && "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
                      stage.status === "running" && "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
                      stage.status === "failed" && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
                      stage.status === "waiting" && "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
                      stage.status === "pending" && "bg-muted text-muted-foreground"
                    )}
                  >
                    {stage.status === "complete" && <Check className="size-2.5" />}
                    {stage.status === "running" && <Loader2 className="size-2.5 animate-spin" />}
                    {stage.status === "failed" && <AlertCircle className="size-2.5" />}
                    {stage.status === "waiting" && <Clock className="size-2.5" />}
                  </div>
                  {/* Stage name + expand indicator */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span
                        className={cn(
                          "text-xs leading-[18px]",
                          stage.status === "complete" && "text-foreground",
                          stage.status === "running" && "font-medium text-blue-700 dark:text-blue-400",
                          stage.status === "waiting" && "font-medium text-amber-700 dark:text-amber-400",
                          stage.status === "failed" && "text-red-700 dark:text-red-400",
                          stage.status === "pending" && "text-muted-foreground"
                        )}
                      >
                        {stage.displayName}
                      </span>
                      {isClickable && (
                        isExpanded
                          ? <ChevronDown className="size-3 text-muted-foreground shrink-0" />
                          : <ChevronRight className="size-3 text-muted-foreground shrink-0" />
                      )}
                    </div>
                    {durationSec !== null && stage.status === "complete" && (
                      <span className="text-[10px] text-muted-foreground">{durationSec}s</span>
                    )}
                  </div>
                </div>

                {/* Expanded output panel */}
                {isExpanded && stage.output && (
                  <div className="relative mb-3 ml-[27px] rounded border bg-muted/30 p-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpandedStage(null); }}
                      className="absolute top-1 right-1 rounded p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                    <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap text-[10px] leading-relaxed text-foreground/80">
                      {stage.output.length > 3000
                        ? stage.output.slice(0, 3000) + "\n\n... (truncated)"
                        : stage.output}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
