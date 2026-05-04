// Phase 67 Plan 03 Wave 2 — filled-in tests for the labelEmailInIcontroller
// module. Mocks playwright Page methods + session/screenshot helpers and
// asserts the four-step DOM dance + brand-mismatch + selection-not-stuck +
// already-labeled paths.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock session + screenshot helpers BEFORE importing module under test.
const mockPage = {
  goto: vi.fn(async () => undefined),
  waitForSelector: vi.fn(async () => undefined),
  waitForTimeout: vi.fn(async () => undefined),
  click: vi.fn(async () => undefined),
  fill: vi.fn(async () => undefined),
  type: vi.fn(async () => undefined),
  $eval: vi.fn(async (_selector: string) => "" as string),
};

vi.mock("@/lib/automations/icontroller/session", () => ({
  openIControllerSession: vi.fn(async () => ({
    browser: {} as unknown,
    context: {} as unknown,
    page: mockPage,
    cfg: { url: "https://test.example", credentialId: "x", sessionKey: "k" },
  })),
  closeIControllerSession: vi.fn(async () => undefined),
}));

vi.mock("@/lib/browser", () => ({
  captureScreenshot: vi.fn(async () => ({
    url: "https://supabase.example/screenshot.png",
  })),
}));

import { labelEmailInIcontroller } from "../label-email-in-icontroller";

beforeEach(() => {
  vi.clearAllMocks();
  // Default $eval responses: 'None selected' for current-label probe (so we
  // go through apply path).
  mockPage.$eval.mockImplementation(async (selector: string) => {
    if (selector === ".select2-container.clients") return "None selected";
    if (selector.includes("select2-highlighted .select2-result-label")) {
      return "506909 - Vos Logistics B.V. (Smeba Brandbeveiliging BV)";
    }
    return "";
  });
});

describe("labelEmailInIcontroller", () => {
  it("clicks trigger, types customer_id, then clicks highlighted result", async () => {
    // After click, the after-text should be the assigned label.
    let callCount = 0;
    mockPage.$eval.mockImplementation(async (selector: string) => {
      if (selector === ".select2-container.clients") {
        callCount += 1;
        // First call (idempotency probe): None selected.
        // Second call (after-text): assigned.
        return callCount === 1
          ? "None selected"
          : "506909 - Vos Logistics B.V. (Smeba Brandbeveiliging BV)";
      }
      if (selector.includes("select2-highlighted .select2-result-label")) {
        return "506909 - Vos Logistics B.V. (Smeba Brandbeveiliging BV)";
      }
      return "";
    });

    const result = await labelEmailInIcontroller({
      icontroller_message_url: "https://test.example/messages/show?msg=1",
      customer_account_id: "506909",
      source_mailbox: "debiteuren@smeba.nl",
      entity: "smeba",
    });

    expect(result.status).toBe("labeled");
    expect(mockPage.click).toHaveBeenCalledWith(".select2-container.clients");
    expect(mockPage.type).toHaveBeenCalledWith(
      ".select2-input.select2-focused",
      "506909",
      { delay: 50 },
    );
    expect(mockPage.waitForSelector).toHaveBeenCalledWith(
      "ul.select2-results .select2-result-selectable",
      { timeout: 4000 },
    );
    expect(mockPage.click).toHaveBeenCalledWith(
      "ul.select2-results .select2-result-selectable.select2-highlighted",
    );
  });

  it("returns 'brand_mismatch' WITHOUT clicking highlighted result when brand suffix mismatches", async () => {
    mockPage.$eval.mockImplementation(async (selector: string) => {
      if (selector === ".select2-container.clients") return "None selected";
      if (selector.includes("select2-highlighted .select2-result-label")) {
        // Smeba mailbox but result is from Sicli — must bail.
        return "506909 - Vos Logistics B.V. (Sicli Noord)";
      }
      return "";
    });

    const result = await labelEmailInIcontroller({
      icontroller_message_url: "https://test.example/messages/show?msg=1",
      customer_account_id: "506909",
      source_mailbox: "debiteuren@smeba.nl",
      entity: "smeba",
    });

    expect(result.status).toBe("brand_mismatch");
    expect(result.reason).toMatch(/brand_mismatch/);
    // Crucially: highlighted-click was NOT called.
    const highlightedClicks = mockPage.click.mock.calls.filter(
      (c) =>
        c[0] ===
        "ul.select2-results .select2-result-selectable.select2-highlighted",
    );
    expect(highlightedClicks).toHaveLength(0);
  });

  it("returns 'failed' with SELECTION_DID_NOT_STICK when after-text still says 'None selected'", async () => {
    mockPage.$eval.mockImplementation(async (selector: string) => {
      if (selector === ".select2-container.clients") return "None selected";
      if (selector.includes("select2-highlighted .select2-result-label")) {
        return "506909 - Vos Logistics B.V. (Smeba Brandbeveiliging BV)";
      }
      return "";
    });

    const result = await labelEmailInIcontroller({
      icontroller_message_url: "https://test.example/messages/show?msg=1",
      customer_account_id: "506909",
      source_mailbox: "debiteuren@smeba.nl",
      entity: "smeba",
    });

    expect(result.status).toBe("failed");
    expect(result.reason).toBe("SELECTION_DID_NOT_STICK");
  });

  it("returns 'already_labeled' WITHOUT opening picker when widget already shows target", async () => {
    mockPage.$eval.mockImplementation(async (selector: string) => {
      if (selector === ".select2-container.clients") {
        return "506909 - Vos Logistics B.V. (Smeba Brandbeveiliging BV)";
      }
      return "";
    });

    const result = await labelEmailInIcontroller({
      icontroller_message_url: "https://test.example/messages/show?msg=1",
      customer_account_id: "506909",
      source_mailbox: "debiteuren@smeba.nl",
      entity: "smeba",
    });

    expect(result.status).toBe("already_labeled");
    // Trigger-click NOT called (skipped opening picker).
    expect(mockPage.click).not.toHaveBeenCalled();
  });
});
