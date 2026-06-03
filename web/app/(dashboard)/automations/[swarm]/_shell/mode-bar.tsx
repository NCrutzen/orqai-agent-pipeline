"use client";

// Phase 2 Plan 02-06 — Bulk Review mode-bar chrome (P2-D-08, S1).
// Phase 4 Plan 02 Task 1 — Patterns slot flipped from disabled placeholder
// to an active link to /automations/[swarm]/patterns (P4-D-12).
// Phase 5 Plan 05-03 Task 2 — History slot flipped active (D-08), links to
// /automations/[swarm]/history. All three slots are now active routes.
//
// Three-third top chrome locked by sketch 001: Queue · History · Patterns.
//
// V7 tokens only — no raw hex. Patterns purple sourced from the
// --v7-brand-patterns token in web/app/globals.css.

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

export type ModeBarMode = "queue" | "history" | "patterns";

export interface ModeBarCounts {
  /** e.g. "47" or null. Rendered as `<count><sub>`. */
  queue?: { count: number; sub: string } | null;
  history?: { count: number; sub: string } | null;
  patterns?: { count: number; sub: string } | null;
}

export interface ModeBarProps {
  activeMode?: ModeBarMode;
  /** Swarm-type segment used to construct the Patterns slot href. Optional
   *  for callers that still render the mode-bar outside a swarm route
   *  (Phase 2 tests). When omitted, the Patterns slot falls back to a
   *  non-link visual that stays accessible but is not clickable. */
  swarmType?: string;
  /** Optional per-tab counts + context (sketch 001 lock: "47 blocked",
   *  "312 handled · 7d", "18 candidates · 30d"). When omitted, tabs render
   *  with descriptor names only. */
  counts?: ModeBarCounts;
}

interface SlotSpec {
  mode: ModeBarMode;
  /** Compact label (kept for `aria-label` + back-compat with tests asserting
   *  the bare word). The display shows `name` (with the · descriptor). */
  label: string;
  /** Full sketch-001 descriptor — "Queue · Live", "History · Review",
   *  "Patterns · Learn". */
  name: string;
  glyph: string;
  fg: string;
  bg: string;
  /** Tooltip for the disabled placeholder slots (still applies to History). */
  disabledTooltip?: string;
}

const SLOTS: ReadonlyArray<SlotSpec> = [
  {
    mode: "queue",
    label: "Queue",
    name: "Queue · Live",
    glyph: "▶",
    fg: "var(--v7-brand-primary)",
    bg: "var(--v7-brand-primary-soft)",
  },
  {
    // Phase 5 Plan 05-03 (D-08) — History flipped from disabled placeholder to
    // an active link to /automations/[swarm]/history. Slate-blue chrome
    // retained; no disabledTooltip (its absence auto-activates the Link render
    // path — isDisabled derives from disabledTooltip).
    mode: "history",
    label: "History",
    name: "History · Review",
    glyph: "◷",
    fg: "var(--v7-brand-secondary)",
    bg: "var(--v7-brand-secondary-soft)",
  },
  {
    mode: "patterns",
    label: "Patterns",
    name: "Patterns · Learn",
    glyph: "☆",
    fg: "var(--v7-brand-patterns)",
    bg: "var(--v7-brand-patterns-soft)",
  },
];

export function slotHref(mode: ModeBarMode, swarmType: string | undefined): string | null {
  if (!swarmType) return null;
  if (mode === "queue") return `/automations/${swarmType}/review`;
  if (mode === "patterns") return `/automations/${swarmType}/patterns`;
  // Phase 5 Plan 05-03 (D-08) — History route arm.
  if (mode === "history") return `/automations/${swarmType}/history`;
  return null;
}

export function ModeBar({ activeMode = "queue", swarmType, counts }: ModeBarProps): ReactNode {
  return (
    <nav
      data-testid="mode-bar"
      role="tablist"
      aria-label="Bulk Review mode"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: "var(--space-2)",
        padding: "var(--space-3) var(--space-5)",
        background: "var(--v7-bg-2)",
        borderBottom: "1px solid var(--v7-border)",
      }}
    >
      {SLOTS.map((slot) => {
        const isActive = slot.mode === activeMode;
        const isDisabled = slot.disabledTooltip !== undefined;
        const href = isDisabled ? null : slotHref(slot.mode, swarmType);

        const baseStyle: CSSProperties = {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--space-2)",
          padding: "var(--space-2) var(--space-3)",
          background: isActive ? slot.bg : "transparent",
          color: slot.fg,
          borderBottom: isActive
            ? `2px solid ${slot.fg}`
            : "2px solid transparent",
          borderRadius: "var(--v7-radius-sm)",
          fontSize: 13,
          fontWeight: isActive ? 500 : 400,
          letterSpacing: "0.02em",
          opacity: isDisabled ? 0.5 : 1,
          pointerEvents: isDisabled ? "none" : "auto",
          cursor: isDisabled ? "not-allowed" : "pointer",
          userSelect: "none",
          textDecoration: "none",
        };

        const commonAttrs = {
          "data-testid": `mode-bar-slot-${slot.mode}`,
          "data-active": isActive ? "true" : "false",
          "data-disabled": isDisabled ? "true" : "false",
          role: "tab",
          "aria-selected": isActive,
          "aria-disabled": isDisabled || undefined,
          title: slot.disabledTooltip,
          style: baseStyle,
        };

        const meta = counts?.[slot.mode];
        const inner = (
          <>
            <span aria-hidden="true" style={{ fontSize: 14 }}>{slot.glyph}</span>
            <span
              data-testid={`mode-bar-slot-${slot.mode}-label`}
              style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}
            >
              <span style={{ fontSize: 12, letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 600 }}>
                {slot.name}
              </span>
              {meta && (
                <span
                  data-testid={`mode-bar-slot-${slot.mode}-count`}
                  style={{
                    fontFamily: "var(--v7-font-mono)",
                    fontSize: 11,
                    color: isActive ? slot.fg : "var(--v7-faint)",
                    fontWeight: 500,
                  }}
                >
                  {meta.count}
                  <span style={{ opacity: 0.7, marginLeft: 4 }}>{meta.sub}</span>
                </span>
              )}
            </span>
          </>
        );

        if (href) {
          return (
            <Link key={slot.mode} href={href} {...commonAttrs}>
              {inner}
            </Link>
          );
        }
        return (
          <div key={slot.mode} {...commonAttrs}>
            {inner}
          </div>
        );
      })}
    </nav>
  );
}
