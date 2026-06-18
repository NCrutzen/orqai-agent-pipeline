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
      mailboxes?: string[];
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
  // Phase 119: rows written to pipeline_events (onFailure telemetry sink).
  // Kept separate from `ledger` (which models the stage-4 ledger-join SELECT).
  pipelineEventInserts: Array<Record<string, unknown>>;
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
    if (table === "pipeline_events") {
      db.pipelineEventInserts.push(row);
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

import {
  swarmBehaviorSync,
  swarmBehaviorSyncMailbox,
} from "@/lib/inngest/functions/swarm-behavior-sync";
import { inngest } from "@/lib/inngest/client";
type Ctx = {
  step: { run: ReturnType<typeof vi.fn>; calls?: Array<{ id: string }> };
  event?: { data?: Record<string, unknown> };
};
type Handler = (ctx: Ctx) => Promise<Record<string, unknown>>;

// Phase 119: the cron entrypoint is now the ORCHESTRATOR (fans out one
// swarm/behavior-sync.mailbox event per enabled (swarm × mailbox)); the
// per-mailbox WORKER processes exactly one mailbox per invocation. Existing
// per-mailbox behaviour tests target the worker handler; fan-out/enablement
// tests target the orchestrator and assert on the captured inngest.send events.
function getOrchestratorHandler(): Handler {
  return (swarmBehaviorSync as unknown as { handler: Handler }).handler;
}
function getWorkerHandler(): Handler {
  return (swarmBehaviorSyncMailbox as unknown as { handler: Handler }).handler;
}
const SALES = "sales-email";
// Capture the orchestrator's fanned-out swarm/behavior-sync.mailbox events.
// The orchestrator sends a single BATCH (array) per fan-out, so flatten any
// array arg as well as a possible single-payload arg.
function fannedOutEvents(): Array<{
  name: string;
  data: Record<string, unknown>;
}> {
  type Ev = { name: string; data: Record<string, unknown> };
  return (vi.mocked(inngest.send).mock.calls as unknown as Array<[Ev | Ev[]]>)
    .flatMap((c) => (Array.isArray(c[0]) ? c[0] : [c[0]]))
    .filter((e): e is Ev => !!e && e.name === "swarm/behavior-sync.mailbox");
}
// Convenience: invoke the worker for a single (swarm, mailbox).
function runWorker(
  mailbox: string,
  step = makeStep(),
  swarm_type = SALES,
): Promise<Record<string, unknown>> {
  return getWorkerHandler()({ event: { data: { swarm_type, mailbox } }, step });
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
    pipelineEventInserts: [],
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

    const ret = await runWorker(MAILBOX);

    expect(db.signals).toHaveLength(0);
    // tokens persisted for both tracked folders, bootstrapped=true
    expect(db.tokens.get("F-inbox")?.bootstrapped).toBe(true);
    expect(db.tokens.get("F-archive")?.bootstrapped).toBe(true);
    expect(db.tokens.get("F-inbox")?.delta_link).toBe(
      "https://graph/delta?token=BOOT",
    );
    // Phase 119: the worker returns the single PerSwarmCounts directly (no results[]).
    const r = ret as unknown as PerSwarmLike;
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

    await runWorker(MAILBOX);

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
    await runWorker(MAILBOX);
    const afterFirst = db.signals.length;
    expect(afterFirst).toBe(1);
    expect(db.signals[0].verdict).toBe("approve_handled");

    // Force the next signal insert to raise 23505 (duplicate) — must be swallowed.
    db.throw23505OnNextSignalInsert = true;
    await expect(runWorker(MAILBOX)).resolves.toBeTruthy();
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

    const ret = await runWorker(MAILBOX);
    expect(db.signals).toHaveLength(0);
    expect(db.transitions.filter((t) => t.dedupe_key !== "prior")).toHaveLength(0);
    const r = ret as unknown as PerSwarmLike;
    expect(r.skipped_sugar).toBeGreaterThanOrEqual(1);
  });

  it("5: registry iteration — disabled swarm is NOT fanned out (orchestrator)", async () => {
    // add a second enabled=false swarm with a different mailbox
    db.swarms.push({
      swarm_type: "support-tickets",
      behavior_tracking_config: { enabled: false, mailbox: "support@other.nl" },
    });

    // Phase 119: the orchestrator reads the registry and fans out one
    // swarm/behavior-sync.mailbox event per ENABLED (swarm × mailbox). It
    // touches no Graph — we assert on the captured inngest.send events.
    await getOrchestratorHandler()({ event: { data: {} }, step: makeStep() });

    const events = fannedOutEvents();
    expect(events).toHaveLength(1);
    expect(events[0].data).toMatchObject({
      swarm_type: "sales-email",
      mailbox: MAILBOX,
    });
    // disabled swarms produce no fan-out
    expect(events.some((e) => e.data.mailbox === "support@other.nl")).toBe(false);
    // orchestrator does no Graph work during fan-out
    expect(graphFetchMock).not.toHaveBeenCalled();
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
  source?: string; // ingest source tag on the email row (default 'outlook')
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
      source: opts.source ?? "outlook",
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

    await runWorker(MAILBOX);

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

    await runWorker(MAILBOX);

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

    await runWorker(MAILBOX);

    expect(db.signals.filter((s) => s.verdict === "reclassify")).toHaveLength(0);
  });

  it("10: re-ticking the same operator edit => no second reclassify row (23505 no-op)", async () => {
    seedCategoryEditScenario({
      immutableId: "m-idem",
      emailId: "e-idem",
      baselineAiCategory: "AI: quote_request",
      newCategories: ["AI: order_status"],
    });

    await runWorker(MAILBOX);
    const afterFirst = db.signals.filter(
      (s) => s.verdict === "reclassify",
    ).length;
    expect(afterFirst).toBe(1);

    // Force the next signal insert to raise 23505 (duplicate) — must be swallowed.
    db.throw23505OnNextSignalInsert = true;
    await expect(runWorker(MAILBOX)).resolves.toBeTruthy();
    expect(db.signals.filter((s) => s.verdict === "reclassify").length).toBe(
      afterFirst,
    );
  });

  it("14: a zapier-debtor-ingest row resolves + fires category_edited (widened source filter)", async () => {
    // The debtor-email ingest tags rows source='zapier-debtor-ingest' (sales is
    // 'outlook'). Both store the Outlook messageId as source_id, so the
    // immutable_id->email_id match works once the source filter accepts both.
    // Pre-fix (.eq("source","outlook")) this row never resolved -> 0 signals (RED).
    seedCategoryEditScenario({
      immutableId: "m-zap",
      emailId: "e-zap",
      baselineAiCategory: "AI: quote_request",
      newCategories: ["AI: order_status"],
      source: "zapier-debtor-ingest",
    });

    await runWorker(MAILBOX);

    const reclassify = db.signals.filter((s) => s.verdict === "reclassify");
    expect(reclassify).toHaveLength(1);
    expect(reclassify[0].email_id).toBe("e-zap");
    expect(reclassify[0].category_key).toBe("order_status");
  });
});

describe("swarmBehaviorSync — multi-mailbox iteration (Phase 118)", () => {
  const A = "a@smeba.nl";
  const B = "b@smeba.nl";

  // A fresh folder-map per mailbox so the worker resolves folders (graph tree)
  // and we can observe which mailboxes are touched via the /users/<mailbox>/ URL.
  function routeForMailboxes(): {
    fetch: (url: string) => Response;
    polled: Set<string>;
  } {
    const polled = new Set<string>();
    const tree = routeGraph({ inboxHasChildren: false });
    const fetch = (url: string): Response => {
      const m = url.match(/users\/([^/]+)\//);
      if (m) polled.add(decodeURIComponent(m[1]));
      if (/messages\/delta/.test(url) || /^PREV-/.test(url)) {
        return jsonResponse({ value: [], "@odata.deltaLink": "DELTA-empty" });
      }
      return tree(url);
    };
    return { fetch, polled };
  }

  it("11: a swarm with mailboxes:[A,B] fans out one event per mailbox (orchestrator)", async () => {
    db.swarms = [
      {
        swarm_type: "sales-email",
        behavior_tracking_config: { enabled: true, mailboxes: [A, B] },
      },
    ];

    // Phase 119: the orchestrator fans out one swarm/behavior-sync.mailbox event
    // per mailbox; each mailbox is later processed by its own worker invocation.
    await getOrchestratorHandler()({ event: { data: {} }, step: makeStep() });

    const events = fannedOutEvents();
    const mailboxes = events.map((e) => e.data.mailbox);
    expect(mailboxes).toContain(A);
    expect(mailboxes).toContain(B);
    expect(mailboxes).toHaveLength(2);
    for (const e of events) expect(e.data.swarm_type).toBe("sales-email");
  });

  it("12: a single worker invocation's step.run ids are unique (mailbox-suffixed) + singular run/tick", async () => {
    // Cross-mailbox uniqueness is now guaranteed structurally (each mailbox is a
    // separate invocation); this test guards WITHIN-invocation uniqueness.
    db.folderMap = [];
    db.tokens = new Map();

    const { fetch } = routeForMailboxes();
    graphFetchMock.mockImplementation(async (url: string) => fetch(url));

    const step = makeStep();
    await runWorker(A, step);

    const ids = step.calls.map((c) => c.id);
    // every recorded step id is unique (a duplicate would silently memoize)
    expect(new Set(ids).size).toBe(ids.length);

    // the loop-body ids for THIS mailbox are present (mailbox-suffixed)
    expect(ids).toContain(`refresh-folder-map-sales-email-${A}`);
    expect(ids).toContain(`tracked-folders-sales-email-${A}`);
    expect(ids).toContain(`derive-and-write-sales-email-${A}`);
    // top-level run/tick ids stay singular (exactly one each)
    expect(ids.filter((id) => id === "resolve-run-id")).toHaveLength(1);
    expect(ids.filter((id) => id === "resolve-tick-iso")).toHaveLength(1);
  });

  it("13: singular fallback — a row with only mailbox:'X' fans out exactly one event (orchestrator)", async () => {
    const X = "x@smeba.nl";
    db.swarms = [
      {
        swarm_type: "sales-email",
        behavior_tracking_config: { enabled: true, mailbox: X },
      },
    ];

    await getOrchestratorHandler()({ event: { data: {} }, step: makeStep() });

    const events = fannedOutEvents();
    expect(events).toHaveLength(1);
    expect(events[0].data).toMatchObject({ swarm_type: "sales-email", mailbox: X });
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

    const out = (await runWorker(MAILBOX)) as {
      transitions_written: number;
      signals_written: number;
      by_verdict: Record<string, number>;
    };

    // refresh ontdekte F-afg + F-2026 met afgehandeld-bucket (ancestry).
    const f2026 = db.folderMap.find((f) => f.folder_id === "F-2026");
    expect(f2026?.bucket).toBe("afgehandeld");

    // de correlatie promoveerde de pending rij naar een echte move + verdict.
    const promoted = db.transitions.find((t) => t.kind === "moved_to_afgehandeld");
    expect(promoted).toMatchObject({ immutable_id: "IM-d1", from_bucket: "inbox", to_bucket: "afgehandeld" });
    const original = db.transitions.find((t) => t.id === "corr-1");
    expect(original?.to_bucket).toBe("resolved_by_bootstrap");
    expect(out.by_verdict).toMatchObject({ approve_handled: 1 });
    const signal = db.signals.find((s) => s.verdict === "approve_handled");
    expect(signal).toMatchObject({ email_id: "e-d1", transition_kind: "moved_to_afgehandeld" });
  });
});

// ---- Phase 119: fan-out fault isolation + fair budgeting (regression) --------
//
// Encodes the 2026-06-16 production regression as a permanent must-not-regress
// suite: enabling debtor's heavy mailbox starved the shared single-run loop and
// froze the previously-healthy sales observe. Post-119 the cron fans out one
// event per (swarm × mailbox) and each mailbox is its own worker invocation, so
// one mailbox can never abort or starve another. These tests would FAIL against
// the pre-119 single-run loop (a throw aborted everything after it).
describe("swarmBehaviorSync — fan-out fault isolation + fair budgeting (Phase 119 regression)", () => {
  const LARGE = "large@smeba.nl"; // models the 55-folder heavy mailbox
  const BB = "b2@smeba.nl";
  const CC = "c@smeba.nl";

  // A graphFetch router. `throwFor` (decoded mailbox) throws on every call for
  // that mailbox (models a per-folder/resolve failure). `heavyCount` gives the
  // LARGE mailbox many tracked folders; other mailboxes get the default 2.
  function makeRouter(opts: {
    throwFor?: string;
    heavyCount?: number;
  }): { fetch: (url: string) => Response; polled: Set<string> } {
    const polled = new Set<string>();
    const fetch = (url: string): Response => {
      const m = url.match(/users\/([^/]+)\//);
      const mb = m ? decodeURIComponent(m[1]) : null;
      if (mb === opts.throwFor) {
        throw new Error(`forced ${opts.throwFor} mailbox failure`);
      }
      if (mb) polled.add(mb);
      if (/\/mailFolders\?/.test(url)) {
        if (mb === LARGE && opts.heavyCount) {
          return jsonResponse({
            value: Array.from({ length: opts.heavyCount }, (_, i) => ({
              id: `LF-${i}`,
              displayName: `Folder ${i}`,
              childFolderCount: 0,
            })),
          });
        }
        return jsonResponse({
          value: [
            { id: "F-inbox", displayName: "Inbox", childFolderCount: 0 },
            { id: "F-archive", displayName: "Archief", childFolderCount: 0 },
          ],
        });
      }
      if (/\/childFolders/.test(url)) return jsonResponse({ value: [] });
      if (/messages\/delta/.test(url) || /^PREV-/.test(url)) {
        return jsonResponse({ value: [], "@odata.deltaLink": "DELTA-empty" });
      }
      return jsonResponse({ value: [], "@odata.deltaLink": "DELTA" });
    };
    return { fetch, polled };
  }

  it("FAN-OUT-COVERAGE: two enabled swarms (one with a heavy mailbox + a second) fan out every (swarm × mailbox) pair, none dropped", async () => {
    // sales-email has a heavy mailbox LARGE plus BB; debtor-email has CC.
    db.swarms = [
      {
        swarm_type: "sales-email",
        behavior_tracking_config: { enabled: true, mailboxes: [LARGE, BB] },
      },
      {
        swarm_type: "debtor-email",
        behavior_tracking_config: { enabled: true, mailboxes: [CC] },
      },
    ];

    await getOrchestratorHandler()({ event: { data: {} }, step: makeStep() });

    const pairs = fannedOutEvents().map((e) => ({
      swarm_type: e.data.swarm_type,
      mailbox: e.data.mailbox,
    }));
    // exactly the three pairs, none dropped regardless of LARGE's folder count
    expect(pairs).toHaveLength(3);
    expect(pairs).toContainEqual({ swarm_type: "sales-email", mailbox: LARGE });
    expect(pairs).toContainEqual({ swarm_type: "sales-email", mailbox: BB });
    expect(pairs).toContainEqual({ swarm_type: "debtor-email", mailbox: CC });
    // the orchestrator does NO Graph work — heavy folder trees are irrelevant here
    expect(graphFetchMock).not.toHaveBeenCalled();
  });

  it("FAULT-ISOLATION: a throw on one mailbox's worker invocation does NOT prevent the others", async () => {
    db.folderMap = [];
    db.tokens = new Map();
    const { fetch, polled } = makeRouter({ throwFor: LARGE, heavyCount: 12 });
    graphFetchMock.mockImplementation(async (url: string) => fetch(url));

    // LARGE's own invocation fails (its own failed run) ...
    await expect(runWorker(LARGE)).rejects.toThrow(/forced large@smeba\.nl/);
    // ... but BB and CC invocations complete normally (inverse of the regression).
    const rb = (await runWorker(BB)) as { mailbox: string };
    const rc = (await runWorker(CC, makeStep(), "debtor-email")) as {
      mailbox: string;
    };
    expect(rb.mailbox).toBe(BB);
    expect(rc.mailbox).toBe(CC);
    expect(polled.has(BB)).toBe(true);
    expect(polled.has(CC)).toBe(true);
    expect(polled.has(LARGE)).toBe(false); // it threw before polling

    // The failure is attributable per-mailbox: onFailure is wired on the worker
    // config and, when invoked, writes a behavior_sync_mailbox_failed row keyed
    // by the specific (swarm, mailbox).
    const cfg = (
      swarmBehaviorSyncMailbox as unknown as {
        __config: { onFailure?: (a: unknown) => Promise<void> };
      }
    ).__config;
    expect(typeof cfg.onFailure).toBe("function");
    await cfg.onFailure!({
      error: new Error("forced large@smeba.nl mailbox failure"),
      event: { data: { event: { data: { swarm_type: "sales-email", mailbox: LARGE } } } },
    });
    const failRow = db.pipelineEventInserts.find(
      (r) => r.decision === "behavior_sync_mailbox_failed",
    );
    expect(failRow).toBeTruthy();
    expect(
      (failRow?.decision_details as { mailbox?: string } | undefined)?.mailbox,
    ).toBe(LARGE);
  });

  it("BUDGET/NON-STARVATION: BB and CC complete independently of the LARGE mailbox's folder count", async () => {
    db.folderMap = [];
    db.tokens = new Map();
    const { fetch, polled } = makeRouter({ heavyCount: 12 }); // LARGE heavy, no throw
    graphFetchMock.mockImplementation(async (url: string) => fetch(url));

    // Each mailbox is its own invocation — BB and CC do not share LARGE's budget.
    const rLarge = (await runWorker(LARGE)) as { mailbox: string };
    const rb = (await runWorker(BB)) as { mailbox: string; signals_written: number };
    const rc = (await runWorker(CC, makeStep(), "debtor-email")) as {
      mailbox: string;
    };
    expect(rLarge.mailbox).toBe(LARGE);
    expect(rb.mailbox).toBe(BB);
    expect(rc.mailbox).toBe(CC);
    expect(typeof rb.signals_written).toBe("number");
    expect(polled.has(BB)).toBe(true);
    expect(polled.has(CC)).toBe(true);
  });

  it("STEP-ID-UNIQUENESS: a heavy single-mailbox invocation has all-unique step ids + singular run/tick", async () => {
    db.folderMap = [];
    db.tokens = new Map();
    const { fetch } = makeRouter({ heavyCount: 12 });
    graphFetchMock.mockImplementation(async (url: string) => fetch(url));

    const step = makeStep();
    await runWorker(LARGE, step);

    const ids = step.calls.map((c) => c.id);
    // many delta-${...}-${folderId} steps, all unique
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.startsWith(`delta-sales-email-${LARGE}-`)).length)
      .toBeGreaterThanOrEqual(10);
    expect(ids.filter((id) => id === "resolve-run-id")).toHaveLength(1);
    expect(ids.filter((id) => id === "resolve-tick-iso")).toHaveLength(1);
  });
});
