"use client";

import { CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

interface ApprovalBadgeProps {
  status: ApprovalStatus;
  className?: string;
}

const approvalStatusConfig: Record<
  ApprovalStatus,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    className: string;
  }
> = {
  pending: {
    label: "Pending",
    icon: Clock,
    className: "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800 dark:text-amber-400 animate-pulse",
  },
  approved: {
    label: "Approved",
    icon: CheckCircle2,
    className: "bg-green-500/10 text-green-600 border-green-200 dark:border-green-800 dark:text-green-400",
  },
  rejected: {
    label: "Rejected",
    icon: XCircle,
    className: "bg-red-500/10 text-red-600 border-red-200 dark:border-red-800 dark:text-red-400",
  },
  expired: {
    label: "Expired",
    icon: AlertTriangle,
    className: "bg-muted text-muted-foreground border-muted-foreground/30",
  },
};

export function ApprovalBadge({ status, className }: ApprovalBadgeProps) {
  const config = approvalStatusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`${config.className} ${className ?? ""}`}>
      <Icon className="size-3" />
      {config.label}
    </Badge>
  );
}
