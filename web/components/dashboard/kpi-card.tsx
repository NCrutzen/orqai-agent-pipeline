import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { EstimatedBadge } from "./estimated-badge";

interface KpiCardProps {
  title: string;
  value: string;
  trend?: {
    value: number;
    label: string;
    direction: "up" | "down" | "flat";
  };
  estimated?: boolean;
  tooltipText?: string;
  icon: React.ReactNode;
  updatedAt: string;
  stale?: boolean;
}

export function KpiCard({
  title,
  value,
  trend,
  estimated,
  tooltipText,
  icon,
  updatedAt,
  stale,
}: KpiCardProps) {
  return (
    <GlassCard
      className={cn(
        "p-5",
        stale && "border-[var(--v7-amber)]"
      )}
    >
      <div className="flex flex-row items-center gap-2 pb-2">
        <div className="size-4 text-[var(--v7-muted)]">{icon}</div>
        <span className="text-[12px] uppercase tracking-[0.1em] text-[var(--v7-faint)]">
          {title}
        </span>
      </div>
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-[26.4px] leading-[1.1] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]">
            {value}
          </span>
          {trend && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-xs",
                trend.direction === "up" && "text-[var(--v7-lime)]",
                trend.direction === "down" && "text-[var(--v7-red)]",
                trend.direction === "flat" && "text-[var(--v7-muted)]"
              )}
            >
              {trend.direction === "up" && <TrendingUp className="size-3" />}
              {trend.direction === "down" && (
                <TrendingDown className="size-3" />
              )}
              {trend.direction === "flat" && <Minus className="size-3" />}
              {trend.label}
            </span>
          )}
        </div>
        {estimated && <EstimatedBadge tooltipText={tooltipText} />}
        <p className="text-[10px] text-[var(--v7-faint)] mt-1">{updatedAt}</p>
        {stale && (
          <p className="text-[10px] text-[var(--v7-amber)]">
            Data may be stale
          </p>
        )}
      </div>
    </GlassCard>
  );
}
