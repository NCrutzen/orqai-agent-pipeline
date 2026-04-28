"use client";

// Phase 60-04 (D-26). 64x24 inline-SVG sparkline of last 14 ci_lo evaluations.
// Stroke --v7-text, fill --v7-panel-2. <title> for a11y per UI-SPEC.

interface SparkPoint {
  ci_lo: number;
  evaluated_at: string;
}

interface CiLoSparklineProps {
  points: SparkPoint[];
}

const W = 64;
const H = 24;
const MIN = 0.85;
const MAX = 1.0;

function scaleY(v: number): number {
  const clamped = Math.max(MIN, Math.min(MAX, v));
  // 0.85 -> 24 (baseline), 1.0 -> 0 (top)
  return H - ((clamped - MIN) / (MAX - MIN)) * H;
}

export function CiLoSparkline({ points }: CiLoSparklineProps) {
  if (points.length === 0) {
    return (
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="No evaluations yet"
      >
        <title>No evaluations yet</title>
        <rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill="var(--v7-panel-2)"
          rx={4}
        />
      </svg>
    );
  }

  const last = points.slice(-14);
  const stepX = last.length === 1 ? 0 : (W - 1) / (last.length - 1);
  const coords = last.map((p, i) => {
    const x = i * stepX;
    const y = scaleY(p.ci_lo);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const polyPoints = coords.join(" ");
  const latestPct = Math.round(last[last.length - 1].ci_lo * 100);

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Wilson CI-lower trend over the last 14 evaluations, latest ${latestPct}%`}
    >
      <title>{`Wilson CI-lower trend over the last 14 evaluations, latest ${latestPct}%`}</title>
      <rect x={0} y={0} width={W} height={H} fill="var(--v7-panel-2)" rx={4} />
      <polyline
        points={polyPoints}
        fill="none"
        stroke="var(--v7-text)"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
