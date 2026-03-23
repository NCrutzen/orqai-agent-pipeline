"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AnnotationSideBySide } from "@/components/annotation/annotation-side-by-side";
import { toast } from "sonner";
import type {
  AnalysisResult,
  ConfirmedStep,
} from "@/lib/systems/types";

interface AnnotationOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  runId: string;
  analysisResult: AnalysisResult;
  sopText: string;
  screenshotUrls: Array<{ ref: string; url: string }>;
}

export function AnnotationOverlay({
  open,
  onOpenChange,
  taskId,
  runId,
  analysisResult,
  sopText,
  screenshotUrls,
}: AnnotationOverlayProps) {
  const [confirmedSteps, setConfirmedSteps] = useState<ConfirmedStep[]>(() =>
    analysisResult.steps.map((step) => ({
      stepNumber: step.stepNumber,
      action: step.action,
      targetElement: step.targetElement,
      expectedResult: step.expectedResult,
      screenshotRef: step.screenshotRef,
      confirmed: false,
    }))
  );
  const [currentAnalysis, setCurrentAnalysis] =
    useState<AnalysisResult>(analysisResult);
  const [finalizing, setFinalizing] = useState(false);

  const confirmedCount = useMemo(
    () => confirmedSteps.filter((s) => s.confirmed).length,
    [confirmedSteps]
  );

  const totalSteps = confirmedSteps.length;

  const allConfirmed = useMemo(
    () => confirmedSteps.length > 0 && confirmedSteps.every((s) => s.confirmed),
    [confirmedSteps]
  );

  const handleStepsChange = useCallback((steps: ConfirmedStep[]) => {
    setConfirmedSteps(steps);
  }, []);

  const handleFinalize = useCallback(async () => {
    setFinalizing(true);
    try {
      // Dynamic import server actions to avoid bundling issues
      const { reanalyzeSteps, confirmAnnotation } = await import(
        "@/lib/systems/actions"
      );

      // Send corrections for re-analysis
      const reanalysisResult = await reanalyzeSteps(taskId, confirmedSteps);

      if ("error" in reanalysisResult) {
        toast.error(reanalysisResult.error);
        return;
      }

      if (reanalysisResult.changed) {
        // Update analysis and reset changed steps
        setCurrentAnalysis(reanalysisResult.result);

        const updatedSteps = reanalysisResult.result.steps.map(
          (newStep, i) => {
            const oldStep = confirmedSteps[i];
            const stepChanged =
              !oldStep ||
              newStep.action !== oldStep.action ||
              newStep.targetElement !== oldStep.targetElement ||
              newStep.expectedResult !== oldStep.expectedResult;

            return {
              stepNumber: newStep.stepNumber,
              action: newStep.action,
              targetElement: newStep.targetElement,
              expectedResult: newStep.expectedResult,
              screenshotRef: newStep.screenshotRef,
              confirmed: stepChanged ? false : oldStep?.confirmed ?? false,
            };
          }
        );

        setConfirmedSteps(updatedSteps);

        const changedCount = updatedSteps.filter(
          (s) => !s.confirmed
        ).length;
        toast.info(
          `AI updated ${changedCount} step(s) based on your corrections. Please review the changes.`
        );
      } else {
        // No changes -- confirm and close
        toast.success("Analysis confirmed -- no changes needed.");

        const confirmResult = await confirmAnnotation(
          runId,
          taskId,
          confirmedSteps
        );

        if (!confirmResult.success) {
          toast.error(confirmResult.error ?? "Failed to confirm annotation");
          return;
        }

        onOpenChange(false);
      }
    } catch (err) {
      toast.error("Failed to finalize steps. Please try again.");
      console.error("Finalize error:", err);
    } finally {
      setFinalizing(false);
    }
  }, [taskId, runId, confirmedSteps, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] min-w-[800px] h-[85vh] flex flex-col p-0 sm:max-w-[90vw]">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>Review Automation Steps</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <AnnotationSideBySide
            analysisResult={currentAnalysis}
            sopText={sopText}
            screenshotUrls={screenshotUrls}
            onStepsChange={handleStepsChange}
          />
        </div>

        <div className="px-6 py-4 border-t flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {confirmedCount} of {totalSteps} steps confirmed
          </span>
          <Button
            onClick={handleFinalize}
            disabled={!allConfirmed || finalizing}
          >
            {finalizing ? "Finalizing..." : "Finalize Steps"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
