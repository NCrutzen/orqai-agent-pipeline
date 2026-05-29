// Phase 4 Plan 03 Task 3 — ActionCard tests.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";

const applyMock = vi.fn();
const refineMock = vi.fn();
const dismissMock = vi.fn();
const pushMock = vi.fn();

vi.mock("../../../_actions/patterns-actions", () => ({
  applyCandidate: (...a: unknown[]) => applyMock(...a),
  refineCandidate: (...a: unknown[]) => refineMock(...a),
  dismissCandidate: (...a: unknown[]) => dismissMock(...a),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { ActionCard } from "../action-card";
import type { ProposedChange } from "@/lib/promotion-recommender/types";

const FILTER_PROPOSED: ProposedChange = {
  display_signature: "Filter rule on 'invoice copy'",
  structured_payload: {
    kind: "regex_rule",
    subject_pattern: "invoice copy",
  },
};

const KNOWN_SENDER_PROPOSED: ProposedChange = {
  display_signature: "Known sender ap@vendor.com",
  structured_payload: {
    kind: "sender_mapping",
    sender_pattern: "ap@vendor.com",
    customer_account_id: "1234",
  },
};

const AI_PROPOSED: ProposedChange = {
  display_signature: "AI tuning hint",
  structured_payload: {
    kind: "prompt_tune_stage_3",
    eval_type_seed: "intent-correction",
  },
};

beforeEach(() => {
  applyMock.mockReset();
  refineMock.mockReset();
  dismissMock.mockReset();
  pushMock.mockReset();
});
afterEach(() => cleanup());

describe("ActionCard", () => {
  it("Test 1: Apply is selected by default and Submit reads 'Apply suggestion ⏎'", () => {
    render(
      <ActionCard
        swarm="debtor-email"
        candidateId="c1"
        kind="regex_rule"
        proposedChange={FILTER_PROPOSED}
      />,
    );
    expect(screen.getByTestId("action-apply").getAttribute("data-selected")).toBe("true");
    expect(screen.getByTestId("action-refine").getAttribute("data-selected")).toBe("false");
    expect(screen.getByTestId("action-dismiss").getAttribute("data-selected")).toBe("false");
    expect(screen.getByTestId("action-submit").textContent).toContain("Apply suggestion");
  });

  it("Test 2: Submit label flips per active action", () => {
    render(
      <ActionCard
        swarm="debtor-email"
        candidateId="c1"
        kind="regex_rule"
        proposedChange={FILTER_PROPOSED}
      />,
    );
    fireEvent.click(screen.getByTestId("action-refine"));
    expect(screen.getByTestId("action-submit").textContent).toContain("Apply refined rule");
    fireEvent.click(screen.getByTestId("action-dismiss"));
    expect(screen.getByTestId("action-submit").textContent).toContain("Dismiss suggestion");
  });

  it("Test 3: Dismiss reveal shows AuditBlock variant=escalate required; Submit disabled until >=8 chars", () => {
    render(
      <ActionCard
        swarm="debtor-email"
        candidateId="c1"
        kind="regex_rule"
        proposedChange={FILTER_PROPOSED}
      />,
    );
    fireEvent.click(screen.getByTestId("action-dismiss"));
    const submit = screen.getByTestId("action-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const audit = screen.getByTestId("dismiss-audit");
    expect(audit.getAttribute("data-variant")).toBe("escalate");
    expect(audit.getAttribute("data-required")).toBe("true");
    fireEvent.change(screen.getByTestId("dismiss-audit-textarea"), {
      target: { value: "short" },
    });
    expect((screen.getByTestId("action-submit") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("dismiss-audit-textarea"), {
      target: { value: "a sufficient eight-plus chars reason" },
    });
    expect((screen.getByTestId("action-submit") as HTMLButtonElement).disabled).toBe(false);
  });

  it("Test 4a: Refine reveals RefineFormFilterRule for regex_rule", () => {
    render(
      <ActionCard
        swarm="debtor-email"
        candidateId="c1"
        kind="regex_rule"
        proposedChange={FILTER_PROPOSED}
      />,
    );
    fireEvent.click(screen.getByTestId("action-refine"));
    expect(screen.getByTestId("refine-form-filter-rule")).toBeTruthy();
  });

  it("Test 4b: Refine reveals 'not wired yet' notice for non-deterministic kinds", () => {
    render(
      <ActionCard
        swarm="debtor-email"
        candidateId="c1"
        kind="prompt_tune_stage_3"
        proposedChange={AI_PROPOSED}
      />,
    );
    fireEvent.click(screen.getByTestId("action-refine"));
    expect(screen.getByTestId("refine-not-wired")).toBeTruthy();
  });

  it("Test 5: Submit dispatches applyCandidate on Apply with candidate_id", async () => {
    applyMock.mockResolvedValueOnce({ ok: true, data: { status: "approved" } });
    render(
      <ActionCard
        swarm="debtor-email"
        candidateId="c1"
        kind="prompt_tune_stage_3"
        proposedChange={AI_PROPOSED}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("action-submit"));
    });
    expect(applyMock).toHaveBeenCalledWith({ candidate_id: "c1" });
    expect(pushMock).toHaveBeenCalledWith("/automations/debtor-email/patterns");
  });

  it("Test 5b: Submit dispatches dismissCandidate with reason", async () => {
    dismissMock.mockResolvedValueOnce({ ok: true, data: { status: "rejected" } });
    render(
      <ActionCard
        swarm="debtor-email"
        candidateId="c1"
        kind="regex_rule"
        proposedChange={FILTER_PROPOSED}
      />,
    );
    fireEvent.click(screen.getByTestId("action-dismiss"));
    fireEvent.change(screen.getByTestId("dismiss-audit-textarea"), {
      target: { value: "pattern too broad to apply safely" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("action-submit"));
    });
    expect(dismissMock).toHaveBeenCalledWith({
      candidate_id: "c1",
      reason: "pattern too broad to apply safely",
    });
  });

  it("Test 6: error code already_terminal renders friendly copy", async () => {
    applyMock.mockResolvedValueOnce({
      ok: false,
      error: "raw",
      code: "already_terminal",
    });
    render(
      <ActionCard
        swarm="debtor-email"
        candidateId="c1"
        kind="prompt_tune_stage_3"
        proposedChange={AI_PROPOSED}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("action-submit"));
    });
    expect(screen.getByTestId("action-error").textContent).toContain(
      "Someone else already acted",
    );
  });

  it("Test 6b: applied with migration_path → keeps surface, shows migration_path", async () => {
    applyMock.mockResolvedValueOnce({
      ok: true,
      data: {
        status: "approved",
        migration_path: "supabase/migrations/202605250930_promotion_abcdef12_filter_rule.sql",
        migration_content: "BEGIN;...",
        message: "Suggestion applied — migration ready",
      },
    });
    render(
      <ActionCard
        swarm="debtor-email"
        candidateId="c1"
        kind="regex_rule"
        proposedChange={FILTER_PROPOSED}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("action-submit"));
    });
    expect(screen.getByTestId("applied-confirmation")).toBeTruthy();
    expect(screen.getByTestId("applied-migration-path").textContent).toContain(
      "promotion_abcdef12_filter_rule.sql",
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("Test 7: reversibility footer copy renders verbatim (anti-drift #10)", () => {
    render(
      <ActionCard
        swarm="debtor-email"
        candidateId="c1"
        kind="regex_rule"
        proposedChange={FILTER_PROPOSED}
      />,
    );
    expect(screen.getByTestId("reversibility-footer").textContent).toBe(
      "all actions are logged · an engineer can reverse Apply if it misbehaves",
    );
  });

  it("Test 8: known_sender Refine reveals the sender-form", () => {
    render(
      <ActionCard
        swarm="debtor-email"
        candidateId="c1"
        kind="sender_mapping"
        proposedChange={KNOWN_SENDER_PROPOSED}
      />,
    );
    fireEvent.click(screen.getByTestId("action-refine"));
    expect(screen.getByTestId("refine-form-known-sender")).toBeTruthy();
  });
});
