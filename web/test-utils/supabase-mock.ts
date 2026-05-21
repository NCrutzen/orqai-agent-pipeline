// Phase 88.2-02 (D-04..D-06) — shared chainable Supabase admin mock factory.
//
// Replaces per-test inline mock builders that bit-rot every time the loader
// adds a new chain method (.not, .schema, .order, .ilike, .in, …). The Proxy
// `get` handler returns the same proxy for any property name, so future chain
// extensions work without code changes here.
//
// References:
//   - SPEC.md §"In scope" — Req R-2 (test gate)
//   - CONTEXT.md §"Decisions" D-04 (chainable Proxy), D-05 (location), D-06
//     (queue-based response API)
//   - RESEARCH.md §"Supabase Admin Mock — Recommended Shape (D-04..D-06)"
//
// Consumer pattern:
//   const adminMock = createSupabaseAdminMock();
//   vi.mock("@/lib/supabase/admin", () => ({
//     admin: adminMock,
//     createAdminClient: () => adminMock,
//   }));
//   adminMock.queueResponse({ data: [...], error: null });
//   await fnUnderTest();
//   expect(adminMock.calls).toContainEqual({ method: "from", args: ["t"] });

export type MockResponse = { data: unknown; error: unknown };

export interface MockAdmin {
  /** Per-table query entry; returns a ChainProxy. */
  from: (table: string) => ChainProxy;
  /** Cross-schema entry; returns admin itself so .schema("x").from("y") works. */
  schema: (s: string) => MockAdmin;
  /** RPC entry; returns a ChainProxy (rpc results are awaited like queries). */
  rpc: (fn: string, args?: unknown) => ChainProxy;
  /** Push a response the next terminal-await will resolve to (FIFO). */
  queueResponse: (r: MockResponse) => void;
  /** Read-only log of every method call, in order. */
  readonly calls: Array<{ method: string; args: unknown[] }>;
}

// ChainProxy is awaitable (Promise<MockResponse>) AND has arbitrary chainable
// methods. The Proxy below makes both true at runtime; the type is a permissive
// indexed signature so TS consumers don't fight the chain.
export type ChainProxy = {
  [k: string]: unknown;
} & Promise<MockResponse>;

export interface CreateOptions {
  /**
   * If set, terminal awaits resolve to this when the queue is empty instead of
   * throwing. Use for tests that don't care about the data shape (e.g. stage-
   * shell render tests that mock all data-shape-sensitive loaders separately).
   * Default: undefined → empty queue throws with a helpful message.
   */
  defaultResponse?: MockResponse;
}

export function createSupabaseAdminMock(options: CreateOptions = {}): MockAdmin {
  const responseQueue: MockResponse[] = [];
  const calls: Array<{ method: string; args: unknown[] }> = [];

  const dequeue = (): MockResponse => {
    const r = responseQueue.shift();
    if (r === undefined) {
      if (options.defaultResponse !== undefined) return options.defaultResponse;
      throw new Error(
        "[supabase-mock] no queued response — did the code call .from() more times than the test queued? " +
          `Call log so far: ${JSON.stringify(calls)}`,
      );
    }
    return r;
  };

  const makeChain = (): ChainProxy => {
    // Wrap a callable target so `apply` works (some chains end in a call).
    const proxy = new Proxy(function () {}, {
      get(_target, prop) {
        // Awaited (`await proxy`) — dequeue and resolve.
        if (prop === "then") {
          return (
            onFulfilled?: ((v: MockResponse) => unknown) | null,
            onRejected?: ((reason: unknown) => unknown) | null,
          ) => Promise.resolve(dequeue()).then(onFulfilled, onRejected);
        }
        // .single() / .maybeSingle() — terminal-await variants.
        if (prop === "single" || prop === "maybeSingle") {
          return () => {
            calls.push({ method: String(prop), args: [] });
            return Promise.resolve(dequeue());
          };
        }
        // catch / finally — Promise-protocol pass-through (rare in tests).
        if (prop === "catch") {
          return (onRejected?: (reason: unknown) => unknown) =>
            Promise.resolve(dequeue()).catch(onRejected);
        }
        if (prop === "finally") {
          return (onFinally?: () => void) =>
            Promise.resolve(dequeue()).finally(onFinally);
        }
        // Any other property name = chainable method; log args, return self.
        return (...args: unknown[]) => {
          calls.push({ method: String(prop), args });
          return proxy;
        };
      },
      apply() {
        return proxy;
      },
    });
    return proxy as unknown as ChainProxy;
  };

  const admin: MockAdmin = {
    from: (table: string) => {
      calls.push({ method: "from", args: [table] });
      return makeChain();
    },
    schema: (s: string) => {
      calls.push({ method: "schema", args: [s] });
      return admin; // chainable: admin.schema("x").from("y")
    },
    rpc: (fn: string, args?: unknown) => {
      calls.push({ method: "rpc", args: [fn, args] });
      return makeChain();
    },
    queueResponse: (r) => {
      responseQueue.push(r);
    },
    calls,
  };

  return admin;
}
