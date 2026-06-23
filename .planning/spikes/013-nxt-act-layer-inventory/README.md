---
spike: 013
name: nxt-act-layer-inventory
type: standard
validates: "Dim B of the V10.5 Order Entry spike — what NXT/Camunda endpoints actually exist for the act layer (order creation), which CTO Claude Code skills cover which, and where Browserless UI-automation is the only path. Source = the CTO's concept skills under ~/Downloads/skills (authoritative per source-trust rule), cross-read against repo spikes 007 + 011d."
verdict: "LARGELY ANSWERED 2026-06-22 from CTO concept-skills (authoritative). The act layer EXISTS as a REST write-surface: Layer C SPA-token on /api/* + /api/camunda-rest. `create-order` (nxt-user) = POST /api/orders (status=prospect + lines) is the canonical order creator; Camunda 7.x orchestrates processes. M2M (Layer B) is dead (401); the agent-workforce proxy is defunct → repo doc `docs/nxt-rest-access.md` is stale. GAP for offerte→order: NO quote-acceptance trigger and NO quote→order skill exist — the orchestration glue (detect acceptance → create-order with quoteReference → optional downstream) is the swarm's to build. Endpoint shapes still to confirm against the live system before any write phase."
related: [007, 011, 012]
idea: order-entry-act-proof
tags: [order-entry, v10.5, act-layer, nxt, camunda, endpoints, cto-sourced]
---

# Spike 013: nxt-act-layer-inventory

## Why this exists

V10.5's central open question (roadmap #124) was the **act-layer integration**: "NXT has almost no
API endpoints and no Flowable endpoints." The CTO shared a set of concept Claude Code skills
(`~/Downloads/skills`, 19 skills) that operate NXT/Camunda/Exact — largely write/act operations.

**Source-trust rule (Nick, 2026-06-22):** material from the **CTO is authoritative** — recorded
here as established fact. (Koen's voorwerk is provisional — that's spike 012.) The one caveat: exact
endpoint shapes/payloads are taken from the skill docs and should still be confirmed against the
live system inside the eventual write phase, not re-litigated here.

## Established (from the CTO skills)

### The 3-layer NXT access model (`nxt-context` / access-model.md)

| Layer | Purpose | Transport | Auth | Status |
|---|---|---|---|---|
| **A** | Read-only warehouse — reference data, catalogs, diagnostics | SQL Server (pymssql), `awsdatawh.moyneroberts.com` user `claude` | DB user (SELECT only) | Live, read-only |
| **B** | Official M2M APIs | Auth0 client_credentials | M2M token | **DEAD** (401 on Layer C) |
| **C** | Internal SPA `/api/*` + `/api/camunda-rest/*` — **the write surface** | REST | **SPA Bearer (Auth0 ID token)**, cached per brand `~/.config/nxt/token-<brand>` | Live, primary |

**All NXT writes go through Layer C (SPA token). No M2M, no direct DB writes.** Brand matrix:
bx→sb, uk→wf, ie→af; hosts `[acc.]<prefix>.n-xt.org`. **The agent-workforce proxy is defunct**
(per access-model.md) → see Action below.

### Act-layer capabilities (skill → what it can write)

| Skill | Act capability | Endpoint(s) | Offerte→order |
|---|---|---|---|
| **nxt-user** | **Create/update customers, sites, order schemes, ORDERS** | `POST/PUT /api/orders`, `/api/customers`, `/api/sites`, `/api/sites/{id}/orderSchemes` (SPA token); warehouse read for catalogs | **HIGH — create-order = the act** |
| **camunda-tasks** | Inspect/complete/fail/retry external tasks; start/delete process instances | `/api/camunda-rest/external-task`, `/process-definition/key/{k}/start` (SPA token) | MEDIUM — process orchestration |
| **amend-order-scheme** | Amend existing recurring scheme + move existing job (PUT + jobUpdates) | `PUT /api/sites/{id}/orderSchemes/{id}` (SPA token) | LOW — amends, not creates |
| **nxt-migrate** | Bulk backfill customers/sites/schemes (delegates to nxt-user) | via nxt-user | MEDIUM — bulk feed |
| **nxt-send-rules** | Configure document send rules (incl. `QUOTE_SEND_MAIL`) | `/api/brands/{id}/send-rules`, `/api/customers/{id}/send-rules` | LOW — mails quotes, not creation |
| nxt-exact-interface / -finalize / -diagnose | Customer re-sync + invoice finalize via Camunda; diagnostics | `/api/camunda-rest/...`, warehouse read | NONE (post-order invoicing) |
| exact-item-maintenance | Create/update Exact articles | exact-mcp proxy `:8099`, `X-Api-Key` | LOW (item master) |
| intelly-plan | Plan/unplan jobs on Intelly board | Intelly `SchedulerWebServices.asmx` (cookie) | LOW (executes existing jobs) |
| nxt-fix-asset-type / -socotec-export / -stock-transfer / -transcoder-restart / -crm-import / -invoice-proforma | One-off corrections / exports / infra / CRM replication | mixed (SPA, warehouse, AWS ECS, Camunda) | NONE |

### Auth/transport patterns (common)
- **SPA Bearer (Layer C)** is the workhorse: paste/cached per brand, ~9–10h TTL, 401→re-auth.
  Used by every NXT write skill. (Token-harvest via Browserless = our existing route in repo.)
- **Warehouse (Layer A)**: read-only catalogs/validation, prod-read guarded.
- **Camunda REST** rides the same host + SPA token as `/api/*`.
- **exact-mcp `:8099`** (`X-Api-Key`) for Exact; **Intelly** cookie-session (not Auth0).

## The offerte→order gap (what the skills do NOT cover)

The building blocks exist; the **orchestration glue is the swarm's to build**:
1. **No quote-acceptance trigger** — no skill watches a quote state change / acceptance; no
   Camunda `quoteAccepted` / `createOrderFromQuote` process definition is shown.
2. **No quote→order transformation** — `create-order` builds from scratch; `quoteReference` can be
   stored but there's no automated lineage.
3. **Only quote touch** = `nxt-send-rules` (`QUOTE_SEND_MAIL` / `QUOTE_REMINDER_SEND_MAIL`) — mailing, not creation.

→ The V10.5 swarm must: **detect acceptance** (Stage-3/4) → **`create-order`** (`POST /api/orders`,
`quoteReference=<id>`) → **optional downstream** (Intelly planning, order-confirmation send-rule,
forecast rerun). This is the cross-swarm act-glue Dim D (015) will scope against sales.

## Consistency with locked repo architecture
- Aligns with the locked Stage-2 rule: **NXT REST = writes / UI-lookups only, never entity
  resolution** (`docs/agentic-pipeline/stage-2-entity.md`). `create-order` is a write — in scope.
- Order Entry's swarm shape = **Router/Hybrid** (Stage-3 dispatch + an act handler), not a
  Stage-1 noise gate — consistent with `docs/agentic-pipeline/README.md` Swarm Shapes.

## Action items (out of this spike's body, into the milestone)
- [ ] **Update `docs/nxt-rest-access.md`** — it documents the now-**defunct** proxy as the route;
      replace with the CTO's 3-layer model (A warehouse / B dead M2M / C SPA-token + camunda-rest)
      and the per-brand token cache. Flag as a doc-only PR.
- [ ] Confirm `POST /api/orders` payload shape + `orderStatusId="prospect"` lifecycle against the
      live acc system inside the write phase (not here).
- [ ] Decide token-harvest path for the swarm (our Browserless harvest vs the CTO's per-brand cache).

## Out of scope
- Building the create-order handler or any swarm registration (a V10.5 phase).
- Live NXT writes (gated on V9.8 dry-capture + explicit acc-first confirmation).
- Koen's classification/intent conclusions (spike 012, provisional).
