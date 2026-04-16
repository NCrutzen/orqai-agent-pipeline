"use client";

/**
 * Lane background row: full-width strip with the agent name label on the
 * left in the 92px gutter. Pure presentation; the parent grid positions
 * lanes by absolute `top`.
 */

interface Props {
  agent: string;
  topPx: number;
}

export function SwimlaneLane({ agent, topPx }: Props) {
  return (
    <div
      className="v7-swimlane-lane"
      style={{ top: `${topPx}px` }}
      role="presentation"
    >
      <span className="v7-swimlane-lane-label">{agent}</span>
    </div>
  );
}
