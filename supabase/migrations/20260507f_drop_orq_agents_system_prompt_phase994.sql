-- Phase 999.4 cleanup — drop orq_agents.system_prompt.
--
-- Added in 20260507e for the Router-direct path (invokeOrqModel). Plan 03
-- (Router transport swap) was reverted 2026-05-07 after empirical evidence
-- showed the Agents-product queue-stuck issue isn't chronic. Stage 0/1
-- stays on the Agents path, which doesn't need this mirror column —
-- prompts live in Studio and are injected server-side.
--
-- Already applied to prod via Supabase MCP on 2026-05-07. This file
-- mirrors that change for `supabase migration` parity.

alter table public.orq_agents drop column if exists system_prompt;
