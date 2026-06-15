// Phase 112.5 Plan 04 Task 2 — worker-level tests for swarmBehaviorSync.
//
// Behaviour map (PLAN.md Task 2):
//   1  bootstrap folder (no token) yields all messages but writes 0 rows in
//      swarm_review_signals; deltaLink + bootstrapped=true ARE persisted.
//   2  follow-up tick with a restored_from_archive event whose email_id is in
//      the mocked pipeline_events stage-4 ledger (swarm_type='sales-email') ->
//      one swarm_review_signals row, verdict correctie_false_positive,
//      swarm_type='sales-email'.
//   3  same tick twice (same dedupe_key) -> the 23505 no-op swallows the second
//      insert; no exception, no duplicate row.
//   4  a Sugar-id event (no source='outlook' match in emails) is skipped.
//   5  registry iteration — the mocked public.swarms returns sales-email enabled
//      (config with mailbox); the worker polls that mailbox. A second swarm row
//      with enabled=false is NOT polled (proves registry-driven enablement, no
//      hardcoded sales).
//
// graphFetch (via deltaPage/resolveFolders) and createAdminClient are mocked.
// The supabase mock is table-aware + stateful so transitions/signals inserts
// and the ledger join behave like the real datalaag.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Inngest client mock -------------------------------------------------
const { createFunctionMock } = vi.hoisted(() => ({
  createFunctionMock: vi.fn((cfg, trigger, handler) => ({
    __config: cfg,
    __trigger: trigger,
    handler,
  })),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: createFunctionMock,
    send: vi.fn().mockResolvedValue({ ids: ["evt"] }),
  },
}));

// ---- Graph helper mock ---------------------------------------------------
// One shared graphFetch mock drives deltaPage + resolveFolders. Routing by URL.
const graphFetchMock = vi.fn();
vi.mock("@/lib/outlook/client", () => ({
  graphFetch: (...args: unknown[]) => graphFetchMock(...args),
}));

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

// ---- Stateful, table-aware Supabase admin mock ---------------------------
// Folder ids: F-inbox (bucket inbox), F-archive (bucket archive).
const MAILBOX = "verkoop@smeba.nl";

type DBState = {
  // public.swarms rows
  swarms: Array<{
    swarm_type: string;
    behavior_tracking_config: {
      enabled: boolean;
      mailbox?: string;
      weights?: unknown;
    };
  }>;
  // outlook_folder_map (mailbox-scoped)
  folderMap: Array<{
    folder_id: string;
    mailbox: string;
    bucket: string;
    tracked: boolean;
    display_name: string | null;
  }>;
  // outlook_delta_tokens (folder_id PK)
  tokens: Map<string, { delta_link: string | null; bootstrapped: boolean }>;
  // email_pipeline.emails — only source='outlook' rows; immutable id = source_id
  emails: Array<{
    id: string;
    source_id: string | null;
    conversation_id: string | null;
    mailbox: string;
    source: string;
  }>;
  // pipeline_events stage-4 ledger
  ledger: Array<{ email_id: string; swarm_type: string; stage: number }>;
  // public.swarm_written_categories baseline (Phase 117): per-message last AI:
  // category our system wrote, keyed by email_id, scoped by swarm_type.
  writtenCategories: Array<{
    email_id: string;
    swarm_type: string;
    ai_category: string | null;
  }>;
  // written rows
  transitions: Array<Record<string, unknown>>;
  signals: Array<Record<string, unknown>>;
  // when true, the NEXT insert into swarm_review_signals throws 23505
  throw23505OnNextSignalInsert: boolean;
};

let db: DBState;

// A tiny chainable query builder that resolves to { data, error } and applies
// .eq/.in filters against the in-memory tables.
function makeQuery(table: string) {
  const filters: Array<{ col: string; val: unknown; kind: "eq" | "in" }> = [];
  let schemaName = "public";

  const builder: Record<string, unknown> = {};

  const applyFilters = <T extends Record<string, unknown>>(rows: T[]): T[] =>
    rows.filter((r) =>
      filters.every((f) => {
        const cell =
          f.col === "behavior_tracking_config->>enabled"
            ? String(
                (r as { behavior_tracking_config?: { enabled?: boolean } })
                  .behavior_tracking_config?.enabled,
              )
            : (r as Record<string, unknown>)[f.col];
        if (f.kind === "in") return (f.val as unknown[]).includes(cell);
        return cell === f.val;
      }),
    );

  const resolveSelect = (): { data: unknown; error: unknown } => {
    if (table === "swarms") {
      return { data: applyFilters(db.swarms as never), error: null };
    }
    if (table === "outlook_folder_map") {
      const rows = db.folderMap.filter((r) =>
        filters.every((f) =>
          f.kind === "eq" ? (r as Record<string, unknown>)[f.col] === f.val : true,
        ),
      );
      return { data: rows, error: null };
    }
    if (table === "emails" && schemaName === "email_pipeline") {
      return { data: applyFilters(db.emails as never), error: null };
    }
    if (table === "swarm_email_transitions") {
      return { data: applyFilters(db.transitions as never), error: null };
    }
    if (table === "pipeline_events") {
      const rows = applyFilters(db.ledger as never).map((r) => ({
        email_id: (r as { email_id: string }).email_id,
      }));
      return { data: rows, error: null };
    }
    if (table === "swarm_written_categories") {
      const rows = applyFilters(db.writtenCategories as never).map((r) => ({
        email_id: (r as { email_id: string }).email_id,
        ai_category: (r as { ai_category: string | null }).ai_category,
      }));
      return { data: rows, error: null };
    }
    return { data: [], error: null };
  };

  // chainable filter methods (.is/.gte/.limit zijn no-op chains voor de
  // left_to_untracked bootstrap-correlatie-query — gap-fix 2026-06-04; .is
  // filtert wel op null-gelijkheid zodat gecorrigeerde rijen niet meedoen)
  for (const k of ["eq", "in", "order", "select", "is", "gte", "limit", "update"]) {
    builder[k] = (...args: unknown[]) => {
      if (k === "eq") filters.push({ col: String(args[0]), val: args[1], kind: "eq" });
      if (k === "in")
        filters.push({ col: String(args[0]), val: args[1], kind: "in" });
      if (k === "is" && args[1] === null)
        filters.push({ col: String(args[0]), val: null, kind: "eq" });
      if (k === "update") {
        // .update({...}).in(...) — pas toe bij await via then() hieronder.
        (builder as { _updatePatch?: unknown })._updatePatch = args[0];
      }
      return builder;
    };
  }
  builder.maybeSingle = async () => {
    if (table === "outlook_delta_tokens") {
      const fid = filters.find((f) => f.col === "folder_id")?.val as string;
      const tok = db.tokens.get(fid);
      return { data: tok ? { delta_link: tok.delta_link } : null, error: null };
    }
    const res = resolveSelect();
    const arr = res.data as unknown[];
    return { data: arr[0] ?? null, error: res.error };
  };
  builder.upsert = async (rows: unknown) => {
    const list = Array.isArray(rows) ? rows : [rows];
    if (table === "outlook_folder_map") {
      for (const r of list as DBState["folderMap"]) db.folderMap.push(r);
    }
    if (table === "outlook_delta_tokens") {
      for (const r of list as Array<{
        folder_id: string;
        delta_link: string | null;
        bootstrapped: boolean;
      }>) {
        db.tokens.set(r.folder_id, {
          delta_link: r.delta_link,
          bootstrapped: r.bootstrapped,
        });
      }
    }
    return { data: null, error: null };
  };
  builder.insert = async (row: Record<string, unknown>) => {
    if (table === "swarm_email_transitions") {
      const dk = row.dedupe_key as string;
      if (db.transitions.some((t) => t.dedupe_key === dk)) {
        return { data: null, error: { code: "23505", message: "duplicate key value" } };
      }
      db.transitions.push(row);
      return { data: null, error: null };
    }
    if (table === "swarm_review_signals") {
      if (db.throw23505OnNextSignalInsert) {
        db.throw23505OnNextSignalInsert = false;
        return { data: null, error: { code: "23505", message: "duplicate key value" } };
      }
      const dk = row.dedupe_key as string;
      if (db.signals.some((s) => s.dedupe_key === dk)) {
        return { data: null, error: { code: "23505", message: "duplicate key value" } };
      }
      db.signals.push(row);
      return { data: null, error: null };
    }
    return { data: null, error: null };
  };

  // make `await builder` resolve to a select on the filtered table — of, bij
  // een .update(...)-chain, de patch toepassen op de gematchte rijen.
  (builder as { then?: unknown }).then = (
    onF?: (v: { data: unknown; error: unknown }) => unknown,
    onR?: (e: unknown) => unknown,
  ) => {
    const patch = (builder as { _updatePatch?: Record<string, unknown> })
      ._updatePatch;
    if (patch && table === "swarm_email_transitions") {
      for (const row of applyFilters(db.transitions as never) as Record<
        string,
        unknown
      >[]) {
        Object.assign(row, patch);
      }
      return Promise.resolve({ data: null, error: null }).then(onF, onR);
    }
    return Promise.resolve(resolveSelect()).then(onF, onR);
  };

  // expose schema setter
  (builder as { __setSchema?: (s: string) => void }).__setSchema = (s: string) => {
    schemaName = s;
  };

  return builder;
}

function makeAdmin() {
  let pendingSchema = "public";
  const admin: Record<string, unknown> = {
    from: (table: string) => {
      const q = makeQuery(table);
      (q as { __setSchema?: (s: string) => void }).__setSchema?.(pendingSchema);
      pendingSchema = "public";
      return q;
    },
    schema: (s: string) => {
      pendingSchema = s;
      return admin;
    },
  };
  return admin;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => makeAdmin(),
}));

// ---- Step stub -----------------------------------------------------------
function makeStep() {
  const calls: Array<{ id: string }> = [];
  const run = vi.fn(async (id: string, fn: () => unknown) => {
    calls.push({ id });
    return await fn();
  });
  return { run, calls };
}

// ---- graphFetch URL router -----------------------------------------------
// resolveFolders walks mailFolders + childFolders; deltaPage hits .../delta.
function routeGraph(folderTree: {
  inboxHasChildren?: boolean;
}): (url: string) => Response {
  return (url: string) => {
    // top-level folders
    if (/\/mailFolders\?/.test(url)) {
      return jsonResponse({
        value: [
          {
            id: "F-inbox",
            displayName: "Inbox",
            childFolderCount: folderTree.inboxHasChildren ? 1 : 0,
          },
          { id: "F-archive", displayName: "Archief", childFolderCount: 0 },
        ],
      });
    }
    if (/\/childFolders/.test(url)) {
      return jsonResponse({ value: [] });
    }
    // delta calls handled by per-test override below
    return jsonResponse({ value: [], "@odata.deltaLink": "DELTA" });
  };
}

import { swarmBehaviorSync } from "@/lib/inngest/functions/swarm-behavior-sync";
type Ctx = {
  step: { run: ReturnType<typeof vi.fn>; calls?: Array<{ id: string }> };
  event?: { data?: Record<string, unknown> };
};
type Handler = (ctx: Ctx) => Promise<Record<string, unknown>>;
function getHandler(): Handler {
  return (swarmBehaviorSync as unknown as { handler: Handler }).handler;
}

beforeEach(() => {
  vi.clearAllMocks();
  graphFetchMock.mockReset();
  db = {
    swarms: [
      {
        swarm_type: "sales-email",
        behavior_tracking_config: { enabled: true, mailbox: MAILBOX },
      },
      {
        swarm_type: "debtor-email",
        behavior_tracking_config: { enabled: false },
      },
    ],
    folderMap: [],
    tokens: new Map(),
    emails: [],
    ledger: [],
    writtenCategories: [],
    transitions: [],
    signals: [],
    throw23505OnNextSignalInsert: false,
  };
});

// Pre-seed the folder-map so the worker skips the resolveFolders bootstrap and
// tracks F-inbox + F-archive. Used by the non-bootstrap tests.
function seedFolderMap() {
  db.folderMap = [
    {
      folder_id: "F-inbox",
      mailbox: MAILBOX,
      bucket: "inbox",
      tracked: true,
      display_name: "Inbox",
    },
    {
      folder_id: "F-archive",
      mailbox: MAILBOX,
      bucket: "archive",
      tracked: true,
      display_name: "Archief",
    },
  ];
}

describe("swarmBehaviorSync — worker level", () => {
  it("1: bootstrap folder (no token) writes 0 signals but persists deltaLink + bootstrapped=true", async () => {
    // No folder map yet → worker resolves folders (graph tree), then polls each.
    const tree = routeGraph({ inboxHasChildren: false });
    graphFetchMock.mockImplementation(async (url: string) => {
      if (/\/messages\/delta/.test(url)) {
        // bootstrap page: returns messages but wasBootstrap=true (no prior token)
        return jsonResponse({
          value: [
            { id: "m1", parentFolderId: "F-inbox", isRead: false },
            { id: "m2", parentFolderId: "F-archive", isRead: true },
          ],
          "@odata.deltaLink": "https://graph/delta?token=BOOT",
        });
      }
      return tree(url);
    });

    const ret = await getHandler()({ event: { data: {} }, step: makeStep() });

    expect(db.signals).toHaveLength(0);
    // tokens persisted for both tracked folders, bootstrapped=true
    expect(db.tokens.get("F-inbox")?.bootstrapped).toBe(true);
    expect(db.tokens.get("F-archive")?.bootstrapped).toBe(true);
    expect(db.tokens.get("F-inbox")?.delta_link).toBe(
      "https://graph/delta?token=BOOT",
    );
    const r = (ret.results as PerSwarmLike[])[0];
    expect(r.swarm_type).toBe("sales-email");
    expect(r.bootstrapped_folders).toBeGreaterThanOrEqual(2);
    expect(r.signals_written).toBe(0);
  });

  it("2: follow-up restore + ledger-hit -> correctie_false_positive (sales-email)", async () => {
    seedFolderMap();
    // existing tokens => non-bootstrap delta
    db.tokens.set("F-inbox", { delta_link: "PREV-inbox", bootstrapped: true });
    db.tokens.set("F-archive", { delta_link: "PREV-archive", bootstrapped: true });
    // emails: immutable id "m-restore" maps to email_id "e-restore"
    db.emails = [
      {
        id: "e-restore",
        source_id: "m-restore",
        conversation_id: "c1",
        mailbox: MAILBOX,
        source: "outlook",
      },
    ];
    // ledger: our system stage-4 archived e-restore for sales-email
    db.ledger = [{ email_id: "e-restore", swarm_type: "sales-email", stage: 4 }];
    // prior transition: last-known bucket of m-restore = archive (so inbox-arrival = restore)
    db.transitions = [
      {
        immutable_id: "m-restore",
        swarm_type: "sales-email",
        mailbox: MAILBOX,
        to_bucket: "archive",
        observed_at: "2026-06-01T00:00:00Z",
        dedupe_key: "prior",
      },
    ];

    const tree = routeGraph({ inboxHasChildren: false });
    graphFetchMock.mockImplementation(async (url: string) => {
      if (/F-inbox\/messages\/delta/.test(url) || url === "PREV-inbox") {
        // m-restore now appears in inbox (entered inbox; left archive last tick)
        return jsonResponse({
          value: [{ id: "m-restore", parentFolderId: "F-inbox" }],
          "@odata.deltaLink": "DELTA-inbox",
        });
      }
      if (/F-archive\/messages\/delta/.test(url) || url === "PREV-archive") {
        return jsonResponse({ value: [], "@odata.deltaLink": "DELTA-archive" });
      }
      return tree(url);
    });

    await getHandler()({ event: { data: {} }, step: makeStep() });

    const correctie = db.signals.filter(
      (s) => s.verdict === "correctie_false_positive",
    );
    expect(correctie).toHaveLength(1);
    expect(correctie[0].swarm_type).toBe("sales-email");
    expect(correctie[0].email_id).toBe("e-restore");
  });

  it("3: same tick twice (same dedupe_key) -> 23505 no-op, no duplicate signal row", async () => {
    seedFolderMap();
    db.tokens.set("F-inbox", { delta_link: "PREV-inbox", bootstrapped: true });
    db.tokens.set("F-archive", { delta_link: "PREV-archive", bootstrapped: true });
    db.emails = [
      {
        id: "e-handled",
        source_id: "m-handled",
        conversation_id: null,
        mailbox: MAILBOX,
        source: "outlook",
      },
    ];
    // last-known inbox so inbox->afgehandeld is detectable; but we route it to
    // afgehandeld directly via folder map below.
    db.folderMap.push({
      folder_id: "F-afgehandeld",
      mailbox: MAILBOX,
      bucket: "afgehandeld",
      tracked: true,
      display_name: "afgehandeld 2026",
    });
    db.transitions = [
      {
        immutable_id: "m-handled",
        swarm_type: "sales-email",
        mailbox: MAILBOX,
        to_bucket: "inbox",
        observed_at: "2026-06-01T00:00:00Z",
        dedupe_key: "prior",
      },
    ];
    db.tokens.set("F-afgehandeld", {
      delta_link: "PREV-afg",
      bootstrapped: true,
    });

    const tree = routeGraph({ inboxHasChildren: false });
    graphFetchMock.mockImplementation(async (url: string) => {
      if (/F-afgehandeld\/messages\/delta/.test(url) || url === "PREV-afg") {
        return jsonResponse({
          value: [{ id: "m-handled", parentFolderId: "F-afgehandeld" }],
          "@odata.deltaLink": "DELTA-afg",
        });
      }
      if (/messages\/delta/.test(url) || /^PREV-/.test(url)) {
        return jsonResponse({ value: [], "@odata.deltaLink": "DELTA-empty" });
      }
      return tree(url);
    });

    // First tick: writes one approve_handled signal.
    await getHandler()({ event: { data: {} }, step: makeStep() });
    const afterFirst = db.signals.length;
    expect(afterFirst).toBe(1);
    expect(db.signals[0].verdict).toBe("approve_handled");

    // Force the next signal insert to raise 23505 (duplicate) — must be swallowed.
    db.throw23505OnNextSignalInsert = true;
    await expect(
      getHandler()({ event: { data: {} }, step: makeStep() }),
    ).resolves.toBeTruthy();
    // dedupe_key carries tickIso which differs per run, but our forced 23505
    // proves the no-op path: no throw, and the dup row is NOT added.
    expect(db.signals.length).toBe(afterFirst);
  });

  it("4: Sugar-id event (no source=outlook match) is skipped", async () => {
    seedFolderMap();
    db.tokens.set("F-inbox", { delta_link: "PREV-inbox", bootstrapped: true });
    db.tokens.set("F-archive", { delta_link: "PREV-archive", bootstrapped: true });
    db.folderMap.push({
      folder_id: "F-afgehandeld",
      mailbox: MAILBOX,
      bucket: "afgehandeld",
      tracked: true,
      display_name: "afgehandeld 2026",
    });
    db.tokens.set("F-afgehandeld", { delta_link: "PREV-afg", bootstrapped: true });
    // emails table is EMPTY -> the Sugar-UUID never resolves to an email_id.
    db.emails = [];
    db.transitions = [
      {
        immutable_id: "sugar-uuid",
        swarm_type: "sales-email",
        mailbox: MAILBOX,
        to_bucket: "inbox",
        observed_at: "2026-06-01T00:00:00Z",
        dedupe_key: "prior",
      },
    ];

    const tree = routeGraph({ inboxHasChildren: false });
    graphFetchMock.mockImplementation(async (url: string) => {
      if (/F-afgehandeld\/messages\/delta/.test(url) || url === "PREV-afg") {
        return jsonResponse({
          value: [{ id: "sugar-uuid", parentFolderId: "F-afgehandeld" }],
          "@odata.deltaLink": "DELTA-afg",
        });
      }
      if (/messages\/delta/.test(url) || /^PREV-/.test(url)) {
        return jsonResponse({ value: [], "@odata.deltaLink": "DELTA-empty" });
      }
      return tree(url);
    });

    const ret = await getHandler()({ event: { data: {} }, step: makeStep() });
    expect(db.signals).toHaveLength(0);
    expect(db.transitions.filter((t) => t.dedupe_key !== "prior")).toHaveLength(0);
    const r = (ret.results as PerSwarmLike[])[0];
    expect(r.skipped_sugar).toBeGreaterThanOrEqual(1);
  });

  it("5: registry iteration — disabled swarm is not polled", async () => {
    seedFolderMap();
    db.tokens.set("F-inbox", { delta_link: "PREV-inbox", bootstrapped: true });
    db.tokens.set("F-archive", { delta_link: "PREV-archive", bootstrapped: true });
    // add a second ENABLED-looking but enabled=false swarm with a different mailbox
    db.swarms.push({
      swarm_type: "support-tickets",
      behavior_tracking_config: { enabled: false, mailbox: "support@other.nl" },
    });

    // Use a FRESH folder-map (no seeded tokens) so the bootstrap step calls
    // resolveFolders -> graphFetch with a /users/<mailbox>/ URL. That lets us
    // observe exactly which mailbox(es) the worker touches.
    db.folderMap = [];
    db.tokens = new Map();
    const polledMailboxes = new Set<string>();
    const tree = routeGraph({ inboxHasChildren: false });
    graphFetchMock.mockImplementation(async (url: string) => {
      const m = url.match(/users\/([^/]+)\//);
      if (m) polledMailboxes.add(decodeURIComponent(m[1]));
      if (/messages\/delta/.test(url) || /^PREV-/.test(url)) {
        return jsonResponse({ value: [], "@odata.deltaLink": "DELTA-empty" });
      }
      return tree(url);
    });

    const ret = await getHandler()({ event: { data: {} }, step: makeStep() });
    expect(ret.swarms_processed).toBe(1);
    expect((ret.results as PerSwarmLike[])[0].swarm_type).toBe("sales-email");
    expect(polledMailboxes.has(MAILBOX)).toBe(true);
    expect(polledMailboxes.has("support@other.nl")).toBe(false);
  });
});

type PerSwarmLike = {
  swarm_type: string;
  signals_written: number;
  bootstrapped_folders: number;
  skipped_sugar: number;
};

// ---- Phase 112.5-05: prevCategories seeded from swarm_written_categories -----
//
// The worker now SELECTs public.swarm_written_categories (Phase 117 baseline) for
// the resolved email_ids, scoped by swarm_type, and seeds prevCategories keyed by
// immutable_id. An operator edit of the AI: intent category on an in-inbox message
// fires category_edited -> reclassify in swarm_review_signals.
//
// Helper: stage an in-place category edit on a resolved inbox email whose new
// categories differ from the seeded baseline. The message must stay in the same
// (inbox) folder so it is NOT a move — only the category set changes.
function seedCategoryEditScenario(opts: {
  immutableId: string;
  emailId: string;
  baselineAiCategory: string | null; // the swarm_written_categories row (null = no baseline)
  newCategories: string[]; // the operator's edited categories on the delta event
}) {
  seedFolderMap();
  db.tokens.set("F-inbox", { delta_link: "PREV-inbox", bootstrapped: true });
  db.tokens.set("F-archive", { delta_link: "PREV-archive", bootstrapped: true });
  db.emails = [
    {
      id: opts.emailId,
      source_id: opts.immutableId,
      conversation_id: null,
      mailbox: MAILBOX,
      source: "outlook",
    },
  ];
  if (opts.baselineAiCategory !== null) {
    db.writtenCategories = [
      {
        email_id: opts.emailId,
        swarm_type: "sales-email",
        ai_category: opts.baselineAiCategory,
      },
    ];
  }

  const tree = routeGraph({ inboxHasChildren: false });
  graphFetchMock.mockImplementation(async (url: string) => {
    if (/F-inbox\/messages\/delta/.test(url) || url === "PREV-inbox") {
      return jsonResponse({
        value: [
          {
            id: opts.immutableId,
            parentFolderId: "F-inbox",
            categories: opts.newCategories,
          },
        ],
        "@odata.deltaLink": "DELTA-inbox",
      });
    }
    if (/F-archive\/messages\/delta/.test(url) || url === "PREV-archive") {
      return jsonResponse({ value: [], "@odata.deltaLink": "DELTA-archive" });
    }
    return tree(url);
  });
}

describe("swarmBehaviorSync — category_edited via swarm_written_categories baseline (Phase 112.5-05)", () => {
  it("7: operator changes AI: quote_request -> AI: order_status => reclassify, category_key 'order_status', swarm_type 'sales-email'", async () => {
    seedCategoryEditScenario({
      immutableId: "m-edit",
      emailId: "e-edit",
      baselineAiCategory: "AI: quote_request",
      newCategories: ["AI: order_status"],
    });

    await getHandler()({ event: { data: {} }, step: makeStep() });

    const reclassify = db.signals.filter((s) => s.verdict === "reclassify");
    expect(reclassify).toHaveLength(1);
    expect(reclassify[0].category_key).toBe("order_status");
    expect(reclassify[0].swarm_type).toBe("sales-email");
    expect(reclassify[0].email_id).toBe("e-edit");
  });

  it("8: operator removes the AI: label (categories []) => reclassify, category_key null", async () => {
    seedCategoryEditScenario({
      immutableId: "m-rm",
      emailId: "e-rm",
      baselineAiCategory: "AI: quote_request",
      newCategories: [],
    });

    await getHandler()({ event: { data: {} }, step: makeStep() });

    const reclassify = db.signals.filter((s) => s.verdict === "reclassify");
    expect(reclassify).toHaveLength(1);
    expect(reclassify[0].category_key).toBe(null);
    expect(reclassify[0].email_id).toBe("e-rm");
  });

  it("9: NO baseline row => NO category_edited signal (fail-safe — dormant default preserved)", async () => {
    seedCategoryEditScenario({
      immutableId: "m-nobase",
      emailId: "e-nobase",
      baselineAiCategory: null, // no swarm_written_categories row
      newCategories: ["AI: order_status"],
    });

    await getHandler()({ event: { data: {} }, step: makeStep() });

    expect(db.signals.filter((s) => s.verdict === "reclassify")).toHaveLength(0);
  });

  it("10: re-ticking the same operator edit => no second reclassify row (23505 no-op)", async () => {
    seedCategoryEditScenario({
      immutableId: "m-idem",
      emailId: "e-idem",
      baselineAiCategory: "AI: quote_request",
      newCategories: ["AI: order_status"],
    });

    await getHandler()({ event: { data: {} }, step: makeStep() });
    const afterFirst = db.signals.filter(
      (s) => s.verdict === "reclassify",
    ).length;
    expect(afterFirst).toBe(1);

    // Force the next signal insert to raise 23505 (duplicate) — must be swallowed.
    db.throw23505OnNextSignalInsert = true;
    await expect(
      getHandler()({ event: { data: {} }, step: makeStep() }),
    ).resolves.toBeTruthy();
    expect(db.signals.filter((s) => s.verdict === "reclassify").length).toBe(
      afterFirst,
    );
  });
});

describe("swarmBehaviorSync — bootstrap-correlatie (gap-fix 2026-06-04)", () => {
  it("6: pending left_to_untracked + nieuw-ontdekte afgehandeld-jaarmap -> moved_to_afgehandeld + approve_handled", async () => {
    db.swarms = [
      {
        swarm_type: "sales-email",
        behavior_tracking_config: { enabled: true, mailbox: MAILBOX },
      },
    ];
    // Map kent alleen inbox+archive; 'afgehandeld' (F-afg) en jaarmap '2026'
    // (F-2026) zijn NIEUW — de per-tick refresh moet ze ontdekken.
    seedFolderMap();
    db.tokens.set("F-inbox", { delta_link: "PREV-inbox", bootstrapped: true });
    db.tokens.set("F-archive", { delta_link: "PREV-archive", bootstrapped: true });
    db.emails = [
      { id: "e-d1", source_id: "IM-d1", conversation_id: null, mailbox: MAILBOX, source: "outlook" },
    ];
    // De eerder vastgelegde verdwijning uit de inbox (vorige tick).
    db.transitions = [
      {
        id: "corr-1",
        swarm_type: "sales-email",
        mailbox: MAILBOX,
        email_id: "e-d1",
        immutable_id: "IM-d1",
        kind: "left_to_untracked",
        from_bucket: "inbox",
        to_bucket: null,
        dedupe_key: "sales-email|IM-d1|left_to_untracked|earlier",
        observed_at: new Date(Date.now() - 3_600_000).toISOString(),
      },
    ];

    graphFetchMock.mockImplementation(async (url: string) => {
      if (/\/mailFolders\?/.test(url)) {
        return jsonResponse({
          value: [
            { id: "F-inbox", displayName: "Inbox", childFolderCount: 1 },
            { id: "F-archive", displayName: "Archief", childFolderCount: 0 },
          ],
        });
      }
      if (/F-inbox\/childFolders/.test(url)) {
        return jsonResponse({
          value: [{ id: "F-afg", displayName: "afgehandeld", childFolderCount: 1 }],
        });
      }
      if (/F-afg\/childFolders/.test(url)) {
        return jsonResponse({
          value: [{ id: "F-2026", displayName: "2026", childFolderCount: 0 }],
        });
      }
      if (/F-inbox\/messages\/delta/.test(url) || url === "PREV-inbox") {
        return jsonResponse({ value: [], "@odata.deltaLink": "NEXT-inbox" });
      }
      if (/F-archive\/messages\/delta/.test(url) || url === "PREV-archive") {
        return jsonResponse({ value: [], "@odata.deltaLink": "NEXT-archive" });
      }
      if (/F-afg\/messages\/delta/.test(url)) {
        return jsonResponse({ value: [], "@odata.deltaLink": "BOOT-afg" });
      }
      if (/F-2026\/messages\/delta/.test(url)) {
        // bootstrap-inhoud van de verse jaarmap bevat de verdwenen mail
        return jsonResponse({
          value: [{ id: "IM-d1", parentFolderId: "F-2026" }],
          "@odata.deltaLink": "BOOT-2026",
        });
      }
      return jsonResponse({ value: [], "@odata.deltaLink": "DELTA" });
    });

    const out = (await getHandler()({ step: makeStep() })) as {
      results: Array<{ transitions_written: number; signals_written: number; by_verdict: Record<string, number> }>;
    };

    // refresh ontdekte F-afg + F-2026 met afgehandeld-bucket (ancestry).
    const f2026 = db.folderMap.find((f) => f.folder_id === "F-2026");
    expect(f2026?.bucket).toBe("afgehandeld");

    // de correlatie promoveerde de pending rij naar een echte move + verdict.
    const promoted = db.transitions.find((t) => t.kind === "moved_to_afgehandeld");
    expect(promoted).toMatchObject({ immutable_id: "IM-d1", from_bucket: "inbox", to_bucket: "afgehandeld" });
    const original = db.transitions.find((t) => t.id === "corr-1");
    expect(original?.to_bucket).toBe("resolved_by_bootstrap");
    expect(out.results[0].by_verdict).toMatchObject({ approve_handled: 1 });
    const signal = db.signals.find((s) => s.verdict === "approve_handled");
    expect(signal).toMatchObject({ email_id: "e-d1", transition_kind: "moved_to_afgehandeld" });
  });
});
