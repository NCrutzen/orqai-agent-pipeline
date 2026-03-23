"use client";

import { CheckCircle2, XCircle, Clock, Loader2, MinusCircle, PauseCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type StepStatus = "pending" | "running" | "complete" | "failed" | "skipped" | "waiting";

interface StepStatusBadgeProps {
  status: StepStatus;
  className?: string;
}

const statusConfig: Record<
  StepStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: React.ComponentType<{ className?: string }>;
    className: string;
  }
> = {
  pending: {
    label: "Pending",
    variant: "outline",
    icon: Clock,
    className: "text-muted-foreground",
  },
  running: {
    label: "Running...",
    variant: "default",
    icon: Loader2,
    className: "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800 dark:text-blue-400 animate-pulse",
  },
  complete: {
    label: "Complete",
    variant: "default",
    icon: CheckCircle2,
    className: "bg-green-500/10 text-green-600 border-green-200 dark:border-green-800 dark:text-green-400",
  },
  failed: {
    label: "Failed",
    variant: "destructive",
    icon: XCircle,
    className: "",
  },
  skipped: {
    label: "Skipped",
    variant: "outline",
    icon: MinusCircle,
    className: "text-muted-foreground",
  },
  waiting: {
    label: "Waiting for Approval",
    variant: "default",
    icon: PauseCircle,
    className: "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800 dark:text-amber-400 animate-pulse",
  },
};

export function StepStatusBadge({ status, className }: StepStatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge
      variant={config.variant}
      className={`${config.className} ${className ?? ""}`}
    >
      <Icon
        className={`size-3 ${status === "running" ? "animate-spin" : ""}`}
      />
      {config.label}
    </Badge>
  );
}
