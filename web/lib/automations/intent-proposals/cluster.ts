// Phase 86 Plan 02 — D-03 pure-JS Levenshtein + greedy single-link clustering.
//
// Dependency-free (no fast-levenshtein, no npm cluster lib — locked by plan
// deviation_rules). Deterministic: input order is normalised, centroid pick is
// most-frequent-then-lexicographic, output is sorted by member_count DESC then
// centroid lexicographically.
//
// Threshold 0.85 derived from RESEARCH Q5 corpus (locked in
// __tests__/cluster.test.ts): only coupa_po_notification ↔ coupa_notification
// merges; all wka_* / payment_* variants stay distinct.

import { normalizeLabel } from "./normalize";
import type { ProposalRow } from "./types";

// ---------------------------------------------------------------------------
// Levenshtein — two-row DP (O(min(|a|,|b|)) memory).
// ---------------------------------------------------------------------------
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Make `a` the shorter string so the inner row is min(|a|,|b|)+1 wide.
  if (a.length > b.length) {
    const tmp = a;
    a = b;
    b = tmp;
  }

  let prev = new Array<number>(a.length + 1);
  let curr = new Array<number>(a.length + 1);
  for (let i = 0; i <= a.length; i++) prev[i] = i;

  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1,        // insertion
        prev[i] + 1,            // deletion
        prev[i - 1] + cost,     // substitution
      );
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[a.length];
}

// ---------------------------------------------------------------------------
// Similarity — normalised to [0, 1].
// ---------------------------------------------------------------------------
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

// ---------------------------------------------------------------------------
// clusterProposals — greedy single-link clustering.
// ---------------------------------------------------------------------------
export interface ProposalCluster {
  centroid: string;
  members: ProposalRow[];
  memberLabels: string[]; // distinct normalised labels in the cluster, sorted
  count: number;
}

interface Bucket {
  norm: string; // first-seen normalised label (the bucket "anchor")
  members: ProposalRow[];
  labels: string[]; // normalised label per member, parallel to members[]
}

export function clusterProposals(
  rows: ReadonlyArray<ProposalRow>,
  threshold = 0.85,
): ProposalCluster[] {
  if (rows.length === 0) return [];

  // Determinism: sort input by (normalised label, pipeline_event_id) so the
  // bucket-anchor pick is stable regardless of caller insertion order.
  const indexed = rows.map((r) => ({
    row: r,
    norm: normalizeLabel(r.proposal_label),
  }));
  indexed.sort((x, y) => {
    if (x.norm < y.norm) return -1;
    if (x.norm > y.norm) return 1;
    return x.row.pipeline_event_id < y.row.pipeline_event_id ? -1 : 1;
  });

  const buckets: Bucket[] = [];
  for (const { row, norm } of indexed) {
    // Greedy single-link: first bucket whose anchor passes threshold wins.
    let placed = false;
    for (const b of buckets) {
      if (similarity(norm, b.norm) >= threshold) {
        b.members.push(row);
        b.labels.push(norm);
        placed = true;
        break;
      }
    }
    if (!placed) {
      buckets.push({ norm, members: [row], labels: [norm] });
    }
  }

  const clusters: ProposalCluster[] = buckets.map((b) => {
    // Centroid = most-frequent label, tie-break lexicographic (stable).
    const counts = new Map<string, number>();
    for (const l of b.labels) counts.set(l, (counts.get(l) ?? 0) + 1);
    let centroid = b.labels[0];
    let bestCount = -1;
    const sortedLabels = Array.from(counts.keys()).sort();
    for (const l of sortedLabels) {
      const c = counts.get(l)!;
      if (c > bestCount) {
        bestCount = c;
        centroid = l;
      }
    }
    return {
      centroid,
      members: b.members,
      memberLabels: sortedLabels,
      count: b.members.length,
    };
  });

  // Output sort: member_count DESC, then centroid ASC for determinism.
  clusters.sort((x, y) => {
    if (y.count !== x.count) return y.count - x.count;
    return x.centroid < y.centroid ? -1 : 1;
  });

  return clusters;
}
