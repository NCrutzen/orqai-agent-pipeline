"use client";

/**
 * Phase 82.3 Plan 09 — RawJsonToggle sub-collapsible for per-stage audit panels.
 *
 * UI-SPEC §Interaction Contract → Raw JSON sub-toggle:
 *   - Inline collapsible code block (NOT modal).
 *   - Trigger copy locked: "Show raw JSON" (closed) / "Hide raw JSON" (open).
 *   - Trigger: Geist Mono 12px, muted closed, brand-primary accent on hover/focus.
 *   - Content: <pre><code> of JSON.stringify(raw, null, 2)
 *       - Geist Mono 12px
 *       - max-height 240px, overflow-y auto
 *       - background var(--v7-panel-2), 1px solid var(--v7-border)
 *       - padding var(--space-3), border-radius 4px
 *   - Default closed.
 *   - data-testid="raw-json-toggle" on root, "raw-json-content" on <pre>.
 */
import { useState } from "react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";

interface Props {
  raw: Record<string, unknown>;
}

export function RawJsonToggle({ raw }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-testid="raw-json-toggle"
    >
      <CollapsibleTrigger
        className="inline-flex items-center bg-transparent border-0 cursor-pointer focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 hover:[color:var(--v7-brand-primary)] focus-visible:[color:var(--v7-brand-primary)]"
        style={{
          fontFamily: "var(--font-geist-mono, monospace)",
          fontSize: "12px",
          lineHeight: 1.5,
          color: open ? "var(--v7-brand-primary)" : "var(--v7-muted, #8a93a3)",
          outlineColor: "var(--v7-brand-secondary)",
          padding: 0,
        }}
      >
        {open ? "Hide raw JSON" : "Show raw JSON"}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre
          data-testid="raw-json-content"
          style={{
            fontFamily: "var(--font-geist-mono, monospace)",
            fontSize: "12px",
            lineHeight: 1.5,
            maxHeight: "240px",
            overflowY: "auto",
            background: "var(--v7-panel-2, #151d29)",
            border: "1px solid var(--v7-border, #1f2a3a)",
            padding: "var(--space-3, 12px)",
            borderRadius: "4px",
            marginTop: "var(--space-2, 8px)",
            color: "var(--text, #e6ebf2)",
            whiteSpace: "pre",
          }}
        >
          <code>{JSON.stringify(raw, null, 2)}</code>
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
