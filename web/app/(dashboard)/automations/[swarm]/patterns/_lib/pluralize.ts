// Phase 4 follow-up (2026-05-27) — operator-facing pluralization.
// Singular/plural for suggestion counts so "1 suggestions" never ships.
export function suggestionsLabel(n: number): string {
  return `${n} suggestion${n === 1 ? "" : "s"}`;
}
