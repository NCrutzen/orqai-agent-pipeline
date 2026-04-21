"use client";

import type { LucideIcon } from "lucide-react";
import type { HealthServiceStatus } from "@/lib/credentials/types";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";

function formatRelativeTime(dateStr: string): string {
  const diffSec = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

const STATUS_CONFIG: Record<
  string,
  { dotClass: string; borderClass: string; text: string }
> = {
  connected: {
    dotClass: "bg-emerald-500",
    borderClass: "border-l-emerald-500",
    text: "Connected",
  },
  degraded: {
    dotClass: "bg-amber-500",
    borderClass: "border-l-amber-500",
    text: "Degraded -- responding slowly",
  },
  unreachable: {
    dotClass: "bg-rose-500",
    borderClass: "border-l-rose-500",
    text: "Unreachable",
  },
  checking: {
    dotClass: "bg-[var(--v7-muted)] animate-pulse",
    borderClass: "border-l-[var(--v7-glass-border)]",
    text: "Checking...",
  },
  null: {
    dotClass: "bg-[var(--v7-faint)]",
    borderClass: "border-l-[var(--v7-glass-border)]",
    text: "Not checked",
  },
};

interface HealthStatusCardProps {
  serviceName: string;
  serviceIcon: LucideIcon;
  status: HealthServiceStatus | null;
  error?: string;
  checkedAt?: string;
}

export function HealthStatusCard({
  serviceName,
  serviceIcon: ServiceIcon,
  status,
  error,
  checkedAt,
}: HealthStatusCardProps) {
  const config = STATUS_CONFIG[status ?? "null"];

  return (
    <GlassCard className={cn("p-5 border-l-4", config.borderClass)}>
      <div className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <div className={cn("size-2 rounded-full", config.dotClass)} />
          <span className="text-[14px] font-semibold text-[var(--v7-text)]">
            {serviceName}
          </span>
        </div>
        <ServiceIcon className="size-4 text-[var(--v7-muted)]" />
      </div>
      <div>
        <p className="text-[14px] text-[var(--v7-text)]">{config.text}</p>
        {checkedAt && (
          <p className="text-[12px] text-[var(--v7-faint)] mt-1">
            Last checked {formatRelativeTime(checkedAt)}
          </p>
        )}
        {error && status !== "connected" && (
          <p className="text-[12px] text-rose-700 dark:text-rose-300 mt-2 line-clamp-2">
            {error}
          </p>
        )}
      </div>
    </GlassCard>
  );
}
