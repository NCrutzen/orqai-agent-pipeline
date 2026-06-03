// Phase 4 Plan 03 Task 2 — page.tsx mount + status auto-flip behavior.

import { describe, it, expect, vi, beforeEach } from "vitest";

const hydrateMock = vi.fn();
const flipMock = vi.fn();
const notFoundSpy = vi.fn(() => {
  throw new Error("__NOT_FOUND__");
});

vi.mock("../../_lib/hydrate-candidate-detail", () => ({
  hydrateCandidateDetail: (...a: unknown[]) => hydrateMock(...a),
  flipStatusOpenToInReview: (...a: unknown[]) => flipMock(...a),
}));
vi.mock("next/navigation", () => ({
  notFound: () => notFoundSpy(),
}));
const shellMock = vi.fn();
vi.mock("../candidate-detail-shell", () => ({
  CandidateDetailShell: (props: unknown) => {
    shellMock(props);
    return null;
  },
}));

import Page from "../page";

beforeEach(() => {
  hydrateMock.mockReset();
  flipMock.mockReset();
  notFoundSpy.mockClear();
});

describe("patterns/[candidate_id]/page.tsx", () => {
  it("calls notFound() when hydration returns null", async () => {
    hydrateMock.mockResolvedValueOnce(null);
    await expect(
      Page({ params: Promise.resolve({ swarm: "debtor-email", candidate_id: "x" }) }),
    ).rejects.toThrow("__NOT_FOUND__");
    expect(notFoundSpy).toHaveBeenCalled();
    expect(flipMock).not.toHaveBeenCalled();
  });

  it("triggers flipStatusOpenToInReview after successful hydration and passes bundle to shell", async () => {
    const bundle = { candidate: { id: "c1" }, evidence_emails: [], evidence_total_count: 0 };
    hydrateMock.mockResolvedValueOnce(bundle);
    const element = await Page({
      params: Promise.resolve({ swarm: "debtor-email", candidate_id: "c1" }),
    });
    expect(flipMock).toHaveBeenCalledWith("c1");
    // The returned React element must reference CandidateDetailShell with the
    // swarm + bundle props the hydration produced.
    expect((element as unknown as { props: { swarm: string; bundle: typeof bundle } }).props.swarm).toBe(
      "debtor-email",
    );
    expect((element as unknown as { props: { bundle: typeof bundle } }).props.bundle).toBe(bundle);
  });
});
