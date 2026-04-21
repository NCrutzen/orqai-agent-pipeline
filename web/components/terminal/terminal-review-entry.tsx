"use client";

import { useState } from "react";
import { Check, MessageSquare, Loader2 } from "lucide-react";
import type { TerminalEntry } from "@/lib/systems/types";
import { submitReviewResponse } from "@/lib/pipeline/review";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GlassCard } from "@/components/ui/glass-card";

interface TerminalReviewEntryProps {
  entry: TerminalEntry;
}

interface ReviewAgent {
  name: string;
  role: string;
  tools: string[];
}

/**
 * Renders a review interaction within the terminal panel.
 * Shows a summary of the proposed swarm and lets the user confirm or give feedback.
 * Used after the architect stage to review the designed agent swarm before continuing.
 */
export function TerminalReviewEntry({ entry }: TerminalReviewEntryProps) {
  const [mode, setMode] = useState<"idle" | "feedback" | "submitting" | "done">("idle");
  const [feedbackText, setFeedbackText] = useState("");

  const runId = entry.metadata?.runId as string;
  const stepName = entry.metadata?.stepName as string;
  const agents = entry.metadata?.agents as ReviewAgent[] | undefined;
  const decided = entry.metadata?.decided as boolean | undefined;

  if (decided) {
    const decision = entry.metadata?.decision as string;
    return (
      <div className="mt-2 rounded-[var(--v7-radius-sm)] border border-[var(--v7-glass-border)] bg-[var(--v7-panel-2)] p-3">
        <p className="text-[14px] text-[var(--v7-muted)]">
          {decision === "confirmed"
            ? "Swarm architecture confirmed. Continuing..."
            : "Feedback submitted. Re-designing swarm..."}
        </p>
      </div>
    );
  }

  if (!agents || agents.length === 0) {
    return (
      <p className="mt-2 text-[14px] text-[var(--v7-muted)]">
        Waiting for swarm architecture...
      </p>
    );
  }

  async function handleConfirm() {
    setMode("submitting");
    try {
      await submitReviewResponse(runId, stepName, "confirmed");
      setMode("done");
    } catch {
      setMode("idle");
    }
  }

  async function handleSubmitFeedback() {
    if (!feedbackText.trim()) return;
    setMode("submitting");
    try {
      await submitReviewResponse(runId, stepName, "feedback", feedbackText);
      setMode("done");
    } catch {
      setMode("feedback");
    }
  }

  if (mode === "done") {
    return (
      <div className="mt-2 rounded-[var(--v7-radius-sm)] border border-[var(--v7-glass-border)] bg-[var(--v7-panel-2)] p-3">
        <p className="text-[14px] text-[var(--v7-muted)]">
          Response submitted. Pipeline resuming...
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-3">
      {/* Agent summary cards */}
      <div className="space-y-2">
        {agents.map((agent) => (
          <GlassCard key={agent.name} className="p-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[14px] font-medium text-[var(--v7-text)]">{agent.name}</p>
                <p className="text-[12px] text-[var(--v7-muted)]">{agent.role}</p>
              </div>
              {agent.tools.length > 0 && (
                <span className="text-[12px] text-[var(--v7-muted)]">
                  {agent.tools.length} tool{agent.tools.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Action buttons */}
      {mode === "idle" && (
        <div className="flex gap-2">
          <Button size="sm" onClick={handleConfirm}>
            <Check className="mr-1.5 size-3.5" />
            Looks good, continue
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMode("feedback")}
          >
            <MessageSquare className="mr-1.5 size-3.5" />
            I have feedback
          </Button>
        </div>
      )}

      {/* Feedback text area */}
      {mode === "feedback" && (
        <div className="space-y-2">
          <Textarea
            placeholder="Describe what you'd like changed about the swarm architecture..."
            rows={3}
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSubmitFeedback}
              disabled={!feedbackText.trim()}
            >
              Submit feedback
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setMode("idle");
                setFeedbackText("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Submitting state */}
      {mode === "submitting" && (
        <div className="flex items-center gap-2 text-[14px] text-[var(--v7-muted)]">
          <Loader2 className="size-3.5 animate-spin" />
          Submitting...
        </div>
      )}
    </div>
  );
}
