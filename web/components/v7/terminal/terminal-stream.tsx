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

  // Auto-scroll behavior.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [followBottom, setFollowBottom] = useState(true);
  const [missedCount, setMissedCount] = useState(0);
  const lastSeenLengthRef = useRef(events.length);

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < NEAR_BOTTOM_PX;
    setFollowBottom(atBottom);
    if (atBottom) setMissedCount(0);
  };

  useEffect(() => {
    const length = events.length;
    const previous = lastSeenLengthRef.current;
    const delta = length - previous;
    lastSeenLengthRef.current = length;

    const el = scrollerRef.current;
    if (!el) return;

    if (followBottom) {
      el.scrollTop = el.scrollHeight;
      setMissedCount(0);
      return;
    }

    if (delta > 0) {
      setMissedCount((c) => c + delta);
    } else if (delta < 0) {
      // Buffer was cleared or evicted -- reset the counter.
      setMissedCount(0);
    }
  }, [events.length, followBottom]);

  const jumpToBottom = () => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setFollowBottom(true);
    setMissedCount(0);
  };

  const lastIndex = events.length - 1;

  return (
    <GlassCard className="p-[18px] flex flex-col gap-[14px] min-h-[280px] h-full">
      <header className="flex justify-between items-start gap-3">
        <div className="flex flex-col gap-2">
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
          <span className="font-[var(--font-cabinet)] text-[20px] leading-[1.2] font-bold text-[var(--v7-text)]">
            Latest events from the swarm
          </span>
        </div>
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

      <div className="relative flex-1 min-h-[220px] flex flex-col">
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="v7-terminal-shell flex-1"
          role="log"
          aria-live={paused ? "off" : "polite"}
          aria-relevant="additions"
        >
          {events.length === 0 ? (
            <div
              className="opacity-70"
              style={{ color: "#6f8ab1" }}
            >
              &gt; Awaiting events...
            </div>
          ) : (
            events.map((event, idx) => (
              <TerminalRow
                key={event.id}
                event={event}
                isLatest={idx === lastIndex}
              />
            ))
          )}
        </div>
        {missedCount > 0 && !followBottom && (
          <button
            type="button"
            onClick={jumpToBottom}
            className="absolute right-3 bottom-3 px-3 py-[6px] rounded-[var(--v7-radius-pill)] text-[12px] leading-none border transition-transform"
            style={{
              background: "var(--v7-teal-soft)",
              color: "var(--v7-teal)",
              borderColor: "var(--v7-teal)",
            }}
          >
            {missedCount} new event{missedCount === 1 ? "" : "s"} {"\u2193"}
          </button>
        )}
      </div>
    </GlassCard>
  );
}
