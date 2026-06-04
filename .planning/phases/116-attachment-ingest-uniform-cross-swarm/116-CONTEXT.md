# Phase 116: Attachment Ingest — uniform cross-swarm attachment data source - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Attachments become a first-class, swarm-agnostic pipeline data source: ingest captures attachment metadata (filenames/content-types/sizes) per email, content extraction (PDF text first) runs as a registry-gated funnel step, and the extracted text is exposed as a uniform source any swarm consumes via registry config — Stage 2 resolution (PO/offertenummer on letterhead), Stage 3 intent signals, future Stage 4 handlers (V11.0). Sales (`verkoop@`) onboards fully; debtor flips metadata capture on via registry row only.

**Sequencing:** executes BEFORE Phase 113 — the 113 retro batch-resolve and intent discovery consume the attachment data this phase produces.

**Hard architecture constraints (roadmap-locked):**
- Zero per-swarm branches in shared workers (SWARM-02; static guard exists since 110-01).
- Engine files stay byte-identical to the v8.2 donor (STAGE2-01) — attachment-derived text enters Stage 2 as an **adapter-side body-source, never an Engine edit**.
- Debtor/future-swarm adoption must require only a registry row, no code change.

**Already done (do not redo):** `has_attachments` boolean capture for new sales mail (Phase 114-03, D-14: `web/lib/outlook/client.ts` requests Graph `hasAttachments`; `web/app/api/automations/sales-email/ingest/route.ts` writes it).

**Out of scope:** Stage 4 handlers consuming attachments (V11.0), debtor extraction/backfill, Office-doc parsing, retention/GDPR policy (all deferred — see below).

</domain>

<decisions>
## Implementation Decisions

### Extraction trigger & timing
- **D-01:** **Post-Stage-1 eager extraction.** Attachment metadata is captured at ingest; content extraction fires automatically once an email survives the Stage 1 noise filter. Noise mail is never extracted (cost control); text is already available when Stage 2/3 run.
- **D-02:** **Sequenced, not raced:** extraction is a funnel step between the Stage 1 verdict and the Stage 2 request — Stage 2 always sees attachment text when there is any. Deterministic; seconds of added latency accepted in an async email-scale pipeline.
- **D-03:** **Fail-soft, never block.** Extraction failure (corrupt PDF, password-protected, oversized, unsupported type) is recorded as a status on the attachment record (visible in Bulk Review detail); Stage 2 proceeds body-only. The funnel never stalls on an attachment.
- **D-04:** **Registry shape = two independent switches per swarm:** (1) metadata capture at ingest, (2) post-Stage-1 content extraction. A swarm can capture metadata without paying for extraction. Caps/types are global defaults with optional per-swarm override.

### Storage & retention
- **D-05:** **Binaries to Supabase Storage, downloaded from Graph only when extraction fires** (post-Stage-1), keyed per email/attachment. Noise mail stores nothing; backfill/re-extraction don't depend on Outlook retention.
- **D-06:** **Extracted text lives in a new generic, swarm-agnostic attachments table** (one row per attachment: metadata + extraction status + extracted text), in the spirit of the Phase 114 D-12 generic `resolution_audit` precedent. Every swarm reuses it. Ships as migration + RLS (service_role minimum; authenticated SELECT if UI-read) + `npm run codegen` atomically.
- **D-07:** **Keep indefinitely for now** — the corpus is the asset (113 discovery, V10.0 learning, future Stage 4 handlers). Retention/GDPR policy is a deferred follow-up once volumes are known.
- **D-08:** **Bulk Review shows metadata + extraction status** (names/types/sizes + done/failed/skipped) in the detail pane. ⚠️ **User directive: implement diligently in the post-UX-rebuild review pane** (stage-keyed shell) — follow the bulk-review-flow-ux design contract, do not bolt onto pre-rebuild layouts. No preview/download UI this phase.

### Extraction depth (v1)
- **D-09:** **Text-layer parse first, LLM-vision fallback for scans:** parse the PDF text layer (cheap, deterministic); when it yields ~nothing, fall back to a vision-capable model **via Orq.ai Router** on rendered pages. No dedicated OCR service. Scanned PO's on letterhead are the exact target of this phase.
- **D-10:** **v1 file types = PDF + standalone images** (jpg/png — photographed PO's, drawings) via the same LLM-vision path. Office docs (docx/xlsx) get metadata only with status `unsupported` — measurable, promotable later.
- **D-11:** **Output is raw text only, per attachment.** The Stage 2 sales adapter mines identifiers from it with its existing layers (same treatment as body text — the locked adapter-side body-source framing); Stage 3 receives it as prompt context. No structured-field extraction in the uniform layer — keeps it swarm-agnostic.

### Backfill
- **D-12:** **Metadata backfill over the whole 1,273-mail corpus** via Graph `source_id` message-ids (closes the `has_attachments=false` blind spot — success criterion 4); **content extraction only for Stage-1 survivors** — same funnel rule as live. That slice is exactly what 113's retro batch-resolve + intent discovery read.
- **D-13:** **Debtor metadata capture flips ON in this phase** via registry row (proves the registry opt-in works for real; invoice-copy attachments start accumulating). **No debtor extraction, no debtor backfill** — those remain future registry/phase decisions.

### Claude's Discretion
- **Caps:** pragmatic global defaults (max attachment size, max vision pages, max attachments per mail) grounded in corpus data; over-cap → status `skipped_cap`, fail-soft and visible — never silent truncation.
- **Mechanics:** Inngest event naming (follow the Phase 88.1 stage-named convention), extraction worker shape, backfill batching/rate-limiting against Graph, handling of mails deleted/moved since ingest (fail-soft status expected), vision model choice (`list_models`-validated per CLAUDE.md catalog rules).
- **Table/bucket placement:** schema (`email_pipeline` likely) and Storage bucket layout/keying at planner discretion; RLS + migration-template compliance non-negotiable.
- **Dedup:** identical attachments repeated across a thread — planner decides if/how to dedup (hash) in v1.

### Folded Todos
- `2026-06-04-sales-ingest-attachments-gap.md` (`resolves_phase: 116`) — the phase's origin todo. Remaining scope after 114-03: attachment metadata capture, content extraction, backfill decision over the 1,273-mail corpus. Fully absorbed by D-01..D-12. Close the todo when this phase completes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture (locked RFCs — win over code-inferred conclusions)
- `docs/agentic-pipeline/README.md` — v8.0 5-stage funnel, Stage 2→3 context-shape contract, SWARM-02 no-branch rule, swarm shapes; this phase inserts a funnel step between Stage 1 and Stage 2.
- `docs/agentic-pipeline/context-shape-contract.md` — `PipelineStageContext` envelope; how attachment-derived text reaches Stage 2/3 must respect this contract.
- `docs/agentic-pipeline/stage-1-regex.md` — the Stage 1 verdict the extraction trigger (D-01) keys off.

### Ingest path (current state)
- `web/lib/outlook/client.ts` — Graph client; `hasAttachments` already requested (Phase 114-03 D-14); attachment list/content fetch endpoints are NEW work here.
- `web/app/api/automations/sales-email/ingest/route.ts` — sales ingest route; writes `has_attachments` (line ~196); metadata capture hooks in here, registry-gated.
- `web/app/api/automations/debtor-email/ingest/route.ts` — debtor ingest route; D-13 capture flip must work through the same registry-driven path, no debtor-specific code.

### Constraints from prior phases
- `.planning/phases/114-stage-2-resolver-reuse-cross-swarm-generality-proof/114-CONTEXT.md` — D-12 generic-table precedent, D-14 ingest-gap prereq history; STAGE2-01 no-Engine-diff guard this phase must keep green.
- `web/lib/agentic-pipeline/resolve/engine.ts` — **read-only**; byte-identical to v8.2 donor (STAGE2-01). Attachment text enters via the sales adapter (`web/lib/automations/sales-email/resolve-customer*`) as body-source.
- `.planning/phases/113-stage-3-sales-intent-agent-greenfield/113-CONTEXT.md` — D-01/D-07: the retro batch-resolve + discovery that consume this phase's output; defines what the backfill slice (D-12) must serve.
- Phase 112 gated Outlook patterns — backfill Graph access is read-only, but follow the 112 batching/safety discipline for corpus-scale Graph operations.

### Review surface (D-08 directive)
- `./.claude/skills/sketch-findings-bulk-review-flow-ux/SKILL.md` — the post-rebuild Bulk Review design contract; the attachment metadata/status display MUST follow the stage-keyed shell + detail-pane patterns from the UX rebuild.
- `web/app/(dashboard)/automations/[swarm]/_shell/` — the rebuilt review-shell code the detail-pane addition lands in.

### Stack rules
- `docs/orqai-patterns.md` + CLAUDE.md Orq block — LLM-vision fallback goes through Orq.ai Router (never direct LLM API keys); `list_models` validation; json_schema `anyOf` nullables if structured calls are used.
- `docs/inngest-patterns.md` + CLAUDE.md Inngest block — replay-safe id generation inside `step.run()`, large outputs to Supabase with reference returns (extracted text!), never destructure `inngest.send`.
- `supabase/migrations/_template.sql` — RLS-mandatory migration template for the new attachments table.
- CLAUDE.md Supabase codegen block — registry changes ship migration + `npm run codegen` atomically; never hand-edit `*.generated.ts`.

### Planning state
- `.planning/ROADMAP.md` §Phase 116 — goal + 4 success criteria + re-sequencing note (116 before 113).
- `.planning/todos/pending/2026-06-04-sales-ingest-attachments-gap.md` — folded origin todo with acceptance criteria + 114-03 status update.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/lib/outlook/client.ts` — Graph auth + message fetch plumbing; extend with `/messages/{id}/attachments` (metadata) and `/attachments/{id}/$value` (content) calls.
- `email_pipeline.emails.source_id` — Graph message-ids over the full 1,273-mail corpus: the backfill key (D-12).
- Phase 111 sales retro candidate selector (`web/lib/automations/sales-email/retro/select-candidates.ts`) — the "Stage-1 survivor" definition the backfill-extraction slice (D-12) should reuse, incl. 40k hard-cap fail-loud pattern.
- `isStageBlocked` / `swarms.dry_run_config` per-stage gates (Phase 110 D-10) — pattern for any new gate keys.
- Phase 114 D-12 `email_pipeline.resolution_audit` migration — the generic-table precedent D-06 mirrors (schema placement, RLS shape).

### Established Patterns
- Registry-as-source-of-truth: new swarm capability = registry row, asserted branch-free by the SWARM-02 static guard.
- Inngest replay safety + business-hours cron defaults; large outputs (extracted text) referenced, not returned, from steps.
- Fail-soft with visible status (Stage 2 prospects fall through; extraction inherits the same philosophy — D-03).
- Shadow→promote / gated production writes (Phase 111/112; archive-incident lesson) — backfill is read-only Graph, but discipline applies.

### Integration Points
- Ingest routes (sales + debtor) — metadata capture, registry-gated (D-04 switch 1).
- Stage 1 verdict flow — the extraction trigger point (D-01); extraction completion then emits/forwards the Stage 2 request (D-02). Event naming per Phase 88.1 stage-named convention.
- Sales Stage 2 adapter (`resolve-customer`, Phase 114-04) — consumes extracted text as an additional body-source (D-11); engine untouched.
- Stage 3 (Phase 113, after this phase) — retro discovery + live classifier read extracted text as prompt context.
- Bulk Review detail pane (post-rebuild shell) — metadata + extraction status display (D-08).

</code_context>

<specifics>
## Specific Ideas

- Operator observation driving the phase: verkoop@ carries *relatively many* attachments (offertes, tekeningen, PO's) while the data showed `has_attachments=false` on all rows — the signal was never captured, not absent.
- "De bijlagen zijn belangrijk om ook uit te lezen zodat we stage 2 en 3 goed kunnen draaien" (113 discussion) — the reason 116 runs before 113.
- D-08 user note verbatim: be diligent implementing the attachment display "correctly in the review pane after the UX rebuild we did" — treat the rebuilt shell + its design contract as binding.

</specifics>

<deferred>
## Deferred Ideas

- **Retention/GDPR policy for stored attachment binaries** — define TTL/lifecycle once real volumes are known (D-07 keeps everything for now).
- **Office-doc (docx/xlsx) text extraction** — v1 marks them `unsupported`; promotable later without schema change (D-10).
- **Debtor extraction + backfill** — capture flips on now (D-13); extraction/backfill for debtor is a future registry/phase decision (invoice-copy handler is the natural consumer).
- **Attachment preview/download in Bulk Review** — v1 shows metadata + status only (D-08).
- **Stage 4 handlers consuming attachments** — V11.0 per roadmap.

### Reviewed Todos (not folded)
- `2026-06-04-d06-corroboration-fast-follow.md` — Stage 2 engine corroboration capability; adjacent (attachment-derived identifiers will eventually feed corroboration) but engine territory, explicitly out of this phase's no-Engine-diff scope.
- `2026-06-04-sales-ingest-sender-email-gap.md` — handled in Phase 114-03; not attachment scope.
- 17 other weak keyword matches (CI debt, Bulk Review UX todos, dry-run gating notes, etc.) reviewed; none fold into attachment-ingest scope.

</deferred>

---

*Phase: 116-attachment-ingest-uniform-cross-swarm*
*Context gathered: 2026-06-04*
