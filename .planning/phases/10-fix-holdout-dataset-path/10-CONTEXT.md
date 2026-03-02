# Phase 10: Fix Holdout Dataset Path - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Resolve the holdout dataset ID path mismatch between test-results.json template and iterator.md so the re-test-on-holdout flow works end-to-end. Also fix stale step labels in iterator.md Phase 9. This is an integration fix — no new capabilities.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
User delegated all implementation decisions. The V2.0 audit (INT-01, FLOW-01) provides clear fix guidance:

- **Dataset ID field structure:** Add `train_dataset_id`, `test_dataset_id`, `holdout_dataset_id` as flat fields in `per_agent_datasets[]` entries, following the audit recommendation. Keep existing `dataset_id` field for backward compatibility.
- **Backward compatibility:** Iterator should handle old test-results.json files gracefully (warn if per-split IDs missing, suggest re-running tests). Don't silently fail.
- **Step renumbering:** Fix stale `Step 7.x` labels in iterator.md Phase 9 to correct `Step 9.x` numbering. Keep step structure as-is — this is a label fix, not a restructure.
- **Path alignment:** Update iterator.md Phase 7 Step 7.2 to read holdout dataset ID from `per_agent_datasets[].holdout_dataset_id` matching the updated template structure.
- **Tester population:** Update tester.md Phase 5.3 to populate all three per-split dataset ID fields when uploading datasets.

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Follow the V2.0 audit fix recommendations directly.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `orq-agent/templates/test-results.json`: Template with `per_agent_datasets[]` array — needs field additions
- `orq-agent/agents/tester.md`: Phase 5.3 already uploads train/test/holdout splits and logs IDs — needs to write per-split IDs to results
- `orq-agent/agents/iterator.md`: Phase 7 Steps 7.1-7.5 handle re-test-on-holdout flow — needs path fix

### Established Patterns
- Dataset IDs stored as string fields in JSON template (`"{{PLATFORM_DATASET_ID}}"`)
- Tester already logs per-split IDs in Step 5.5 output format: `agent_key: test_dataset_id, train_dataset_id, holdout_dataset_id`
- Iterator passes holdout dataset IDs to tester subagent via invocation parameters

### Integration Points
- `test-results.json` is the data contract between tester.md (writer) and iterator.md (reader)
- Iterator invokes tester subagent with holdout split override — tester needs to accept per-split IDs
- Changes must not break the primary test flow (Phase 7 automated testing) that uses test split

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-fix-holdout-dataset-path*
*Context gathered: 2026-03-02*
