"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import type { TerminalEntry } from "@/lib/systems/types";
import { TerminalEntryCard } from "./terminal-entry";
import { EntryInteraction } from "./terminal-input";

interface TerminalPanelProps {
  runId: string;
  entries: TerminalEntry[];
  onEntriesChange: (entries: TerminalEntry[]) => void;
}

/**
 * Main scrollable terminal panel replacing the Sheet drawer.
 * Renders pipeline step entries as card-based log with auto-scroll,
 * "Jump to latest" button, and empty state.
 *
 * Accessibility: `role="log"` with `aria-live="polite"` for screen readers.
 */
export function TerminalPanel({
  runId,
  entries,
  onEntriesChange,
}: TerminalPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const [showJumpButton, setShowJumpButton] = useState(false);
  const prevEntryCountRef = useRef(entries.length);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (entries.length > prevEntryCountRef.current && !userScrolledRef.current) {
      const container = scrollContainerRef.current;
      if (container) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        });
      }
    }
    prevEntryCountRef.current = entries.length;
  }, [entries.length]);

  // Detect user scroll away from bottom
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const isAtBottom =
      container.scrollHeight - container.scrollTop <=
      container.clientHeight + 100;

    if (!isAtBottom) {
      userScrolledRef.current = true;
      setShowJumpButton(true);
    } else {
      userScrolledRef.current = false;
      setShowJumpButton(false);
    }
  }, []);

  // Jump to latest entry
  function handleJumpToLatest() {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
    userScrolledRef.current = false;
    setShowJumpButton(false);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-[var(--v7-glass-border)] px-4 py-3">
        <h2 className="text-[14px] font-semibold text-[var(--v7-text)]">Activity</h2>
        <Badge variant="secondary" className="text-[12px]">
          {entries.length}
        </Badge>
      </div>

      {/* Scrollable entries container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto p-4"
        role="log"
        aria-live="polite"
      >
        {entries.length === 0 ? (
          /* Empty state */
          <GlassCard className="mt-8 py-8 text-center">
            <p className="text-[14px] text-[var(--v7-muted)]">
              Pipeline steps will appear here as they execute.
            </p>
          </GlassCard>
        ) : (
          entries.map((entry) => (
            <TerminalEntryCard key={entry.id} entry={entry}>
              <EntryInteraction entry={entry} />
            </TerminalEntryCard>
          ))
        )}
      </div>

      {/* Jump to latest floating button */}
      {showJumpButton && (
        <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleJumpToLatest}
            className="shadow-lg"
          >
            <ArrowDown className="mr-1.5 size-4" />
            Jump to latest
          </Button>
        </div>
      )}
    </div>
  );
}
