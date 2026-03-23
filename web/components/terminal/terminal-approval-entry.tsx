"use client";

import type { TerminalEntry } from "@/lib/systems/types";
import { ApprovalPanel } from "@/components/approval/approval-panel";

interface TerminalApprovalEntryProps {
  entry: TerminalEntry;
}

/**
 * Renders approval UI within a terminal entry card.
 * Wraps the existing ApprovalPanel component, extracting approval data
 * from the terminal entry's metadata.
 */
export function TerminalApprovalEntry({ entry }: TerminalApprovalEntryProps) {
  const approvalData = entry.metadata?.approvalData as
    | {
        id: string;
        oldContent: string;
        newContent: string;
        explanation: string;
        status: "pending" | "approved" | "rejected" | "expired";
        decidedBy?: string;
        decidedAt?: string;
        comment?: string | null;
      }
    | undefined;

  if (!approvalData) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        Loading approval data...
      </p>
    );
  }

  return (
    <div className="mt-2">
      <ApprovalPanel approval={approvalData} />
    </div>
  );
}
