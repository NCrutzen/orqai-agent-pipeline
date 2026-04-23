"use client";

/**
 * Right-side drawer showing the full detail of an automation run:
 * status, timeline (created → completed), sub-agent, trigger source,
 * before/after screenshots and raw result JSON.
 */

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  STAGE_META,
  extractScreenshots,
  runCategory,
  runTitle,
  stageFromStatus,
  type AutomationRun,
} from "@/lib/automations/types";
import { ScreenshotViewer } from "./screenshot-viewer";
import { cn } from "@/lib/utils";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function duration(startIso: string, endIso: string | null): string {
  if (!endIso) return "lopend";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

const TONE_DOT: Record<string, string> = {
  blue: "bg-[var(--v7-blue)]",
  amber: "bg-[var(--v7-amber)]",
  teal: "bg-[var(--v7-teal)]",
  red: "bg-[var(--v7-red)]",
  neutral: "bg-[var(--v7-faint)]",
};

interface AgentRunDrawerProps {
  run: AutomationRun | null;
  prefix: string;
  onOpenChange: (open: boolean) => void;
}

export function AgentRunDrawer({
  run,
  prefix,
  onOpenChange,
}: AgentRunDrawerProps) {
  const open = run !== null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden bg-[var(--v7-bg)] p-0 sm:max-w-xl"
      >
        {run && (
          <AgentRunDrawerBody run={run} prefix={prefix} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function AgentRunDrawerBody({
  run,
  prefix,
}: {
  run: AutomationRun;
  prefix: string;
}) {
  const stage = stageFromStatus(run.status);
  const meta = STAGE_META[stage];
  const title = runTitle(run);
  const category = runCategory(run);
  const shots = extractScreenshots(run.result);

  const subAgent = run.automation.startsWith(`${prefix}-`)
    ? run.automation.slice(prefix.length + 1)
    : run.automation;

  return (
    <>
      <SheetHeader className="border-b border-[var(--v7-line)] p-5">
        <div className="mb-2 flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              "inline-block h-2.5 w-2.5 rounded-full",
              TONE_DOT[meta.tone],
              meta.pulse && "animate-pulse",
            )}
          />
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--v7-muted)]">
            {subAgent} · {meta.dutchLabel}
          </span>
        </div>
        <SheetTitle className="text-[18px] font-semibold text-[var(--v7-text)]">
          {title}
        </SheetTitle>
        <SheetDescription className="text-[12px] text-[var(--v7-muted)]">
          Gestart {formatDateTime(run.created_at)} door {run.triggered_by} ·
          duur {duration(run.created_at, run.completed_at)}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {run.error_message && (
          <section className="rounded-[var(--v7-radius-inner,14px)] border border-[var(--v7-red)]/40 bg-[rgba(181,69,78,0.08)] p-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--v7-red)]">
              Foutmelding
            </div>
            <div className="text-[12px] text-[var(--v7-text)] whitespace-pre-wrap">
              {run.error_message}
            </div>
          </section>
        )}

        <section className="grid grid-cols-2 gap-3 text-[12px]">
          <DetailRow label="Agent" value={subAgent} />
          <DetailRow label="Status" value={meta.dutchLabel} />
          <DetailRow label="Categorie" value={category ?? "—"} />
          <DetailRow
            label="Afgerond"
            value={formatDateTime(run.completed_at)}
          />
        </section>

        {shots && (shots.before || shots.after) && (
          <section>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--v7-muted)]">
              Screenshots
            </div>
            <div className="grid grid-cols-2 gap-3">
              {shots.before && (
                <ScreenshotViewer
                  path={shots.before.path}
                  url={shots.before.url}
                  label="Voor"
                />
              )}
              {shots.after && (
                <ScreenshotViewer
                  path={shots.after.path}
                  url={shots.after.url}
                  label="Na"
                />
              )}
            </div>
          </section>
        )}

        <section>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--v7-muted)]">
            Result payload
          </div>
          <pre className="max-h-[280px] overflow-auto rounded-[var(--v7-radius-inner,10px)] border border-[var(--v7-line)] bg-[var(--v7-panel-2)] p-3 text-[11px] leading-relaxed text-[var(--v7-text)]">
            {JSON.stringify(run.result, null, 2) ?? "null"}
          </pre>
        </section>
      </div>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--v7-faint)]">
        {label}
      </span>
      <span className="truncate text-[var(--v7-text)]">{value}</span>
    </div>
  );
}
