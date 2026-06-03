// Phase 4 Plan 04 Task 1 — End-to-end integration test.
//
// Exercises the Plan 01 → Plan 02 → Plan 03 happy path without standing up
// Supabase / Inngest. The in-memory Supabase mock supports the operations
// Plans 01–03 perform: SELECT (+filters, +ordering, +.in()), UPSERT, UPDATE,
// single-row SELECT, cross-schema reads. Cron handler is captured via the
// Inngest mock and invoked directly.
//
// Flow asserted (one test per phase boundary so failures point at the slice):
//   1. seed pipeline_events override rows
//   2. invoke patternsRecommenderCron → 1 promotion_candidate row written
//   3. hydrateCandidatesForSwarm sees the new candidate
//   4. hydrateCandidateDetail returns candidate + 5 evidence emails
//   5. flipStatusOpenToInReview flips open→in_review (idempotent)
//   6. applyCandidate flips in_review→approved + emits migration content
//   7. re-apply rejected with code='already_terminal'
//   8. dismissCandidate on a second cluster → status=rejected
//
// IMPORTANT: this file is the single integration smoke for Phase 4. Per-slice
// unit tests already cover behavior; this file proves the slices compose.

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ---------- In-memory Supabase mock (shared across all imports) ----------

type Row = Record<string, unknown>;

interface SupabaseState {
  pipeline_events: Row[];
  promotion_candidates: Row[];
  email_pipeline_emails: Row[];
  swarm_intents: Row[];
}

const state: SupabaseState = {
  pipeline_events: [],
  promotion_candidates: [],
  email_pipeline_emails: [],
  swarm_intents: [],
};

function resetState() {
  state.pipeline_events = [];
  state.promotion_candidates = [];
  state.email_pipeline_emails = [];
  state.swarm_intents = [];
}

interface PublicQueryBuilder {
  _table: string;
  _filters: Array<{ kind: string; col?: string; val?: unknown }>;
  _orderBy: Array<{ col: string; ascending: boolean; nullsFirst?: boolean }>;
  _selectCols: string;
  select: (cols?: string) => PublicQueryBuilder;
  eq: (col: string, val: unknown) => PublicQueryBuilder;
  not: (col: string, op: string, val: unknown) => PublicQueryBuilder;
  gte: (col: string, val: unknown) => PublicQueryBuilder;
  in: (col: string, vals: unknown[]) => PublicQueryBuilder;
  order: (
    col: string,
    opts?: { ascending?: boolean; nullsFirst?: boolean },
  ) => PublicQueryBuilder;
  single: () => Promise<{ data: Row | null; error: { message: string } | null }>;
  upsert: (
    row: Row,
    opts?: { onConflict?: string },
  ) => PublicQueryBuilder;
  update: (patch: Row) => PublicQueryBuilder;
  // Awaitable resolver (then-able) — returns rows after filters/ordering applied.
  then: (
    resolve: (v: { data: Row[] | null; error: { message: string } | null }) => unknown,
  ) => unknown;
}

function buildBuilder(table: string): PublicQueryBuilder {
  const builder: Partial<PublicQueryBuilder> & {
    _table: string;
    _filters: Array<{ kind: string; col?: string; val?: unknown }>;
    _orderBy: Array<{ col: string; ascending: boolean; nullsFirst?: boolean }>;
    _selectCols: string;
    _upsertRow?: Row;
    _upsertOnConflict?: string;
    _updatePatch?: Row;
  } = {
    _table: table,
    _filters: [],
    _orderBy: [],
    _selectCols: "*",
  };

  builder.select = (cols?: string) => {
    builder._selectCols = cols ?? "*";
    return builder as PublicQueryBuilder;
  };
  builder.eq = (col: string, val: unknown) => {
    builder._filters.push({ kind: "eq", col, val });
    return builder as PublicQueryBuilder;
  };
  builder.not = (col: string, _op: string, val: unknown) => {
    // Only `.not('override', 'is', null)` is used by Phase 4 cron — model as
    // "value is not null".
    builder._filters.push({ kind: "not_null", col, val });
    return builder as PublicQueryBuilder;
  };
  builder.gte = (col: string, val: unknown) => {
    builder._filters.push({ kind: "gte", col, val });
    return builder as PublicQueryBuilder;
  };
  builder.in = (col: string, vals: unknown[]) => {
    builder._filters.push({ kind: "in", col, val: vals });
    return builder as PublicQueryBuilder;
  };
  builder.order = (
    col: string,
    opts?: { ascending?: boolean; nullsFirst?: boolean },
  ) => {
    builder._orderBy.push({
      col,
      ascending: opts?.ascending ?? true,
      nullsFirst: opts?.nullsFirst,
    });
    return builder as PublicQueryBuilder;
  };

  function rowsForTable(): Row[] {
    if (table === "pipeline_events") return state.pipeline_events;
    if (table === "promotion_candidates") return state.promotion_candidates;
    if (table === "swarm_intents") return state.swarm_intents;
    if (table === "emails") return state.email_pipeline_emails;
    return [];
  }

  function applyFilters(rows: Row[]): Row[] {
    let out = rows;
    for (const f of builder._filters) {
      if (f.kind === "eq") {
        out = out.filter((r) => r[f.col!] === f.val);
      } else if (f.kind === "not_null") {
        out = out.filter((r) => r[f.col!] != null);
      } else if (f.kind === "gte") {
        out = out.filter((r) => {
          const v = r[f.col!];
          return typeof v === "string" && typeof f.val === "string"
            ? v >= f.val
            : (v as number) >= (f.val as number);
        });
      } else if (f.kind === "in") {
        const arr = f.val as unknown[];
        out = out.filter((r) => arr.includes(r[f.col!]));
      }
    }
    return out;
  }

  function applyOrder(rows: Row[]): Row[] {
    if (builder._orderBy.length === 0) return rows;
    const sorted = [...rows];
    sorted.sort((a, b) => {
      for (const o of builder._orderBy) {
        const av = a[o.col];
        const bv = b[o.col];
        const aNull = av === null || av === undefined;
        const bNull = bv === null || bv === undefined;
        if (aNull && bNull) continue;
        if (aNull) return o.nullsFirst ? -1 : 1;
        if (bNull) return o.nullsFirst ? 1 : -1;
        if (av === bv) continue;
        const cmp = (av as number | string) < (bv as number | string) ? -1 : 1;
        return o.ascending ? cmp : -cmp;
      }
      return 0;
    });
    return sorted;
  }

  builder.single = async () => {
    const filtered = applyFilters(rowsForTable());
    if (filtered.length === 0) {
      return { data: null, error: { message: "no rows" } };
    }
    return { data: filtered[0], error: null };
  };

  builder.upsert = (row: Row, opts?: { onConflict?: string }) => {
    const onConflict = opts?.onConflict ?? "id";
    const conflictKeys = onConflict.split(",");
    const tableRows = rowsForTable();
    const matchIdx = tableRows.findIndex((existing) =>
      conflictKeys.every((k) => existing[k] === row[k]),
    );
    if (matchIdx >= 0) {
      // Merge: refresh provided columns, preserve everything else (mirrors
      // the cron's explicit-column UPSERT semantics).
      tableRows[matchIdx] = { ...tableRows[matchIdx], ...row };
    } else {
      // Synthesize a UUID-shaped id (the migration emitter validates
      // candidate_id against UUID_RE — `cand-N` synthetic IDs would
      // fail validation and surface as { code: 'emit_failed' } downstream).
      const synthId = (() => {
        const n = tableRows.length + 1;
        const hex = n.toString(16).padStart(12, "0");
        return `aaaaaaaa-bbbb-cccc-dddd-${hex}`;
      })();
      tableRows.push({
        id: row.id ?? synthId,
        status: "open",
        approved_by: null,
        approved_at: null,
        dismissed_by: null,
        dismissed_at: null,
        created_at: new Date().toISOString(),
        ...row,
      });
    }
    builder._upsertRow = row;
    builder._upsertOnConflict = onConflict;
    // Allow chained .select().single() on the upsert result.
    return builder as PublicQueryBuilder;
  };

  builder.update = (patch: Row) => {
    builder._updatePatch = patch;
    return builder as PublicQueryBuilder;
  };

  builder.then = (resolve) => {
    // If this was an UPSERT chain that ended with .select().single() — handled
    // separately via single() above. Otherwise: an awaited query (SELECT or
    // UPDATE).
    if (builder._updatePatch) {
      const tableRows = rowsForTable();
      const matches = applyFilters(tableRows);
      for (const m of matches) {
        const idx = tableRows.indexOf(m);
        if (idx >= 0) {
          tableRows[idx] = { ...tableRows[idx], ...builder._updatePatch };
        }
      }
      return resolve({ data: matches, error: null });
    }
    const filtered = applyFilters(rowsForTable());
    const ordered = applyOrder(filtered);
    return resolve({ data: ordered, error: null });
  };

  return builder as PublicQueryBuilder;
}

// Cross-schema support: `admin.schema('email_pipeline').from('emails')...`
function makeAdminClient() {
  return {
    from: (table: string) => buildBuilder(table),
    schema: (_schemaName: string) => ({
      from: (table: string) => buildBuilder(table),
    }),
    auth: {
      // Not used by cron/hydrate paths, but Plan 03 server actions hit
      // createClient().auth.getUser separately (mocked below).
      getUser: async () => ({ data: { user: null } }),
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => makeAdminClient(),
}));

// Plan 03 action auth gate: mock createClient (server cookie-bound client).
const sessionUser = { id: "11111111-1111-1111-1111-111111111111" };
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: sessionUser } }),
    },
  }),
}));

// ---------- Inngest mock — capture the cron handler for direct invocation ----------

type CapturedFn = { handler?: (...args: unknown[]) => unknown };
const captured: CapturedFn = {};

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn().mockResolvedValue({ ids: ["evt"] }),
    createFunction: vi.fn(
      (
        _cfg: unknown,
        _trigger: unknown,
        handler: (...args: unknown[]) => unknown,
      ) => {
        captured.handler = handler;
        return { handler };
      },
    ),
  },
}));

// ---------- Imports (after mocks are wired) ----------

// Import these AFTER the vi.mock calls above so they bind to the mocks.
// patternsRecommenderCron must be imported to populate `captured.handler`.
async function loadModules() {
  await import("@/lib/inngest/functions/promotion-recommender-cron");
  const hydrateListing = await import(
    "@/app/(dashboard)/automations/[swarm]/patterns/_lib/hydrate-candidates"
  );
  const hydrateDetail = await import(
    "@/app/(dashboard)/automations/[swarm]/patterns/_lib/hydrate-candidate-detail"
  );
  const actions = await import(
    "@/app/(dashboard)/automations/[swarm]/patterns/_actions/patterns-actions"
  );
  return { hydrateListing, hydrateDetail, actions };
}

// ---------- Fixtures ----------

const SWARM = "debtor-email";

function mkOverrideRow(i: number, overrides: Partial<Row> = {}): Row {
  return {
    id: `evt-${i}`,
    swarm_type: SWARM,
    email_id: `email-${i}`,
    stage: 1,
    eval_type: "category-correction",
    override: { subject: "Out of office reply auto-generated message" },
    decision: "noise",
    decision_details: null,
    cost_cents: 20,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function mkEmail(id: string, idx: number): Row {
  return {
    id,
    sender_email: `sender${idx}@vendor.example`,
    subject: "Out of office reply auto-generated message",
    received_at: new Date(Date.now() - idx * 60_000).toISOString(),
  };
}

// Step stub — runs the function immediately (replay simulation not needed here).
function makeStep() {
  return {
    run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => await fn()),
  };
}

// ---------- Tests ----------

let mods: Awaited<ReturnType<typeof loadModules>>;

beforeAll(async () => {
  mods = await loadModules();
});

beforeEach(() => {
  resetState();
});

describe("Phase 4 end-to-end integration (Plan 01 → 02 → 03)", () => {
  it("Test 1 (cron clusters 5 override rows → 1 promotion_candidate row in 'open')", async () => {
    state.pipeline_events = Array.from({ length: 5 }, (_, i) => mkOverrideRow(i));
    const step = makeStep();
    const result = await captured.handler!({ step, event: { data: {} } });

    expect((result as { fetched: number }).fetched).toBe(5);
    expect((result as { clusters_above_threshold: number }).clusters_above_threshold).toBe(1);
    expect(state.promotion_candidates).toHaveLength(1);
    const cand = state.promotion_candidates[0];
    expect(cand.kind).toBe("regex_rule");
    expect(cand.stage).toBe("1-noise");
    expect(cand.status).toBe("open");
    expect(typeof cand.expected_savings_cents_per_month).toBe("number");
    expect((cand.expected_savings_cents_per_month as number) > 0).toBe(true);
  });

  it("Test 2 (listing hydration sees the cron-emitted candidate)", async () => {
    state.pipeline_events = Array.from({ length: 5 }, (_, i) => mkOverrideRow(i));
    const step = makeStep();
    await captured.handler!({ step, event: { data: {} } });

    const candidates = await mods.hydrateListing.hydrateCandidatesForSwarm(SWARM);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].swarm_type).toBe(SWARM);
    expect(candidates[0].kind).toBe("regex_rule");
  });

  it("Test 3 (detail hydration returns candidate + 5 evidence emails)", async () => {
    state.pipeline_events = Array.from({ length: 5 }, (_, i) => mkOverrideRow(i));
    state.email_pipeline_emails = Array.from({ length: 5 }, (_, i) =>
      mkEmail(`email-${i}`, i),
    );
    const step = makeStep();
    await captured.handler!({ step, event: { data: {} } });

    const cand = state.promotion_candidates[0];
    const bundle = await mods.hydrateDetail.hydrateCandidateDetail(
      SWARM,
      cand.id as string,
    );
    expect(bundle).not.toBeNull();
    expect(bundle!.candidate.id).toBe(cand.id);
    expect(bundle!.evidence_total_count).toBe(5);
    expect(bundle!.evidence_emails).toHaveLength(5);
  });

  it("Test 4 (status auto-flip): open → in_review is idempotent", async () => {
    state.pipeline_events = Array.from({ length: 5 }, (_, i) => mkOverrideRow(i));
    const step = makeStep();
    await captured.handler!({ step, event: { data: {} } });

    const cand = state.promotion_candidates[0];
    expect(cand.status).toBe("open");

    await mods.hydrateDetail.flipStatusOpenToInReview(cand.id as string);
    expect(state.promotion_candidates[0].status).toBe("in_review");

    // Re-call is a no-op (the .eq('status','open') guard means 0 rows match).
    await mods.hydrateDetail.flipStatusOpenToInReview(cand.id as string);
    expect(state.promotion_candidates[0].status).toBe("in_review");
  });

  it("Test 5 (apply): UPDATEs status=approved + returns migration_path + migration_content", async () => {
    state.pipeline_events = Array.from({ length: 5 }, (_, i) => mkOverrideRow(i));
    const step = makeStep();
    await captured.handler!({ step, event: { data: {} } });

    const cand = state.promotion_candidates[0];
    const res = await mods.actions.applyCandidate({
      candidate_id: cand.id as string,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.status).toBe("approved");
    expect(res.data.migration_path).toMatch(/_filter_rule\.sql$/);
    expect(res.data.migration_content).toMatch(/INSERT INTO public\.classifier_rules/);
    // Verify the row was actually mutated in the in-memory store.
    expect(state.promotion_candidates[0].status).toBe("approved");
    expect(state.promotion_candidates[0].approved_by).toBe(sessionUser.id);
    expect(typeof state.promotion_candidates[0].approved_at).toBe("string");
  });

  it("Test 6 (re-apply blocked): second applyCandidate returns code='already_terminal'", async () => {
    state.pipeline_events = Array.from({ length: 5 }, (_, i) => mkOverrideRow(i));
    const step = makeStep();
    await captured.handler!({ step, event: { data: {} } });

    const cand = state.promotion_candidates[0];
    await mods.actions.applyCandidate({ candidate_id: cand.id as string });
    const second = await mods.actions.applyCandidate({
      candidate_id: cand.id as string,
    });

    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("expected err");
    expect(second.code).toBe("already_terminal");
  });

  it("Test 7 (dismiss path): second cluster → dismissCandidate flips status=rejected + stamps dismissed_by/dismissed_at", async () => {
    // Two distinct clusters: 5 category-correction rows (Filter rule) +
    // 4 entity-correction rows (Known sender).
    state.pipeline_events = [
      ...Array.from({ length: 5 }, (_, i) => mkOverrideRow(i)),
      ...Array.from({ length: 4 }, (_, i) =>
        mkOverrideRow(100 + i, {
          stage: 2,
          eval_type: "entity-correction",
          override: {
            sender_email: `p${i}@brand.example`,
            new_customer_account_id: "C-77",
          },
        }),
      ),
    ];
    const step = makeStep();
    await captured.handler!({ step, event: { data: {} } });

    expect(state.promotion_candidates).toHaveLength(2);
    const senderCand = state.promotion_candidates.find(
      (c) => c.kind === "sender_mapping",
    );
    expect(senderCand).toBeDefined();

    const res = await mods.actions.dismissCandidate({
      candidate_id: senderCand!.id as string,
      reason: "operator-decided this pattern is too broad for production",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok");

    const stored = state.promotion_candidates.find(
      (c) => c.id === senderCand!.id,
    )!;
    expect(stored.status).toBe("rejected");
    expect(stored.dismissed_by).toBe(sessionUser.id);
    expect(typeof stored.dismissed_at).toBe("string");
  });
});
