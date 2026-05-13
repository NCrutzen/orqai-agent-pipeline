// Phase 82.3 Plan 08 — GET /api/automations/audit/signed-url tests.
// Mints 1h Supabase Storage signed URLs for `automation-screenshots` bucket
// objects. Operator-auth gated; path-traversal hardened; service-role server-only.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { createSignedUrlMock, getMockUser, setMockUser, errorSpy } = vi.hoisted(() => {
  const createSignedUrlMock = vi.fn();
  let mockUser: { id: string } | null = { id: "00000000-0000-4000-8000-0000000000aa" };
  return {
    createSignedUrlMock,
    getMockUser: () => mockUser,
    setMockUser: (u: { id: string } | null) => {
      mockUser = u;
    },
    errorSpy: vi.fn(),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: getMockUser() } })) },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: createSignedUrlMock,
      })),
    },
  })),
}));

import { GET } from "../route";

beforeEach(() => {
  createSignedUrlMock.mockReset();
  setMockUser({ id: "00000000-0000-4000-8000-0000000000aa" });
  errorSpy.mockReset();
  vi.spyOn(console, "error").mockImplementation((...args) => errorSpy(...args));
});

function makeReq(qs: string) {
  return new Request(`http://localhost/api/automations/audit/signed-url${qs}`);
}

describe("GET /api/automations/audit/signed-url", () => {
  it("200: returns signed URL + expires_at + Cache-Control header", async () => {
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: "https://supabase.example/sig?token=abc" },
      error: null,
    });
    const res = await GET(makeReq("?path=stage-2/icontroller/2026-05-13/before.png"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://supabase.example/sig?token=abc");
    expect(typeof body.expires_at).toBe("string");
    expect(new Date(body.expires_at).toString()).not.toBe("Invalid Date");
    expect(res.headers.get("cache-control")).toBe("private, max-age=200");
  });

  it("400: missing path", async () => {
    const res = await GET(makeReq(""));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_path" });
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it("400: path with .. traversal", async () => {
    const res = await GET(makeReq("?path=stage-2/../etc/passwd"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_path" });
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it("400: path starting with /", async () => {
    const res = await GET(makeReq("?path=/absolute/leak.png"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_path" });
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it("400: path over 512 chars", async () => {
    const long = "a".repeat(513);
    const res = await GET(makeReq(`?path=${long}`));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_path" });
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it("400: path with disallowed chars", async () => {
    const res = await GET(makeReq("?path=stage-2/foo%20bar.png"));
    // %20 decodes to space, fails regex
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_path" });
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it("401: unauthenticated", async () => {
    setMockUser(null);
    const res = await GET(makeReq("?path=stage-2/ok.png"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it("500: storage error surfaces as storage_error + console.error called", async () => {
    createSignedUrlMock.mockResolvedValue({
      data: null,
      error: { message: "Object not found" },
    });
    const res = await GET(makeReq("?path=stage-2/missing.png"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "storage_error" });
    expect(errorSpy).toHaveBeenCalled();
  });
});
