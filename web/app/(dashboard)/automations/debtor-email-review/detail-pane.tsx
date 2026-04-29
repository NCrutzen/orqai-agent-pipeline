"use client";

// Phase 61-02 stub. Real implementation lands in Task 4.
// Exports kept minimal so page.tsx + row-strip.tsx typecheck through
// the intermediate Task 1/2/3 commits.

import type { PredictedRow } from "./page";
import type { PageSearchParams } from "./page";

interface DetailPaneProps {
  row: PredictedRow | null;
  rows: PredictedRow[];
  selection: PageSearchParams;
}

export function DetailPane(_props: DetailPaneProps) {
  void _props;
  return null;
}

// Body-cache prefetch helper — real impl in Task 4. Stubbed as a no-op so
// row-strip.tsx can import it now.
export function prefetchReviewEmailBody(_id: string): void {
  void _id;
}
