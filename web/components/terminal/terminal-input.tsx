"use client";

import type { TerminalEntry } from "@/lib/systems/types";
import { TerminalApprovalEntry } from "./terminal-approval-entry";
import { Button } from "@/components/ui/button";

interface EntryInteractionProps {
  entry: TerminalEntry;
}

/**
 * Renders type-specific inline UI within a terminal entry card.
 * Acts as a dispatcher -- each entry type gets its own UI treatment.
 *
 * Plan 02 implements: status, approval, prompt.
 * Plan 03/04 will add: upload, annotation-review.
 */
export function EntryInteraction({ entry }: EntryInteractionProps) {
  switch (entry.type) {
    case "status":
      // Status entries only show the card text (rendered by TerminalEntryCard)
      return null;

    case "approval":
      return <TerminalApprovalEntry entry={entry} />;

    case "prompt": {
      // Render action buttons if present in metadata
      const actions = entry.metadata?.actions as
        | Array<{ label: string; action: string }>
        | undefined;

      if (!actions || actions.length === 0) return null;

      return (
        <div className="mt-2 flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button
              key={action.action}
              variant="outline"
              size="sm"
            >
              {action.label}
            </Button>
          ))}
        </div>
      );
    }

    // Upload and annotation-review types will be added in Plan 03/04
    case "upload":
    case "annotation-review":
    case "user-input":
    default:
      return null;
  }
}
