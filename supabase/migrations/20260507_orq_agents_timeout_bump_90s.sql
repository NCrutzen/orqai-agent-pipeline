-- Bump per-agent client-abort timeout from 45s → 90s across all Orq.ai agents.
--
-- Motivation (2026-05-06): Stage 0 calls were aborting client-side at 45s while
-- Orq.ai itself succeeded at 57-86s during a Bedrock EU Haiku 4.5 latency spike
-- (trace 01KQYTZEVP4V7CXJRQGACC43FS). Orq.ai's internal retry/fallback budget
-- is 31s — primary failure triggers fallback chain — but slow-but-successful
-- primary calls don't trigger fallback, so client just sat waiting and aborted
-- a successful in-flight call.
--
-- 90s gives headroom for: 31s primary + 31s fallback-1 + ~28s fallback-2 budget.
-- All agents run inside Inngest functions on Vercel Pro (300s budget) so the
-- bump stays well under the Inngest step.run cap.
update public.orq_agents
   set timeout_ms = 90000,
       updated_at = now()
 where timeout_ms < 90000;
