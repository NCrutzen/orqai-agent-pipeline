"use client";

/**
 * Live event stream panel (Phase 52, OBS-03 / OBS-04 / OBS-05).
 *
 * Reads from the swarm's single Realtime channel via `useRealtimeTable`
 * and bridges new events into a per-swarm ring buffer. Renders a
 * mono-font dark "terminal shell" with auto-scroll, pause, clear, and
 * a "N new events" affordance for users who scrolled away from the
 * tail.
 *
 * The terminal NEVER opens its own Supabase channel -- RT-01 requires
 * a single channel per swarm view.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Eraser, Pause, Play } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { TerminalRow } from "@/components/v7/terminal/terminal-row";
import { useRealtimeTable } from "@/lib/v7/use-realtime-table";
import { useEventBuffer } from "@/lib/v7/terminal/use-event-buffer";

interface TerminalStreamProps {
  swarmId: string;
}

const NEAR_BOTTOM_PX = 32;

export function TerminalStream({ swarmId }: TerminalStreamProps) {
  const { rows: realtimeEvents } = useRealtimeTable("events");
  const { events, paused, setPaused, clear, pushMany } =
    useEventBuffer(swarmId);

  // The realtime feed is sorted desc by `created_at`. Terminals expect
  // oldest-first (newest at bottom) so the buffer can append naturally.
  const ascending = useMemo(() => {
    const next = [...realtimeEvents];
    next.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return next;
  }, [realtimeEvents]);

  // Bridge: push every new realtime event into the buffer. pushMany is
  // idempotent so re-submitting the full ascending array is safe -- the
  // store dedupes by id.
  useEffect(() => {
    if (ascending.length === 0) return;
    pushMany(ascending);
  }, [ascending, pushMany]);

  // Auto-scroll behavior. Newest events render at the top so the user
  // immediately sees what just happened; scrolling down reveals older
  // activity. Follow-top = "stay pinned to newest".
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [followTop, setFollowTop] = useState(true);
  const [missedCount, setMissedCount] = useState(0);
  const lastSeenLengthRef = useRef(events.length);

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const atTop = el.scrollTop < NEAR_BOTTOM_PX;
    setFollowTop(atTop);
    if (atTop) setMissedCount(0);
  };

  useEffect(() => {
    const length = events.length;
    const previous = lastSeenLengthRef.current;
    const delta = length - previous;
    lastSeenLengthRef.current = length;

    const el = scrollerRef.current;
    if (!el) return;

    // Phase 88.2-03 (D-14): defer the setMissedCount writes off the effect
    // commit phase so RC's "no synchronous setState in effect" passes.
    if (followTop) {
      el.scrollTop = 0;
      Promise.resolve().then(() => setMissedCount(0));
      return;
    }

    if (delta > 0) {
      Promise.resolve().then(() => setMissedCount((c) => c + delta));
    } else if (delta < 0) {
      Promise.resolve().then(() => setMissedCount(0));
    }
  }, [events.length, followTop]);

  const jumpToTop = () => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = 0;
    setFollowTop(true);
    setMissedCount(0);
  };

  // Render newest-first: reverse a shallow copy so the underlying buffer
  // (which pushMany appends to) stays untouched.
  const rendered = useMemo(() => events.slice().reverse(), [events]);

  return (
    <GlassCard className="p-[18px] flex flex-col gap-3">
      <header className="flex justify-between items-center gap-3">
        <span className="inline-flex items-center gap-2 text-[12px] leading-[1.3] tracking-[0.1em] uppercase text-[var(--v7-faint)]">
          <span
            aria-hidden
            className="inline-block w-2 h-2 rounded-full"
            style={{
              background: "var(--v7-teal)",
              animation: "v7-pulse-eyebrow 1.8s ease-in-out infinite",
            }}
          />
          Live event stream
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setPaused(!paused)}
            aria-label={paused ? "Resume event stream" : "Pause event stream"}
            className="inline-flex items-center gap-1 px-3 py-[6px] rounded-[var(--v7-radius-pill)] border border-[var(--v7-line)] text-[12px] leading-none transition-colors"
            style={
              paused
                ? {
                    background: "var(--v7-amber-soft)",
                    color: "var(--v7-amber)",
                  }
                : {
                    background: "rgba(255,255,255,0.04)",
                    color: "var(--v7-muted)",
                  }
            }
          >
            {paused ? <Play size={12} /> : <Pause size={12} />}
            <span>{paused ? "Resume" : "Pause"}</span>
          </button>
          <button
            type="button"
            onClick={clear}
            aria-label="Clear terminal"
            className="inline-flex items-center gap-1 px-3 py-[6px] rounded-[var(--v7-radius-pill)] border border-[var(--v7-line)] text-[12px] leading-none text-[var(--v7-muted)] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <Eraser size={12} />
            <span>Clear</span>
          </button>
        </div>
      </header>

      <div className="relative flex flex-col" style={{ height: 260 }}>
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="v7-terminal-shell flex-1"
          style={{ maxHeight: 260 }}
          role="log"
          aria-live={paused ? "off" : "polite"}
          aria-relevant="additions"
        >
          {rendered.length === 0 ? (
            <div
              className="opacity-70"
              style={{ color: "#6f8ab1" }}
            >
              &gt; Awaiting events...
            </div>
          ) : (
            rendered.map((event, idx) => (
              <TerminalRow
                key={event.id}
                event={event}
                isLatest={idx === 0}
              />
            ))
          )}
        </div>
        {missedCount > 0 && !followTop && (
          <button
            type="button"
            onClick={jumpToTop}
            className="absolute right-3 top-3 px-3 py-[6px] rounded-[var(--v7-radius-pill)] text-[12px] leading-none border transition-transform"
            style={{
              background: "var(--v7-teal-soft)",
              color: "var(--v7-teal)",
              borderColor: "var(--v7-teal)",
            }}
          >
            {missedCount} new event{missedCount === 1 ? "" : "s"} {"\u2191"}
          </button>
        )}
      </div>
    </GlassCard>
  );
}
