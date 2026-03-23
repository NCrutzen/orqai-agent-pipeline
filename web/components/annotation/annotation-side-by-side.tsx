"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AnnotationStepCard } from "@/components/annotation/annotation-step-card";
import { AnnotationHighlight } from "@/components/annotation/annotation-highlight";
import type {
  AnalysisResult,
  ConfirmedStep,
} from "@/lib/systems/types";

interface AnnotationSideBySideProps {
  analysisResult: AnalysisResult;
  sopText: string;
  screenshotUrls: Array<{ ref: string; url: string }>;
  onStepsChange: (steps: ConfirmedStep[]) => void;
}

export function AnnotationSideBySide({
  analysisResult,
  sopText: _sopText,
  screenshotUrls,
  onStepsChange,
}: AnnotationSideBySideProps) {
  // Initialize confirmed steps from analysis result
  const [confirmedSteps, setConfirmedSteps] = useState<
    Map<number, ConfirmedStep>
  >(() => {
    const map = new Map<number, ConfirmedStep>();
    for (const step of analysisResult.steps) {
      map.set(step.stepNumber, {
        stepNumber: step.stepNumber,
        action: step.action,
        targetElement: step.targetElement,
        expectedResult: step.expectedResult,
        screenshotRef: step.screenshotRef,
        confirmed: false,
      });
    }
    return map;
  });

  const [activeStep, setActiveStep] = useState<number | null>(null);

  // Refs for screenshot containers to enable scrollIntoView
  const screenshotRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Unique screenshot refs in order
  const uniqueScreenshotRefs = useMemo(() => {
    const seen = new Set<string>();
    const refs: string[] = [];
    for (const step of analysisResult.steps) {
      if (!seen.has(step.screenshotRef)) {
        seen.add(step.screenshotRef);
        refs.push(step.screenshotRef);
      }
    }
    return refs;
  }, [analysisResult.steps]);

  // Scroll to active screenshot when activeStep changes
  useEffect(() => {
    if (activeStep === null) return;
    const step = analysisResult.steps.find(
      (s) => s.stepNumber === activeStep
    );
    if (!step) return;
    const el = screenshotRefs.current.get(step.screenshotRef);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeStep, analysisResult.steps]);

  // Notify parent of steps change
  const emitStepsChange = useCallback(
    (map: Map<number, ConfirmedStep>) => {
      onStepsChange(Array.from(map.values()));
    },
    [onStepsChange]
  );

  const handleConfirm = useCallback(
    (stepNumber: number) => {
      setConfirmedSteps((prev) => {
        const next = new Map(prev);
        const step = next.get(stepNumber);
        if (step) {
          next.set(stepNumber, { ...step, confirmed: !step.confirmed });
        }
        emitStepsChange(next);
        return next;
      });
    },
    [emitStepsChange]
  );

  const handleEdit = useCallback(
    (
      stepNumber: number,
      updated: {
        action: string;
        targetElement: string;
        expectedResult: string;
      }
    ) => {
      setConfirmedSteps((prev) => {
        const next = new Map(prev);
        const step = next.get(stepNumber);
        if (step) {
          next.set(stepNumber, {
            ...step,
            ...updated,
            confirmed: false,
            userCorrection: `Action: ${updated.action}, Target: ${updated.targetElement}, Expected: ${updated.expectedResult}`,
          });
        }
        emitStepsChange(next);
        return next;
      });
    },
    [emitStepsChange]
  );

  const handleStepClick = useCallback((stepNumber: number) => {
    setActiveStep(stepNumber);
  }, []);

  // Get screenshot URL by ref
  const getScreenshotUrl = useCallback(
    (ref: string) => {
      return screenshotUrls.find((s) => s.ref === ref)?.url;
    },
    [screenshotUrls]
  );

  // Set ref callback for screenshot containers
  const setScreenshotRef = useCallback(
    (ref: string) => (el: HTMLDivElement | null) => {
      if (el) {
        screenshotRefs.current.set(ref, el);
      } else {
        screenshotRefs.current.delete(ref);
      }
    },
    []
  );

  return (
    <div className="flex h-full">
      {/* Left panel: SOP steps (40%) */}
      <div className="w-[40%] overflow-y-auto border-r p-4 space-y-3">
        {/* Missing screenshot warning */}
        {analysisResult.missingScreenshots.length > 0 && (
          <Card className="border-amber-500 bg-amber-500/5">
            <CardContent className="p-3">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {analysisResult.missingScreenshots.length === 1
                  ? `Your SOP mentions "${analysisResult.missingScreenshots[0]}" but I don't see a matching screenshot. You can add it now or proceed without it.`
                  : `Your SOP mentions ${analysisResult.missingScreenshots.length} screens without matching screenshots: ${analysisResult.missingScreenshots.join(", ")}. You can add them or proceed without.`}
              </p>
            </CardContent>
          </Card>
        )}

        {analysisResult.steps.map((step) => {
          const confirmed =
            confirmedSteps.get(step.stepNumber)?.confirmed ?? false;
          return (
            <AnnotationStepCard
              key={step.stepNumber}
              step={step}
              confirmed={confirmed}
              onConfirm={() => handleConfirm(step.stepNumber)}
              onEdit={(updated) => handleEdit(step.stepNumber, updated)}
              active={activeStep === step.stepNumber}
              onClick={() => handleStepClick(step.stepNumber)}
            />
          );
        })}
      </div>

      {/* Right panel: Screenshots (60%) */}
      <div className="w-[60%] overflow-y-auto p-4 space-y-6">
        {uniqueScreenshotRefs.map((screenshotRef) => {
          const url = getScreenshotUrl(screenshotRef);
          const stepsForScreenshot = analysisResult.steps.filter(
            (s) => s.screenshotRef === screenshotRef
          );

          return (
            <div
              key={screenshotRef}
              ref={setScreenshotRef(screenshotRef)}
              className="relative"
            >
              <p className="text-xs text-muted-foreground mb-2">
                {screenshotRef}
              </p>
              <div className="relative">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={`Screenshot: ${screenshotRef}`}
                    className="w-full rounded-lg"
                  />
                ) : (
                  <div className="w-full h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">
                    Screenshot not available
                  </div>
                )}

                {/* Annotation highlights overlay */}
                {stepsForScreenshot.map((step) => {
                  if (!step.boundingBox) return null;
                  const confirmed =
                    confirmedSteps.get(step.stepNumber)?.confirmed ?? false;
                  return (
                    <AnnotationHighlight
                      key={step.stepNumber}
                      annotation={{
                        stepNumber: step.stepNumber,
                        label: step.targetElement,
                        boundingBox: step.boundingBox,
                        confidence: step.confidence,
                      }}
                      confirmed={confirmed}
                      active={activeStep === step.stepNumber}
                      onClick={() => handleStepClick(step.stepNumber)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
