"use client";

import { cn } from "@/lib/utils";
import { Check, Loader2, AlertCircle, Clock } from "lucide-react";

interface StageStatus {
  name: string;
  displayName: string;
  status: "pending" | "running" | "complete" | "failed" | "waiting";
}

interface StageProgressBarProps {
  stages: StageStatus[];
}

export function StageProgressBar({ stages }: StageProgressBarProps) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto border-b px-4 py-2">
      {stages.map((stage, i) => (
        <div key={stage.name} className="flex items-center gap-1.5">
          {i > 0 && <div className="h-px w-3 bg-border" />}
          <div
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap",
              stage.status === "complete" && "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
              stage.status === "running" && "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
              stage.status === "failed" && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
              stage.status === "waiting" && "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
              stage.status === "pending" && "bg-muted text-muted-foreground"
            )}
            title={stage.displayName}
          >
            {stage.status === "complete" && <Check className="size-2.5" />}
            {stage.status === "running" && <Loader2 className="size-2.5 animate-spin" />}
            {stage.status === "failed" && <AlertCircle className="size-2.5" />}
            {stage.status === "waiting" && <Clock className="size-2.5" />}
            <span className="hidden sm:inline">{stage.displayName.split(" ").slice(0, 2).join(" ")}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
