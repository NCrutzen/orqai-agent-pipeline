// Per-swarm mailbox label helper.
//
// Labels are derived at runtime by loadMailboxLabels(admin, swarmType) which
// joins automation_runs.{mailbox_id, entity} against swarms.entity_brand.
// New mailboxes appear automatically — no code change needed.
//
// This module stays sync because some callers (server components after the
// async lookup) just need to merge a label map with ids observed in rows.

export interface MailboxOption {
  id: number;
  label: string;
}

/**
 * Derive the option list for a swarm's mailbox filter.
 *
 * Algorithm:
 *   1. Collect distinct non-null mailbox_id values from `rows`.
 *   2. Union with all ids in the provided `labels` map.
 *   3. Map each id to { id, label: labels[id] OR `mailbox ${id}` }.
 *   4. Sort by id ascending.
 */
export function getSwarmMailboxes(
  rows: ReadonlyArray<{ mailbox_id: number | null }>,
  labels: Record<number, string> = {},
): MailboxOption[] {
  const ids = new Set<number>();
  for (const r of rows) {
    if (r.mailbox_id !== null && r.mailbox_id !== undefined) {
      ids.add(r.mailbox_id);
    }
  }
  for (const key of Object.keys(labels)) {
    ids.add(Number(key));
  }
  const out: MailboxOption[] = [];
  for (const id of ids) {
    out.push({ id, label: labels[id] ?? `mailbox ${id}` });
  }
  out.sort((a, b) => a.id - b.id);
  return out;
}
