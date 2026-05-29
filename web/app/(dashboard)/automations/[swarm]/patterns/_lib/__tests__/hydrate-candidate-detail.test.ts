// Phase 4 Plan 03 Task 2 — hydrate-candidate-detail tests.
//
// Verifies single-candidate hydration + evidence-email join + cross-swarm
// tampering guard + open→in_review status auto-flip.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- Mocked admin client with two-table mock surface ----------

interface CandRow {
  id: string;
  swarm_type: string;
  evidence_email_ids: string[];
  status: string;
}
interface EmailRow {
  id: string;
  sender_email: string;
  subject: string;
  received_at: string;
}

const state: {
  candidate: CandRow | null;
  emails: EmailRow[];
  emailsQueryCapture: { ids?: readonly string[] };
  updateCapture: { patch?: Record<string, unknown>; id?: string; statusEq?: string };
} = {
  candidate: null,
  emails: [],
  emailsQueryCapture: {},
  updateCapture: {},
};

const adminMock = {
  from: (table: string) => {
    if (table === "promotion_candidates") {
      return {
        select: (_cols: string) => ({
          eq: (_col: string, _val: string) => ({
            single: async () =>
              state.candidate
                ? { data: state.candidate, error: null }
                : { data: null, error: { message: "not found" } },
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          state.updateCapture.patch = patch;
          return {
            eq: (col: string, val: string) => {
              if (col === "id") state.updateCapture.id = val;
              return {
                eq: (col2: string, val2: string) => {
                  if (col2 === "status") state.updateCapture.statusEq = val2;
                  return Promise.resolve({ error: null });
                },
                then: (r: (v: { error: null }) => void) => r({ error: null }),
              };
            },
          };
        },
      };
    }
    throw new Error(`unexpected public.${table}`);
  },
  schema: (s: string) => {
    if (s !== "email_pipeline") throw new Error(`unexpected schema ${s}`);
    return {
      from: (table: string) => {
        if (table !== "emails") throw new Error(`unexpected ${s}.${table}`);
        return {
          select: (_cols: string) => ({
            in: (_col: string, ids: readonly string[]) => {
              state.emailsQueryCapture.ids = ids;
              return Promise.resolve({ data: state.emails, error: null });
            },
          }),
        };
      },
    };
  },
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminMock,
}));

import {
  hydrateCandidateDetail,
  flipStatusOpenToInReview,
} from "../hydrate-candidate-detail";

beforeEach(() => {
  state.candidate = null;
  state.emails = [];
  state.emailsQueryCapture = {};
  state.updateCapture = {};
});

describe("hydrateCandidateDetail", () => {
  it("returns { candidate, evidence_emails, evidence_total_count }", async () => {
    state.candidate = {
      id: "c1",
      swarm_type: "debtor-email",
      evidence_email_ids: ["e1", "e2", "e3", "e4", "e5", "e6", "e7"],
      status: "open",
    };
    state.emails = [
      { id: "e1", sender_email: "a@x.com", subject: "s1", received_at: "2026-05-01T00:00:00Z" },
      { id: "e2", sender_email: "b@x.com", subject: "s2", received_at: "2026-05-02T00:00:00Z" },
    ];
    const bundle = await hydrateCandidateDetail("debtor-email", "c1");
    expect(bundle).not.toBeNull();
    expect(bundle!.candidate.id).toBe("c1");
    expect(bundle!.evidence_emails.length).toBe(2);
    expect(bundle!.evidence_total_count).toBe(7);
    // Only first 5 ids requested
    expect(state.emailsQueryCapture.ids!.length).toBe(5);
  });

  it("returns null for unknown candidate", async () => {
    state.candidate = null;
    const bundle = await hydrateCandidateDetail("debtor-email", "missing");
    expect(bundle).toBeNull();
  });

  it("returns null on cross-swarm tampering (URL swarm mismatch)", async () => {
    state.candidate = {
      id: "c1",
      swarm_type: "sales-email",
      evidence_email_ids: [],
      status: "open",
    };
    const bundle = await hydrateCandidateDetail("debtor-email", "c1");
    expect(bundle).toBeNull();
  });

  it("handles empty evidence_email_ids without crashing", async () => {
    state.candidate = {
      id: "c2",
      swarm_type: "debtor-email",
      evidence_email_ids: [],
      status: "open",
    };
    const bundle = await hydrateCandidateDetail("debtor-email", "c2");
    expect(bundle!.evidence_emails).toEqual([]);
    expect(bundle!.evidence_total_count).toBe(0);
  });
});

describe("flipStatusOpenToInReview", () => {
  it("issues an UPDATE gated by .eq('status','open') (idempotent)", async () => {
    await flipStatusOpenToInReview("c1");
    expect(state.updateCapture.patch).toBeDefined();
    expect(state.updateCapture.patch!.status).toBe("in_review");
    expect(state.updateCapture.id).toBe("c1");
    expect(state.updateCapture.statusEq).toBe("open");
  });
});
