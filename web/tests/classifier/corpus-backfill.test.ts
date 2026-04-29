// Phase 60-08 (D-04, D-22, D-28). Tests for the corpus-backfill function.
//
// Mocks: createAdminClient (cross-schema reads + classifier_rules upsert) and
// inngest.createFunction (pass-through so we can invoke the handler directly).
//
// Fixture corpus: 5 email_analysis rows joined with 5 emails. classify() runs
// against real classify.ts (D-22 read-only — no mock). Expected tally:
//
//   subject_autoreply:  n=3, agree=2  (one disagreement: LLM says "payment")
//   subject_paid_marker: n=1, agree=1
//   no_match:           skipped (catch-all)
//   skipped_missing_fields: 0 (all fixtures have subject + sender + body)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { wilsonCiLower } from "@/lib/classifier/wilson";

type AnalysisRow = { email_id: string; email_intent: string | null; category: string | null };
type EmailRow = {
  id: string;
  subject: string | null;
  sender_email: string | null;
  body_text: string | null;
  body_html: string | null;
};

// Fixtures
const ANALYSIS: AnalysisRow[] = [
  { email_id: "e1", category: "auto_reply", email_intent: "auto_reply" },
  { email_id: "e2", category: "auto_reply", email_intent: null },
  { email_id: "e3", category: "payment", email_intent: "payment_confirmation" }, // disagreement: rule fires auto_reply but LLM says payment
  { email_id: "e4", category: "payment", email_intent: "payment_confirmation" }, // subject_paid_marker
  { email_id: "e5", category: null, email_intent: null }, // no_match (random non-classifier subject)
];

const EMAILS: EmailRow[] = [
  { id: "e1", subject: "Automatic reply: out of office", sender_email: "alice@example.com", body_text: "I am away.", body_html: null },
  { id: "e2", subject: "Automatic reply: away", sender_email: "bob@example.com", body_text: "Back monday.", body_html: null },
  { id: "e3", subject: "Automatic reply: thanks", sender_email: "carol@example.com", body_text: "Got your mail.", body_html: null },
  { id: "e4", subject: "Factuur 17340374 gemarkeerd als Betaald door CBRE", sender_email: "noreply@cbre.com", body_text: "Status updated.", body_html: null },
  { id: "e5", subject: "Lunch tomorrow?", sender_email: "dave@example.com", body_text: "Want to meet?", body_html: null },
];

// Capture upsert calls
type UpsertCall = { payload: Record<string, unknown>; options: { onConflict: string } };
const upsertCalls: UpsertCall[] = [];

const upsertMock = vi.fn(async (payload: Record<string, unknown>, options: { onConflict: string }) => {
  upsertCalls.push({ payload, options });
  return { error: null };
});

// Build a chained query mock that returns analysis or emails depending on schema/table.
function buildAdminMock(
  emailsRows: EmailRow[] = EMAILS,
  analysisRows: AnalysisRow[] = ANALYSIS,
  existingRules: { rule_key: string; status: string }[] = [],
) {
  return {
    schema: (schemaName: string) => ({
      from: (tableName: string) => {
        if (schemaName === "debtor" && tableName === "email_analysis") {
          return {
            select: (_cols: string) => ({
              range: (from: number, to: number) =>
                Promise.resolve({ data: analysisRows.slice(from, to + 1), error: null }),
            }),
          };
        }
        if (schemaName === "email_pipeline" && tableName === "emails") {
          return {
            select: (_cols: string) => ({
              in: (_col: string, ids: string[]) =>
                Promise.resolve({ data: emailsRows.filter((e) => ids.includes(e.id)), error: null }),
            }),
          };
        }
        throw new Error(`unexpected schema/table: ${schemaName}.${tableName}`);
      },
    }),
    from: (tableName: string) => {
      if (tableName === "classifier_rules") {
        return {
          upsert: upsertMock,
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) =>
              Promise.resolve({ data: existingRules, error: null }),
          }),
        };
      }
      throw new Error(`unexpected table: ${tableName}`);
    },
  };
}

let adminMock: ReturnType<typeof buildAdminMock> = buildAdminMock();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminMock,
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: (
      _config: unknown,
      _trigger: unknown,
      handler: (ctx: { step: { run: (name: string, fn: () => unknown) => Promise<unknown> } }) => Promise<unknown>,
    ) => ({ __handler: handler }),
  },
}));

import { classifierCorpusBackfill } from "@/lib/inngest/functions/classifier-corpus-backfill";

async function invoke() {
  const stepRun = async <T>(_name: string, fn: () => T | Promise<T>): Promise<T> => fn();
  const handler = (classifierCorpusBackfill as unknown as {
    __handler: (ctx: { step: { run: typeof stepRun } }) => Promise<{
      processed: number;
      skipped_missing_fields: number;
      total_classified: number;
      rules_seeded: number;
    }>;
  }).__handler;
  return handler({ step: { run: stepRun } }) as Promise<{
    processed: number;
    skipped_missing_fields: number;
    total_classified: number;
    rules_seeded: number;
    rules_skipped_locked: number;
  }>;
}

describe("60-08 classifier/corpus-backfill — corpus-derived n/agree per rule", () => {
  beforeEach(() => {
    upsertCalls.length = 0;
    upsertMock.mockClear();
    adminMock = buildAdminMock();
  });

  it("upserts subject_autoreply with n=3, agree=2 and computes Wilson CI-lo", async () => {
    const result = await invoke();
    expect(result.processed).toBe(5);
    expect(result.skipped_missing_fields).toBe(0);
    expect(result.total_classified).toBe(5);

    const autoreply = upsertCalls.find((c) => c.payload.rule_key === "subject_autoreply");
    expect(autoreply).toBeDefined();
    expect(autoreply!.payload).toMatchObject({
      swarm_type: "debtor-email",
      kind: "regex",
      status: "candidate",
      n: 3,
      agree: 2,
    });
    expect(autoreply!.payload.ci_lo).toBeCloseTo(wilsonCiLower(3, 2), 6);
    expect(autoreply!.options).toEqual({ onConflict: "swarm_type,rule_key" });
    expect(autoreply!.payload.notes).toMatch(/corpus-backfill/);
  });

  it("upserts subject_paid_marker with n=1, agree=1", async () => {
    await invoke();
    const paid = upsertCalls.find((c) => c.payload.rule_key === "subject_paid_marker");
    expect(paid).toBeDefined();
    expect(paid!.payload).toMatchObject({ n: 1, agree: 1, status: "candidate" });
  });

  it("does NOT upsert no_match (catch-all skip clause)", async () => {
    await invoke();
    const noMatch = upsertCalls.find((c) => c.payload.rule_key === "no_match");
    expect(noMatch).toBeUndefined();
  });

  it("returns rules_seeded == upsert call count", async () => {
    const result = await invoke();
    expect(result.rules_seeded).toBe(upsertCalls.length);
    // 2 distinct rule_keys fired (subject_autoreply, subject_paid_marker); no_match excluded
    expect(result.rules_seeded).toBe(2);
  });

  it("skips rows with missing subject/sender/body and increments counter", async () => {
    adminMock = buildAdminMock(
      [
        { id: "e1", subject: null, sender_email: "alice@example.com", body_text: "x", body_html: null },
        { id: "e2", subject: "ok", sender_email: null, body_text: "x", body_html: null },
        { id: "e3", subject: "ok", sender_email: "x@y.com", body_text: null, body_html: null },
      ],
      [
        { email_id: "e1", category: null, email_intent: null },
        { email_id: "e2", category: null, email_intent: null },
        { email_id: "e3", category: null, email_intent: null },
      ],
    );
    const result = await invoke();
    expect(result.skipped_missing_fields).toBe(3);
    expect(result.total_classified).toBe(0);
    expect(upsertCalls).toHaveLength(0);
  });

  it("skips rules with existing status='promoted' or 'manual_block' (additive only)", async () => {
    adminMock = buildAdminMock(EMAILS, ANALYSIS, [
      { rule_key: "subject_paid_marker", status: "promoted" },
      { rule_key: "subject_autoreply", status: "manual_block" },
    ]);
    const result = await invoke();
    // Both rules tallied but neither upserted — only the candidates remain.
    expect(upsertCalls.find((c) => c.payload.rule_key === "subject_paid_marker")).toBeUndefined();
    expect(upsertCalls.find((c) => c.payload.rule_key === "subject_autoreply")).toBeUndefined();
    expect(result.rules_seeded).toBe(0);
    expect(result.rules_skipped_locked).toBe(2);
  });

  it("is idempotent — re-running produces same upsert payloads with onConflict", async () => {
    await invoke();
    const firstSnapshot = upsertCalls.map((c) => ({ ...c.payload }));
    upsertCalls.length = 0;
    await invoke();
    const secondSnapshot = upsertCalls.map((c) => ({ ...c.payload }));
    // Same rule_keys, same n/agree. (notes carries today's date — same per-run.)
    expect(secondSnapshot.map((p) => p.rule_key).sort()).toEqual(firstSnapshot.map((p) => p.rule_key).sort());
    for (const call of upsertCalls) {
      expect(call.options.onConflict).toBe("swarm_type,rule_key");
    }
  });
});
