// Phase 112.5 Plan 02 Task 3 — swarm-agnostic folder-map registry-reader.
//
// Leest public.outlook_folder_map (folder_id -> semantische bucket:
// inbox/archive/afgehandeld/sent/other) als registry-as-source-of-truth.
// GEEN hardcoded folder-ids, GEEN sales-constanten: mailbox is altijd een
// parameter zodat meerdere swarms dezelfde engine delen. Een nieuwe
// afgehandeld-jaar-folder is een INSERT-rij in de registry, geen code-change.
//
// Volgt de admin-select-shape van web/lib/swarms/registry.ts
// (loadSwarmNoiseCategories): service-role select, last-known-good niet nodig
// hier (geen hete read-pad — de delta-worker leest dit één keer per run).

import type { SupabaseClient } from "@supabase/supabase-js";

interface FolderMapRow {
  folder_id: string;
  bucket: string;
  tracked: boolean;
  display_name: string | null;
}

/**
 * Lees outlook_folder_map voor één mailbox en bouw een Map folder_id -> bucket.
 * Op Supabase-error: lege Map (de caller behandelt onbekende folders als
 * "other" via bucketForFolder).
 */
export async function loadFolderMap(
  admin: SupabaseClient,
  mailbox: string,
): Promise<Map<string, string>> {
  const { data, error } = await admin
    .from("outlook_folder_map")
    .select("folder_id, bucket, tracked, display_name")
    .eq("mailbox", mailbox);

  if (error || !data) return new Map();

  const rows = data as FolderMapRow[];
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.folder_id, row.bucket);
  }
  return map;
}

/**
 * De getrackte folders voor één mailbox (tracked=true), zodat de delta-worker
 * (Plan 04) weet welke folders te pollen. Geeft folder_id + bucket terug.
 */
export async function getTrackedFolders(
  admin: SupabaseClient,
  mailbox: string,
): Promise<{ folder_id: string; bucket: string }[]> {
  const { data, error } = await admin
    .from("outlook_folder_map")
    .select("folder_id, bucket, tracked, display_name")
    .eq("mailbox", mailbox);

  if (error || !data) return [];

  return (data as FolderMapRow[])
    .filter((row) => row.tracked === true)
    .map((row) => ({ folder_id: row.folder_id, bucket: row.bucket }));
}

/**
 * Pure resolver: folder-id -> bucket via de geladen map. Een niet-gemapte
 * folder-id valt in "other" (nooit undefined) — zo telt onbekende ruis niet
 * mee in afgehandeld/archive-ratio's maar crasht de pipeline ook niet.
 */
export function bucketForFolder(map: Map<string, string>, folderId: string): string {
  return map.get(folderId) ?? "other";
}
