# Phase 84 — Discussion Log

**Session:** 2026-05-20 (update round; original CONTEXT.md drafted 2026-05-19)
**Mode:** standard `/gsd:discuss-phase` (no flags), worked-without-stopping per session directive.

## Areas selected for discussion

User selected all four candidate areas:
1. Category key naming
2. Cross-swarm scope per category
3. Shadow window duration
4. `swarms.tenant_domains` JSONB shape (D-03)

## Area 1 — Category key naming

**Initial options:** keep-as-proposed / vendor-prefixed-strict / generic-typed.
**Operator selection:** keep as proposed, **but** flagged `coupa_po_issued` reads like "a PO needs to be issued by us" → action-required connotation.
**Resolution path:** I proposed renaming to `coupa_po_notification` to mirror `coupa_invoice_paid_notification` + `coupa_invoice_approved_notification`. Operator pushed back further — "the email itself shouldn't be handled as noise; show me examples to verify."

→ Triggered Area 1' (Coupa subject corpus pull).

## Area 1' — Coupa subject corpus pull (2026-05-20)

Queried `email_pipeline.emails` for every `*@coupahost.com` subject, normalised digits → `#`, distribution:

| Count | Subject template | Verdict |
|------:|------------------|---------|
| 40 | `***Kopie voor referentie*** Nieuwe inkooporder NL# is uitgegeven` | Originally noise; operator dropped |
|  7 | `Action Required - AECOM  Registration Instructions` | NOT noise (supplier onboarding) |
|  6 | `Factuurnummer # is gemarkeerd als betwist door ISS` | NOT noise (real dispute) |
|  3 | `Factuur # gemarkeerd als Betaald door ISS` | Noise ✓ |
|  3 | `Factuur # is goedgekeurd voor betaling door ISS` | Noise ✓ |
|  1 | `CBRE Revised Purchase Order ##NLP#` | NOT noise (revised → action) |
|  1 | `CBRE Purchase Order ##NLP#` | Ambiguous — bare PO |
|  1 | `New payment role granted` | Platform admin, 3-row cluster |
|  1 | `Alert - New community role granted` | Platform admin |
|  1 | `New Coupa User Added` | Platform admin |
|  1 | `Invoice ## has been marked as Disputed by CBRE` | NOT noise (real dispute) |

**Operator decisions:**
- DROP the `coupa_po_notification` rule entirely. Rationale: even with a strict `***Kopie voor referentie***` prefix anchor, the downside of swallowing a future template variant outweighs the 40-email/4mo upside. Err toward visibility; revisit in V8.2 when Phase 86's discovery surface gives a structured promotion path.
- SKIP the `coupa_platform_role_admin` cluster (3 emails / 4 months — below registry-row threshold).

→ Category count drops from 9 to **8**.

## Area 2 — Cross-swarm scope per category

**Options:** cross-swarm-by-default / debtor-email-only / per-category-judgement.
**Operator selection:** cross-swarm by default ("e-mails hit multiple mailboxes at once").
**Codified as:** D-08. Justification grounded in Spike 003's 56% cross-swarm transferability finding. Per-swarm overrides allowed during the 7-day shadow if FP risk emerges.

## Area 3 — Shadow window duration

**Options:** volume-adaptive / fixed-7-day / two-tier-by-volume.
**Operator selection:** volume-adaptive.
**Codified as:** D-05 revision. Wilson-CI gate kept; promotion fires when either (a) 7-day shadow + Wilson-CI ≥ 0.95 OR (b) ≥ 10 corpus-confirmed positives, zero hand-confirmed FPs, 7-day live shadow with no operator-flagged FPs. 7-day floor preserved either way.

## Area 4 — `swarms.tenant_domains` JSONB shape

**First-round confusion:** operator asked "What is this??" — jargon-dense framing on my side.
**Second-round walk-through:** concrete Fire Control loopback example (administratie@fire-control.nl outbound BCC'd back to itself), explained the lookup need.
**Operator selection:** flat array, migrate later if needed (recommended path).
**Codified as:** D-03 revision. Shape = `jsonb` flat array of lowercase domain strings, `NOT NULL DEFAULT '[]'::jsonb`. Loopback rule body uses `direction='inbound' AND lower(split_part(from_address, '@', 2)) = ANY(tenant_domains)`.

## Deferred ideas captured

- Coupa PO notification rule — revisit V8.2 / Phase 86 discovery
- Coupa platform admin cluster — auto-surface via Phase 86 if it grows
- `{primary, aliases}` shape for tenant_domains — only if multi-brand tenant materialises
- AP master-data handler for bank-change — V8.2 handler scoping
- M365 quarantine → IT ticket handler — V8.2 handler scoping

## Anti-pattern checks

- No `.continue-here.md` present in phase dir → no blocking anti-patterns to acknowledge.
- USER-PROFILE.md absent → ADVISOR_MODE inactive, standard flow used.

## Net delta vs prior CONTEXT.md (2026-05-19)

- 9 → 8 categories (`coupa_po_notification` dropped).
- D-03 schema concretised (flat array, with explicit rule body).
- D-05 shadow window revised (24h → volume-adaptive with 7-day floor).
- D-08 added (cross-swarm by default).
- R-01 rewritten (was about Coupa "betwist" misfire; that risk is gone with the PO rule dropped — replaced with template-stability risk).
- R-04 + R-05 added (cross-swarm FP risk, codegen drift).
- `<canonical_refs>` section added (was missing from prior draft; mandatory per discuss-phase workflow).
- `<deferred>` section added.
- Success criteria #2 rewritten (Coupa-PO claim removed; loopback claim added).
- Success criteria #4 forecast revised downward (Coupa-PO contribution removed).
