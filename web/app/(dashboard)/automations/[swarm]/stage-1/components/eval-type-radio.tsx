"use client";

/**
 * Phase 71-04 (REVW-05) — original implementation.
 * Phase 82.7.3 Plan 01 (H-02) — plain-English rewrite. The REG/CAP pills
 * (engineering shorthand) are replaced with sentence-case titles + muted
 * subheads. Selection feedback still uses the existing checked border swap
 * (brand-primary outline + brand-primary-soft background). The `c` / `g`
 * keyboard shortcuts (`_shell/keyboard-shortcuts.tsx:225-226`) and the API
 * payload (`eval_type: "capability" | "regression"`) are unchanged.
 *
 * Layout:
 *   - Two cards, differentiated by TEXT only — no pills, no dots, no
 *     colored badges.
 *   - Card 1 (option `"regression"`): title "Recent regression",
 *     subhead "Used to work correctly".
 *   - Card 2 (option `"capability"`): title "New case",
 *     subhead "Never handled correctly before".
 *   - role="radiogroup", each card role="radio" + aria-checked.
 *   - Tooltip on the section heading preserved.
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
          title="Recent regression"
          subhead="Used to work correctly"
        />
        <Card
          option="capability"
          checked={value === "capability"}
          title="New case"
          subhead="Never handled correctly before"
        />
      </RadioGroup>
    </div>
  );
}

function Card({
  option,
  checked,
  title,
  subhead,
}: {
  option: EvalType;
  checked: boolean;
  title: string;
  subhead: string;
}) {
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
          aria-label={`${title} — ${subhead}`}
        />
        <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
      </div>
      <span
        style={{
          color: "var(--v7-text-muted)",
          fontSize: 12,
          fontFamily: "var(--font-mono)",
        }}
      >
        {subhead}
      </span>
    </label>
  );
}
