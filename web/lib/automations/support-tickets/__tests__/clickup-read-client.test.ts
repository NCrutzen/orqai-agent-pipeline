/**
 * Tests for clickup-read-client.ts (Plan 02-01 Task 2 — TDD RED phase)
 *
 * Covers the ClickUp read client that fetches a single user's tickets from
 * the ClickUp "Support" list, filtered by their M365 email.
 *
 * R1  (TICK-08): missing env vars → { error }, no fetch
 * R2  (TICK-08): fetch res.ok === false → { error: "ClickUp API error: N" }
 * R3: single page last_page=true → returns mapped tickets
 * R4: two pages (last_page=false then true) → fetches both, concatenates
 * R5  (TICK-07): matching email field → included
 * R6  (TICK-07): non-matching email field → excluded by re-filter
 * R7  (TICK-07): absent email field entry → excluded
 * R8  (TICK-07): field present but value null or "" → excluded
 * R9  (TICK-07): case-insensitive match "User@Example.COM" === "user@example.com"
 * R10 (TICK-04): page 0 returns { tasks: [], last_page: true } → { tickets: [] }
 * R11 (TICK-02): Dutch label + color per status; unknown → { label: raw, color: "#808080" }
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock server-only so it does not throw in the Vitest (jsdom) environment.
// In production Next.js, this import guard prevents client-bundle inclusion.
vi.mock("server-only", () => ({}));

import {
  fetchTicketsByEmail,
  fetchTicketById,
  getDutchStatusLabel,
  type ClickupTicket,
} from "../clickup-read-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIELD_ID = "f18d0cb0-5dd5-4081-85f7-b48f6f0b6127";
const TOKEN = "pk_test_token";
const LIST_ID = "901515337844";
const USER_EMAIL = "user@example.com";

/** Build a minimal raw ClickUp task for tests. */
function makeTask(
  id: string,
  emailFieldValue: string | null | undefined,
  rawStatus = "new request",
  fieldAbsent = false,
): Record<string, unknown> {
  const custom_fields: unknown[] = fieldAbsent
    ? []
    : [
        {
          id: FIELD_ID,
          name: "Email Address",
          type: "email",
          value: emailFieldValue,
        },
      ];

  return {
    id,
    name: `Task ${id}`,
    date_created: "1704067200000",
    status: {
      status: rawStatus,
      color: "#5f55ee",
      type: "custom",
    },
    custom_fields,
  };
}

/** Build a mock fetch response. */
function mockFetchResponse(
  tasks: unknown[],
  lastPage: boolean,
  status = 200,
  ok = true,
): Response {
  return {
    ok,
    status,
    json: async () => ({ tasks, last_page: lastPage }),
  } as unknown as Response;
}

/** Set all three required env vars. */
function setEnvVars() {
  process.env.CLICKUP_API_TOKEN = TOKEN;
  process.env.CLICKUP_LIST_ID = LIST_ID;
  process.env.CLICKUP_EMAIL_FIELD_ID = FIELD_ID;
}

/** Clear all three required env vars. */
function clearEnvVars() {
  delete process.env.CLICKUP_API_TOKEN;
  delete process.env.CLICKUP_LIST_ID;
  delete process.env.CLICKUP_EMAIL_FIELD_ID;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("fetchTicketsByEmail", () => {
  beforeEach(() => {
    clearEnvVars();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearEnvVars();
  });

  // ── R1: missing env vars ─────────────────────────────────────────────────

  it("R1a: returns { error } when CLICKUP_API_TOKEN is missing", async () => {
    process.env.CLICKUP_LIST_ID = LIST_ID;
    process.env.CLICKUP_EMAIL_FIELD_ID = FIELD_ID;

    const result = await fetchTicketsByEmail(USER_EMAIL);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/env/i);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("R1b: returns { error } when CLICKUP_LIST_ID is missing", async () => {
    process.env.CLICKUP_API_TOKEN = TOKEN;
    process.env.CLICKUP_EMAIL_FIELD_ID = FIELD_ID;

    const result = await fetchTicketsByEmail(USER_EMAIL);

    expect("error" in result).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("R1c: returns { error } when CLICKUP_EMAIL_FIELD_ID is missing", async () => {
    process.env.CLICKUP_API_TOKEN = TOKEN;
    process.env.CLICKUP_LIST_ID = LIST_ID;

    const result = await fetchTicketsByEmail(USER_EMAIL);

    expect("error" in result).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  // ── R2: API error (res.ok === false) ─────────────────────────────────────

  it("R2: returns { error: 'ClickUp API error: 500' } on server error", async () => {
    setEnvVars();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockFetchResponse([], false, 500, false)),
    );

    const result = await fetchTicketsByEmail(USER_EMAIL);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("ClickUp API error: 500");
    }
  });

  it("R2b: returns { error: 'ClickUp API error: 429' } on rate limit", async () => {
    setEnvVars();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockFetchResponse([], false, 429, false)),
    );

    const result = await fetchTicketsByEmail(USER_EMAIL);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("ClickUp API error: 429");
    }
  });

  // ── R3: single page with last_page === true ───────────────────────────────

  it("R3: single page (last_page=true) returns mapped tickets", async () => {
    setEnvVars();
    const tasks = [makeTask("t1", USER_EMAIL)];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockFetchResponse(tasks, true)),
    );

    const result = await fetchTicketsByEmail(USER_EMAIL);

    expect("tickets" in result).toBe(true);
    if ("tickets" in result) {
      expect(result.tickets).toHaveLength(1);
      expect(result.tickets[0].id).toBe("t1");
      expect(result.tickets[0].title).toBe("Task t1");
      expect(result.tickets[0].createdAt).toBeInstanceOf(Date);
      expect(result.tickets[0].rawStatus).toBe("new request");
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  // ── R4: multi-page pagination ─────────────────────────────────────────────

  it("R4: fetches page 0 then page 1 when last_page=false on first page", async () => {
    setEnvVars();
    const page0Tasks = [makeTask("t1", USER_EMAIL)];
    const page1Tasks = [makeTask("t2", USER_EMAIL)];

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockFetchResponse(page0Tasks, false))
      .mockResolvedValueOnce(mockFetchResponse(page1Tasks, true));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchTicketsByEmail(USER_EMAIL);

    expect(fetch).toHaveBeenCalledTimes(2);

    // Verify page params
    const calls = fetchMock.mock.calls;
    expect((calls[0][0] as string)).toContain("page=0");
    expect((calls[1][0] as string)).toContain("page=1");

    // include_closed=true is required so resolved/rejected tickets (closed-type
    // statuses) are returned — without it users with only closed tickets see nothing.
    expect((calls[0][0] as string)).toContain("include_closed=true");

    expect("tickets" in result).toBe(true);
    if ("tickets" in result) {
      expect(result.tickets).toHaveLength(2);
      expect(result.tickets.map((t: ClickupTicket) => t.id)).toEqual(["t1", "t2"]);
    }
  });

  // ── R5: matching email field → included ───────────────────────────────────

  it("R5: task with matching email field is included", async () => {
    setEnvVars();
    const tasks = [makeTask("t1", USER_EMAIL)];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockFetchResponse(tasks, true)),
    );

    const result = await fetchTicketsByEmail(USER_EMAIL);

    expect("tickets" in result).toBe(true);
    if ("tickets" in result) {
      expect(result.tickets).toHaveLength(1);
    }
  });

  // ── R6: non-matching email → excluded ────────────────────────────────────

  it("R6: task with a different email is excluded by re-filter", async () => {
    setEnvVars();
    const tasks = [makeTask("t1", "other@example.com")];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockFetchResponse(tasks, true)),
    );

    const result = await fetchTicketsByEmail(USER_EMAIL);

    expect("tickets" in result).toBe(true);
    if ("tickets" in result) {
      expect(result.tickets).toHaveLength(0);
    }
  });

  // ── R7: absent email field entry → excluded ───────────────────────────────

  it("R7: task with no custom_fields entry for the field id is excluded", async () => {
    setEnvVars();
    const tasks = [makeTask("t1", null, "new request", true /* fieldAbsent */)];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockFetchResponse(tasks, true)),
    );

    const result = await fetchTicketsByEmail(USER_EMAIL);

    expect("tickets" in result).toBe(true);
    if ("tickets" in result) {
      expect(result.tickets).toHaveLength(0);
    }
  });

  // ── R8: field present but value null or "" → excluded ────────────────────

  it("R8a: task with null email field value is excluded", async () => {
    setEnvVars();
    const tasks = [makeTask("t1", null)];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockFetchResponse(tasks, true)),
    );

    const result = await fetchTicketsByEmail(USER_EMAIL);

    expect("tickets" in result).toBe(true);
    if ("tickets" in result) {
      expect(result.tickets).toHaveLength(0);
    }
  });

  it("R8b: task with empty-string email field value is excluded", async () => {
    setEnvVars();
    const tasks = [makeTask("t1", "")];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockFetchResponse(tasks, true)),
    );

    const result = await fetchTicketsByEmail(USER_EMAIL);

    expect("tickets" in result).toBe(true);
    if ("tickets" in result) {
      expect(result.tickets).toHaveLength(0);
    }
  });

  // ── R9: case-insensitive email matching ───────────────────────────────────

  it("R9: 'User@Example.COM' field matches 'user@example.com' session email", async () => {
    setEnvVars();
    const tasks = [makeTask("t1", "User@Example.COM")];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockFetchResponse(tasks, true)),
    );

    const result = await fetchTicketsByEmail("user@example.com");

    expect("tickets" in result).toBe(true);
    if ("tickets" in result) {
      expect(result.tickets).toHaveLength(1);
      expect(result.tickets[0].id).toBe("t1");
    }
  });

  // ── R10: empty tasks array → { tickets: [] } ─────────────────────────────

  it("R10: empty tasks on page 0 returns { tickets: [] }, not an error", async () => {
    setEnvVars();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockFetchResponse([], true)),
    );

    const result = await fetchTicketsByEmail(USER_EMAIL);

    expect("tickets" in result).toBe(true);
    if ("tickets" in result) {
      expect(result.tickets).toHaveLength(0);
    }
    expect("error" in result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getDutchStatusLabel — R11
// ---------------------------------------------------------------------------

describe("getDutchStatusLabel — R11", () => {
  it("R11a: maps 'new request' to Dutch label and color", () => {
    const { label, color } = getDutchStatusLabel("new request");
    expect(label).toBe("Nieuw verzoek");
    expect(color).toBeTruthy();
    expect(color).toMatch(/^#/);
  });

  it("R11b: maps 'to discuss' to Dutch label", () => {
    const { label } = getDutchStatusLabel("to discuss");
    expect(label).toBe("Te bespreken");
  });

  it("R11c: maps 'acknowledged' to Dutch label", () => {
    const { label } = getDutchStatusLabel("acknowledged");
    expect(label).toBe("Bevestigd");
  });

  it("R11d: maps 'test' to Dutch label", () => {
    const { label } = getDutchStatusLabel("test");
    expect(label).toBe("Test");
  });

  it("R11e: maps 'started' to Dutch label", () => {
    const { label } = getDutchStatusLabel("started");
    expect(label).toBe("Gestart");
  });

  it("R11f: maps 'third party feedback' to Dutch label", () => {
    const { label } = getDutchStatusLabel("third party feedback");
    expect(label).toBe("Feedback derde partij");
  });

  it("R11g: maps 'end user feedback' to Dutch label", () => {
    const { label } = getDutchStatusLabel("end user feedback");
    expect(label).toBe("Feedback eindgebruiker");
  });

  it("R11h: maps 'rejected' to Dutch label", () => {
    const { label } = getDutchStatusLabel("rejected");
    expect(label).toBe("Afgewezen");
  });

  it("R11i: maps 'merged with another ticket' to Dutch label", () => {
    const { label } = getDutchStatusLabel("merged with another ticket");
    expect(label).toBe("Samengevoegd");
  });

  it("R11j: maps 'resolved' to Dutch label", () => {
    const { label } = getDutchStatusLabel("resolved");
    expect(label).toBe("Opgelost");
  });

  it("R11k: unknown status falls back to { label: rawStatus, color: '#808080' }", () => {
    const { label, color } = getDutchStatusLabel("some-unknown-status");
    expect(label).toBe("some-unknown-status");
    expect(color).toBe("#808080");
  });

  it("R11l: lookup is case-insensitive (e.g. 'NEW REQUEST' → 'Nieuw verzoek')", () => {
    const { label } = getDutchStatusLabel("NEW REQUEST");
    expect(label).toBe("Nieuw verzoek");
  });

  it("R11m: getDutchStatusLabel returns a color that is a hex string for all known statuses", () => {
    const known = [
      "new request",
      "to discuss",
      "acknowledged",
      "test",
      "started",
      "third party feedback",
      "end user feedback",
      "rejected",
      "merged with another ticket",
      "resolved",
    ];
    for (const s of known) {
      const { color } = getDutchStatusLabel(s);
      expect(color).toMatch(/^#[0-9a-fA-F]{3,6}$/, `Expected hex color for status "${s}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// fetchTicketById — Plan 03-01 (TICK-03, TICK-07)
// ---------------------------------------------------------------------------
//
// Covers the fetchTicketById ownership + error matrix:
// B1: owned ticket → { ticket } with all ClickupTicketDetail fields
// B2: not owned (different email) → { notOwned: true }
// B3: email field absent/null/empty → { notOwned: true }
// B4: HTTP 404 from ClickUp → { notOwned: true } (identical to not-owned, no info leak)
// B5: non-404 API error (HTTP 500) → { error: string }
// B6: missing env vars → { error: string }, no fetch
// B7: network throw → { error: string }, never throws
// B8: empty/missing description → ticket.description === "" (not null)

describe("fetchTicketById", () => {
  const TASK_ID = "task123";
  const OWNER_EMAIL = "owner@example.com";

  /** Build a minimal raw single-task ClickUp API response body. */
  function makeTaskBody(
    emailFieldValue: string | null | undefined,
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const custom_fields: unknown[] =
      emailFieldValue === undefined
        ? []
        : [
            {
              id: FIELD_ID,
              name: "Email Address",
              type: "email",
              value: emailFieldValue,
            },
          ];

    return {
      id: TASK_ID,
      name: "Fix the printer",
      date_created: "1704067200000",
      description: "Detailed description of the issue.",
      text_content: "Detailed description of the issue.",
      status: { status: "new request", color: "#5f55ee", type: "custom" },
      assignees: [{ username: "John Doe" }],
      custom_fields,
      ...overrides,
    };
  }

  /** Build a mock fetch Response for the single-task endpoint. */
  function mockSingleTaskFetch(
    body: unknown,
    status = 200,
    ok = true,
  ): Response {
    return {
      ok,
      status,
      json: async () => body,
    } as unknown as Response;
  }

  beforeEach(() => {
    clearEnvVars();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearEnvVars();
  });

  // ── B1: owned ticket → { ticket } with full ClickupTicketDetail fields ────

  it("B1: owned ticket returns { ticket } with title, description, statusDisplay, assignee, createdAt", async () => {
    setEnvVars();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockSingleTaskFetch(makeTaskBody(OWNER_EMAIL))),
    );

    const result = await fetchTicketById(TASK_ID, OWNER_EMAIL);

    expect("ticket" in result).toBe(true);
    if ("ticket" in result) {
      expect(result.ticket.title).toBe("Fix the printer");
      expect(result.ticket.description).toBe("Detailed description of the issue.");
      expect(result.ticket.statusDisplay.label).toBe("Nieuw verzoek");
      expect(result.ticket.assignee).toBe("John Doe");
      expect(result.ticket.createdAt).toBeInstanceOf(Date);
    }
  });

  it("B1b: owned ticket — email comparison is case-insensitive (field has mixed case)", async () => {
    setEnvVars();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockSingleTaskFetch(makeTaskBody("OWNER@EXAMPLE.COM"))),
    );

    const result = await fetchTicketById(TASK_ID, "owner@example.com");

    expect("ticket" in result).toBe(true);
  });

  // ── B2: not owned (different email) → { notOwned: true } ─────────────────

  it("B2: task owned by a different email returns { notOwned: true }", async () => {
    setEnvVars();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockSingleTaskFetch(makeTaskBody("other@example.com"))),
    );

    const result = await fetchTicketById(TASK_ID, OWNER_EMAIL);

    expect("notOwned" in result).toBe(true);
    if ("notOwned" in result) {
      expect(result.notOwned).toBe(true);
    }
    expect("ticket" in result).toBe(false);
    expect("error" in result).toBe(false);
  });

  // ── B3: email field absent/null/empty → { notOwned: true } ───────────────

  it("B3a: absent email field returns { notOwned: true }", async () => {
    setEnvVars();
    vi.stubGlobal(
      "fetch",
      // emailFieldValue undefined → fieldAbsent, custom_fields = []
      vi.fn().mockResolvedValue(mockSingleTaskFetch(makeTaskBody(undefined))),
    );

    const result = await fetchTicketById(TASK_ID, OWNER_EMAIL);

    expect("notOwned" in result).toBe(true);
  });

  it("B3b: null email field value returns { notOwned: true }", async () => {
    setEnvVars();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockSingleTaskFetch(makeTaskBody(null))),
    );

    const result = await fetchTicketById(TASK_ID, OWNER_EMAIL);

    expect("notOwned" in result).toBe(true);
  });

  it("B3c: empty-string email field value returns { notOwned: true }", async () => {
    setEnvVars();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockSingleTaskFetch(makeTaskBody(""))),
    );

    const result = await fetchTicketById(TASK_ID, OWNER_EMAIL);

    expect("notOwned" in result).toBe(true);
  });

  // ── B4: HTTP 404 → { notOwned: true } (indistinguishable from not-owned) ─

  it("B4: HTTP 404 returns { notOwned: true }, not { error }", async () => {
    setEnvVars();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockSingleTaskFetch({ err: "Task not found" }, 404, false)),
    );

    const result = await fetchTicketById(TASK_ID, OWNER_EMAIL);

    expect("notOwned" in result).toBe(true);
    if ("notOwned" in result) {
      expect(result.notOwned).toBe(true);
    }
    expect("error" in result).toBe(false);
  });

  // ── B4b: HTTP 401 "Team not authorized" → { notOwned: true } ─────────────
  //   ClickUp returns 401 OAUTH_027 (not 404) for a task ID outside the token's
  //   reachable teams — i.e. a non-existent ID or another workspace's task.
  //   With a valid token this is the not-found / IDOR case.

  it("B4b: HTTP 401 OAUTH_027 (Team not authorized) returns { notOwned: true }", async () => {
    setEnvVars();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockSingleTaskFetch({ err: "Team not authorized", ECODE: "OAUTH_027" }, 401, false),
      ),
    );

    const result = await fetchTicketById("999999", OWNER_EMAIL);

    expect("notOwned" in result).toBe(true);
    if ("notOwned" in result) {
      expect(result.notOwned).toBe(true);
    }
    expect("error" in result).toBe(false);
  });

  it("B4c: HTTP 403 with unrecognized ECODE returns { notOwned: true } (safe default)", async () => {
    setEnvVars();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockSingleTaskFetch({ err: "Not authorized to view this task", ECODE: "OAUTH_999" }, 403, false),
      ),
    );

    const result = await fetchTicketById(TASK_ID, OWNER_EMAIL);

    expect("notOwned" in result).toBe(true);
    expect("error" in result).toBe(false);
  });

  // ── B5: non-404 API error → { error: string } ────────────────────────────

  it("B5: HTTP 500 returns { error: string }", async () => {
    setEnvVars();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockSingleTaskFetch({}, 500, false)),
    );

    const result = await fetchTicketById(TASK_ID, OWNER_EMAIL);

    expect("error" in result).toBe(true);
    expect("notOwned" in result).toBe(false);
  });

  // ── B5b: HTTP 401 from a genuine bad/missing token → { error } ───────────
  //   A token-level failure (OAUTH_025 Token invalid) must NOT be masked as
  //   not-found — that would hide a real misconfiguration/outage.

  it("B5b: HTTP 401 OAUTH_025 (Token invalid) returns { error }, not { notOwned }", async () => {
    setEnvVars();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockSingleTaskFetch({ err: "Token invalid", ECODE: "OAUTH_025" }, 401, false),
      ),
    );

    const result = await fetchTicketById(TASK_ID, OWNER_EMAIL);

    expect("error" in result).toBe(true);
    expect("notOwned" in result).toBe(false);
  });

  // ── B6: missing env vars → { error }, no fetch ───────────────────────────

  it("B6: missing CLICKUP_API_TOKEN returns { error } without fetching", async () => {
    process.env.CLICKUP_LIST_ID = LIST_ID;
    process.env.CLICKUP_EMAIL_FIELD_ID = FIELD_ID;

    const result = await fetchTicketById(TASK_ID, OWNER_EMAIL);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/env/i);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("B6b: missing CLICKUP_EMAIL_FIELD_ID returns { error } without fetching", async () => {
    process.env.CLICKUP_API_TOKEN = TOKEN;
    process.env.CLICKUP_LIST_ID = LIST_ID;

    const result = await fetchTicketById(TASK_ID, OWNER_EMAIL);

    expect("error" in result).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  // ── B7: network throw → { error }, never throws ──────────────────────────

  it("B7: network error (fetch throws) returns { error: string } and does not rethrow", async () => {
    setEnvVars();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network unreachable")),
    );

    // Must not throw
    const result = await fetchTicketById(TASK_ID, OWNER_EMAIL);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/Network unreachable/i);
    }
  });

  // ── B8: empty/missing description → ticket.description === "" ─────────────

  it("B8: task with no description returns ticket.description === ''", async () => {
    setEnvVars();
    const bodyWithoutDesc = makeTaskBody(OWNER_EMAIL);
    delete (bodyWithoutDesc as Record<string, unknown>).description;
    delete (bodyWithoutDesc as Record<string, unknown>).text_content;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockSingleTaskFetch(bodyWithoutDesc)),
    );

    const result = await fetchTicketById(TASK_ID, OWNER_EMAIL);

    expect("ticket" in result).toBe(true);
    if ("ticket" in result) {
      expect(result.ticket.description).toBe("");
    }
  });

  it("B8b: task with no assignees returns ticket.assignee === null", async () => {
    setEnvVars();
    const bodyNoAssignee = makeTaskBody(OWNER_EMAIL, { assignees: [] });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockSingleTaskFetch(bodyNoAssignee)),
    );

    const result = await fetchTicketById(TASK_ID, OWNER_EMAIL);

    expect("ticket" in result).toBe(true);
    if ("ticket" in result) {
      expect(result.ticket.assignee).toBeNull();
    }
  });
});
