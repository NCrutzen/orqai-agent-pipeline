"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check, Pencil } from "lucide-react";
import type { AnalysisStep } from "@/lib/systems/types";

interface AnnotationStepCardProps {
  step: AnalysisStep;
  confirmed: boolean;
  onConfirm: () => void;
  onEdit: (updated: {
    action: string;
    targetElement: string;
    expectedResult: string;
  }) => void;
  active: boolean;
  onClick: () => void;
}

export function AnnotationStepCard({
  step,
  confirmed,
  onConfirm,
  onEdit,
  active,
  onClick,
}: AnnotationStepCardProps) {
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    action: step.action,
    targetElement: step.targetElement,
    expectedResult: step.expectedResult,
  });

  const handleSave = () => {
    onEdit(editValues);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditValues({
      action: step.action,
      targetElement: step.targetElement,
      expectedResult: step.expectedResult,
    });
    setEditing(false);
  };

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all min-h-[44px]",
        confirmed
          ? "border-l-4 border-l-green-500"
          : editing
            ? "border-l-4 border-l-amber-500"
            : "border-l-4 border-l-blue-500",
        active && "ring-2 ring-blue-500/50"
      )}
      onClick={onClick}
    >
      <CardContent className="p-3">
        {/* Header row */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center size-6 rounded-full bg-muted text-xs font-medium shrink-0">
            {step.stepNumber}
          </span>
          <span className={cn("flex-1 text-sm", !editing && "truncate")}>
            {step.action}
          </span>
          <Button
            variant={confirmed ? "default" : "ghost"}
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
            aria-label={confirmed ? "Step confirmed" : "Confirm step"}
            className={cn(
              confirmed &&
                "bg-green-500 hover:bg-green-600 text-white animate-in zoom-in duration-200"
            )}
          >
            <Check className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(!editing);
            }}
            aria-label="Edit step"
          >
            <Pencil className="size-3.5" />
          </Button>
        </div>

        {/* Editing fields */}
        {editing && (
          <div
            className="mt-3 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <label className="text-xs text-muted-foreground">Action</label>
              <Input
                value={editValues.action}
                onChange={(e) =>
                  setEditValues((prev) => ({
                    ...prev,
                    action: e.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Target Element
              </label>
              <Input
                value={editValues.targetElement}
                onChange={(e) =>
                  setEditValues((prev) => ({
                    ...prev,
                    targetElement: e.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Expected Result
              </label>
              <Textarea
                value={editValues.expectedResult}
                onChange={(e) =>
                  setEditValues((prev) => ({
                    ...prev,
                    expectedResult: e.target.value,
                  }))
                }
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={handleCancel}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave}>
                Save
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
