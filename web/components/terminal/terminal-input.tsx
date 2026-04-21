"use client";

import { useCallback, useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import type { TerminalEntry, AnalysisResult } from "@/lib/systems/types";
import { TerminalApprovalEntry } from "./terminal-approval-entry";
import { TerminalReviewEntry } from "./terminal-review-entry";
import { TerminalSOPPreview } from "./terminal-sop-preview";
import { TerminalScreenshotUpload } from "./terminal-screenshot-upload";
import { AnnotationOverlay } from "@/components/annotation/annotation-overlay";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { submitSOPUpload } from "@/lib/systems/actions";

interface EntryInteractionProps {
  entry: TerminalEntry;
}

/**
 * Renders type-specific inline UI within a terminal entry card.
 * Acts as a dispatcher -- each entry type gets its own UI treatment.
 *
 * Plan 02 implements: status, approval, prompt.
 * Plan 03 adds: upload (SOP and screenshots).
 * Plan 04 will add: annotation-review.
 */
export function EntryInteraction({ entry }: EntryInteractionProps) {
  switch (entry.type) {
    case "status":
      // Status entries only show the card text (rendered by TerminalEntryCard)
      return null;

    case "approval":
      return <TerminalApprovalEntry entry={entry} />;

    case "review":
      return <TerminalReviewEntry entry={entry} />;

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

    case "upload": {
      const uploadType = entry.metadata?.uploadType as string | undefined;

      if (uploadType === "sop") {
        return (
          <SOPUploadInteraction
            runId={entry.metadata?.runId as string}
            taskId={entry.metadata?.taskId as string}
          />
        );
      }

      if (uploadType === "screenshots") {
        return (
          <ScreenshotUploadInteraction
            runId={entry.metadata?.runId as string}
            taskId={entry.metadata?.taskId as string}
            sopText={entry.metadata?.sopText as string}
          />
        );
      }

      return null;
    }

    case "annotation-review": {
      // Annotation review entry: opens full-width overlay for step confirmation.
      // Entry metadata is populated by the RunDetailClient broadcast handler when
      // the annotation-review pipeline step enters "waiting" status. The handler
      // fetches automation_task data (analysis_result, sop_text) from Supabase
      // and generates public URLs for screenshots in storage.
      const taskId = entry.metadata?.taskId as string;
      const runId = entry.metadata?.runId as string;
      const analysisResult = entry.metadata?.analysisResult as AnalysisResult | undefined;
      const sopText = entry.metadata?.sopText as string | undefined;
      const screenshotUrls = entry.metadata?.screenshotUrls as
        | Array<{ ref: string; url: string }>
        | undefined;

      if (!taskId || !runId || !analysisResult || !sopText || !screenshotUrls) {
        return (
          <p className="mt-2 text-[14px] text-[var(--v7-muted)]">
            Waiting for AI analysis to complete...
          </p>
        );
      }

      return (
        <AnnotationReviewInteraction
          taskId={taskId}
          runId={runId}
          analysisResult={analysisResult}
          sopText={sopText}
          screenshotUrls={screenshotUrls}
        />
      );
    }

    case "user-input":
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// SOP Upload Interaction (upload .md file or paste markdown)
// ---------------------------------------------------------------------------

function SOPUploadInteraction({
  runId,
  taskId,
}: {
  runId: string;
  taskId: string;
}) {
  const [sopContent, setSopContent] = useState("");
  const [phase, setPhase] = useState<"input" | "preview" | "confirmed" | "screenshots">("input");
  const [screenshotPaths, setScreenshotPaths] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result;
        if (typeof text === "string") {
          setSopContent(text);
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    []
  );

  const handleSubmitSOP = useCallback(() => {
    if (sopContent.trim().length >= 10) {
      setPhase("preview");
    }
  }, [sopContent]);

  const handleConfirm = useCallback(() => {
    setPhase("confirmed");
    // Transition to screenshot upload phase
    setPhase("screenshots");
  }, []);

  const handleScreenshotsComplete = useCallback(
    async (paths: string[]) => {
      setScreenshotPaths(paths);
      // Submit SOP + screenshot paths to Inngest
      await submitSOPUpload(runId, taskId, sopContent, paths);
    },
    [runId, taskId, sopContent]
  );

  if (phase === "screenshots") {
    return (
      <div className="mt-3">
        <TerminalSOPPreview
          markdown={sopContent}
          onConfirm={() => {}}
          confirmed={true}
        />
        <TerminalScreenshotUpload
          runId={runId}
          taskId={taskId}
          onUploadComplete={handleScreenshotsComplete}
          disabled={screenshotPaths.length > 0}
        />
      </div>
    );
  }

  if (phase === "preview") {
    return (
      <TerminalSOPPreview
        markdown={sopContent}
        onConfirm={handleConfirm}
        confirmed={false}
      />
    );
  }

  // Input phase: tabs for upload file or paste markdown
  return (
    <div className="mt-3">
      <p className="mb-2 text-[14px] text-[var(--v7-muted)]">
        Upload your SOP document (.md) or paste the markdown content directly
        below.
      </p>

      <Tabs defaultValue="paste">
        <TabsList>
          <TabsTrigger value="upload">
            <Upload className="size-3.5 mr-1" />
            Upload File
          </TabsTrigger>
          <TabsTrigger value="paste">
            <FileText className="size-3.5 mr-1" />
            Paste Markdown
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-3">
          <div
            className="flex min-h-[96px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--v7-radius-inner)] border-2 border-dashed border-[var(--v7-glass-border)] p-4 transition-colors hover:border-[var(--v7-muted)]"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            tabIndex={0}
            role="button"
            aria-label="Drop .md file here or click to browse"
          >
            <Upload className="size-5 text-[var(--v7-muted)]" />
            <p className="text-[14px] text-[var(--v7-muted)]">
              Drop .md file here or click to browse
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,text/markdown"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
          {sopContent && (
            <p className="mt-2 text-[12px] text-[var(--v7-faint)]">
              File loaded ({sopContent.length} characters)
            </p>
          )}
        </TabsContent>

        <TabsContent value="paste" className="mt-3">
          <Textarea
            placeholder="Paste your SOP markdown here..."
            rows={6}
            value={sopContent}
            onChange={(e) => setSopContent(e.target.value)}
          />
        </TabsContent>
      </Tabs>

      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          onClick={handleSubmitSOP}
          disabled={sopContent.trim().length < 10}
        >
          Submit SOP
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screenshot Upload Interaction (standalone, for entries of uploadType "screenshots")
// ---------------------------------------------------------------------------

function ScreenshotUploadInteraction({
  runId,
  taskId,
  sopText,
}: {
  runId: string;
  taskId: string;
  sopText: string;
}) {
  const [submitted, setSubmitted] = useState(false);

  const handleUploadComplete = useCallback(
    async (paths: string[]) => {
      await submitSOPUpload(runId, taskId, sopText || "", paths);
      setSubmitted(true);
    },
    [runId, taskId, sopText]
  );

  return (
    <TerminalScreenshotUpload
      runId={runId}
      taskId={taskId}
      onUploadComplete={handleUploadComplete}
      disabled={submitted}
    />
  );
}

// ---------------------------------------------------------------------------
// Annotation Review Interaction (opens full-width overlay for step review)
// ---------------------------------------------------------------------------

function AnnotationReviewInteraction({
  taskId,
  runId,
  analysisResult,
  sopText,
  screenshotUrls,
}: {
  taskId: string;
  runId: string;
  analysisResult: AnalysisResult;
  sopText: string;
  screenshotUrls: Array<{ ref: string; url: string }>;
}) {
  const [overlayOpen, setOverlayOpen] = useState(false);

  return (
    <div className="mt-2">
      <GlassCard className="p-3">
        <p className="text-[14px] text-[var(--v7-text)]">
          AI has analyzed your SOP and screenshots. Review the identified
          automation steps.
        </p>
        <div className="mt-2">
          <Button size="sm" onClick={() => setOverlayOpen(true)}>
            Review Steps
          </Button>
        </div>
      </GlassCard>

      <AnnotationOverlay
        open={overlayOpen}
        onOpenChange={setOverlayOpen}
        taskId={taskId}
        runId={runId}
        analysisResult={analysisResult}
        sopText={sopText}
        screenshotUrls={screenshotUrls}
      />
    </div>
  );
}
