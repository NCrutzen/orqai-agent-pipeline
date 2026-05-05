"use client";

/**
 * Phase 71-04 (REVW-04). Stage 4 handler-output quality widget.
 *
 * Implements UI-SPEC §S4:
 *   - 5 Buttons (1..5) with aria-pressed on the selected one.
 *     sr-only verbose labels: 1 Terrible / 2 Poor / 3 Okay / 4 Good / 5 Perfect.
 *   - Reason Textarea: maxLength={1000}, placeholder
 *     "Why? (optional, max 1000 chars)".
 *   - Char-count footer rendered when reason.length > 800: `{n} / 1000`.
 */
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type Stage4Quality = 1 | 2 | 3 | 4 | 5;

interface Stage4WidgetProps {
  quality: Stage4Quality | null;
  onQualityChange: (q: Stage4Quality) => void;
  reason: string;
  onReasonChange: (r: string) => void;
}

const QUALITY_LABELS: Record<Stage4Quality, string> = {
  1: "Terrible",
  2: "Poor",
  3: "Okay",
  4: "Good",
  5: "Perfect",
};

const QUALITIES: Stage4Quality[] = [1, 2, 3, 4, 5];

export function Stage4Widget({
  quality,
  onQualityChange,
  reason,
  onReasonChange,
}: Stage4WidgetProps) {
  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label="Stage 4 output quality (1 to 5)"
        className="flex items-center gap-2"
      >
        {QUALITIES.map((n) => {
          const selected = quality === n;
          return (
            <Button
              key={n}
              type="button"
              variant={selected ? "default" : "outline"}
              size="sm"
              aria-pressed={selected}
              aria-label={`${n} — ${QUALITY_LABELS[n]}`}
              onClick={() => onQualityChange(n)}
              className="min-w-[36px]"
            >
              <span aria-hidden="true">{n}</span>
              <span className="sr-only">{QUALITY_LABELS[n]}</span>
            </Button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1">
        <Textarea
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          maxLength={1000}
          placeholder="Why? (optional, max 1000 chars)"
          aria-label="Reason for the Stage 4 quality rating"
          rows={3}
        />
        {reason.length > 800 && (
          <span
            className="text-[11px] leading-[1.3] font-mono text-right"
            style={{
              color: "var(--v7-muted)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {reason.length} / 1000
          </span>
        )}
      </div>
    </div>
  );
}
