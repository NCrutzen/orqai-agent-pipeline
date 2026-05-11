// Phase 82 Plan 01 — Per-swarm mailbox label helper.
//
// `swarms.mailboxes` field doesn't exist on SwarmRow (RESEARCH A1). We derive
// the option list from (a) distinct mailbox_ids observed across loaded rows
// PLUS (b) a per-swarm static fallback map. The static map is the verbatim
// copy from stage-1/detail-pane.tsx:109-116 (debtor-email: 6 entries).
//
// A future `swarms.mailboxes` jsonb migration is a one-line swap inside this
// file (RESEARCH §Don't Hand-Roll) — callers stay unchanged.

export interface MailboxOption {
  id: number;
  label: string;
}

/**
 * Per-swarm hardcoded mailbox-id → display-label map. Keyed by swarm_type.
 * Source for debtor-email entries: stage-1/detail-pane.tsx:109-116.
 */
export const MAILBOX_LABELS: Record<string, Record<number, string>> = {
  "debtor-email": {
    1: "Sicli Noord",
    2: "Sicli Sud",
    3: "Berki",
    4: "Smeba",
    5: "Smeba Fire",
    6: "FireControl",
  },
};

/**
 * Derive the option list for a swarm's mailbox filter.
 *
 * Algorithm:
 *   1. Collect distinct non-null mailbox_id values from `rows`.
 *   2. Union with all ids in MAILBOX_LABELS[swarmType] ?? {}.
 *   3. Map each id to { id, label: label-lookup OR `mailbox ${id}` }.
 *   4. Sort by id ascending.
 *
 * Returns at least the hardcoded list for known swarms even when `rows` is
 * empty — Stage 0 / Stage 2 (which have empty rows) still see the canonical
 * options. Unknown swarms fall back to deriving purely from row data.
 */
export function getSwarmMailboxes(
  swarmType: string,
  rows: ReadonlyArray<{ mailbox_id: number | null }>,
): MailboxOption[] {
  const labelMap = MAILBOX_LABELS[swarmType] ?? {};
  const ids = new Set<number>();
  for (const r of rows) {
    if (r.mailbox_id !== null && r.mailbox_id !== undefined) {
      ids.add(r.mailbox_id);
    }
  }
  for (const key of Object.keys(labelMap)) {
    ids.add(Number(key));
  }
  const out: MailboxOption[] = [];
  for (const id of ids) {
    out.push({ id, label: labelMap[id] ?? `mailbox ${id}` });
  }
  out.sort((a, b) => a.id - b.id);
  return out;
}
