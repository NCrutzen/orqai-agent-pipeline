"use client";

/**
 * Tag pill rendered inside a Kanban job card. Variant controls bg color
 * per the V7 token map in `52-UI-SPEC.md`.
 */

import { cn } from "@/lib/utils";

export type JobTagVariant = "default" | "warn" | "risk" | "ok";

interface JobTagPillProps {
  label: string;
  variant?: JobTagVariant;
}

const VARIANT_BG: Record<JobTagVariant, string> = {
  default: "rgba(255,255,255,0.04)",
  warn: "var(--v7-amber-soft)",
  risk: "var(--v7-pink-soft)",
  ok: "var(--v7-teal-soft)",
};

export function JobTagPill({ label, variant = "default" }: JobTagPillProps) {
  return (
    <span
      className={cn(
        "px-[9px] py-[6px] rounded-[var(--v7-radius-pill)]",
        "text-[11.8px] leading-[1.2] text-[var(--v7-muted)]",
        "border border-[var(--v7-line)]",
      )}
      style={{ background: VARIANT_BG[variant] }}
    >
      {label}
    </span>
  );
}
