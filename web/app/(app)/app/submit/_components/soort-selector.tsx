"use client";

import * as React from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

// Two soort options — self-contained, no types.ts import
const SOORT_OPTIONS = ["software", "hardware"] as const;

// Dutch display labels per UI-SPEC §Section 3
const SOORT_LABELS: Record<(typeof SOORT_OPTIONS)[number], string> = {
  software: "Software",
  hardware: "Hardware",
};

interface SoortSelectorProps {
  value: "software" | "hardware" | "";
  onValueChange: (v: "software" | "hardware") => void;
}

export function SoortSelector({ value, onValueChange }: SoortSelectorProps) {
  return (
    <RadioGroup
      value={value}
      onValueChange={onValueChange as (v: string) => void}
      aria-required="true"
      className="flex gap-2"
    >
      {SOORT_OPTIONS.map((soort) => (
        <label
          key={soort}
          className={cn(
            "rounded-full border px-4 py-2 text-sm cursor-pointer transition-colors",
            value === soort
              ? "border-[var(--v7-brand-primary)] bg-[var(--v7-brand-primary-soft)] font-semibold text-[var(--v7-text)]"
              : "border-[var(--v7-line)] text-[var(--v7-muted)] hover:text-[var(--v7-text)]",
          )}
        >
          {/* Hidden radio input — pill label handles click */}
          <RadioGroupItem value={soort} className="sr-only" />
          {SOORT_LABELS[soort]}
        </label>
      ))}
    </RadioGroup>
  );
}
