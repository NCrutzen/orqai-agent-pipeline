"use client";

/**
 * Time axis ticks for the swimlane grid. Pure presentation — given a window
 * and a tick count, computes evenly-spaced HH:MM labels positioned to the
 * right of the lane label gutter.
 */

interface Props {
  windowStart: number;
  windowEnd: number;
  ticks: number;
}

const LANE_LABEL_GUTTER_PX = 92;

export function SwimlaneAxis({ windowStart, windowEnd, ticks }: Props) {
  const span = windowEnd - windowStart;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const tickList = Array.from({ length: ticks }, (_, i) => {
    const t = windowStart + (span * i) / (ticks - 1);
    const pct = (i / (ticks - 1)) * 100;
    return { t, pct };
  });

  return (
    <div className="v7-swimlane-axis" aria-hidden>
      {tickList.map(({ t, pct }) => (
        <span
          key={t}
          style={{
            left: `calc(${LANE_LABEL_GUTTER_PX}px + ${pct}% * (100% - ${LANE_LABEL_GUTTER_PX}px) / 100%)`,
          }}
        >
          {formatter.format(new Date(t))}
        </span>
      ))}
    </div>
  );
}
