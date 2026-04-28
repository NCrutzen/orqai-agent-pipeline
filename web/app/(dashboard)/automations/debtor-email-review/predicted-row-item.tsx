"use client";

// Phase 60-05 (D-16/D-17). Per-row Approve / Reject buttons. The action
// path is verdict-write only (60-06): clicking Approve or Reject calls
// the recordVerdict server-action, which flips automation_runs.status to
// 'feedback' and fires the classifier/verdict.recorded Inngest event for
// async Outlook side-effects. The row leaves the queue on the resulting
// broadcast invalidation — no client-side optimistic removal needed.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { recordVerdict } from "./actions";
import type { PredictedRow } from "./page";

type RowStatus = "predicted" | "approving" | "rejecting" | "failed";

interface PredictedRowItemProps {
  row: PredictedRow;
}

interface ResultPayload {
  message_id?: string;
  source_mailbox?: string;
  subject?: string;
  from?: string;
  fromName?: string;
  predicted?: { rule?: string; category?: string };
}

function readResult(row: PredictedRow): ResultPayload {
  const r = row.result as ResultPayload | null;
  return r ?? {};
}

function statusPillCopy(status: RowStatus): string {
  switch (status) {
    case "predicted":
      return "Predicted";
    case "approving":
      return "Approving…";
    case "rejecting":
      return "Rejecting…";
    case "failed":
      return "Action failed — Retry";
  }
}

function statusPillColor(status: RowStatus): {
  bg: string;
  fg: string;
} {
  if (status === "failed") {
    return { bg: "rgba(181,69,78,0.13)", fg: "var(--v7-red)" };
  }
  if (status === "approving" || status === "rejecting") {
    return { bg: "var(--v7-amber-soft)", fg: "var(--v7-amber)" };
  }
  return { bg: "var(--v7-panel-2)", fg: "var(--v7-muted)" };
}

export function PredictedRowItem({ row }: PredictedRowItemProps) {
  const [status, setStatus] = useState<RowStatus>("predicted");
  const [, startTransition] = useTransition();
  const result = readResult(row);
  const subject = result.subject ?? "(no subject)";
  const sender = result.fromName
    ? `${result.fromName} <${result.from ?? "unknown"}>`
    : (result.from ?? "unknown sender");
  const ruleKey = result.predicted?.rule ?? "no_match";
  const predictedCategory = result.predicted?.category ?? row.topic ?? "unknown";

  const submit = (decision: "approve" | "reject") => {
    setStatus(decision === "approve" ? "approving" : "rejecting");
    startTransition(async () => {
      try {
        await recordVerdict({
          automation_run_id: row.id,
          rule_key: ruleKey,
          decision,
          message_id: result.message_id ?? "",
          source_mailbox: result.source_mailbox ?? "",
          entity: row.entity ?? "",
          predicted_category: predictedCategory,
        });
        // Row vanishes via broadcast → keep status visible until then.
      } catch {
        setStatus("failed");
        toast.error("Couldn't record verdict — try again");
      }
    });
  };

  const pill = statusPillColor(status);
  const disabled = status === "approving" || status === "rejecting";

  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3 rounded-[var(--v7-radius-sm)] border border-[var(--v7-line)] bg-[var(--v7-panel-2)]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="px-[9px] py-[6px] rounded-[var(--v7-radius-pill)] text-[11.8px] leading-[1.2] border border-[var(--v7-line)]"
            style={{ background: pill.bg, color: pill.fg }}
            aria-label={`Status: ${statusPillCopy(status)}`}
          >
            {statusPillCopy(status)}
          </span>
          <span className="text-[14px] font-semibold leading-[1.4] truncate">
            {subject}
          </span>
        </div>
        <div className="text-[12px] text-[var(--v7-muted)] mt-1 truncate">
          {sender} · rule{" "}
          <code className="font-mono">{ruleKey}</code> · {new Date(row.created_at).toLocaleString("en-GB")}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0" style={{ gap: 8 }}>
        <Button
          onClick={() => submit("approve")}
          disabled={disabled}
          aria-label={`Approve predicted classification for email from ${sender} matching rule ${ruleKey}`}
          style={{
            background: "var(--v7-brand-primary)",
            color: "#fff",
          }}
        >
          Approve
        </Button>
        <Button
          variant="outline"
          onClick={() => submit("reject")}
          disabled={disabled}
          aria-label={`Reject predicted classification for email from ${sender} matching rule ${ruleKey}`}
          style={{
            borderColor: "var(--v7-red)",
            color: "var(--v7-red)",
          }}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}
