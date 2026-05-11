"use client";

/**
 * Phase 71-04 (REVW-05). eval_type radio cards.
 *
 * Implements UI-SPEC §eval_type radio (REVW-05):
 *   - Two cards: regression (left, default selected) + capability (right).
 *   - Default value = "regression" (CONTEXT D-08 safety bias).
 *   - red `reg` pill + "Used to work" sub | lime `cap` pill + "New pattern" sub.
 *   - role="radiogroup", each card role="radio" + aria-checked.
 *   - Tooltip on the section heading.
 */
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type EvalType = "capability" | "regression";

interface EvalTypeRadioProps {
  value: EvalType;
  onChange: (v: EvalType) => void;
}

export function EvalTypeRadio({ value, onChange }: EvalTypeRadioProps) {
  return (
    <div className="flex flex-col gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <h4 className="text-[14px] font-semibold leading-[1.3] cursor-help inline-flex items-center gap-1">
              Eval type — applied to every overridden stage
              <span aria-hidden="true" style={{ color: "var(--v7-muted)" }}>
                ⓘ
              </span>
            </h4>
          </TooltipTrigger>
          <TooltipContent>
            Tags this override so model swaps don&apos;t silently break previously-correct
            decisions. Defaults to &quot;regression&quot; — the higher-cost failure mode.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <RadioGroup
        value={value}
        onValueChange={(v: string) => onChange(v as EvalType)}
        aria-label="Eval type"
        className="grid grid-cols-2 gap-3"
      >
        <Card
          option="regression"
          checked={value === "regression"}
          pillClass="reg"
          subhead="Used to work"
          description="Worked correctly before the most recent model/prompt change."
        />
        <Card
          option="capability"
          checked={value === "capability"}
          pillClass="cap"
          subhead="New pattern"
          description="Never handled correctly before, or a brand-new case."
        />
      </RadioGroup>
    </div>
  );
}

function Card({
  option,
  checked,
  pillClass,
  subhead,
  description,
}: {
  option: EvalType;
  checked: boolean;
  pillClass: "reg" | "cap";
  subhead: string;
  description: string;
}) {
  const isReg = pillClass === "reg";
  return (
    <label
      className="flex flex-col gap-2 p-3 rounded-[var(--v7-radius-sm)] border cursor-pointer transition-colors duration-150"
      style={{
        background: checked
          ? "var(--v7-brand-primary-soft)"
          : "var(--v7-panel-2)",
        borderColor: checked
          ? "var(--v7-brand-primary)"
          : "var(--v7-line)",
      }}
    >
      <div className="flex items-center gap-2">
        <RadioGroupItem
          value={option}
          aria-checked={checked}
          aria-label={`${option} — ${subhead}`}
        />
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-[var(--v7-radius-pill)] text-[11px] font-semibold uppercase"
          style={{
            letterSpacing: "0.04em",
            background: isReg
              ? "rgba(255,107,122,0.16)"
              : "rgba(138,208,94,0.16)",
            color: isReg ? "var(--v7-red)" : "var(--v7-lime)",
          }}
        >
          {pillClass}
        </span>
        <span className="text-[12px] leading-[1.3]" style={{ color: "var(--v7-muted)" }}>
          {subhead}
        </span>
      </div>
      <p
        className="text-[13px] leading-[1.5]"
        style={{ color: "var(--v7-text)" }}
      >
        {description}
      </p>
    </label>
  );
}
