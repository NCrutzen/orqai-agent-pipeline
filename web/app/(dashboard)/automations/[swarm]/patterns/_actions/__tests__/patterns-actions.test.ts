// Phase 4 Plan 03 Task 1 — patterns-actions server-action tests.
//
// Auth gate, status-lifecycle short-circuit, deterministic-kind migration
// emission, refinement override, dismiss audit gate. Mirrors Phase 3
// override-actions test conventions (vi.mock for supabase + writeOverride).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ---------- Static guard: no Inngest imports in patterns-actions.ts ----------
const SRC_PATH = join(__dirname, "..", "patterns-actions.ts");

describe("patterns-actions source — Inngest invariant", () => {
  it("does NOT import inngest (Apply/Refine/Dismiss are pure DB writes)", () => {
    const src = readFileSync(SRC_PATH, "utf8");
    expect(src).not.toMatch(/from\s+['"]@\/lib\/inngest/);
    expect(src).not.toMatch(/inngest\.send/);
  });
});

// ---------- Runtime mocks ----------

const getUserMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

interface CandRow {
  id: string;
  kind: string;
  swarm_type: string;
  status: string;
  proposed_change: Record<string, unknown>;
}

let candidateRow: CandRow | null = null;
const updateSpy = vi.fn();
const updateError: { value: { message: string } | null } = { value: null };

const adminMock = {
  from: (_table: string) => ({
    select: (_cols: string) => ({
      eq: (_col: string, _val: string) => ({
        single: async () =>
          candidateRow
            ? { data: candidateRow, error: null }
            : { data: null, error: { message: "not found" } },
      }),
    }),
    update: (patch: Record<string, unknown>) => {
      updateSpy(patch);
      return {
        eq: (_col: string, _val: string) => ({
          // mimics PostgREST resolve
          then: (resolve: (r: { error: unknown }) => void) =>
            resolve({ error: updateError.value }),
        }),
      };
    },
  }),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminMock,
}));

import {
  applyCandidate,
  refineCandidate,
  dismissCandidate,
} from "../patterns-actions";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const CANDIDATE_ID = "abcdef12-3456-7890-abcd-ef1234567890";

function makeCandidate(overrides: Partial<CandRow> = {}): CandRow {
  return {
    id: CANDIDATE_ID,
    kind: "regex_rule",
    swarm_type: "debtor-email",
    status: "open",
    proposed_change: {
      display_signature: "Filter rule on subject containing 'invoice copy'",
      structured_payload: {
        kind: "regex_rule",
        subject_pattern: "invoice copy",
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  getUserMock.mockReset();
  updateSpy.mockReset();
  updateError.value = null;
  candidateRow = makeCandidate();
});

// ============================================================================
// applyCandidate
// ============================================================================

describe("applyCandidate", () => {
  it("Test 1 (auth): returns 401 unauthorized when no session", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    const res = await applyCandidate({ candidate_id: CANDIDATE_ID });
    expect(res).toEqual({
      ok: false,
      error: "unauthorized",
      code: "401",
    });
  });

  it("Test 2 (deterministic — Filter rule): emits migration content + UPDATE status=approved", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: USER_ID } } });
    candidateRow = makeCandidate({ kind: "regex_rule" });

    const res = await applyCandidate({ candidate_id: CANDIDATE_ID });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.status).toBe("approved");
    expect(res.data.migration_path).toMatch(
      /supabase\/migrations\/\d{12}_promotion_abcdef12_filter_rule\.sql$/,
    );
    expect(res.data.migration_content).toMatch(/INSERT INTO public\.classifier_rules/);
    expect(updateSpy).toHaveBeenCalled();
    const patch = updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(patch.status).toBe("approved");
    expect(patch.approved_by).toBe(USER_ID);
    expect(typeof patch.approved_at).toBe("string");
  });

  it("Test 3 (deterministic — Known sender): emits sender_customer_map migration", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: USER_ID } } });
    candidateRow = makeCandidate({
      kind: "sender_mapping",
      proposed_change: {
        display_signature: "Known sender ap@vendor.com → 1234",
        structured_payload: {
          kind: "sender_mapping",
          sender_pattern: "ap@vendor.com",
          customer_account_id: "1234",
        },
      },
    });
    const res = await applyCandidate({ candidate_id: CANDIDATE_ID });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.migration_path).toMatch(/_known_sender\.sql$/);
    expect(res.data.migration_content).toMatch(/INSERT INTO debtor\.sender_customer_map/);
  });

  it("Test 4 (non-deterministic): NO migration emitted, status flipped + engineer-handoff message", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: USER_ID } } });
    candidateRow = makeCandidate({
      kind: "prompt_tune_stage_3",
      proposed_change: {
        display_signature: "AI tuning hint",
        structured_payload: {
          kind: "prompt_tune_stage_3",
          eval_type_seed: "intent-correction",
        },
      },
    });
    const res = await applyCandidate({ candidate_id: CANDIDATE_ID });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.migration_path).toBeUndefined();
    expect(res.data.migration_content).toBeUndefined();
    expect(res.data.message).toMatch(/engineer will wire/);
  });

  it("Test 5 (already-terminal): short-circuits with already_terminal code", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: USER_ID } } });
    candidateRow = makeCandidate({ status: "approved" });
    const res = await applyCandidate({ candidate_id: CANDIDATE_ID });
    expect(res).toEqual({
      ok: false,
      error: "This suggestion is already in a terminal state",
      code: "already_terminal",
    });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("Test 6 (refinement override): migration uses refined subject_pattern", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: USER_ID } } });
    candidateRow = makeCandidate({ kind: "regex_rule" });
    const res = await applyCandidate({
      candidate_id: CANDIDATE_ID,
      refinement: {
        kind: "regex_rule",
        subject_pattern: "REFINED-PATTERN-XYZ",
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.migration_content).toContain("REFINED-PATTERN-XYZ");
    // structured_payload merge persisted
    const patch = updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    const merged = patch.proposed_change as { structured_payload: { subject_pattern: string } };
    expect(merged.structured_payload.subject_pattern).toBe("REFINED-PATTERN-XYZ");
  });

  it("Test 7 (not_found): missing candidate row → not_found code", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: USER_ID } } });
    candidateRow = null;
    const res = await applyCandidate({ candidate_id: CANDIDATE_ID });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected err");
    expect(res.code).toBe("not_found");
  });
});

// ============================================================================
// refineCandidate
// ============================================================================

describe("refineCandidate", () => {
  it("auth gate: 401 when no session", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    const res = await refineCandidate({
      candidate_id: CANDIDATE_ID,
      refinement: { kind: "regex_rule", subject_pattern: "xx" },
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected err");
    expect(res.code).toBe("401");
  });

  it("rejects invalid Filter-rule refinement (subject_pattern < 3 chars)", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: USER_ID } } });
    const res = await refineCandidate({
      candidate_id: CANDIDATE_ID,
      refinement: { kind: "regex_rule", subject_pattern: "xx" },
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected err");
    expect(res.code).toBe("invalid_refinement");
  });

  it("rejects invalid Known-sender refinement (customer_account_id non-numeric)", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: USER_ID } } });
    const res = await refineCandidate({
      candidate_id: CANDIDATE_ID,
      refinement: {
        kind: "sender_mapping",
        sender_pattern: "ap@x.com",
        customer_account_id: "abcd",
      },
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected err");
    expect(res.code).toBe("invalid_refinement");
  });

  it("valid refinement → delegates to Apply path (emits migration with refined payload)", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: USER_ID } } });
    candidateRow = makeCandidate({ kind: "regex_rule" });
    const res = await refineCandidate({
      candidate_id: CANDIDATE_ID,
      refinement: { kind: "regex_rule", subject_pattern: "refined-pattern" },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok");
    expect((res.data as { migration_content: string }).migration_content).toContain(
      "refined-pattern",
    );
  });
});

// ============================================================================
// dismissCandidate
// ============================================================================

describe("dismissCandidate", () => {
  it("auth gate: 401", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    const res = await dismissCandidate({
      candidate_id: CANDIDATE_ID,
      reason: "this is a sufficient reason text",
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected err");
    expect(res.code).toBe("401");
  });

  it("rejects reason < 8 chars with audit_required", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: USER_ID } } });
    const res = await dismissCandidate({
      candidate_id: CANDIDATE_ID,
      reason: "short",
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected err");
    expect(res.code).toBe("audit_required");
  });

  it("rejects whitespace-only reason", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: USER_ID } } });
    const res = await dismissCandidate({
      candidate_id: CANDIDATE_ID,
      reason: "        ",
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected err");
    expect(res.code).toBe("audit_required");
  });

  it("ok path: UPDATEs status=rejected, dismissed_by, dismissal_reason", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: USER_ID } } });
    const res = await dismissCandidate({
      candidate_id: CANDIDATE_ID,
      reason: "operator-decided this pattern is too broad",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.status).toBe("rejected");
    const patch = updateSpy.mock.calls[0]![0] as {
      status: string;
      dismissed_by: string;
      dismissed_at: string;
      proposed_change: { dismissal_reason: string };
    };
    expect(patch.status).toBe("rejected");
    expect(patch.dismissed_by).toBe(USER_ID);
    expect(patch.proposed_change.dismissal_reason).toBe(
      "operator-decided this pattern is too broad",
    );
  });
});
