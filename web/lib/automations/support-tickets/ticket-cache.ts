import "server-only";

// Supabase data layer for the ClickUp ticket read-cache (migration
// 20260617_support_tickets_cache.sql). The "Mijn tickets" pages read through
// these helpers instead of hitting ClickUp live; the clickup-cache-sync Inngest
// function writes through them on each ClickUp webhook.
//
// SECURITY: tables are backend-only (service_role RLS). These helpers use
// createAdminClient() (bypasses RLS) and enforce ownership IN CODE — the read
// helpers only ever return rows whose `email` is one of the caller's M365
// aliases (sourced from the server session), mirroring clickup-read-client's
// IDOR model. Callers MUST pass session-derived emails, never request params.

import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Locale } from "@/lib/i18n/config";
import { translateText } from "@/lib/automations/support-tickets/translate";
import {
  getDutchStatusLabel,
  fetchTaskForSync,
  fetchCommentsForSync,
  type ClickupTicket,
  type ClickupTicketDetail,
  type ClickupComment,
  type SyncTaskRecord,
  type SyncComment,
} from "@/lib/automations/support-tickets/clickup-read-client";

const TICKETS_TABLE = "support_tickets_cache";
const COMMENTS_TABLE = "support_ticket_comments";
const SOLUTIONS_TABLE = "support_ticket_solutions";
const TRANSLATIONS_TABLE = "support_ticket_translations";

/** Fields we cache translations for (see support_ticket_translations). */
export type TranslatableField = "title" | "description";

// ---------------------------------------------------------------------------
// Row shapes (only the columns we read back)
// ---------------------------------------------------------------------------

interface TicketRowDb {
  external_task_id: string;
  email: string | null;
  title: string;
  raw_status: string;
  description: string;
  assignee: string | null;
  summary: string;
  date_created: string | null;
  date_updated: string | null;
}

function toTicket(row: TicketRowDb): ClickupTicket {
  return {
    id: row.external_task_id,
    title: row.title,
    createdAt: new Date(row.date_created ?? row.date_updated ?? Date.now()),
    rawStatus: row.raw_status,
    statusDisplay: getDutchStatusLabel(row.raw_status),
  };
}

function toTicketDetail(row: TicketRowDb): ClickupTicketDetail {
  return {
    ...toTicket(row),
    description: row.description ?? "",
    assignee: row.assignee ?? null,
    summary: row.summary ?? "",
  };
}

function recordToDetail(record: SyncTaskRecord): ClickupTicketDetail {
  return {
    id: record.external_task_id,
    title: record.title,
    createdAt: new Date(record.date_created ?? record.date_updated ?? Date.now()),
    rawStatus: record.raw_status,
    statusDisplay: getDutchStatusLabel(record.raw_status),
    description: record.description,
    assignee: record.assignee,
    summary: record.summary,
  };
}

const TICKET_COLUMNS =
  "external_task_id,email,title,raw_status,description,assignee,summary,date_created,date_updated";

function normalizeEmails(emails: string[]): string[] {
  return [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

// ===========================================================================
// READ PATH (ticket pages)
// ===========================================================================

/**
 * List a user's cached tickets across all their aliases, with titles localized
 * to `locale`. Translation is READ-THROUGH: cached titles are reused (validated
 * by source_hash), and only cache-misses are translated via Orq.ai and stored.
 * Because the list is filtered by the caller's emails this only ever touches the
 * user's own handful of tickets — not the whole (~1900-row) Support list.
 * Ownership enforced via the `email IN (aliases)` filter — emails must come from
 * the server session. Never throws; returns { error } on a DB failure (the page
 * shows its error state, matching the old live-fetch contract).
 */
export async function getCachedTicketsByEmails(
  emails: string[],
  locale: Locale,
): Promise<{ tickets: ClickupTicket[] } | { error: string }> {
  const unique = normalizeEmails(emails);
  if (unique.length === 0) return { tickets: [] };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(TICKETS_TABLE)
    .select(TICKET_COLUMNS)
    .in("email", unique)
    .order("date_created", { ascending: false });

  if (error) return { error: error.message };

  const rows = data as TicketRowDb[];
  const cached = await getCachedTitleTranslations(
    rows.map((r) => r.external_task_id),
    locale,
  );

  const tickets = await Promise.all(
    rows.map(async (row) => {
      const ticket = toTicket(row);
      const hash = sourceHash(row.title);
      const hit = cached.get(row.external_task_id);
      if (hit && hit.sourceHash === hash) {
        ticket.title = hit.text;
      } else {
        const translated = await translateText(row.title, locale);
        await upsertCachedTranslation(row.external_task_id, "title", locale, translated, hash);
        ticket.title = translated;
      }
      return ticket;
    }),
  );
  return { tickets };
}

/**
 * Fetch one cached ticket and enforce ownership (email ∈ caller's aliases).
 *
 * On a cache MISS we fall back to a single live ClickUp fetch and populate the
 * cache, so a freshly-linked ticket (not yet synced via webhook/backfill) still
 * resolves correctly. "not found" and "not owned" return the SAME { notOwned }
 * disposition (no IDOR enumeration), mirroring fetchTicketById.
 */
export async function getCachedTicketById(
  id: string,
  emails: string[],
): Promise<{ ticket: ClickupTicketDetail } | { notOwned: true } | { error: string }> {
  const allowed = new Set(normalizeEmails(emails));
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from(TICKETS_TABLE)
    .select(TICKET_COLUMNS)
    .eq("external_task_id", id)
    .maybeSingle();

  if (error) return { error: error.message };

  if (data) {
    const row = data as TicketRowDb;
    if (row.email === null || !allowed.has(row.email)) return { notOwned: true };
    return { ticket: toTicketDetail(row) };
  }

  // Cache miss → self-healing live fallback (no ownership guard in the fetch;
  // we enforce ownership here before returning OR caching anything user-visible).
  const synced = await fetchTaskForSync(id);
  if ("error" in synced) return { error: synced.error };
  if ("notFound" in synced) return { notOwned: true };

  const record = synced.record;
  if (record.email === null || !allowed.has(record.email)) return { notOwned: true };

  // Owner confirmed — populate the cache (ticket + comments) for next time.
  await upsertCachedTicket(record);
  await replaceCachedComments(id, await fetchCommentsForSync(id));

  return { ticket: recordToDetail(record) };
}

/** Cached comments for a task, oldest first. Never throws (returns [] on error). */
export async function getCachedComments(id: string): Promise<ClickupComment[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(COMMENTS_TABLE)
    .select("author,body,commented_at")
    .eq("external_task_id", id)
    .order("commented_at", { ascending: true });

  if (error || !data) return [];
  return (data as { author: string; body: string }[]).map((c) => ({
    author: c.author,
    text: c.body,
  }));
}

// ---------------------------------------------------------------------------
// Solution cache (read-through; one row per (task, locale))
// ---------------------------------------------------------------------------

export async function getCachedSolution(
  id: string,
  locale: string,
): Promise<{ text: string; sourceHash: string } | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(SOLUTIONS_TABLE)
    .select("solution_text,source_hash")
    .eq("external_task_id", id)
    .eq("locale", locale)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as { solution_text: string; source_hash: string };
  return { text: row.solution_text, sourceHash: row.source_hash };
}

export async function upsertCachedSolution(
  id: string,
  locale: string,
  text: string,
  sourceHash: string,
): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from(SOLUTIONS_TABLE)
    .upsert(
      {
        external_task_id: id,
        locale,
        solution_text: text,
        source_hash: sourceHash,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "external_task_id,locale" },
    );
}

// ---------------------------------------------------------------------------
// Translation cache (title/description per locale; populated read-through on
// view — NOT pre-generated, see getCachedTicketsByEmails / getOrTranslate).
// ---------------------------------------------------------------------------

/** Freshness key for a translation: hash of the source text it was made from. */
function sourceHash(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

/** Batched lookup of cached titles (+ source hash) for a set of tasks in one locale. */
export async function getCachedTitleTranslations(
  ids: string[],
  locale: string,
): Promise<Map<string, { text: string; sourceHash: string }>> {
  const out = new Map<string, { text: string; sourceHash: string }>();
  if (ids.length === 0) return out;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(TRANSLATIONS_TABLE)
    .select("external_task_id,text,source_hash")
    .eq("field", "title")
    .eq("locale", locale)
    .in("external_task_id", ids);

  if (error || !data) return out;
  for (const row of data as { external_task_id: string; text: string; source_hash: string }[]) {
    out.set(row.external_task_id, { text: row.text, sourceHash: row.source_hash });
  }
  return out;
}

/**
 * Read-through translation for a single (task, field): return the cached
 * translation when it matches the current source text (by hash), otherwise
 * translate via Orq.ai, store it, and return it. translateText never throws
 * (returns the source on failure), so this is safe to await on render.
 */
export async function getOrTranslate(
  id: string,
  field: TranslatableField,
  locale: Locale,
  sourceText: string,
): Promise<string> {
  const hash = sourceHash(sourceText);
  const existing = await getCachedTranslation(id, field, locale);
  if (existing && existing.sourceHash === hash) return existing.text;

  const translated = await translateText(sourceText, locale);
  await upsertCachedTranslation(id, field, locale, translated, hash);
  return translated;
}

/** One cached translation (with its source hash, for freshness checks). */
export async function getCachedTranslation(
  id: string,
  field: TranslatableField,
  locale: string,
): Promise<{ text: string; sourceHash: string } | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(TRANSLATIONS_TABLE)
    .select("text,source_hash")
    .eq("external_task_id", id)
    .eq("field", field)
    .eq("locale", locale)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as { text: string; source_hash: string };
  return { text: row.text, sourceHash: row.source_hash };
}

export async function upsertCachedTranslation(
  id: string,
  field: TranslatableField,
  locale: string,
  text: string,
  sourceHash: string,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from(TRANSLATIONS_TABLE).upsert(
    {
      external_task_id: id,
      field,
      locale,
      text,
      source_hash: sourceHash,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "external_task_id,field,locale" },
  );
  if (error) throw new Error(`upsertCachedTranslation failed: ${error.message}`);
}

// ===========================================================================
// WRITE PATH (clickup-cache-sync Inngest function + backfill)
// ===========================================================================

/** Upsert one ticket record into the cache (PK = external_task_id). */
export async function upsertCachedTicket(record: SyncTaskRecord): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from(TICKETS_TABLE).upsert(
    {
      external_task_id: record.external_task_id,
      email: record.email,
      title: record.title,
      raw_status: record.raw_status,
      status_type: record.status_type,
      ticket_group: record.ticket_group,
      description: record.description,
      assignee: record.assignee,
      summary: record.summary,
      date_created: record.date_created,
      date_updated: record.date_updated,
      url: record.url,
      raw: record.raw,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "external_task_id" },
  );
  if (error) throw new Error(`upsertCachedTicket failed: ${error.message}`);
}

/**
 * Replace a task's comment set: delete the current rows, then insert the latest
 * snapshot. This keeps the cache exact (handles edited/deleted comments) and is
 * idempotent across Inngest retries.
 */
export async function replaceCachedComments(
  id: string,
  comments: SyncComment[],
): Promise<void> {
  const supabase = createAdminClient();
  const { error: delError } = await supabase
    .from(COMMENTS_TABLE)
    .delete()
    .eq("external_task_id", id);
  if (delError) throw new Error(`replaceCachedComments delete failed: ${delError.message}`);

  if (comments.length === 0) return;
  const rows = comments.map((c) => ({
    external_task_id: id,
    clickup_comment_id: c.clickup_comment_id,
    author: c.author,
    body: c.body,
    commented_at: c.commented_at,
    synced_at: new Date().toISOString(),
  }));
  const { error: insError } = await supabase.from(COMMENTS_TABLE).insert(rows);
  if (insError) throw new Error(`replaceCachedComments insert failed: ${insError.message}`);
}

/** Remove a ticket from the cache (FK cascade clears comments + solutions). */
export async function deleteCachedTicket(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from(TICKETS_TABLE).delete().eq("external_task_id", id);
  if (error) throw new Error(`deleteCachedTicket failed: ${error.message}`);
}

/**
 * Drop all cached solutions for a task. Called by the sync function when a
 * ticket leaves "resolved" (user requirement: remove the solution; it is
 * regenerated read-through when the ticket is resolved again).
 */
export async function deleteCachedSolutions(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from(SOLUTIONS_TABLE).delete().eq("external_task_id", id);
  if (error) throw new Error(`deleteCachedSolutions failed: ${error.message}`);
}
