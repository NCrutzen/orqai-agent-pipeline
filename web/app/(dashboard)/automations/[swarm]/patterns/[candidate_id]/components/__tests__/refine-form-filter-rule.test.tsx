import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RefineFormFilterRule } from "../refine-form-filter-rule";

afterEach(() => cleanup());

describe("RefineFormFilterRule", () => {
  it("prepopulates subject_pattern from initial", () => {
    const onChange = vi.fn();
    render(
      <RefineFormFilterRule
        initial={{ subject_pattern: "invoice copy" }}
        onChange={onChange}
      />,
    );
    expect((screen.getByTestId("refine-subject-pattern") as HTMLInputElement).value).toBe(
      "invoice copy",
    );
  });

  it("reports valid=true when subject_pattern >= 3 chars", () => {
    const onChange = vi.fn();
    render(
      <RefineFormFilterRule
        initial={{ subject_pattern: "" }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId("refine-subject-pattern"), {
      target: { value: "abc" },
    });
    const last = onChange.mock.calls[onChange.mock.calls.length - 1]![0];
    expect(last.valid).toBe(true);
    expect(last.payload).toEqual({ kind: "regex_rule", subject_pattern: "abc" });
  });

  it("emits sender_filter from comma-split text", () => {
    const onChange = vi.fn();
    render(
      <RefineFormFilterRule
        initial={{ subject_pattern: "invoice" }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId("refine-sender-filter"), {
      target: { value: "a@x.com, b@y.com" },
    });
    const last = onChange.mock.calls[onChange.mock.calls.length - 1]![0];
    expect(last.payload).toEqual({
      kind: "regex_rule",
      subject_pattern: "invoice",
      sender_filter: ["a@x.com", "b@y.com"],
    });
  });
});
