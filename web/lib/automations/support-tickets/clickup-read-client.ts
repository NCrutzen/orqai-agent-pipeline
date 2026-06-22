// Plan 02-01 Task 2 — Server-only ClickUp read client for the "Support" list.
// Plan 03-01 Task 2 — fetchTicketById: single-task fetch with IDOR ownership guard.
//
// T-04-05-02 read-only exception:
//   This module performs server-side GET requests to api.clickup.com ONLY.
//   - Read-only: no POST / PUT / DELETE calls to ClickUp.
//   - Server-side only: `import "server-only"` prevents client-bundle inclusion.
//   - No client-side calls: this module must never be imported in a Client Component.
//   - Isolated module: all ClickUp read access routes through this file.
//
// Used by: web/app/(app)/app/tickets/page.tsx (Server Component, force-dynamic).
//          web/app/(app)/app/tickets/[id]/page.tsx (Server Component, force-dynamic).

import "server-only";

import { z } from "zod";

// ---------------------------------------------------------------------------
// Dutch status label map (TICK-02)
//
// Covers all 10 live statuses of the ClickUp "Support" list (901515337844).
// Do NOT reuse ClickUp's status.color — we pick our own accessible palette.
// Do NOT modify clickup-status-map.ts — that module is for outbound
// notification gating only (returns null for 8 of these 10 statuses).
// ---------------------------------------------------------------------------

const DUTCH_STATUS_LABELS: Readonly<Record<string, { label: string; color: string }>> = {
  "new request":               { label: "Nieuw verzoek",           color: "#5f55ee" },
  "to discuss":                { label: "Te bespreken",            color: "#b59400" },
  "acknowledged":              { label: "Bevestigd",               color: "#2e7d32" },
  "test":                      { label: "Test",                    color: "#616161" },
  "started":                   { label: "Gestart",                 color: "#7b1fa2" },
  "third party feedback":      { label: "Feedback derde partij",   color: "#1565c0" },
  "end user feedback":         { label: "Feedback eindgebruiker",  color: "#c62828" },
  "rejected":                  { label: "Afgewezen",               color: "#b71c1c" },
  "merged with another ticket":{ label: "Samengevoegd",            color: "#e65100" },
  "resolved":                  { label: "Opgelost",                color: "#1b5e20" },
} as const;

/**
 * Map a raw ClickUp status string to a Dutch display label + color.
 *
 * - Case-insensitive; trims surrounding whitespace.
 * - Unknown statuses → { label: rawStatus, color: "#808080" } (graceful fallback).
 *
 * @param rawStatus - Raw status string from a ClickUp task (e.g. "new request").
 */
export function getDutchStatusLabel(rawStatus: string): { label: string; color: string } {
  const key = rawStatus.trim().toLowerCase();
  return DUTCH_STATUS_LABELS[key] ?? { label: rawStatus, color: "#808080" };
}

// ---------------------------------------------------------------------------
// ClickupTicket — exported type consumed by the tickets page
// ---------------------------------------------------------------------------

export interface ClickupTicket {
  /** ClickUp task ID */
  id: string;
  /** Task title (task.name) */
  title: string;
  /** Parsed creation date from epoch-ms string */
  createdAt: Date;
  /** Raw status string as returned by ClickUp (e.g. "new request") */
  rawStatus: string;
  /** Dutch display label + accessible UI color for the status */
  statusDisplay: { label: string; color: string };
}

// ---------------------------------------------------------------------------
// ClickupTicketDetail — extended type for the ticket detail page (Plan 03)
// ---------------------------------------------------------------------------

/**
 * Extended ticket type for the detail page (TICK-03).
 * Carries all ClickupTicket fields plus full description and assignee name.
 */
export interface ClickupTicketDetail extends ClickupTicket {
  /** Full task body text. Empty string ("") when the task has no description. */
  description: string;
  /** First assignee username, or null when assignees is absent or empty. */
  assignee: string | null;
  /** ClickUp's AI "Summary" custom field value. Empty string when unset. */
  summary: string;
}

// The ClickUp-AI "Summary" custom field on the Support list. Stable id (like the
// email field); used as one input to the customer-facing solution (see solution.ts).
const SUMMARY_FIELD_ID = "6fc07f2a-e183-4dd5-b42c-22753474b9a5";

/** A single ClickUp task comment, reduced to author + plain text. */
export interface ClickupComment {
  author: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Zod schemas — parse only the fields we consume (catches API drift at runtime)
// ---------------------------------------------------------------------------

const RawCustomFieldSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
  value: z.unknown().optional(),
});

const RawStatusSchema = z.object({
  status: z.string(),
  color: z.string().optional(),
  type: z.string().optional(),
});

const RawTaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  date_created: z.string(),
  status: RawStatusSchema,
  custom_fields: z.array(RawCustomFieldSchema).optional(),
});

const ClickupTasksResponseSchema = z.object({
  tasks: z.array(RawTaskSchema),
  last_page: z.boolean().optional(),
});

type RawTask = z.infer<typeof RawTaskSchema>;

// Extended schema for the single-task detail endpoint (GET /task/{id})
const RawAssigneeSchema = z.object({
  username: z.string().optional(),
});

const RawTaskDetailSchema = RawTaskSchema.extend({
  description: z.string().optional(),
  text_content: z.string().optional(),
  assignees: z.array(RawAssigneeSchema).optional(),
  date_updated: z.string().optional(),
  url: z.string().optional(),
});

type RawTaskDetail = z.infer<typeof RawTaskDetailSchema>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract the email value from a raw task's custom_fields array.
 *
 * Returns null when:
 *   - the field entry is absent from the array (not set in ClickUp)
 *   - the field entry is present but value is null, undefined, or empty string
 *
 * Always returns a trimmed+lowercased value for comparison.
 */
function emailFromField(task: RawTask, fieldId: string): string | null {
  const field = task.custom_fields?.find((f) => f.id === fieldId);
  if (!field) return null;
  if (typeof field.value !== "string" || field.value.trim() === "") return null;
  return field.value.trim().toLowerCase();
}

/** Raw string value of a text custom field by id, or "" when absent/empty. */
function stringFieldValue(task: RawTask, fieldId: string): string {
  const field = task.custom_fields?.find((f) => f.id === fieldId);
  return typeof field?.value === "string" ? field.value.trim() : "";
}

/**
 * Map a raw ClickUp task to a ClickupTicket.
 */
function mapToTicket(task: RawTask): ClickupTicket {
  return {
    id: task.id,
    title: task.name,
    createdAt: new Date(Number(task.date_created)),
    rawStatus: task.status.status,
    statusDisplay: getDutchStatusLabel(task.status.status),
  };
}

/**
 * Build the URL for a single paginated request to the ClickUp tasks endpoint.
 * The custom_fields filter param must be URL-encoded JSON.
 *
 * include_closed=true is REQUIRED: the Support list's resolved/rejected/merged
 * statuses are "closed" types, which the endpoint omits by default. Without this
 * a user whose tickets are all closed (the common case) sees an empty list.
 */
function buildUrl(listId: string, fieldId: string, email: string, page: number): string {
  const filterParam = JSON.stringify([
    { field_id: fieldId, operator: "=", value: email },
  ]);
  return (
    `https://api.clickup.com/api/v2/list/${listId}/task` +
    `?custom_fields=${encodeURIComponent(filterParam)}` +
    `&include_closed=true` +
    `&page=${page}`
  );
}

// ---------------------------------------------------------------------------
// fetchTicketsByEmail — main export (TICK-01, TICK-07, TICK-08)
// ---------------------------------------------------------------------------

/**
 * Fetch all ClickUp tickets for a given email from the Support list.
 *
 * Security model:
 *   - Env vars are read at call time (not module load), so tests can stub them.
 *   - Missing env vars → typed error result (TICK-08).
 *   - API filter is applied server-side; an in-code re-filter (TICK-07) is applied
 *     before returning — never trust the API filter alone (T-02-01 mitigation).
 *   - The Authorization header uses NO "Bearer" prefix (personal token format).
 *   - next: { revalidate: 0 } ensures force-dynamic (no stale cache).
 *   - This function NEVER throws — all failures are returned as { error: string }.
 *
 * @param email - The M365 email from `supabase.auth.getUser()` (never a client param).
 * @returns { tickets: ClickupTicket[] } on success; { error: string } on any failure.
 */
export async function fetchTicketsByEmail(
  email: string,
): Promise<{ tickets: ClickupTicket[] } | { error: string }> {
  // 1. Read env vars at call time (not module load) — enables test stubbing
  const token = process.env.CLICKUP_API_TOKEN;
  const listId = process.env.CLICKUP_LIST_ID;
  const fieldId = process.env.CLICKUP_EMAIL_FIELD_ID;

  if (!token || !listId || !fieldId) {
    return { error: "ClickUp env vars not configured (CLICKUP_API_TOKEN / CLICKUP_LIST_ID / CLICKUP_EMAIL_FIELD_ID)" };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const allTasks: RawTask[] = [];

  try {
    // 2. Pagination loop — stop when last_page === true OR tasks array is empty
    let page = 0;
    while (true) {
      const url = buildUrl(listId, fieldId, email, page);
      const res = await fetch(url, {
        headers: { Authorization: token },
        next: { revalidate: 0 },
      });

      if (!res.ok) {
        return { error: `ClickUp API error: ${res.status}` };
      }

      const rawBody = await res.json();
      const parsed = ClickupTasksResponseSchema.safeParse(rawBody);
      if (!parsed.success) {
        return { error: `ClickUp API response shape unexpected: ${parsed.error.message}` };
      }

      const { tasks, last_page } = parsed.data;
      allTasks.push(...tasks);

      // Stop when last_page signal or empty page (belt-and-suspenders)
      if (last_page === true || tasks.length === 0) break;
      page++;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `ClickUp fetch failed: ${message}` };
  }

  // 3. Secondary in-code re-filter (TICK-07 / T-02-01 defense-in-depth)
  //    Keep only tasks whose Email Address field matches the caller's email.
  //    Absent field / null / empty → excluded.
  const filtered = allTasks.filter(
    (task) => emailFromField(task, fieldId) === normalizedEmail,
  );

  // 4. Map to typed ClickupTicket[]
  const tickets = filtered.map(mapToTicket);

  return { tickets };
}

// ---------------------------------------------------------------------------
// fetchTicketsByEmails — alias-aware list (TICK-07)
//
// A user may have multiple email identities (see email-aliases.ts). Fetch each
// address and merge, de-duplicating by task id. Any single failure surfaces as
// an error result (consistent with the single-email behavior). Empty input
// returns no tickets.
// ---------------------------------------------------------------------------

export async function fetchTicketsByEmails(
  emails: string[],
): Promise<{ tickets: ClickupTicket[] } | { error: string }> {
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (unique.length === 0) return { tickets: [] };

  const byId = new Map<string, ClickupTicket>();
  for (const email of unique) {
    const result = await fetchTicketsByEmail(email);
    if ("error" in result) return result;
    for (const ticket of result.tickets) byId.set(ticket.id, ticket);
  }
  return { tickets: [...byId.values()] };
}

// ---------------------------------------------------------------------------
// fetchTicketById — TICK-03 + TICK-07 (IDOR ownership guard on the detail page)
//
// Security model (T-03-01 / T-03-02):
//   - The `id` parameter is an untrusted sequential integer from the URL.
//   - The `email` parameter MUST come exclusively from the server session; the
//     caller (Plan 02 detail page) is responsible for that contract.
//   - HTTP 404 and ownership mismatch both return { notOwned: true } — the
//     caller cannot distinguish them, preventing enumeration (T-03-02).
//   - This function NEVER throws — all failures return { error: string }.
// ---------------------------------------------------------------------------

/**
 * Fetch a single ClickUp task by its ID and enforce ownership.
 *
 * @param id    - ClickUp task ID (from the URL `[id]` param — untrusted).
 * @param email - The M365 email from the server session — the only trusted identity input.
 *
 * @returns
 *   { ticket: ClickupTicketDetail } — task found and caller is the owner.
 *   { notOwned: true }             — task not found (404), or belongs to a different email,
 *                                    or the email field is absent/null/empty (all identical
 *                                    disposition to prevent info-leakage).
 *   { error: string }              — misconfiguration or unexpected API failure.
 */
export async function fetchTicketById(
  id: string,
  email: string | string[],
): Promise<{ ticket: ClickupTicketDetail } | { notOwned: true } | { error: string }> {
  // Accept one address or a set of the caller's aliases (see email-aliases.ts).
  const allowedEmails = new Set(
    (Array.isArray(email) ? email : [email]).map((e) => e.trim().toLowerCase()),
  );
  // 1. Read env vars at call time — enables test stubbing (mirrors fetchTicketsByEmail)
  const token = process.env.CLICKUP_API_TOKEN;
  const fieldId = process.env.CLICKUP_EMAIL_FIELD_ID;
  // CLICKUP_LIST_ID is not needed for the single-task endpoint, but we still
  // require it to be set so all three are configured together (config gate).
  const listId = process.env.CLICKUP_LIST_ID;

  if (!token || !listId || !fieldId) {
    return {
      error:
        "ClickUp env vars not configured (CLICKUP_API_TOKEN / CLICKUP_LIST_ID / CLICKUP_EMAIL_FIELD_ID)",
    };
  }

  try {
    // 2. Fetch the single task from the ClickUp API
    const url = `https://api.clickup.com/api/v2/task/${id}`;
    const res = await fetch(url, {
      headers: { Authorization: token },
      next: { revalidate: 0 },
    });

    // 3. HTTP 404 → not-owned (T-03-02: indistinguishable from ownership mismatch)
    if (res.status === 404) {
      return { notOwned: true };
    }

    // 3b. HTTP 401/403 — ClickUp does NOT return 404 for an unreachable task ID.
    //     A non-existent task, or one in a team/workspace this token can't see,
    //     comes back as 401 "Team not authorized" (ECODE OAUTH_027). With a valid
    //     token that is the not-found / IDOR case, so we map it to { notOwned }.
    //     Only a genuine token/config failure (invalid or missing token) must
    //     surface as an error — masking that as not-found would hide an outage.
    if (res.status === 401 || res.status === 403) {
      // Token/config-level auth failures (token itself is bad/missing) → error.
      const TOKEN_AUTH_ECODES = new Set(["OAUTH_017", "OAUTH_023", "OAUTH_025"]);
      let ecode: string | undefined;
      try {
        const body: unknown = await res.json();
        if (body && typeof body === "object" && "ECODE" in body) {
          const raw = (body as { ECODE: unknown }).ECODE;
          if (typeof raw === "string") ecode = raw;
        }
      } catch {
        // Unparseable body → fall through to not-owned (safe default: never leak).
      }
      if (ecode && TOKEN_AUTH_ECODES.has(ecode)) {
        return { error: `ClickUp API error: ${res.status}` };
      }
      return { notOwned: true };
    }

    // 4. Other non-ok responses → error
    if (!res.ok) {
      return { error: `ClickUp API error: ${res.status}` };
    }

    // 5. Parse the response body
    const rawBody = await res.json();
    const parsed = RawTaskDetailSchema.safeParse(rawBody);
    if (!parsed.success) {
      return { error: `ClickUp API response shape unexpected: ${parsed.error.message}` };
    }

    const task: RawTaskDetail = parsed.data;

    // 6. Ownership check — case-insensitive (T-03-01 IDOR mitigation)
    //    Owner if the task's email field matches ANY of the caller's aliases.
    //    Absent / null / empty email field → not-owned (never leak the task)
    const taskEmail = emailFromField(task, fieldId);
    if (taskEmail === null || !allowedEmails.has(taskEmail)) {
      return { notOwned: true };
    }

    // 7. Map to ClickupTicketDetail
    const ticket: ClickupTicketDetail = {
      ...mapToTicket(task),
      description: task.description ?? task.text_content ?? "",
      assignee: task.assignees?.[0]?.username ?? null,
      summary: stringFieldValue(task, SUMMARY_FIELD_ID),
    };

    return { ticket };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `ClickUp fetch failed: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// fetchTicketComments — task comments (input to the customer-facing solution)
//
// The CALLER must have already confirmed ownership via fetchTicketById before
// fetching comments for a task id (comments are not ownership-checked here).
// Returns [] on any failure or when there are no comments.
// ---------------------------------------------------------------------------

// ===========================================================================
// SERVER-SIDE SYNC FETCHERS (no ownership guard)
//
// Used by the cache write-path (clickup-cache-sync Inngest function + the
// backfill route) to mirror ClickUp into Postgres. Unlike fetchTicketById,
// these do NOT take or check an email — they run server-side from a trusted
// webhook/backfill context, and ownership is enforced later on READ (the
// ticket pages filter cache rows by the caller's M365 aliases). They must
// never be reachable from a request that carries an untrusted task id without
// a subsequent ownership check.
// ===========================================================================

/**
 * Bucket a granular ClickUp status into the user-facing filter group stored on
 * the cache row. "open" is the catch-all for any active status. Keep in sync
 * with the (now redundant) grouping the tickets page used to do inline.
 */
export function ticketGroup(rawStatus: string): "open" | "rejected" | "resolved" {
  const s = rawStatus.trim().toLowerCase();
  if (s === "resolved") return "resolved";
  if (s === "rejected") return "rejected";
  return "open";
}

/** Cache-ready record for one ClickUp task (maps 1:1 to support_tickets_cache). */
export interface SyncTaskRecord {
  external_task_id: string;
  email: string | null;
  title: string;
  raw_status: string;
  status_type: string | null;
  ticket_group: "open" | "rejected" | "resolved";
  description: string;
  assignee: string | null;
  summary: string;
  date_created: string | null; // ISO
  date_updated: string | null; // ISO
  url: string | null;
  raw: unknown;
}

/** Cache-ready comment record (maps to support_ticket_comments). */
export interface SyncComment {
  clickup_comment_id: string;
  author: string;
  body: string;
  commented_at: string | null; // ISO
}

/** Parse a ClickUp epoch-ms string into an ISO timestamp, or null. */
function epochMsToIso(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return new Date(n).toISOString();
}

/**
 * Fetch one task from ClickUp for cache sync — full detail, NO ownership guard.
 *
 * @returns { record } on success; { notFound: true } when the task is gone or
 *          unreachable (404/401/403 — the sync path treats all as "remove from
 *          cache"); { error } on misconfiguration or unexpected API failure.
 */
export async function fetchTaskForSync(
  id: string,
): Promise<{ record: SyncTaskRecord } | { notFound: true } | { error: string }> {
  const token = process.env.CLICKUP_API_TOKEN;
  const fieldId = process.env.CLICKUP_EMAIL_FIELD_ID;
  if (!token || !fieldId) {
    return { error: "ClickUp env vars not configured (CLICKUP_API_TOKEN / CLICKUP_EMAIL_FIELD_ID)" };
  }

  try {
    const res = await fetch(`https://api.clickup.com/api/v2/task/${id}`, {
      headers: { Authorization: token },
      next: { revalidate: 0 },
    });

    // 404 / auth-to-task failures → not present in (our view of) ClickUp.
    // Mirror fetchTicketById: only a token-level OAuth failure is a real error.
    if (res.status === 404) return { notFound: true };
    if (res.status === 401 || res.status === 403) {
      const TOKEN_AUTH_ECODES = new Set(["OAUTH_017", "OAUTH_023", "OAUTH_025"]);
      let ecode: string | undefined;
      try {
        const body: unknown = await res.json();
        if (body && typeof body === "object" && "ECODE" in body) {
          const raw = (body as { ECODE: unknown }).ECODE;
          if (typeof raw === "string") ecode = raw;
        }
      } catch {
        /* unparseable → treat as not-found */
      }
      if (ecode && TOKEN_AUTH_ECODES.has(ecode)) {
        return { error: `ClickUp API error: ${res.status}` };
      }
      return { notFound: true };
    }
    if (!res.ok) return { error: `ClickUp API error: ${res.status}` };

    const rawBody = await res.json();
    const parsed = RawTaskDetailSchema.safeParse(rawBody);
    if (!parsed.success) {
      return { error: `ClickUp API response shape unexpected: ${parsed.error.message}` };
    }
    const task = parsed.data;

    const record: SyncTaskRecord = {
      external_task_id: task.id,
      email: emailFromField(task, fieldId),
      title: task.name,
      raw_status: task.status.status,
      status_type: task.status.type ?? null,
      ticket_group: ticketGroup(task.status.status),
      description: task.description ?? task.text_content ?? "",
      assignee: task.assignees?.[0]?.username ?? null,
      summary: stringFieldValue(task, SUMMARY_FIELD_ID),
      date_created: epochMsToIso(task.date_created),
      date_updated: epochMsToIso(task.date_updated),
      url: task.url ?? null,
      raw: rawBody,
    };
    return { record };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `ClickUp fetch failed: ${message}` };
  }
}

/**
 * Fetch a task's comments for cache sync (with stable ids + timestamps).
 * Returns [] on any failure (the sync proceeds; comments fill in on retry).
 */
export async function fetchCommentsForSync(id: string): Promise<SyncComment[]> {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) return [];
  try {
    const res = await fetch(`https://api.clickup.com/api/v2/task/${id}/comment`, {
      headers: { Authorization: token },
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      comments?: {
        id?: string;
        comment_text?: string;
        user?: { username?: string };
        date?: string;
      }[];
    };
    return (body.comments ?? [])
      .filter((c) => typeof c.id === "string" && c.id !== "")
      .map((c) => ({
        clickup_comment_id: c.id as string,
        author: c.user?.username ?? "",
        body: (c.comment_text ?? "").trim(),
        commented_at: epochMsToIso(c.date),
      }))
      .filter((c) => c.body !== "");
  } catch {
    return [];
  }
}

/**
 * Enumerate ALL task ids on the Support list (no email filter) for cache
 * backfill / reconciliation. Paginates with include_closed=true so closed
 * (resolved/rejected/merged) tasks are included.
 */
export async function fetchAllTaskIds(): Promise<{ ids: string[] } | { error: string }> {
  const token = process.env.CLICKUP_API_TOKEN;
  const listId = process.env.CLICKUP_LIST_ID;
  if (!token || !listId) {
    return { error: "ClickUp env vars not configured (CLICKUP_API_TOKEN / CLICKUP_LIST_ID)" };
  }

  const ids: string[] = [];
  try {
    let page = 0;
    while (true) {
      const url =
        `https://api.clickup.com/api/v2/list/${listId}/task` +
        `?include_closed=true&page=${page}`;
      const res = await fetch(url, {
        headers: { Authorization: token },
        next: { revalidate: 0 },
      });
      if (!res.ok) return { error: `ClickUp API error: ${res.status}` };

      const rawBody = await res.json();
      const parsed = ClickupTasksResponseSchema.safeParse(rawBody);
      if (!parsed.success) {
        return { error: `ClickUp API response shape unexpected: ${parsed.error.message}` };
      }
      const { tasks, last_page } = parsed.data;
      for (const t of tasks) ids.push(t.id);
      if (last_page === true || tasks.length === 0) break;
      page++;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `ClickUp fetch failed: ${message}` };
  }
  return { ids };
}

export async function fetchTicketComments(id: string): Promise<ClickupComment[]> {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) return [];
  try {
    const res = await fetch(`https://api.clickup.com/api/v2/task/${id}/comment`, {
      headers: { Authorization: token },
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      comments?: { comment_text?: string; user?: { username?: string } }[];
    };
    return (body.comments ?? [])
      .map((c) => ({
        author: c.user?.username ?? "",
        text: (c.comment_text ?? "").trim(),
      }))
      .filter((c) => c.text !== "");
  } catch {
    return [];
  }
}
