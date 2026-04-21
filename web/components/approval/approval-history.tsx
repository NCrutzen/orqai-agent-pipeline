"use client";

import { GlassCard } from "@/components/ui/glass-card";
import { Separator } from "@/components/ui/separator";
import { ApprovalBadge, type ApprovalStatus } from "./approval-badge";

interface ApprovalEntry {
  id: string;
  stepName: string;
  status: ApprovalStatus;
  decidedBy?: string;
  decidedAt?: string;
  comment?: string | null;
  createdAt: string;
}

interface ApprovalHistoryProps {
  entries: ApprovalEntry[];
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function ApprovalHistory({ entries }: ApprovalHistoryProps) {
  if (entries.length === 0) {
    return (
      <GlassCard className="p-5">
        <div className="pb-3">
          <h3 className="text-[14px] font-semibold text-[var(--v7-text)]">Approval History</h3>
        </div>
        <div>
          <p className="text-[14px] text-[var(--v7-muted)]">No approvals needed</p>
          <p className="text-[12px] text-[var(--v7-faint)] mt-1">
            This pipeline run has not requested any changes for review.
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-5">
      <div className="pb-3">
        <h3 className="text-[14px] font-semibold text-[var(--v7-text)]">Approval History</h3>
      </div>
      <div>
        <div className="space-y-3">
          {entries.map((entry, index) => (
            <div key={entry.id}>
              <div className="flex items-center gap-2">
                <ApprovalBadge status={entry.status} />
                <span className="text-[14px] font-semibold text-[var(--v7-text)]">{entry.stepName}</span>
              </div>
              {entry.status === "expired" ? (
                <p className="mt-1 text-[12px] text-[var(--v7-muted)]">
                  Expired after 7 days -- no decision made
                </p>
              ) : entry.decidedBy ? (
                <p className="mt-1 text-[12px] text-[var(--v7-muted)]">
                  {entry.status === "approved" ? "Approved" : "Rejected"} by{" "}
                  {entry.decidedBy} -- {entry.decidedAt ? formatRelativeTime(entry.decidedAt) : ""}
                </p>
              ) : null}
              {entry.comment && (
                <p className="mt-1 text-[14px] italic text-[var(--v7-muted)]">
                  &quot;{entry.comment}&quot;
                </p>
              )}
              {index < entries.length - 1 && <Separator className="mt-3" />}
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}
