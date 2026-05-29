// Phase 3 Plan 01 Task 1 — AuditBlock primitive tests.
//
// Covers behaviors 1-4 from the plan:
//   1. required=false ⇒ isComplete=true regardless of text.
//   2. required=true ⇒ isComplete=false when empty; true when non-empty trimmed.
//   3. question + sub + placeholder rendered verbatim (UI-SPEC §10 copy lock).
//   4. variant="default" uses --brand-primary; variant="escalate" uses --red
//      for the 3px left border.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import {
  AuditBlock,
  auditBlockIsComplete,
} from "../audit-block";

describe("auditBlockIsComplete helper", () => {
  it("Test 1: required=false ⇒ always complete", () => {
    expect(auditBlockIsComplete("", false)).toBe(true);
    expect(auditBlockIsComplete("anything", false)).toBe(true);
  });

  it("Test 2: required=true + empty (or whitespace-only) ⇒ incomplete", () => {
    expect(auditBlockIsComplete("", true)).toBe(false);
    expect(auditBlockIsComplete("   ", true)).toBe(false);
    expect(auditBlockIsComplete("\t\n", true)).toBe(false);
  });

  it("Test 2b: required=true + non-empty trimmed ⇒ complete", () => {
    expect(auditBlockIsComplete("ok", true)).toBe(true);
    expect(auditBlockIsComplete("   payload  ", true)).toBe(true);
  });
});

describe("AuditBlock render", () => {
  afterEach(() => cleanup());

  it("Test 3: renders question + sub + placeholder verbatim (UI-SPEC §10 copy lock)", () => {
    render(
      <AuditBlock
        question="Why this verdict?"
        sub="Rule feedback — describe behavior on this email"
        placeholder="Operator-friendly note"
        value=""
        onChange={() => undefined}
      />,
    );
    expect(screen.getByTestId("audit-block-question").textContent).toContain(
      "Why this verdict?",
    );
    expect(screen.getByTestId("audit-block-sub").textContent).toBe(
      "Rule feedback — describe behavior on this email",
    );
    const ta = screen.getByTestId("audit-block-textarea") as HTMLTextAreaElement;
    expect(ta.placeholder).toBe("Operator-friendly note");
  });

  // Plan 03-15 (r3-3): the tone-aware left-border lives on the CONTAINER
  // (.block, via data-tone) ONLY — the textarea now uses a normal border and
  // carries NO inline borderLeft. These tests assert the container tone, and
  // that the textarea inline style is minHeight-only (no orange/red leak).
  it("Test 4a: default variant → container data-tone=default; textarea has no inline borderLeft", () => {
    render(<AuditBlock question="Q" value="" onChange={() => undefined} />);
    const block = screen.getByTestId("audit-block");
    expect(block.getAttribute("data-tone")).toBe("default");
    const ta = screen.getByTestId(
      "audit-block-textarea",
    ) as HTMLTextAreaElement;
    expect(ta.style.borderLeft).toBe("");
  });

  it("Test 4b: variant=escalate → container data-tone=danger (tone border on the container)", () => {
    render(
      <AuditBlock
        question="Q"
        value=""
        onChange={() => undefined}
        variant="escalate"
      />,
    );
    const block = screen.getByTestId("audit-block");
    expect(block.getAttribute("data-tone")).toBe("danger");
    const ta = screen.getByTestId(
      "audit-block-textarea",
    ) as HTMLTextAreaElement;
    // No inline borderLeft on the textarea — the double-orange drift is gone.
    expect(ta.style.borderLeft).toBe("");
  });

  it("Test 5a: tone=danger flips the CONTAINER tone (alias of escalate); textarea border unchanged", () => {
    render(
      <AuditBlock
        question="Q"
        value=""
        onChange={() => undefined}
        tone="danger"
      />,
    );
    const block = screen.getByTestId("audit-block");
    expect(block.getAttribute("data-tone")).toBe("danger");
    const ta = screen.getByTestId(
      "audit-block-textarea",
    ) as HTMLTextAreaElement;
    expect(ta.style.borderLeft).toBe("");
  });

  it("Test 5b: default tone keeps data-tone=default", () => {
    render(<AuditBlock question="Q" value="" onChange={() => undefined} />);
    expect(screen.getByTestId("audit-block").getAttribute("data-tone")).toBe(
      "default",
    );
  });

  it("Test 6a: minHeight defaults to 110px (§9 standard)", () => {
    render(<AuditBlock question="Q" value="" onChange={() => undefined} />);
    const ta = screen.getByTestId(
      "audit-block-textarea",
    ) as HTMLTextAreaElement;
    expect(ta.style.minHeight).toBe("110px");
  });

  it("Test 6b: minHeight is configurable (160 Stage 1, 90 short)", () => {
    render(
      <AuditBlock
        question="Q"
        value=""
        onChange={() => undefined}
        minHeight={160}
      />,
    );
    expect(
      (screen.getByTestId("audit-block-textarea") as HTMLTextAreaElement).style
        .minHeight,
    ).toBe("160px");
    cleanup();
    render(
      <AuditBlock
        question="Q"
        value=""
        onChange={() => undefined}
        minHeight={90}
      />,
    );
    expect(
      (screen.getByTestId("audit-block-textarea") as HTMLTextAreaElement).style
        .minHeight,
    ).toBe("90px");
  });

  it("Test 6c: renders the 'optional but encouraged' tag when not required", () => {
    render(<AuditBlock question="Q" value="" onChange={() => undefined} />);
    expect(
      screen.getByTestId("audit-block-optional-tag").textContent,
    ).toContain("optional but encouraged");
    expect(screen.queryByTestId("audit-block-required-marker")).toBeNull();
  });

  it("renders the required-marker asterisk only when required=true", () => {
    render(
      <AuditBlock question="Q" value="" onChange={() => undefined} required />,
    );
    expect(
      screen.getByTestId("audit-block-required-marker"),
    ).toBeDefined();
    cleanup();
    render(<AuditBlock question="Q" value="" onChange={() => undefined} />);
    expect(
      screen.queryByTestId("audit-block-required-marker"),
    ).toBeNull();
  });

  it("invokes onChange with the new value when the operator types", () => {
    const onChange = vi.fn();
    render(<AuditBlock question="Q" value="" onChange={onChange} />);
    const ta = screen.getByTestId("audit-block-textarea") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "context note" } });
    expect(onChange).toHaveBeenCalledWith("context note");
  });
});
