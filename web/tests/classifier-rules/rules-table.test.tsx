// Phase 60-04 (D-26). Real assertions on RulesTable rendering.

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { ClassifierRule } from "@/lib/classifier/types";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { RulesTable } from "@/app/(dashboard)/automations/classifier-rules/rules-table";

const baseRule = (overrides: Partial<ClassifierRule>): ClassifierRule => ({
  id: overrides.id ?? "rule-id",
  swarm_type: overrides.swarm_type ?? "debtor-email",
  rule_key: overrides.rule_key ?? "subject_paid_marker",
  kind: overrides.kind ?? "regex",
  status: overrides.status ?? "candidate",
  n: overrides.n ?? 0,
  agree: overrides.agree ?? 0,
  ci_lo: overrides.ci_lo ?? null,
  last_evaluated: overrides.last_evaluated ?? "2026-04-27T10:00:00Z",
  promoted_at: overrides.promoted_at ?? null,
  last_demoted_at: overrides.last_demoted_at ?? null,
  notes: overrides.notes ?? null,
});

const fixtureRules: ClassifierRule[] = [
  baseRule({
    id: "1",
    rule_key: "promoted_rule",
    status: "promoted",
    n: 169,
    agree: 165,
    ci_lo: 0.96,
  }),
  baseRule({
    id: "2",
    rule_key: "candidate_high",
    status: "candidate",
    n: 50,
    agree: 49,
    ci_lo: 0.96,
  }),
  baseRule({
    id: "3",
    rule_key: "demoted_rule",
    status: "demoted",
    n: 100,
    agree: 80,
    ci_lo: 0.7,
  }),
  baseRule({
    id: "4",
    rule_key: "blocked_rule",
    status: "manual_block",
    n: 30,
    agree: 28,
    ci_lo: 0.85,
  }),
];

describe("D-26: RulesTable", () => {
  it("renders 4 group headers exactly: Promoted / Candidates / Demoted / Manually blocked", () => {
    render(<RulesTable rules={fixtureRules} evalsByRule={{}} shadowMode={false} />);
    expect(screen.getByRole("heading", { name: "Promoted" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Candidates" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Demoted" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Manually blocked" })).toBeInTheDocument();
  });

  it("shows 'Would have promoted' chip on candidate row in shadow mode when n>=30 and ci_lo>=0.95", () => {
    render(<RulesTable rules={fixtureRules} evalsByRule={{}} shadowMode={true} />);
    expect(screen.getAllByText("Would have promoted").length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT show 'Would have promoted' chip when shadowMode=false", () => {
    render(<RulesTable rules={fixtureRules} evalsByRule={{}} shadowMode={false} />);
    expect(screen.queryByText("Would have promoted")).not.toBeInTheDocument();
  });

  it("renders N as tabular-nums", () => {
    render(<RulesTable rules={fixtureRules} evalsByRule={{}} shadowMode={false} />);
    const cell = screen.getByText("169");
    expect(cell.className).toContain("tabular-nums");
  });

  it("Block button click renders a Dialog whose body contains the rule_key", () => {
    render(<RulesTable rules={fixtureRules} evalsByRule={{}} shadowMode={false} />);
    // Block button is on the promoted row (rule_key = promoted_rule)
    const blockButtons = screen.getAllByRole("button", { name: /^Block$/ });
    expect(blockButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(blockButtons[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/promoted_rule/)).toBeInTheDocument();
  });

  it("Unblock button does NOT open a Dialog (no confirmation per UI-SPEC)", () => {
    render(<RulesTable rules={fixtureRules} evalsByRule={{}} shadowMode={false} />);
    const unblockButtons = screen.getAllByRole("button", { name: /^Unblock$/ });
    expect(unblockButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(unblockButtons[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders empty state when no rules", () => {
    render(<RulesTable rules={[]} evalsByRule={{}} shadowMode={false} />);
    expect(screen.getByText("No rules yet")).toBeInTheDocument();
  });
});
