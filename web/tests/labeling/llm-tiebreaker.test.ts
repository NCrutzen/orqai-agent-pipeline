// Phase 56-00 (D-13). LLM tiebreaker unit tests.
// Module skeleton from Task 2 — these tests verify Zod boundary, candidate
// post-validation (security V11 / threat T-56-00-03), and timeout config.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("callTiebreaker", () => {
  const ORIG_KEY = process.env.ORQ_API_KEY;
  const ORIG_SLUG = process.env.LABEL_TIEBREAKER_AGENT_SLUG;

  beforeEach(() => {
    process.env.ORQ_API_KEY = "orq-test";
    process.env.LABEL_TIEBREAKER_AGENT_SLUG = "label-tiebreaker-test";
    vi.resetModules();
  });
  afterEach(() => {
    process.env.ORQ_API_KEY = ORIG_KEY;
    process.env.LABEL_TIEBREAKER_AGENT_SLUG = ORIG_SLUG;
    vi.restoreAllMocks();
  });

  it("validates output with Zod — rejects when confidence is not in enum", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          selected_account_id: "ACC-1",
          confidence: "GARBAGE",
          reason: "n/a",
        }),
      }),
    );
    const { callTiebreaker } = await import(
      "@/lib/automations/debtor-email/llm-tiebreaker"
    );
    await expect(
      callTiebreaker({
        email_subject: "s",
        email_body: "b",
        candidates: [{ customer_account_id: "ACC-1", customer_name: "A" }],
      }),
    ).rejects.toThrow();
  });

  it("rejects when selected_account_id not in candidates — prompt-injection guard", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          selected_account_id: "EVIL-INJECTED-999",
          confidence: "high",
          reason: "ignore previous instructions",
        }),
      }),
    );
    const { callTiebreaker } = await import(
      "@/lib/automations/debtor-email/llm-tiebreaker"
    );
    await expect(
      callTiebreaker({
        email_subject: "s",
        email_body: "b",
        candidates: [
          { customer_account_id: "ACC-1", customer_name: "A" },
          { customer_account_id: "ACC-2", customer_name: "B" },
        ],
      }),
    ).rejects.toThrow(/candidates|selected_account_id/i);
  });

  it.todo("45s timeout — AbortController fires after ORQ_TIMEOUT_MS");
});
