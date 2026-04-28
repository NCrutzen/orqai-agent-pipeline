"use client";

// Phase 60-04 (D-20). Block-confirmation Dialog using shadcn primitives.
// Copy verbatim from 60-UI-SPEC.md Copywriting Contract.

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Ban } from "lucide-react";
import { blockRule } from "./actions";

interface BlockRuleModalProps {
  ruleId: string;
  ruleKey: string;
}

export function BlockRuleModal({ ruleId, ruleKey }: BlockRuleModalProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    startTransition(async () => {
      await blockRule(ruleId);
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="text-[var(--v7-red)] border-[var(--v7-line)]"
        >
          <Ban className="size-4" />
          Block
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Block rule "${ruleKey}"?`}</DialogTitle>
          <DialogDescription>
            This sets status to manual_block. Future ingest decisions will skip
            auto-action for matching rows. The cron will not auto-promote until
            you unblock.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending}
          >
            Block rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
