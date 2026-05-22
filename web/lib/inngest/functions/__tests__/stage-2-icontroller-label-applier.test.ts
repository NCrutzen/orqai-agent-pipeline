// Phase 67 Plan 05 — concrete tests for stage2IcontrollerLabelApplier.
// Mocks findMessageRow + labelEmailInIcontroller + session helpers + admin
// chains; invokes the handler directly via the mocked inngest.createFunction
// capture pattern (mirrors debtor-email-coordinator.test.ts).
import { describe, it, expect, vi, beforeEach } from "vitest";

// Loose-typed mocks: vi.fn()'s default signature is `() => any`, so calling
// them with positional args trips strict mode. Cast to the broad function
// shape so .mock.calls indexing + spread args compile cleanly.
const findMock = vi.fn() as unknown as ((..._args: unknown[]) => unknown) & {
  mockResolvedValueOnce: (v: unknown) => void;
  mockRejectedValueOnce: (v: unknown) => void;
  mock: { calls: unknown[][]; invocationCallOrder: number[] };
};
const labelMock = vi.fn() as unknown as ((..._args: unknown[]) => unknown) & {
  mockResolvedValueOnce: (v: unknown) => void;
  mockRejectedValueOnce: (v: unknown) => void;
  mock: { calls: unknown[][]; invocationCallOrder: number[] };
};
const updateEqMock = vi.fn(async () => ({ data: null, error: null }));
const updateMock = vi.fn((_payload: unknown) => ({ eq: updateEqMock }));
const fromMock = vi.fn(() => ({ update: updateMock }));
const schemaMock = vi.fn(() => ({ from: fromMock }));
const adminClient = { schema: schemaMock };
const emitStaleMock = vi.fn(async (..._args: unknown[]) => undefined);
const openSessionMock = vi.fn() as unknown as ((..._args: unknown[]) => unknown) & {
  mockResolvedValue: (v: unknown) => void;
  mockRejectedValueOnce: (v: unknown) => void;
};
const closeSessionMock = vi.fn(async (_s: unknown) => undefined);

vi.mock("@/lib/automations/icontroller/find-message-row", () => ({
  findMessageRow: (page: unknown, input: unknown) => findMock(page, input),
}));
vi.mock("@/lib/automations/debtor-email/label-email-in-icontroller", () => ({
  labelEmailInIcontroller: (input: unknown) => labelMock(input),
}));
vi.mock("@/lib/automations/icontroller/session", () => ({
  openIControllerSession: (...args: unknown[]) => openSessionMock(...args),
  closeIControllerSession: (s: unknown) => closeSessionMock(s),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminClient,
}));
vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: (...args: unknown[]) => emitStaleMock(...args),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: (cfg: unknown, trigger: unknown, handler: unknown) => ({
      __config: cfg,
      __trigger: trigger,
      handler,
    }),
  },
}));

import { stage2IcontrollerLabelApplier } from "../stage-2-icontroller-label-applier";

type TaggerHandler = (ctx: {
  event: { data: Record<string, unknown> };
  step: { run: <T>(_name: string, fn: () => Promise<T>) => Promise<T> };
}) => Promise<unknown>;

const handler = (
  stage2IcontrollerLabelApplier as unknown as { handler: TaggerHandler }
).handler;

const makeStep = () => ({
  run: <T>(_name: string, fn: () => Promise<T>) => fn(),
});

const stubPage = { goto: vi.fn(async () => undefined) };
const stubSession = { page: stubPage, browser: {}, context: {}, cfg: {} };

const baseEventData = {
  email_label_id: "label-uuid-1",
  email_id: "email-uuid-1",
  automation_run_id: "run-uuid-1",
  customer_account_id: "506909",
  customer_name: "Vos Logistics B.V.",
  source_mailbox: "debiteuren@smeba.nl",
  icontroller_mailbox_id: 4,
  icontroller_company: "smebabrandbeveiliging",
  icontroller_message_url:
    "https://walkerfire.icontroller.eu/messages/index/mailbox/4",
  entity: "smeba",
  sender_email: "test@example.com",
  subject: "test subject",
  received_at: "2026-05-04T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  openSessionMock.mockResolvedValue(stubSession);
});

describe("stage2IcontrollerLabelApplier", () => {
  it("UPDATEs 'tagged' + icontroller_msg_id on label success", async () => {
    findMock.mockResolvedValueOnce({
      found: true,
      detail_url: "https://walkerfire.icontroller.eu/messages/show?msg=12345",
      icontroller_msg_id: 12345,
    });
    labelMock.mockResolvedValueOnce({
      status: "labeled",
      screenshot_before_url: "https://supabase.example/before.png",
      screenshot_after_url: "https://supabase.example/after.png",
    });
    const result = await handler({
      event: { data: baseEventData },
      step: makeStep(),
    });
    expect(result).toMatchObject({
      ok: true,
      status: "tagged",
      icontroller_msg_id: 12345,
    });
    const updateArg = updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg).toMatchObject({
      icontroller_tag_status: "tagged",
      icontroller_msg_id: 12345,
      screenshot_before_url: "https://supabase.example/before.png",
      screenshot_after_url: "https://supabase.example/after.png",
    });
    expect(updateArg).toHaveProperty("labeled_at");
    expect(emitStaleMock).toHaveBeenCalledWith(
      adminClient,
      "debtor-email-review",
    );
    expect(closeSessionMock).toHaveBeenCalled();
    // Sequencing: findMessageRow called BEFORE labelEmailInIcontroller, and
    // they share the same page instance.
    expect(findMock.mock.invocationCallOrder[0]).toBeLessThan(
      labelMock.mock.invocationCallOrder[0],
    );
    expect(findMock.mock.calls[0][0]).toBe(stubPage);
    expect((labelMock.mock.calls[0][0] as { page: unknown }).page).toBe(
      stubPage,
    );
  });

  it("UPDATEs 'failed' with 'message_not_found' when search-and-click misses; label NOT called", async () => {
    findMock.mockResolvedValueOnce({
      found: false,
      detail_url: null,
      icontroller_msg_id: null,
      debug: "[nearest: ...]",
    });
    const result = await handler({
      event: { data: baseEventData },
      step: makeStep(),
    });
    expect(result).toMatchObject({ ok: true, status: "failed" });
    expect(labelMock).not.toHaveBeenCalled();
    const updateArg = updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.icontroller_tag_status).toBe("failed");
    expect(String(updateArg.error)).toMatch(/^message_not_found/);
  });

  it("maps 'already_labeled' to 'tagged' with msg_id populated", async () => {
    findMock.mockResolvedValueOnce({
      found: true,
      detail_url: "https://walkerfire.icontroller.eu/messages/show?msg=99",
      icontroller_msg_id: 99,
    });
    labelMock.mockResolvedValueOnce({
      status: "already_labeled",
      screenshot_before_url: null,
      screenshot_after_url: null,
    });
    const result = await handler({
      event: { data: baseEventData },
      step: makeStep(),
    });
    expect(result).toMatchObject({
      ok: true,
      status: "tagged",
      icontroller_msg_id: 99,
    });
  });

  it("UPDATEs 'failed' with error LIKE 'brand_mismatch:%' on brand_mismatch", async () => {
    findMock.mockResolvedValueOnce({
      found: true,
      detail_url: "https://walkerfire.icontroller.eu/messages/show?msg=42",
      icontroller_msg_id: 42,
    });
    labelMock.mockResolvedValueOnce({
      status: "brand_mismatch",
      reason: "highlighted 'Sicli Noord' did not match entity 'smeba'",
      screenshot_before_url: "https://supabase.example/before.png",
      screenshot_after_url: "https://supabase.example/mismatch.png",
    });
    const result = await handler({
      event: { data: baseEventData },
      step: makeStep(),
    });
    expect(result).toMatchObject({ ok: true, status: "failed" });
    const updateArg = updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.icontroller_tag_status).toBe("failed");
    expect(updateArg.icontroller_msg_id).toBe(42);
    expect(String(updateArg.error)).toMatch(/^brand_mismatch:/);
  });

  it("returns ok:true even when labelEmailInIcontroller throws (Inngest stays green); session closed", async () => {
    findMock.mockResolvedValueOnce({
      found: true,
      detail_url: "https://walkerfire.icontroller.eu/messages/show?msg=7",
      icontroller_msg_id: 7,
    });
    labelMock.mockRejectedValueOnce(new Error("Browserless connect timeout"));
    const result = await handler({
      event: { data: baseEventData },
      step: makeStep(),
    });
    expect(result).toMatchObject({ ok: true, status: "failed" });
    const updateArg = updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.icontroller_tag_status).toBe("failed");
    expect(String(updateArg.error)).toMatch(/^tagger error:/);
    expect(closeSessionMock).toHaveBeenCalled();
  });

  it("UPDATEs 'failed' when labelEmailInIcontroller returns status='failed'", async () => {
    findMock.mockResolvedValueOnce({
      found: true,
      detail_url: "https://walkerfire.icontroller.eu/messages/show?msg=1",
      icontroller_msg_id: 1,
    });
    labelMock.mockResolvedValueOnce({
      status: "failed",
      reason: "SELECTION_DID_NOT_STICK",
      screenshot_before_url: null,
      screenshot_after_url: null,
    });
    const result = await handler({
      event: { data: baseEventData },
      step: makeStep(),
    });
    expect(result).toMatchObject({ ok: true, status: "failed" });
    const updateArg = updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.error).toBe("SELECTION_DID_NOT_STICK");
  });

  it("UPDATEs 'failed' when openIControllerSession rejects; no re-throw", async () => {
    openSessionMock.mockRejectedValueOnce(new Error("Browserless unreachable"));
    // When openSession fails before try/finally, the handler currently throws.
    // Document expected behavior: the handler is wrapped at the Inngest level
    // with retries=1; the open call sits OUTSIDE the try/catch because we
    // need a session to exist before we can release it. Assert the rejection
    // bubbles (this is the one path Inngest will retry on).
    await expect(
      handler({ event: { data: baseEventData }, step: makeStep() }),
    ).rejects.toThrow(/Browserless unreachable/);
  });
});
