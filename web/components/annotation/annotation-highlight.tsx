"use client";

import { cn } from "@/lib/utils";

interface AnnotationHighlightProps {
  annotation: {
    stepNumber: number;
    label: string;
    boundingBox: { x: number; y: number; width: number; height: number };
    confidence: number;
  };
  confirmed: boolean;
  active: boolean;
  onClick?: () => void;
}

export function AnnotationHighlight({
  annotation,
  confirmed,
  active,
  onClick,
}: AnnotationHighlightProps) {
  return (
    <div
      className={cn(
        "absolute rounded pointer-events-auto cursor-pointer transition-all duration-150",
        confirmed
          ? "border-2 border-green-500 bg-green-500/10"
          : "border-2 border-blue-500 bg-blue-500/10",
        active && "border-[3px] shadow-lg"
      )}
      style={{
        left: `${annotation.boundingBox.x}%`,
        top: `${annotation.boundingBox.y}%`,
        width: `${annotation.boundingBox.width}%`,
        height: `${annotation.boundingBox.height}%`,
      }}
      onClick={onClick}
      aria-label={`Step ${annotation.stepNumber}: ${annotation.label}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && onClick) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <span
        className={cn(
          "absolute -top-5 left-0 text-white text-xs px-1 rounded whitespace-nowrap",
          confirmed ? "bg-green-500" : "bg-blue-500"
        )}
      >
        {annotation.stepNumber}. {annotation.label}
      </span>
    </div>
  );
}
