"use client";

/**
 * Phase 71-04 (REVW-01..06). Override confirmation modal.
 *
 * Implements UI-SPEC §Confirmation modal (CONTEXT D-16):
 *   Trigger conditions:
 *     1. Stage 2 override with re_run_downstream=true.
 *     2. Stage 3 override (always — replaces handler).
 *     3. ≥2 axes dirty in the same submission (compound).
 *
 *   Copy table (verbatim from UI-SPEC):
 *     - Title:                 "Confirm override"
 *     - Body — Stage 2 re-run: "Re-running downstream stages will spend additional
 *                              LLM tokens (~€0.02 per email) and replace the existing
 *                              draft. The original pipeline events stay in audit
 *                              history. Continue?"
 *     - Body — Stage 3:        "This dispatches a new {handler_key} handler. The
 *                              original Stage 4 output will be kept as audit but not
 *                              re-used. The iController draft (if any) is NOT auto-
 *                              updated — you'll need to update it separately."
 *     - Body — multi-axis:     "You're overriding {N} stages in one submission ({axis
 *                              list}). Each axis emits its own learning signal.
 *                              Continue?"
 *     - Confirm:               "Yes, submit override" (primary, brand-primary fill)
 *     - Dismiss:               "Keep editing" (ghost)
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type OverrideConfirmTrigger =
  | "stage_2_rerun"
  | "stage_3"
  | "multi_axis";

interface OverrideConfirmDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  trigger: OverrideConfirmTrigger;
  /** Trigger-specific extras: handler_key for stage_3; axis_count + axis_list for multi_axis. */
  extra: {
    handler_key?: string;
    axis_count?: number;
    axis_list?: string[];
  };
  onConfirm: () => void;
  onDismiss: () => void;
}

function bodyFor(
  trigger: OverrideConfirmTrigger,
  extra: OverrideConfirmDialogProps["extra"],
): string {
  if (trigger === "stage_2_rerun") {
    return "Re-running downstream stages will spend additional LLM tokens (~€0.02 per email) and replace the existing draft. The original pipeline events stay in audit history. Continue?";
  }
  if (trigger === "stage_3") {
    const handler = extra.handler_key ?? "selected";
    return `This dispatches a new ${handler} handler. The original Stage 4 output will be kept as audit but not re-used. The iController draft (if any) is NOT auto-updated — you'll need to update it separately.`;
  }
  // multi_axis
  const n = extra.axis_count ?? (extra.axis_list?.length ?? 2);
  const list = extra.axis_list?.join(", ") ?? "";
  return `You're overriding ${n} stages in one submission (${list}). Each axis emits its own learning signal. Continue?`;
}

export function OverrideConfirmDialog({
  open,
  onOpenChange,
  trigger,
  extra,
  onConfirm,
  onDismiss,
}: OverrideConfirmDialogProps) {
  const body = bodyFor(trigger, extra);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm override</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onDismiss}>
            Keep editing
          </Button>
          <Button variant="default" onClick={onConfirm}>
            Yes, submit override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
