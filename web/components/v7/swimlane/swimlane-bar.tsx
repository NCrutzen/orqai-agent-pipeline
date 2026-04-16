"use client";

/**
 * Single Gantt-style bar in the swimlane grid. Absolutely positioned by
 * the parent SwimlaneTimeline using `bar.leftPct`/`widthPct` math that
 * accounts for the 92px lane label gutter on the left.
 *
 * Tooltip is CSS-only (visible on :hover and :focus-visible).
 */

import type { Bar } from "@/lib/v7/swimlane/bars";

const LANE_LABEL_GUTTER_PX = 92;
const LANE_HEIGHT = 36;
const LANE_GUTTER_TOP = 14;
const BAR_TOP_OFFSET = 7;

export function SwimlaneBar({ bar }: { bar: Bar }) {
  return (
    <div
      className="v7-swimlane-bar"
      data-type={bar.type}
      role="img"
      aria-label={`${bar.agent}: ${bar.label}, ${bar.duration}`}
      tabIndex={0}
      style={{
        top: `${LANE_GUTTER_TOP + bar.laneIndex * LANE_HEIGHT + BAR_TOP_OFFSET}px`,
        left: `calc(${LANE_LABEL_GUTTER_PX}px + ${bar.leftPct}% * (100% - ${LANE_LABEL_GUTTER_PX}px) / 100%)`,
        width: `calc(${bar.widthPct}% * (100% - ${LANE_LABEL_GUTTER_PX}px) / 100%)`,
      }}
    >
      <span className="v7-swimlane-bar-label">{bar.shortLabel}</span>
      <span className="v7-bar-tooltip" role="presentation">
        <strong>{bar.label}</strong>
        <span>
          {bar.duration} {"\u2022"} {bar.agent}
        </span>
        <span>
          {bar.startTime}
          {"\u2013"}
          {bar.endTime}
        </span>
      </span>
    </div>
  );
}
