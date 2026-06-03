import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

const searchCustomersMock = vi.fn();
vi.mock("../../../../stage-1/components/stage-2-search", () => ({
  searchCustomers: (...a: unknown[]) => searchCustomersMock(...a),
}));

import { RefineFormKnownSender } from "../refine-form-known-sender";

beforeEach(() => {
  searchCustomersMock.mockReset();
});

describe("RefineFormKnownSender", () => {
  it("Test 1: customer_account_id input is NUMBER-ONLY (strips non-digits)", () => {
    const onChange = vi.fn();
    render(
      <RefineFormKnownSender
        initial={{ sender_pattern: "", customer_account_id: "" }}
        onChange={onChange}
      />,
    );
    const input = screen.getByTestId("refine-customer-account-id") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12ab34" } });
    expect(input.value).toBe("1234");
  });

  it("Test 2: matched customer renders ✓ customer_name", async () => {
    searchCustomersMock.mockResolvedValueOnce([
      { customer_account_id: "1234", customer_name: "Vendor BV" },
    ]);
    const onChange = vi.fn();
    render(
      <RefineFormKnownSender
        initial={{ sender_pattern: "ap@vendor.com", customer_account_id: "" }}
        onChange={onChange}
      />,
    );
    await act(async () => {
      fireEvent.change(screen.getByTestId("refine-customer-account-id"), {
        target: { value: "1234" },
      });
    });
    await waitFor(
      () => {
        const node = screen.getByTestId("refine-customer-validation");
        expect(node.getAttribute("data-status")).toBe("match");
        expect(node.textContent).toContain("Vendor BV");
      },
      { timeout: 1000 },
    );
    const last = onChange.mock.calls[onChange.mock.calls.length - 1]![0];
    expect(last.valid).toBe(true);
    expect(last.payload).toEqual({
      kind: "sender_mapping",
      sender_pattern: "ap@vendor.com",
      customer_account_id: "1234",
    });
  });

  it("Test 3: unmatched customer renders 'Customer not found' and reports invalid", async () => {
    searchCustomersMock.mockResolvedValueOnce([]);
    const onChange = vi.fn();
    render(
      <RefineFormKnownSender
        initial={{ sender_pattern: "ap@vendor.com", customer_account_id: "" }}
        onChange={onChange}
      />,
    );
    await act(async () => {
      fireEvent.change(screen.getByTestId("refine-customer-account-id"), {
        target: { value: "9999" },
      });
    });
    await waitFor(
      () => {
        expect(screen.getByTestId("refine-customer-validation").textContent).toContain(
          "Customer not found",
        );
      },
      { timeout: 1000 },
    );
    const last = onChange.mock.calls[onChange.mock.calls.length - 1]![0];
    expect(last.valid).toBe(false);
  });
});
