-- Bump stage-0-safety-classifier timeout from 90s to 120s.
--
-- Production logs (2026-05-07 09:07, 09:14) showed AbortError /
-- DOMException on the llm-verdict step in stage-0-safety-worker.
-- Root cause: Orq.ai fallback chain (primary haiku-4-5 -> gpt-4o-mini
-- -> gemini-2.5-flash) occasionally exceeds 90s end-to-end when the
-- primary stalls and Orq retries on a fallback. Vercel maxDuration on
-- /api/inngest is 300s so there is plenty of headroom; 120s buys
-- comfortable margin without piling pressure on upstream timeouts.
--
-- Idempotent: bare UPDATE, safe to re-run.

UPDATE public.orq_agents
SET timeout_ms = 120000
WHERE agent_key = 'stage-0-safety-classifier';
