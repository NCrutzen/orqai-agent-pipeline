"use client";

// Phase 56.7-03 (D-08, generic). Generic version of the race-cohort
// banner. Was originally debtor-email-review/race-cohort-banner.tsx
// (Phase 60-05). recordVerdict now requires `swarm_type` (Pitfall 5);
// banner threads it from the dynamic-segment route.
//
// Renders only when:
//   1. selection.rule is set, AND
//   2. promotedToday includes that rule_key, AND
//   3. count > 0

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { recordVerdict } from "./actions";

export interface RaceCohortRow {
  automation_run_id: string;
  message_id: string;
  source_mailbox: string;
  entity: string;
  predicted_category: string;
}

interface RaceCohortBannerProps {
  selection: { rule?: string };
  promotedToday: Array<{ rule_key: string; promoted_at: string }>;
  count: number;
  rows?: RaceCohortRow[];
  swarmType: string;
}

export function RaceCohortBanner({
  selection,
  promotedToday,
  count,
  rows,
  swarmType,
}: RaceCohortBannerProps) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  if (!selection.rule || count <= 0) return null;

  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const promoted = promotedToday.find(
    (p) =>
      p.rule_key === selection.rule &&
      new Date(p.promoted_at).getTime() >= todayMidnight.getTime(),
  );
  if (!promoted) return null;

  const ruleKey = selection.rule;
  const ctaText = `Bulk-clear remaining ${count} predicted rows for promoted rule "${ruleKey}"`;
  const heading = `Bulk-clear ${count} rows?`;
  const body = `These rows were predicted before "${ruleKey}" was auto-promoted. Approving them runs categorize+archive on each. This cannot be undone.`;
  const confirmCta = `Approve all ${count}`;

  const handleConfirm = () => {
    if (!rows || rows.length === 0) return;
    startTransition(async () => {
      setProgress({ done: 0, total: rows.length });
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        try {
          await recordVerdict({
            swarm_type: swarmType,
            automation_run_id: r.automation_run_id,
            rule_key: ruleKey,
            decision: "approve",
            message_id: r.message_id,
            source_mailbox: r.source_mailbox,
            entity: r.entity,
            predicted_category: r.predicted_category,
          });
        } catch {
          // Continue — failures surface on the per-row side via broadcast.
        }
        setProgress({ done: i + 1, total: rows.length });
      }
      setOpen(false);
      setProgress(null);
    });
  };

  return (
    <div
      className="sticky top-0 z-10 mb-3 rounded-[var(--v7-radius-sm)] border border-[var(--v7-line)] px-4 py-3"
      style={{ background: "var(--v7-blue-soft)" }}
      role="status"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] leading-[1.5] text-[var(--v7-text)]">
          Rule <code className="font-mono text-[12px]">{ruleKey}</code> was
          auto-promoted today. The classifier will whitelist new matches
          from now on, but {count} previously-predicted row{count === 1 ? "" : "s"} are
          still queued for review.
        </p>
        <Button
          variant="default"
          onClick={() => setOpen(true)}
          aria-label={ctaText}
        >
          {ctaText}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{heading}</DialogTitle>
            <DialogDescription>{body}</DialogDescription>
          </DialogHeader>
          {progress && (
            <p className="text-[13px] text-[var(--v7-muted)]">
              {progress.done} of {progress.total} cleared…
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={pending || !rows || rows.length === 0}
            >
              {confirmCta}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
