/**
 * Phase 87 Plan 02 — shared fixtures for retro helpers.
 *
 * Deterministic email + pipeline_event + conversation_context rows used by
 * select-candidates.test.ts, reconstruct-input.test.ts, and
 * aggregate-baseline.test.ts. `buildMockAdmin()` returns a Supabase JS-shaped
 * chainable mock — terminal awaits resolve to `{ data, error: null }`.
 */

import { vi } from "vitest";

export type FixtureEmail = {
  id: string;
  subject: string;
  body_text: string | null;
  body_full_text: string | null;
  sender_email: string;
  mailbox: string;
  received_at: string;
};

export type FixturePipelineEvent = {
  email_id: string;
  decision: string | null;
  confidence: number | null;
  created_at: string;
  swarm_type?: string;
  stage?: number;
};

export type FixtureConversationContext = {
  email_id: string;
  position: number;
  sender_email: string | null;
  subject: string | null;
  body_text: string | null;
  received_at: string | null;
  source_message_id?: string | null;
  fetched_at?: string | null;
};

export type FixtureEmailLabel = {
  email_id: string;
  source_mailbox: string | null;
  debtor_id: string | null;
  customer_account_id: string | null;
};

export type FixtureClusterRow = {
  swarm_type: string;
  centroid_label: string;
  member_count: number;
  window_start: string;
  window_end: string;
};

export type FixtureRetroRunRow = {
  run_id: string;
  email_id: string;
  new_top_intent: string;
};

export const SAMPLE_EMAILS: FixtureEmail[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    subject: "Vraag over factuur 33050836",
    body_text: "Korte body",
    body_full_text:
      "Volledig thread body. Origineel: Goedendag, ik heb een vraag.",
    sender_email: "klant1@example.nl",
    mailbox: "debiteuren@smeba.nl",
    received_at: "2026-05-10T08:30:00Z",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    subject: "Betaling reeds voldaan",
    body_text: "Betaling is reeds voldaan op 1 mei.",
    body_full_text: "Betaling is reeds voldaan op 1 mei.",
    sender_email: "klant2@example.com",
    mailbox: "debiteuren@smeba.nl",
    received_at: "2026-05-11T10:15:00Z",
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    subject: "Kopie factuur",
    body_text: null,
    body_full_text: "Kunt u een kopie sturen van factuur 12345?",
    sender_email: "klant3@otherclient.be",
    mailbox: "debiteuren@smeba-fire.be",
    received_at: "2026-05-12T14:00:00Z",
  },
];

export const SAMPLE_PIPELINE_EVENTS: FixturePipelineEvent[] = [
  {
    email_id: SAMPLE_EMAILS[0].id,
    decision: "general_inquiry",
    confidence: 0.72,
    created_at: "2026-05-10T08:31:00Z",
    swarm_type: "debtor-email",
    stage: 3,
  },
  {
    email_id: SAMPLE_EMAILS[1].id,
    decision: "payment_dispute",
    confidence: 0.91,
    created_at: "2026-05-11T10:16:00Z",
    swarm_type: "debtor-email",
    stage: 3,
  },
  {
    email_id: SAMPLE_EMAILS[2].id,
    decision: "other",
    confidence: 0.55,
    created_at: "2026-05-12T14:01:00Z",
    swarm_type: "debtor-email",
    stage: 3,
  },
];

export const SAMPLE_LABELS: FixtureEmailLabel[] = [
  {
    email_id: SAMPLE_EMAILS[0].id,
    source_mailbox: "debiteuren@smeba.nl",
    debtor_id: "D-1001",
    customer_account_id: "CA-1001",
  },
];

export const SAMPLE_CONVERSATION_CONTEXT: FixtureConversationContext[] = [
  {
    email_id: SAMPLE_EMAILS[0].id,
    position: 1,
    sender_email: "klant1@example.nl",
    subject: "Vraag over factuur 33050836",
    body_text: "Origineel: Goedendag, ik heb een vraag.",
    received_at: "2026-05-09T15:00:00Z",
  },
  {
    email_id: SAMPLE_EMAILS[0].id,
    position: 2,
    sender_email: "debiteuren@smeba.nl",
    subject: "Re: Vraag over factuur 33050836",
    body_text: "Hartelijk dank voor uw bericht.",
    received_at: "2026-05-09T16:00:00Z",
  },
];

/**
 * Chainable Supabase mock. Each `.from(table)` call resolves to data the
 * caller stores in `tables[table]`. Filters (`.eq`, `.gte`, `.lt`, `.order`,
 * `.limit`) are recorded for assertion but only `.eq` actually filters the
 * resolved dataset — sufficient for the helpers' query shapes.
 *
 * `.insert()` and `.upsert()` resolve to `{ data: null, error: null }` and
 * record the rows on `mock.inserts[table]` for assertion.
 */
export type MockAdminCalls = {
  fromCalls: string[];
  eqCalls: Array<{ table: string; col: string; val: unknown }>;
  inserts: Record<string, unknown[]>;
};

export type MockAdminTables = {
  pipeline_events?: FixturePipelineEvent[];
  emails?: FixtureEmail[];
  email_labels?: FixtureEmailLabel[];
  conversation_context?: FixtureConversationContext[];
  stage_3_retro_runs?: FixtureRetroRunRow[];
  intent_proposal_clusters?: FixtureClusterRow[];
};

export function buildMockAdmin(tables: MockAdminTables) {
  const calls: MockAdminCalls = {
    fromCalls: [],
    eqCalls: [],
    inserts: {},
  };

  function builderFor(table: string, dataset: unknown[]) {
    let filtered = [...dataset];
    let lastCall: Promise<{ data: unknown; error: null }> | null = null;

    const builder: Record<string, unknown> = {};

    builder.select = vi.fn().mockImplementation(() => builder);
    builder.eq = vi.fn().mockImplementation((col: string, val: unknown) => {
      calls.eqCalls.push({ table, col, val });
      filtered = filtered.filter(
        (row) => (row as Record<string, unknown>)[col] === val,
      );
      return builder;
    });
    builder.gte = vi.fn().mockImplementation((col: string, val: unknown) => {
      filtered = filtered.filter(
        (row) => (row as Record<string, unknown>)[col] >= val,
      );
      return builder;
    });
    builder.lt = vi.fn().mockImplementation((col: string, val: unknown) => {
      filtered = filtered.filter(
        (row) => (row as Record<string, unknown>)[col] < val,
      );
      return builder;
    });
    builder.lte = vi.fn().mockImplementation((col: string, val: unknown) => {
      filtered = filtered.filter(
        (row) => (row as Record<string, unknown>)[col] <= val,
      );
      return builder;
    });
    builder.order = vi
      .fn()
      .mockImplementation(
        (col: string, opts?: { ascending?: boolean }) => {
          const asc = opts?.ascending !== false;
          filtered.sort((a, b) => {
            const av = (a as Record<string, unknown>)[col] as
              | string
              | number;
            const bv = (b as Record<string, unknown>)[col] as
              | string
              | number;
            if (av < bv) return asc ? -1 : 1;
            if (av > bv) return asc ? 1 : -1;
            return 0;
          });
          return builder;
        },
      );
    builder.limit = vi.fn().mockImplementation((n: number) => {
      filtered = filtered.slice(0, n);
      return builder;
    });
    builder.maybeSingle = vi.fn().mockImplementation(() => {
      lastCall = Promise.resolve({ data: filtered[0] ?? null, error: null });
      return lastCall;
    });
    builder.single = vi.fn().mockImplementation(() => {
      lastCall = Promise.resolve({ data: filtered[0] ?? null, error: null });
      return lastCall;
    });
    builder.insert = vi.fn().mockImplementation((rows: unknown) => {
      const arr = Array.isArray(rows) ? rows : [rows];
      calls.inserts[table] = (calls.inserts[table] ?? []).concat(arr);
      return Promise.resolve({ data: null, error: null });
    });
    builder.upsert = vi.fn().mockImplementation((rows: unknown) => {
      const arr = Array.isArray(rows) ? rows : [rows];
      calls.inserts[table] = (calls.inserts[table] ?? []).concat(arr);
      return Promise.resolve({ data: null, error: null });
    });

    // Make the builder thenable so callers can `await admin.from(...).select(...).eq(...)`.
    builder.then = (
      resolve: (v: { data: unknown[]; error: null }) => unknown,
    ) => resolve({ data: filtered, error: null });

    return builder;
  }

  const from = vi.fn().mockImplementation((tableArg: string) => {
    calls.fromCalls.push(tableArg);
    // Resolve table name aliases: schema.table and unqualified
    const key = tableArg
      .replace("public.", "")
      .replace("email_pipeline.", "")
      .replace("debtor.", "");
    const dataset = (tables as Record<string, unknown[] | undefined>)[key] ?? [];
    return builderFor(tableArg, dataset);
  });

  return { from, _calls: calls };
}
