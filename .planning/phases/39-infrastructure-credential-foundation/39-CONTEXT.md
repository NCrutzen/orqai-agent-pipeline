# Phase 39: Infrastructure & Credential Foundation - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

The platform has verified connectivity to Browserless.io, secure credential storage, file upload infrastructure, and an MCP tool hosting route — all validated before any automation features are built. Users can store and manage credentials for target systems via the web app. Infrastructure smoke tests confirm all external services are reachable from Inngest steps.

</domain>

<decisions>
## Implementation Decisions

### Credential vault UX
- Global credential store with per-project linking — credentials managed centrally, assigned to specific projects for use in automations
- Credentials accessible from both a global settings page AND project-level settings tab (linked view)
- Paste-only input fields for secret values — no typing, mask immediately after paste. Encourages password manager usage, prevents shoulder-surfing
- Write-once security model — credential values are never viewable after creation. Users must re-enter if forgotten. Matches AWS/GCP secret patterns
- Credential list display: Claude's discretion on table vs cards — pick what fits existing UI patterns best

### Auth profile types
- All auth methods supported: username+password, SSO/Azure AD token, API key/bearer token, client certificate/mTLS, and 2FA (TOTP/SMS)
- Templates + custom fallback: generic auth type templates (username+password, SSO, API key, certificate, TOTP) ship first, users can create custom profiles for unknown systems
- No system-specific templates for NXT/iController/Intelly in Phase 39 — generic templates only, mapped to specific systems when automations are built in later phases
- 2FA handling: Claude's discretion — pick the approach (TOTP auto-generate vs pause-and-prompt) based on Browserless.io feasibility and security model

### Rotation and failure handling
- No manual expiry dates — credential failure is auto-detected when automation scripts fail authentication on Browserless.io
- On credential failure: automation blocks immediately, credential flagged as "needs rotation", no retries with bad credentials
- Notification: in-app warning banner on credential page + affected automation pages, PLUS email notification to credential owner
- Failure state is persistent until user replaces the credential with new values

### Infrastructure smoke test
- Admin-only health page (/settings/health or similar) showing green/red status for each integration: Browserless.io, Supabase Storage, MCP adapter
- Smoke tests verify connectivity from Inngest steps (server-side, not client)
- Not user-facing — only admins see the health dashboard

### Orq.ai vision integration
- Orq.ai supports image insertion in user messages natively — the #1 risk from STATE.md is resolved
- Vision analysis for screenshots routes through Orq.ai (Agent or AI Routing), NOT direct Claude API
- Reference implementation exists in per100-app project for the image-in-message pattern

### MCP adapter
- MCP tools serve Orq.ai agents only — no external MCP client access needed
- Single consumer simplifies auth and scope

### Supabase Storage
- Automation-scoped file storage: files stored per automation run (automations/{id}/)
- Clean isolation — easy cleanup when automation is deleted
- No cross-automation file reuse needed

### Claude's Discretion
- Credential list display format (table vs cards)
- 2FA handling approach (TOTP auto-generate vs pause-and-prompt)
- Encryption implementation (Node.js crypto, Supabase Vault, or alternative)
- MCP adapter route structure and transport protocol
- Health page design and layout
- Database schema for credentials, auth profiles, and automation storage
- Credential proxy architecture for Browserless.io injection (per PITFALLS.md recommendations)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Infrastructure research
- `.planning/research/STACK.md` — Technology stack decisions: Browserless.io REST /function API, playwright-core for types, mammoth/pdf-parse for docs, mcp-handler + @modelcontextprotocol/sdk for MCP hosting
- `.planning/research/BROWSERLESS-CAPABILITIES.md` — Browserless.io API patterns: REST /function, BaaS WebSocket, Session Replay, persistent sessions, pricing tiers
- `.planning/research/PITFALLS.md` — Security risks: credential proxy pattern, never pass credentials in Inngest events, encryption requirements
- `.planning/research/ARCHITECTURE.md` — SOP + screenshot workflow architecture, vision analysis flow, Playwright generation pipeline

### Existing codebase patterns
- `web/lib/supabase/client.ts`, `server.ts`, `admin.ts` — Supabase client factories (browser/server/admin)
- `web/lib/supabase/broadcast.ts` — Broadcast pattern for real-time updates
- `web/lib/inngest/functions/pipeline.ts` — Inngest durable function pattern (step-per-stage, admin client, broadcast integration)
- `web/components/create-project-modal.tsx` — Modal CRUD pattern with Zod validation
- `supabase/schema.sql`, `supabase/schema-pipeline.sql` — Existing database schema and RLS policy patterns

### Vision integration reference
- `../developer/per100-app` — Reference implementation for Orq.ai image-in-user-message pattern (user confirmed working)

### Requirements
- `.planning/REQUIREMENTS.md` — CRED-01 through CRED-04: credential storage, runtime injection, rotation reminders, per-system auth profiles

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/components/create-project-modal.tsx`: Modal CRUD pattern with Zod validation — reuse for credential creation modal
- `web/components/invite-member-modal.tsx`: Email input + API call pattern — reuse for auth profile configuration
- `web/components/ui/*`: Full shadcn/ui library (Dialog, Card, Badge, Tabs, Input, Button, etc.)
- `web/lib/supabase/admin.ts`: Admin client for server-side mutations — reuse for encrypted credential storage
- `web/lib/supabase/broadcast.ts`: Broadcast utilities — reuse for real-time health status updates

### Established Patterns
- Server components for data fetching, client components for interactivity
- Supabase RLS for per-user data isolation — extend with credential access policies
- Zod validation for all form inputs
- Inngest step-per-stage execution with admin client for DB mutations
- shadcn/ui for all UI components (radix-nova preset, clean minimal style)

### Integration Points
- `web/app/api/inngest/route.ts`: Inngest serve endpoint — add automation-related functions
- `supabase/schema*.sql`: Database schema files — add credential, auth profile, and automation tables
- `web/app/(dashboard)/layout.tsx`: Dashboard layout with sidebar — add Settings/Health page routes
- Sidebar navigation: add Credentials/Settings entries for credential management

</code_context>

<specifics>
## Specific Ideas

- Credential paste-only + write-once model mirrors cloud provider patterns (AWS Secrets Manager, GCP Secret Manager) — familiar to anyone who's used enterprise secrets management
- Auto-detect failure instead of manual expiry dates keeps the UX simple for non-technical users — they don't need to know when passwords expire
- Global store with project linking lets credentials be reused across multiple projects without duplication
- Per100-app has a working pattern for Orq.ai image messages — don't reinvent, reference that implementation

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 39-infrastructure-credential-foundation*
*Context gathered: 2026-03-23*
