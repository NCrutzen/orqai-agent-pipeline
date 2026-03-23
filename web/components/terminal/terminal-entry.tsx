"use client";

import { Card, CardContent } from "@/components/ui/card";
import { StepStatusBadge, type StepStatus } from "@/components/step-status-badge";
import type { TerminalEntry } from "@/lib/systems/types";

interface TerminalEntryCardProps {
  entry: TerminalEntry;
  children?: React.ReactNode;
}

function getLeftBorderClass(status?: string): string {
  switch (status) {
    case "running":
    case "uploading":
    case "analyzing":
      return "border-l-4 border-l-blue-500";
    case "failed":
      return "border-l-4 border-l-destructive";
    case "waiting":
    case "reviewing":
      return "border-l-4 border-l-amber-500";
    default:
      return "";
  }
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TerminalEntryCard({ entry, children }: TerminalEntryCardProps) {
  const isUserInput = entry.type === "user-input";
  const borderClass = getLeftBorderClass(entry.status);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
      <Card
        className={`mb-3 ${borderClass} ${isUserInput ? "ml-12 bg-muted" : ""}`}
      >
        <CardContent className="py-3">
          <div className="flex gap-3">
            {/* Status icon area */}
            {entry.status && (
              <div className="shrink-0 pt-0.5">
                <StepStatusBadge status={entry.status as StepStatus} />
              </div>
            )}

            {/* Content area */}
            <div className="min-w-0 flex-1">
              {/* Header row: timestamp + display name */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatTime(entry.timestamp)}
                </span>
                {entry.displayName && (
                  <span className="text-xs font-medium">
                    {entry.displayName}
                  </span>
                )}
              </div>

              {/* Content text */}
              {entry.content && (
                <p className="mt-1 text-sm">{entry.content}</p>
              )}

              {/* Children slot for rich inline UI (EntryInteraction) */}
              {children}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
