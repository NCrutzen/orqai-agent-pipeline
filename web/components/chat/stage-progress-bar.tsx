"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check, Loader2, AlertCircle, Clock, ChevronRight, X } from "lucide-react";

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
 * Completed stages are clickable — opens a floating overlay with stage output.
 */
export function StageProgressBar({ stages }: StageProgressBarProps) {
  const [selectedStage, setSelectedStage] = useState<StageStatus | null>(null);

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex-none px-3 pt-4 pb-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Progress
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <div className="relative flex flex-col gap-0">
            {stages.map((stage, i) => {
              const isLast = i === stages.length - 1;
              const isClickable = (stage.status === "complete" || stage.status === "failed") && stage.output;
              const durationSec = stage.durationMs ? Math.round(stage.durationMs / 1000) : null;

              return (
                <div key={stage.name} className="relative">
                  <div
                    className={cn(
                      "relative flex items-start gap-2.5 pb-3",
                      isClickable && "cursor-pointer hover:bg-muted/50 -mx-1 px-1 rounded"
                    )}
                    onClick={isClickable ? () => setSelectedStage(stage) : undefined}
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
                    {/* Stage name */}
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
                        {isClickable && <ChevronRight className="size-3 text-muted-foreground shrink-0" />}
                      </div>
                      {durationSec !== null && stage.status === "complete" && (
                        <span className="text-[10px] text-muted-foreground">{durationSec}s</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating output overlay */}
      {selectedStage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedStage(null)}>
          <div
            className="relative mx-4 max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-lg border bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-sm font-semibold">{selectedStage.displayName}</h3>
              <button onClick={() => setSelectedStage(null)} className="rounded p-1 hover:bg-muted">
                <X className="size-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4" style={{ maxHeight: 'calc(80vh - 3rem)' }}>
              <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">
                {selectedStage.output}
              </pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
