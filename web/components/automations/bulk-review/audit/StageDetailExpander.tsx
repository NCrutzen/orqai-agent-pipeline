"use client";

/**
 * Phase 82.3 Plan 07 — generic Collapsible wrapper for the per-stage audit
 * panels rendered in the Bulk Review detail-pane sidebar.
 *
 * UI-SPEC §Interaction Contract:
 *   - Inline expand (NOT popover), multiple-open allowed, default closed.
 *   - Trigger copy locked: "Show details" (closed) / "Hide details" (open).
 *   - ChevronDown when closed (muted); ChevronUp when open (brand-primary accent).
 *   - 11px uppercase 600 button label, var(--space-2) gap.
 *   - Content panel: var(--space-3) padding, var(--v7-panel-2) background,
 *     1px top divider in var(--v7-border), margin-top var(--space-2).
 *   - data-testid="stage-detail-expander-{stage}" on Collapsible root.
 *
 * Stage 4 NEVER consumes this — caller (stage-step.tsx) guards on n !== 4.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";

interface Props {
  stage: 0 | 1 | 2 | 3;
  children: ReactNode;
}

export function StageDetailExpander({ stage, children }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-testid={`stage-detail-expander-${stage}`}
    >
      <CollapsibleTrigger
        className="inline-flex items-center bg-transparent border-0 cursor-pointer focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          gap: "var(--space-2)",
          fontSize: "11px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: open ? "var(--v7-brand-primary)" : "var(--v7-muted)",
          outlineColor: "var(--v7-brand-secondary)",
        }}
      >
        {open ? (
          <>
            <ChevronUp
              size={14}
              aria-hidden="true"
              style={{ color: "var(--v7-brand-primary)" }}
            />
            <span>Hide details</span>
          </>
        ) : (
          <>
            <ChevronDown
              size={14}
              aria-hidden="true"
              style={{ color: "var(--v7-muted)" }}
            />
            <span>Show details</span>
          </>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          style={{
            marginTop: "var(--space-2)",
            paddingTop: "var(--space-3)",
            padding: "var(--space-3)",
            background: "var(--v7-panel-2)",
            borderTop: "1px solid var(--v7-border)",
          }}
        >
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
