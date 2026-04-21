import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { formatRelativeTimestamp } from "@/lib/dashboard/format";
import { HealthDot } from "./health-dot";
import type { HealthStatus } from "@/lib/dashboard/types";

interface SourceStatusCardProps {
  source: string;
  metrics: Record<string, string | number>;
  freshness: {
    lastTimestamp: string | null;
    stale: boolean;
    usingFallback?: boolean;
    fallbackTimestamp?: string | null;
    validationStatus?: string | null;
  };
  health: HealthStatus;
}

export function SourceStatusCard({
  source,
  metrics,
  freshness,
  health,
}: SourceStatusCardProps) {
  return (
    <GlassCard className={cn("p-5", freshness.stale && "border-[var(--v7-amber)]")}>
      <div className="flex flex-row items-center gap-2 pb-3">
        <h3 className="text-[14px] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]">
          {source}
        </h3>
        <HealthDot status={health} />
      </div>
      <div className="space-y-1">
        {Object.entries(metrics).map(([key, value]) => (
          <div key={key} className="flex justify-between text-[14px]">
            <span className="text-[var(--v7-muted)]">{key}</span>
            <span className="font-medium text-[var(--v7-text)]">{String(value)}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col items-start gap-1 pt-3 text-[10px]">
        {freshness.lastTimestamp ? (
          <span className="text-[var(--v7-faint)]">
            {formatRelativeTimestamp(freshness.lastTimestamp)}
          </span>
        ) : (
          <span className="text-[var(--v7-faint)]">No data collected yet</span>
        )}
        {freshness.stale && (
          <span className="text-[var(--v7-amber)]">
            Data may be stale
          </span>
        )}
        {freshness.usingFallback && freshness.fallbackTimestamp && (
          <span className="text-[var(--v7-amber)]">
            Using data from {freshness.fallbackTimestamp} -- latest scrape had issues
          </span>
        )}
      </div>
    </GlassCard>
  );
}
