// Phase 80 Plan 01 Wave 0 — RED test scaffold for backfill-stuck-classifying-stage3.
//
// Target file `../backfill-stuck-classifying-stage3` does NOT exist yet
// (Wave 4 / plan 80-05 builds it). The module-not-found is the RED state.
//
// Behaviour modelled per 80-PATTERNS.md §"web/scripts/backfill-stuck-classifying-stage3.ts":
//   - Three-bucket exhaustive routing (HAS_KANBAN / NO_KANBAN / MULTI_KANBAN)
//   - Status-guarded UPDATE (`.eq('status','classifying')`) prevents racing the dispatcher
//   - Dry-run by default; `--apply` to mutate; `--confirm-prod` + typed-phrase
//     prompt for prod gate (Plan 80-05 implements; mock here so the prompt
//     does not block tests)
//
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js: per-test override of select result + capture of
// update / insert calls.
// ---------------------------------------------------------------------------
type FixtureRow = { id: string; email_id: string; kanban_rows: number };
let fixtureRows: FixtureRow[] = [];

const captured = {
  updates: [] as Array<{
    patch: Record<string, unknown>;
    eqs: Array<[string, unknown]>;
  }>,
  inserts: [] as Array<Record<string, unknown>>,
};

vi.mock("@supabase/supabase-js", () => {
  function makeChain() {
    const eqs: Array<[string, unknown]> = [];
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn((col: string, val: unknown) => {
      eqs.push([col, val]);
      return chain;
    });
    chain.in = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() =>
      Promise.resolve({ data: fixtureRows, error: null }),
    );
    chain.update = vi.fn((patch: Record<string, unknown>) => {
      const updEqs: Array<[string, unknown]> = [];
      const updChain: Record<string, unknown> = {};
      updChain.eq = vi.fn((col: string, val: unknown) => {
        updEqs.push([col, val]);
        return updChain;
      });
      // Attach a thenable for `await` on the update chain.
      (updChain as unknown as { then: (r: (v: unknown) => unknown) => unknown }).then = (
        resolve: (v: unknown) => unknown,
      ) => {
        captured.updates.push({ patch, eqs: updEqs });
        return resolve({ data: null, error: null });
      };
      return updChain;
    });
    chain.insert = vi.fn(async (row: Record<string, unknown>) => {
      captured.inserts.push(row);
      return { data: null, error: null };
    });
    return chain;
  }
  return {
    createClient: vi.fn(() => ({
      from: vi.fn(() => makeChain()),
    })),
  };
});

// ---------------------------------------------------------------------------
// Mock node:fs/promises so the NO_KANBAN / MULTI_KANBAN bucket writes can be
// asserted without touching disk.
// ---------------------------------------------------------------------------
const fsCalls = {
  writeFile: [] as Array<{ path: string; data: string }>,
  appendFile: [] as Array<{ path: string; data: string }>,
};
vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn(async (path: string, data: string) => {
    fsCalls.writeFile.push({ path, data });
  }),
  appendFile: vi.fn(async (path: string, data: string) => {
    fsCalls.appendFile.push({ path, data });
  }),
  readFile: vi.fn(async () => "[]"),
}));

// ---------------------------------------------------------------------------
// Mock node:readline/promises so the production typed-phrase prompt resolves
// without TTY input. Plan 80-05 implements the prompt; this mock documents
// the contract (two-factor gate: --confirm-prod flag + typed phrase).
// ---------------------------------------------------------------------------
const readlineQuestionMock = vi.fn(async () => "I understand this writes to production");
vi.mock("node:readline/promises", () => ({
  createInterface: vi.fn(() => ({
    question: readlineQuestionMock,
    close: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/inngest/client in case the script sends events.
// ---------------------------------------------------------------------------
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn().mockResolvedValue({ ids: ["evt"] }),
  },
}));

// ---------------------------------------------------------------------------
// Helpers — toggle process.argv between tests.
// ---------------------------------------------------------------------------
const ORIGINAL_ARGV = process.argv.slice();
function setArgv(extra: string[]) {
  process.argv = ["node", "backfill-stuck-classifying-stage3.ts", ...extra];
}

beforeEach(() => {
  fixtureRows = [];
  captured.updates.length = 0;
  captured.inserts.length = 0;
  fsCalls.writeFile.length = 0;
  fsCalls.appendFile.length = 0;
  readlineQuestionMock.mockClear();
  process.argv = ORIGINAL_ARGV.slice();
  vi.resetModules();
  // Ensure env vars exist so the script does not exit early.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
});

// Helper: dynamic import the (not-yet-existing) script. Each test imports
// fresh because process.argv toggles drive code-paths.
async function importBackfill() {
  // Plan 80-05 (Wave 4) shipped the implementation; this import now resolves.
  return import("../backfill-stuck-classifying-stage3");
}

describe("backfill-stuck-classifying-stage3", () => {
  it("dry-run does NOT mutate DB (apply=false default)", async () => {
    fixtureRows = [{ id: "ar-1", email_id: "em-1", kanban_rows: 1 }];
    setArgv([]); // no --apply

    const mod = await importBackfill();
    const main = (mod as { main?: () => Promise<unknown> }).main;
    if (main) await main();

    expect(captured.updates).toHaveLength(0);
  });

  it("HAS_KANBAN bucket flips status to routed_human_queue (apply=true)", async () => {
    fixtureRows = [{ id: "ar-1", email_id: "em-1", kanban_rows: 1 }];
    setArgv(["--apply"]);

    const mod = await importBackfill();
    const main = (mod as { main?: () => Promise<unknown> }).main;
    if (main) await main();

    const flip = captured.updates.find(
      (u) => u.patch.status === "routed_human_queue",
    );
    expect(flip).toBeDefined();
    // Status-precondition guard: race protection vs dispatcher.
    expect(
      flip!.eqs.some(
        ([col, val]) => col === "status" && val === "classifying",
      ),
    ).toBe(true);
  });

  it("NO_KANBAN bucket writes to JSON file (apply=true), does NOT flip", async () => {
    fixtureRows = [{ id: "ar-2", email_id: "em-2", kanban_rows: 0 }];
    setArgv(["--apply"]);

    const mod = await importBackfill();
    const main = (mod as { main?: () => Promise<unknown> }).main;
    if (main) await main();

    expect(captured.updates).toHaveLength(0);
    const wrote = [...fsCalls.writeFile, ...fsCalls.appendFile].some((c) =>
      c.path.includes("backfill-stuck-no-kanban"),
    );
    expect(wrote).toBe(true);
  });

  it("MULTI_KANBAN bucket flagged via JSON (apply=true), does NOT flip", async () => {
    fixtureRows = [{ id: "ar-3", email_id: "em-3", kanban_rows: 2 }];
    setArgv(["--apply"]);

    const mod = await importBackfill();
    const main = (mod as { main?: () => Promise<unknown> }).main;
    if (main) await main();

    expect(captured.updates).toHaveLength(0);
    const wrote = [...fsCalls.writeFile, ...fsCalls.appendFile].some((c) =>
      c.path.includes("backfill-multi-kanban"),
    );
    expect(wrote).toBe(true);
  });

  it("status-precondition guard prevents racing dispatcher (.eq status classifying on UPDATE)", async () => {
    fixtureRows = [{ id: "ar-4", email_id: "em-4", kanban_rows: 1 }];
    setArgv(["--apply"]);

    const mod = await importBackfill();
    const main = (mod as { main?: () => Promise<unknown> }).main;
    if (main) await main();

    expect(captured.updates.length).toBeGreaterThanOrEqual(1);
    const allHaveGuard = captured.updates.every((u) =>
      u.eqs.some(([col, val]) => col === "status" && val === "classifying"),
    );
    expect(allHaveGuard).toBe(true);
  });

  it("prod gate: typed-phrase prompt is consulted under --confirm-prod (mock returns expected phrase)", async () => {
    fixtureRows = [{ id: "ar-5", email_id: "em-5", kanban_rows: 1 }];
    setArgv(["--apply", "--confirm-prod"]);
    readlineQuestionMock.mockResolvedValueOnce("I understand this writes to production");

    const mod = await importBackfill();
    const main = (mod as { main?: () => Promise<unknown> }).main;
    if (main) await main();

    // Either the prompt was consulted, OR createInterface was used — both prove
    // the prod gate code-path is wired through readline/promises.
    expect(readlineQuestionMock).toHaveBeenCalled();
  });
});
