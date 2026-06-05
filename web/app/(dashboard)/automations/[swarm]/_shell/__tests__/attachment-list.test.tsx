// Phase 116-05 Task 2 (TDD) — RTL tests for _shell/attachment-list.tsx
//
// Covers the plan's <behavior> block:
//   1. renders one entry per attachment: filename, content_type, human size
//   2. every extraction_status gets a distinct badge treatment
//   3. empty list → empty state ("No attachments"), no crash
//   4. NO preview/download control (no <a download>, no <img>) — out of scope

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";

import {
  AttachmentList,
  type AttachmentRow,
} from "../components/attachment-list";

afterEach(() => {
  cleanup();
});

const ALL_STATUSES = [
  "extracted",
  "needs_vision",
  "extraction_failed",
  "skipped_cap",
  "unsupported",
  "source_gone",
  "pending",
  "not_requested",
];

describe("_shell/attachment-list (Phase 116-05)", () => {
  it("Test 1: renders filename, content_type and a human-readable size per attachment", () => {
    const attachments: AttachmentRow[] = [
      {
        attachment_id: "att-1",
        filename: "offerte.pdf",
        content_type: "application/pdf",
        size_bytes: 1_258_291, // ~1.2 MB
        extraction_status: "extracted",
      },
      {
        attachment_id: "att-2",
        filename: "logo.png",
        content_type: "image/png",
        size_bytes: 2048, // 2.0 KB
        extraction_status: "needs_vision",
      },
    ];

    render(<AttachmentList attachments={attachments} />);

    const rows = screen.getAllByTestId("attachment-row");
    expect(rows).toHaveLength(2);

    expect(within(rows[0]).getByTestId("attachment-filename").textContent).toBe(
      "offerte.pdf",
    );
    const meta0 = within(rows[0]).getByTestId("attachment-meta").textContent;
    expect(meta0).toContain("application/pdf");
    expect(meta0).toContain("1.2 MB");

    const meta1 = within(rows[1]).getByTestId("attachment-meta").textContent;
    expect(meta1).toContain("image/png");
    expect(meta1).toContain("2.0 KB");
  });

  it("Test 1b: null filename → 'unnamed', null content_type/size → graceful fallbacks", () => {
    render(
      <AttachmentList
        attachments={[
          {
            attachment_id: "att-x",
            filename: null,
            content_type: null,
            size_bytes: null,
            extraction_status: "extracted",
          },
        ]}
      />,
    );
    expect(screen.getByTestId("attachment-filename").textContent).toBe(
      "unnamed",
    );
    const meta = screen.getByTestId("attachment-meta").textContent;
    expect(meta).toContain("unknown type");
    expect(meta).toContain("—");
  });

  it("Test 2: each extraction_status renders a badge with a distinct tone treatment", () => {
    const attachments: AttachmentRow[] = ALL_STATUSES.map((s, i) => ({
      attachment_id: `att-${i}`,
      filename: `f${i}.pdf`,
      content_type: "application/pdf",
      size_bytes: 1024,
      extraction_status: s,
    }));

    render(<AttachmentList attachments={attachments} />);

    const badges = screen.getAllByTestId("attachment-status-badge");
    expect(badges).toHaveLength(ALL_STATUSES.length);

    // Every status carries a data-status + a non-empty visible label + a tone.
    for (const s of ALL_STATUSES) {
      const badge = badges.find((b) => b.getAttribute("data-status") === s);
      expect(badge, `badge for status ${s}`).toBeTruthy();
      expect(badge!.getAttribute("data-tone")).toBeTruthy();
      expect((badge!.textContent ?? "").length).toBeGreaterThan(0);
    }

    // The success status and a warning status must NOT share a tone
    // (distinct visual treatment, not all-neutral).
    const extracted = badges.find(
      (b) => b.getAttribute("data-status") === "extracted",
    )!;
    const failed = badges.find(
      (b) => b.getAttribute("data-status") === "extraction_failed",
    )!;
    expect(extracted.getAttribute("data-tone")).toBe("success");
    expect(failed.getAttribute("data-tone")).not.toBe(
      extracted.getAttribute("data-tone"),
    );
  });

  it("Test 3: empty list renders an empty state, not a crash", () => {
    render(<AttachmentList attachments={[]} />);
    expect(screen.getByTestId("attachment-list-empty").textContent).toBe(
      "No attachments",
    );
    expect(screen.queryAllByTestId("attachment-row")).toHaveLength(0);
  });

  it("Test 4: no preview/download control is rendered (D-08 scope)", () => {
    const { container } = render(
      <AttachmentList
        attachments={[
          {
            attachment_id: "att-1",
            filename: "offerte.pdf",
            content_type: "application/pdf",
            size_bytes: 1024,
            extraction_status: "extracted",
          },
        ]}
      />,
    );
    // No anchor (download link) and no image preview anywhere in the subtree.
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("a[download]")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
});
