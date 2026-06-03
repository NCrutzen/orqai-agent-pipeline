// Phase 06 Plan 02 Task 1 — LoadMoreLink tests.
//
// LoadMoreLink is the reusable server-rendered "Load more" affordance that the
// /review (Queue) and /history pages render below the list. It links to
// ?before=<nextBefore> (the proven stage-1 cursor primitive). Behaviors:
//   - nextBefore non-null → renders a Link to `${basePath}?before=<encoded>`.
//   - nextBefore === null → renders nothing (population exhausted).
//   - Visible label is operator-language compliant: exactly "Load more".

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { LoadMoreLink } from "../load-more-link";

describe("LoadMoreLink", () => {
  afterEach(() => cleanup());

  it("renders a Link to ?before=<encoded cursor> when nextBefore is set", () => {
    render(
      <LoadMoreLink
        nextBefore="2026-05-28T10:00:00.000Z"
        basePath="/automations/debtor-email/review"
      />,
    );
    const link = screen.getByTestId("load-more-link");
    expect(link.getAttribute("href")).toBe(
      "/automations/debtor-email/review?before=" +
        encodeURIComponent("2026-05-28T10:00:00.000Z"),
    );
  });

  it("renders nothing when nextBefore is null (population exhausted)", () => {
    const { container } = render(
      <LoadMoreLink
        nextBefore={null}
        basePath="/automations/debtor-email/review"
      />,
    );
    expect(screen.queryByTestId("load-more-link")).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it("IN-04: preserves existing query params and only sets/overrides `before`", () => {
    render(
      <LoadMoreLink
        nextBefore="2026-05-28T10:00:00.000Z|lbl-9"
        basePath="/automations/debtor-email/review"
        currentParams={{ stage: "1", category: "noise", before: "STALE" }}
      />,
    );
    const href = screen.getByTestId("load-more-link").getAttribute("href")!;
    const url = new URL(href, "https://x.test");
    // existing filters survive the page advance...
    expect(url.searchParams.get("stage")).toBe("1");
    expect(url.searchParams.get("category")).toBe("noise");
    // ...and `before` is overridden with the fresh cursor, not the stale one.
    expect(url.searchParams.get("before")).toBe(
      "2026-05-28T10:00:00.000Z|lbl-9",
    );
  });

  it("IN-04: accepts a URLSearchParams instance and preserves its entries", () => {
    render(
      <LoadMoreLink
        nextBefore="cursor-X"
        basePath="/automations/debtor-email/history"
        currentParams={new URLSearchParams("q=open&sort=desc")}
      />,
    );
    const href = screen.getByTestId("load-more-link").getAttribute("href")!;
    const url = new URL(href, "https://x.test");
    expect(url.searchParams.get("q")).toBe("open");
    expect(url.searchParams.get("sort")).toBe("desc");
    expect(url.searchParams.get("before")).toBe("cursor-X");
  });

  it("uses the operator-language label 'Load more' (no jargon)", () => {
    render(
      <LoadMoreLink
        nextBefore="2026-05-28T10:00:00.000Z"
        basePath="/automations/debtor-email/history"
      />,
    );
    expect(screen.getByTestId("load-more-link").textContent).toBe("Load more");
  });
});
