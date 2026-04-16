/**
 * Small pill rendering a live count + label (e.g. "3 active", "5 agents")
 * inside the V7 sidebar. Purely presentational — tone controls the color
 * bucket used from Phase 48 tokens.
 */

interface SidebarMiniStatProps {
  count: number;
  label: string;
  tone: "blue" | "teal";
}

const toneClasses: Record<SidebarMiniStatProps["tone"], string> = {
  blue: "bg-[var(--v7-blue-soft)] text-[var(--v7-blue)]",
  teal: "bg-[var(--v7-teal-soft)] text-[var(--v7-teal)]",
};

export function SidebarMiniStat({ count, label, tone }: SidebarMiniStatProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--v7-radius-pill)] text-[12px] leading-[1.3] font-medium ${toneClasses[tone]}`}
    >
      {count} {label}
    </span>
  );
}
