---
created: 2026-06-05
phase: 116
severity: go-live-blocker
---

# Apply migration 20260605c AFTER Phase 116 code deploys to Vercel

**What:** `supabase/migrations/20260605c_sales_unknown_dispatch_to_extractor.sql` repoints the live sales `unknown` `swarm_dispatch` (in `public.swarm_noise_categories`) to `sales-email/attachments.extract.requested`.

**Why deferred:** The Stage-1.5 extractor worker (`stage-1_5-attachment-extractor.ts`, registered in the Inngest serve array in commit `02b5e31d`) only exists on branch `workspace/sales-agent-swarm`. Applying the migration before the code deploy makes the verdict worker emit an event nothing serves → sales `unknown` rows stall before Stage 2 (same failure class as the 2026-06-04 sales-archive incident: go-live pas na code-deploy). User chose defer on 2026-06-05.

**Apply steps (post-deploy):**
1. Confirm the branch is merged + deployed on Vercel and Inngest shows `stage-1_5-attachment-extractor` registered.
2. Apply `20260605c` to remote `mvqjhlxfvtqqubqgdvhz` (Management API or Supabase MCP; both migrations 20260605/20260605b are already applied).
3. Verify: `SELECT swarm_dispatch FROM public.swarm_noise_categories WHERE swarm_type='sales-email' AND category_key='unknown'` → `sales-email/attachments.extract.requested`.
4. Watch one live sales `unknown` mail route Stage 1 → extractor → Stage 2.
