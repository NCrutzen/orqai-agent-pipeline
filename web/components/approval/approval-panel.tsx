"use client";

import { useState } from "react";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ApprovalDiffViewer } from "./diff-viewer";
import { ApprovalBadge, type ApprovalStatus } from "./approval-badge";
import { submitApprovalDecision } from "@/lib/pipeline/approval";
import { toast } from "sonner";

interface ApprovalData {
  id: string;
  oldContent: string;
  newContent: string;
  explanation: string;
  status: ApprovalStatus;
  decidedBy?: string;
  decidedAt?: string;
  comment?: string | null;
}

interface ApprovalPanelProps {
  approval: ApprovalData;
  containerWidth?: number;
}

export function ApprovalPanel({ approval, containerWidth }: ApprovalPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [comment, setComment] = useState("");
  const [localStatus, setLocalStatus] = useState<ApprovalStatus>(approval.status);
  const [localDecision, setLocalDecision] = useState<"approved" | "rejected" | null>(null);

  const isPending = localStatus === "pending";
  const maxCommentLength = 500;

  async function handleDecision(decision: "approved" | "rejected") {
    setIsSubmitting(true);
    // Optimistic UI: show decided state immediately
    setLocalStatus(decision);
    setLocalDecision(decision);

    try {
      await submitApprovalDecision(
        approval.id,
        decision,
        comment.trim() || undefined
      );
      toast.success(
        decision === "approved"
          ? "Changes approved -- pipeline resuming"
          : "Changes rejected -- pipeline continuing without changes"
      );
    } catch (error) {
      // Revert optimistic update
      setLocalStatus("pending");
      setLocalDecision(null);
      const message = error instanceof Error ? error.message : "Could not submit decision. Check your connection and try again.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Decided state (read-only) */}
      {!isPending && (
        <div className="flex items-center gap-2">
          <ApprovalBadge status={localStatus} />
          {approval.comment && (
            <p className="text-sm italic text-muted-foreground">
              &quot;{approval.comment}&quot;
            </p>
          )}
          {localDecision && comment.trim() && (
            <p className="text-sm italic text-muted-foreground">
              &quot;{comment.trim()}&quot;
            </p>
          )}
        </div>
      )}

      {/* Explanation card */}
      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold">What changed and why</h4>
          <p className="mt-1 text-sm">{approval.explanation}</p>
        </CardContent>
      </Card>

      <Separator />

      {/* Diff viewer */}
      <ApprovalDiffViewer
        oldContent={approval.oldContent}
        newContent={approval.newContent}
        containerWidth={containerWidth}
      />

      {/* Action area (only when pending) */}
      {isPending && (
        <>
          <Separator />

          {/* Comment field */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="approval-comment" className="text-sm font-semibold">
                Comment
              </label>
              <span className="text-xs text-muted-foreground">Optional</span>
            </div>
            <Textarea
              id="approval-comment"
              placeholder="Add a note about your decision (optional)"
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, maxCommentLength))}
              rows={3}
              className="mt-1 resize-y"
              disabled={isSubmitting}
            />
            {comment.length > 0 && (
              <p className="mt-1 text-right text-xs text-muted-foreground">
                {comment.length} / {maxCommentLength}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => handleDecision("rejected")}
              disabled={isSubmitting}
              className="text-destructive"
            >
              {isSubmitting && localDecision === "rejected" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <XCircle className="size-4" />
              )}
              {isSubmitting && localDecision === "rejected" ? "Submitting..." : "Reject Changes"}
            </Button>
            <Button
              onClick={() => handleDecision("approved")}
              disabled={isSubmitting}
            >
              {isSubmitting && localDecision === "approved" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle className="size-4" />
              )}
              {isSubmitting && localDecision === "approved" ? "Submitting..." : "Approve Changes"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
