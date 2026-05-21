// Phase 88.2 (D-01..D-03): global `next/headers` mock for all Vitest runs.
//
// Wired via vitest.config.ts#setupFiles. Retires the 22 "cookies was called
// outside a request scope" failures across the 5 stage-shell test files in
// one place — tests never have to remember to vi.mock("next/headers") inline.
//
// Per-test override semantics (D-03) via exported helpers; global afterEach
// resets state so tests don't leak.
//
// Async note (RESEARCH §"next/headers Mock", Pitfall 2): Next.js 15+ made
// cookies()/headers()/draftMode() async. Consumers in web/lib/supabase/server.ts
// do `await cookies()`. The sync mock works because `await nonPromise === nonPromise`.
import "@testing-library/jest-dom/vitest";
import { vi, afterEach } from "vitest";

// Phase 88.2 (Rule 2 deviation): provide dummy Supabase env vars so server
// components imported by RSC tests can call `createClient()` without
// "Your project's URL and Key are required" errors. Tests mock the admin
// client at the module boundary anyway — the env vars only need to exist.
// Each test file that exercises real Supabase calls overrides with its own
// mock; this just unblocks the constructor.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "test-anon-key";
process.env.SUPABASE_URL ??= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

// Mutable per-test state — reset by the global afterEach below.
let mockCookies = new Map<string, string>();
let mockHeaders: Record<string, string> = {};
let mockDraftMode = false;

export function __setMockCookies(
  entries: Record<string, string> | Map<string, string>,
): void {
  mockCookies =
    entries instanceof Map ? entries : new Map(Object.entries(entries));
}
export function __setMockHeaders(entries: Record<string, string>): void {
  mockHeaders = entries;
}
export function __setMockDraftMode(enabled: boolean): void {
  mockDraftMode = enabled;
}

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) => {
      const value = mockCookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
    getAll: () =>
      Array.from(mockCookies.entries()).map(([name, value]) => ({
        name,
        value,
      })),
    set: (_name: string, _value: string) => {},
    delete: (_name: string) => {},
    has: (name: string) => mockCookies.has(name),
  }),
  headers: () => new Headers(mockHeaders),
  draftMode: () => ({
    isEnabled: mockDraftMode,
    enable: () => {},
    disable: () => {},
  }),
}));

afterEach(() => {
  mockCookies = new Map();
  mockHeaders = {};
  mockDraftMode = false;
});
