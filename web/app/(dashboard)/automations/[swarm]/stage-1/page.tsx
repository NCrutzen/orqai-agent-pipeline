// Phase 76 Plan 08 Task 2 — Stage 1 route wrapper.
//
// Per CONTEXT.md D-04 REVISED ("Stage 1 = today's Bulk Review surface") and
// the plan's minimum-churn directive, this page re-exports the existing
// /review page so the legacy implementation stays the source of truth and
// only the URL changes.
//
// The middleware (Phase 76 Plan 08 Task 1) 308-redirects external
// /review traffic onto this URL; internal links from the registry-driven
// stage tab strip (Plan 06) point here directly via t.slug='stage-1'.
//
// Hard-separation note (RFC docs/agentic-pipeline/stage-1-regex.md):
// Stage 1 is the noise filter. The Bulk Review surface re-exported here
// reads pipeline_events at stage=1 (regex Pass 1 + LLM 2nd-pass on
// `unknown`) and writes verdicts back through swarm_noise_categories —
// it never blurs into swarm_intents (Stage 3).

// Next.js 16 + Turbopack reject re-exported route segment config (`dynamic`)
// because the value must be statically parsed at compile-time. Inline it here
// and only re-export the default page component.
export const dynamic = "force-dynamic";
export { default } from "../review/page";
