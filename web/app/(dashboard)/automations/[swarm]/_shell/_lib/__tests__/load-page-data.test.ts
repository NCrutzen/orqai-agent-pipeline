// Phase 5 Plan 05-01 Task 1 (Wave 0) — loadReviewPageData unit test.
//
// Mirrors the in-memory Supabase admin stub from
// lib/bulk-review/__tests__/write-override.test.ts:33-74, extended with a
// .select(...).in(...) chain that returns canned email_pipeline.emails +
// debtor.labeling_settings rows (and the automation_runs / swarms reads the
// chunked mailbox helpers perform).
//
// Asserts (D-01/D-02 + RESEARCH A3/Pitfall 4):
//   - every output map is keyed by email_label_id (NOT email_id)
//   - senderLabels falls back name → email
//   - dryRunByRow defaults true when the recipient mailbox is unknown
//   - a row whose email_id is null produces NO map entries (no crash)

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { BulkReviewRow } from "@/lib/bulk-review/types";
import { loadReviewPageData } from "../load-page-data";

// Canned production-shaped rows.
const EMAILS = [
  {
    id: "email-A",
    body_text: "body A",
    body_html: null,
    sender_email: "a@smeba.nl",
    sender_name: "Alice",
    subject: "Subject A",
    conversation_id: "conv-A",
    mailbox: "debiteuren@smeba.nl", // present in labeling_settings (live)
    received_at: "2026-05-01T10:00:00Z",
  },
  {
    id: "email-B",
    body_text: null,
    body_html: "<p>html B</p>",
    sender_email: "b@example.com",
    sender_name: null, // forces name→email fallback
    subject: "Subject B",
    conversation_id: null,
    mailbox: "unknown@nowhere.test", // NOT in labeling_settings → default true
    received_at: "2026-05-02T11:00:00Z",
  },
  // Plan 03: a thread sibling of conv-A with NO corresponding BulkReviewRow.
  // It must NOT create a label map entry (no row points at it) but it MUST be
  // counted toward conv-A's message_count → conv-A has 2 messages.
  {
    id: "email-A2",
    body_text: "reply in thread A",
    body_html: null,
    sender_email: "c@smeba.nl",
    sender_name: "Carol",
    subject: "RE: Subject A",
    conversation_id: "conv-A",
    mailbox: "debiteuren@smeba.nl",
    received_at: "2026-05-01T12:00:00Z",
  },
];

const LABELING_SETTINGS = [
  { source_mailbox: "debiteuren@smeba.nl", dry_run: false }, // live
];

// automation_runs rows the chunked loadEmailMailboxes helper reads. Note its
// select aliases result->>email_id as `email_id`.
const AUTOMATION_RUNS = [
  { email_id: "email-A", mailbox_id: 12, created_at: "2026-05-01T10:00:00Z" },
  { email_id: "email-B", mailbox_id: 5, created_at: "2026-05-02T11:00:00Z" },
];

// swarms.entity_brand the loadMailboxLabels helper reads; plus the distinct
// mailbox_id/entity pairs from automation_runs.
const MAILBOX_ENTITY_PAIRS = [
  { mailbox_id: 12, entity: "smeba" },
  { mailbox_id: 5, entity: "smeba-fire" },
];
const SWARM_ENTITY_BRAND = [
  { code: "smeba", display_name: "Smeba" },
  { code: "smeba-fire", display_name: "Smeba Fire" },
];

// When set, the email_pipeline.emails chain resolves a PostgREST error instead
// of data — drives the GAP 1 recurrence-guard test (a bad column name must make
// the loader REJECT, not silently empty every map).
function makeAdmin(emailsError?: { message: string }): SupabaseClient {
  // Builder that supports the chained shapes the loader + helpers use:
  //   .schema(s).from(t).select(cols)[.in(col, vals)] → await → {data, error}
  //   .schema(s).from(t).select(cols) (no .in)        → await → {data, error}
  //   .from(t).select(cols).eq(...).in(...).order(...) → await → {data, error}  (automation_runs)
  //   .from(t).select(cols).eq(...).not(...).not(...).limit(...) → await → pairs
  //   .from("swarms").select(...).eq(...).maybeSingle() → {data:{entity_brand}, error}
  function resolveData(schema: string | undefined, table: string): unknown[] {
    if (schema === "email_pipeline" && table === "emails") return EMAILS;
    if (schema === "debtor" && table === "labeling_settings")
      return LABELING_SETTINGS;
    if (table === "automation_runs") {
      // The pairs read selects mailbox_id + entity (no result->>email_id alias).
      return AUTOMATION_RUNS.length ? AUTOMATION_RUNS : [];
    }
    return [];
  }

  function makeChain(schema: string | undefined, table: string): unknown {
    const result =
      schema === "email_pipeline" && table === "emails"
        ? EMAILS
        : schema === "debtor" && table === "labeling_settings"
          ? LABELING_SETTINGS
          : table === "automation_runs"
            ? AUTOMATION_RUNS
            : [];

    // The mailbox-labels pairs read (automation_runs with .not().not().limit())
    // wants {mailbox_id, entity} shape; distinguish by selected columns.
    // GAP 1 guard: when emailsError is set, the emails SELECT resolves a
    // PostgREST-shaped error with null data (mirrors a 42703 bad-column reject).
    const isEmails = schema === "email_pipeline" && table === "emails";
    const resolved =
      isEmails && emailsError
        ? { data: null, error: emailsError }
        : { data: result, error: null };

    const chain: Record<string, unknown> = {
      // thenable so `await chain` resolves (covers .select(...) and .in(...))
      then: (
        resolve: (v: { data: unknown[] | null; error: unknown }) => void,
      ) => resolve(resolved),
      select: (cols: string) => {
        // automation_runs is read two different ways; branch on columns.
        if (table === "automation_runs" && cols.includes("entity")) {
          return makePairsChain();
        }
        return chain;
      },
      in: (_col: string, _vals: unknown[]) => chain,
      eq: (_col: string, _val: unknown) => chain,
      order: (_col: string, _opts?: unknown) => chain,
    };
    return chain;
    void resolveData;
  }

  // automation_runs pairs read: .eq().not().not().limit() → {mailbox_id, entity}[]
  function makePairsChain(): Record<string, unknown> {
    const c: Record<string, unknown> = {
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        resolve({ data: MAILBOX_ENTITY_PAIRS, error: null }),
      eq: () => c,
      not: () => c,
      limit: () => c,
    };
    return c;
  }

  function fromProxy(schema: string | undefined, table: string): unknown {
    if (table === "swarms") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { entity_brand: SWARM_ENTITY_BRAND },
              error: null,
            }),
          }),
        }),
      };
    }
    return makeChain(schema, table);
  }

  return {
    from: (table: string) => fromProxy(undefined, table),
    schema: (schema: string) => ({
      from: (table: string) => fromProxy(schema, table),
    }),
  } as unknown as SupabaseClient;
}

function makeRow(email_label_id: string, email_id: string | null): BulkReviewRow {
  return {
    email_label_id,
    swarm_type: "debtor-email",
    email_id,
    context_version: "1.0.0",
    stage_0: null,
    stage_1: null,
    stage_2: null,
    stage_3: null,
    stage_3p5: null,
    stage_4: null,
    overrides: {
      axis_1_corrected_category: null,
      axis_1_human_verdict: null,
      axis_2_corrected_customer_account_id: null,
      axis_2_reviewed_by: null,
      axis_2_reviewed_at: null,
      axis_4_draft_quality: null,
      axis_4_feedback_reason: null,
      axis_3_event_ids: [],
    },
  };
}

describe("loadReviewPageData", () => {
  const rows = [
    makeRow("label-A", "email-A"),
    makeRow("label-B", "email-B"),
    makeRow("label-null", null), // null email_id → no entries
  ];

  it("keys every output map by email_label_id (NOT email_id)", async () => {
    const admin = makeAdmin();
    const data = await loadReviewPageData(admin, rows, "debtor-email");

    expect(Object.keys(data.senderLabels)).toEqual(["label-A", "label-B"]);
    expect(Object.keys(data.subjectLabels)).toEqual(["label-A", "label-B"]);
    expect(Object.keys(data.bodyByRow)).toEqual(["label-A", "label-B"]);
    expect(Object.keys(data.conversationByRow)).toEqual(["label-A", "label-B"]);
    // never keyed by email_id
    expect(data.senderLabels["email-A"]).toBeUndefined();
  });

  it("falls back sender name → email when sender_name is null", async () => {
    const admin = makeAdmin();
    const data = await loadReviewPageData(admin, rows, "debtor-email");
    expect(data.senderLabels["label-A"]).toBe("Alice"); // name present
    expect(data.senderLabels["label-B"]).toBe("b@example.com"); // fallback to email
  });

  it("uses body_html when body_text is null", async () => {
    const admin = makeAdmin();
    const data = await loadReviewPageData(admin, rows, "debtor-email");
    expect(data.bodyByRow["label-A"]).toBe("body A");
    expect(data.bodyByRow["label-B"]).toBe("<p>html B</p>");
  });

  it("projects conversation_id; derives messageCountByRow from conversation membership", async () => {
    const admin = makeAdmin();
    const data = await loadReviewPageData(admin, rows, "debtor-email");
    expect(data.conversationByRow["label-A"]).toBe("conv-A");
    // Plan 03: count = number of emails sharing conv-A. EMAILS has two members
    // of conv-A (email-A + its thread sibling email-A2) → count 2, so the
    // "View full thread" gate (message_count > 1) now correctly shows.
    expect(data.messageCountByRow["label-A"]).toBe(2);
    // label-B has no conversation_id → count null (thread button stays hidden).
    expect(data.conversationByRow["label-B"]).toBeNull();
    expect(data.messageCountByRow["label-B"]).toBeNull();
  });

  it("dryRunByRow reflects labeling_settings; defaults true for unknown mailbox (A3)", async () => {
    const admin = makeAdmin();
    const data = await loadReviewPageData(admin, rows, "debtor-email");
    // debiteuren@smeba.nl → dry_run=false (live)
    expect(data.dryRunByRow["label-A"]).toBe(false);
    // unknown@nowhere.test not in labeling_settings → default true
    expect(data.dryRunByRow["label-B"]).toBe(true);
  });

  it("produces NO map entries for a row whose email_id is null (no crash)", async () => {
    const admin = makeAdmin();
    const data = await loadReviewPageData(admin, rows, "debtor-email");
    expect(data.senderLabels["label-null"]).toBeUndefined();
    expect(data.bodyByRow["label-null"]).toBeUndefined();
    expect(data.dryRunByRow["label-null"]).toBeUndefined();
  });

  it("resolves mailbox display labels keyed by email_label_id", async () => {
    const admin = makeAdmin();
    const data = await loadReviewPageData(admin, rows, "debtor-email");
    expect(data.mailboxLabels["label-A"]).toBe("Smeba");
    expect(data.mailboxLabels["label-B"]).toBe("Smeba Fire");
  });

  // GAP 1 recurrence guard: a failed email SELECT (e.g. a future bad column
  // name → PostgREST 42703) must make the loader REJECT loudly instead of
  // silently degrading every label map to empty.
  it("rejects when the email SELECT returns an error (recurrence guard)", async () => {
    const admin = makeAdmin({
      message: 'column emails.message_count does not exist',
    });
    await expect(
      loadReviewPageData(admin, rows, "debtor-email"),
    ).rejects.toThrow(/email_pipeline\.emails SELECT failed/);
  });
});
