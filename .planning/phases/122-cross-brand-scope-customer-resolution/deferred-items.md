# Deferred items — Phase 122 cross-brand-scope-customer-resolution

## #95 confident-wrong (out of scope for Plan 05 leaf-vs-root)

- **Found during:** Plan 05 Task 3 eval re-run (live substrate, 2026-06-18).
- **Symptom:** Fixture row #95 resolves to `524156` (the "De Studio" leaf) at
  `confidence: high`, but the operator ground-truth is `525156` (a sibling/different
  party). It is confident-wrong both BEFORE this fix (resolved to `524011`, the root of
  524156) and AFTER (resolved to `524156`, the leaf). The leaf-vs-root fix changed it
  from root-wrong to leaf-wrong; neither matches GT `525156`.
- **Why deferred:** #95 is NOT in the leaf-vs-root reachable bucket-C target set
  (#98/#12/#38 + the #96 control) the Plan 05 gap-closure scoped. It belongs to the
  original 4 confident-wrong AUTO rows (#2/#85/#95/#97) whose root cause is a different
  defect (a wrong invoice→party mapping on the live substrate, or a sibling-party
  collision under the same root), not the root-instead-of-leaf bug. This is a
  pre-existing failure, not a regression introduced by Plan 05.
- **Next step:** Investigate #95's invoice→party mapping in `zapier.dbo.resolver_index`
  (does invoice 33050903's sibling resolve to 524156 vs 525156?) in a follow-up
  debug/plan. Out of scope for the cross-scope leaf-vs-root gap-closure.
