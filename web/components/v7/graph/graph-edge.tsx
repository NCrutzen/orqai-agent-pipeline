"use client";

/**
 * Single edge in the V7 delegation graph (Phase 53).
 *
 * Pure SVG: a Bezier `<path>` plus, for "recent" edges, a `<circle>`
 * particle whose `<animateMotion mpath>` traverses the path. Particle
 * animation is GPU-driven and never re-renders React.
 */

import { particleColor, type Edge } from "@/lib/v7/graph/edges";

interface GraphEdgeProps {
  edge: Edge;
  fromCoord: { x: number; y: number };
  toCoord: { x: number; y: number };
  recent: boolean;
  reducedMotion: boolean;
}

function bezier(
  a: { x: number; y: number },
  b: { x: number; y: number },
): string {
  const mx = (a.x + b.x) / 2;
  return `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
}

export function GraphEdge({
  edge,
  fromCoord,
  toCoord,
  recent,
  reducedMotion,
}: GraphEdgeProps) {
  const pathId = `edge-${edge.key}`;
  const d = bezier(fromCoord, toCoord);
  const stroke = recent ? "url(#v7-edge-grad)" : "url(#v7-edge-grad-stale)";
  const opacity = recent ? 1 : 0.35;

  // Particle dur randomized per edge so concurrent particles don't
  // visually phase-lock. Range: 1.0s -- 1.6s.
  const dur = (1.0 + (edge.count % 5) * 0.15).toFixed(2);
  const color = particleColor(edge.index);

  return (
    <g>
      <path
        id={pathId}
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity={opacity}
      />
      {recent && (
        <circle
          r="5"
          fill={color}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        >
          <animateMotion
            dur={`${dur}s`}
            repeatCount={reducedMotion ? "1" : "indefinite"}
            rotate="auto"
          >
            <mpath href={`#${pathId}`} />
          </animateMotion>
        </circle>
      )}
    </g>
  );
}
