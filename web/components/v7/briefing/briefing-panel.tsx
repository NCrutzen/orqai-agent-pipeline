"use client";

/**
 * AI briefing panel. Reads the latest briefing from Supabase Realtime,
 * renders narrative + KPI grid + optional alerts, and exposes a Regenerate
 * button that triggers the Orq.ai Briefing Agent via a server action.
 */

import { useMemo, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { GlassCard } from "@/components/ui/glass-card";
import { KpiGrid } from "@/components/v7/briefing/kpi-grid";
import { useRealtimeTable } from "@/lib/v7/use-realtime-table";
import {
  briefingOutputSchema,
  type BriefingAlert,
  type BriefingOutput,
} from "@/lib/v7/briefing/schema";
import { regenerateBriefingAction } from "@/lib/v7/briefing/actions";

interface BriefingPanelProps {
  swarmId: string;
}

const ALERT_TONE: Record<
  BriefingAlert["severity"],
  { bg: string; border: string; text: string }
> = {
  info: {
    bg: "rgba(255,255,255,0.04)",
    border: "var(--v7-line)",
    text: "var(--v7-muted)",
  },
  warn: {
    bg: "var(--v7-amber-soft)",
    border: "var(--v7-amber)",
    text: "var(--v7-amber)",
  },
  critical: {
    bg: "var(--v7-pink-soft)",
    border: "var(--v7-red)",
    text: "var(--v7-red)",
  },
};

function AlertPill({ alert }: { alert: BriefingAlert }) {
  const tone = ALERT_TONE[alert.severity];
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-[6px] rounded-[var(--v7-radius-pill)] text-[12px] leading-[1.3]"
      style={{
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        color: tone.text,
      }}
    >
      <span className="uppercase tracking-[0.1em] font-semibold">
        {alert.severity}
      </span>
      <span>{alert.message}</span>
    </span>
  );
}

export function BriefingPanel({ swarmId }: BriefingPanelProps) {
  const { rows: briefings } = useRealtimeTable("briefings");
  const [isPending, startTransition] = useTransition();

  const latest = useMemo(() => {
    if (briefings.length === 0) return null;
    return [...briefings].sort((a, b) =>
      b.generated_at.localeCompare(a.generated_at)
    )[0];
  }, [briefings]);

  const parsed: BriefingOutput | null = useMemo(() => {
    if (!latest?.narrative) return null;
    try {
      const obj = JSON.parse(latest.narrative);
      const result = briefingOutputSchema.safeParse(obj);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }, [latest]);

  function handleRegenerate() {
    startTransition(async () => {
      await regenerateBriefingAction(swarmId);
    });
  }

  const updatedAgo = latest
    ? formatDistanceToNowStrict(new Date(latest.generated_at), {
        addSuffix: true,
      })
    : null;

  return (
    <GlassCard
      className="relative overflow-hidden p-[18px] min-h-[200px] flex flex-col gap-2"
      style={{ borderRadius: "var(--v7-radius)" }}
    >
      {/* Radial accent per UI-SPEC (compacted) */}
      <span
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          inset: "-30% auto auto 58%",
          width: 200,
          height: 200,
          background:
            "radial-gradient(circle, var(--v7-teal-soft), transparent 62%)",
        }}
      />

      <div className="relative flex justify-between items-start gap-3">
        <span className="inline-flex items-center gap-2 text-[12px] leading-[1.3] tracking-[0.1em] uppercase text-[var(--v7-faint)]">
          <span
            aria-hidden
            className="inline-block w-2 h-2 rounded-full"
            style={{
              background: "var(--v7-teal)",
              animation: "v7-pulse-eyebrow 1.8s ease-in-out infinite",
            }}
          />
          Autonomous briefing
        </span>
      </div>

      {parsed ? (
        <>
          <h2 className="relative font-[var(--font-cabinet)] text-[20px] leading-[1.2] font-bold text-[var(--v7-text)] mt-2 max-w-[40ch]">
            {parsed.headline}
          </h2>
          <p className="relative text-[13px] leading-[1.5] text-[var(--v7-muted)] max-w-[72ch] line-clamp-3">
            {parsed.summary}
          </p>
          {parsed.alerts.length > 0 && (
            <div className="relative flex flex-wrap gap-2 mt-1">
              {parsed.alerts.map((alert, idx) => (
                <AlertPill
                  key={`${alert.severity}-${idx}`}
                  alert={alert}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="relative flex-1 flex flex-col items-start justify-center gap-1 py-2">
          <h2 className="font-[var(--font-cabinet)] text-[20px] leading-[1.2] font-bold text-[var(--v7-text)] max-w-[40ch]">
            Briefing will appear once the first agents report in.
          </h2>
          <p className="text-[13px] leading-[1.5] text-[var(--v7-muted)]">
            Click Regenerate to force a briefing now.
          </p>
        </div>
      )}

      <div className="relative">
        <KpiGrid />
      </div>

      <div className="relative mt-3 flex items-center justify-between gap-3 text-[12px] leading-[1.3] text-[var(--v7-faint)]">
        <span>{updatedAgo ? `Updated ${updatedAgo}` : "No briefing yet"}</span>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-3 py-[6px] rounded-[var(--v7-radius-pill)] border border-[var(--v7-line)] bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.06)] disabled:opacity-60 disabled:cursor-wait text-[var(--v7-text)] transition"
        >
          <RefreshCw
            size={14}
            className={isPending ? "animate-spin" : undefined}
          />
          <span>{isPending ? "Regenerating..." : "Regenerate"}</span>
        </button>
      </div>
    </GlassCard>
  );
}
