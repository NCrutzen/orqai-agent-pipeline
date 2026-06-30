-- Phase 135 Plan 03 (MODEL-01, MODEL-02, MODEL-04, MIGRATE-01, MIGRATE-03).
-- Gating-model storage migration + 4-swarm normalization (V9.8 P1a).
--
-- This migration is AUTHORED here; it is APPLIED (operator-gated) in Phase 135-05.
-- It (1) renames public.swarms.dry_run_config -> gating_config, (2) migrates the
-- stage_4_handlers map from boolean (blocked/live) to a tri-state string
-- (off|dry|live), (3) seeds the swarms to their verified-live LEGAL state, and
-- (4) installs the trigger-stage invariant (PL/pgSQL BEFORE trigger + a
-- security_invoker violation view) STRICTLY LAST so the seed lands before
-- enforcement turns on (RESEARCH Pitfall 5).
--
-- Polarity reminder: per-stage flags TRUE = blocked/held, FALSE = live.
-- Forward-bucket sub-map: TRUE = released (inverse polarity — NEVER converted to
-- tri-state). Tri-state handlers: "off" | "dry" | "live".
--
-- Only ALTERs the existing RLS-enabled public.swarms; existing swarms policies
-- cover the renamed column. No new table, no new policy, no anon grant. The
-- violation view is security_invoker = true (RLS of the calling role applies).
--
-- ════════════════════════════════════════════════════════════════════════════
-- TASK 1 — CONFIRMED handler -> trigger-stage map (MODEL-04 / RESEARCH A1)
-- ════════════════════════════════════════════════════════════════════════════
-- The trigger below RAISEs on any handler="live" whose trigger-stage is not live.
-- The handler->trigger-stage map encoded in the trigger fn was CONFIRMED against
-- the real dispatch wiring (not just inferred from RESEARCH A1):
--
--   * stage_1_cleanup  -> trigger-stage = stage_1_cleanup (flag false = live).
--       Dispatched by the Stage-1 iController cleanup path, NOT by Stage-3 routing:
--       web/lib/inngest/functions/stage-1-icontroller-noise-cleanup-dispatcher.ts:48
--         is a `{ cron: "TZ=Europe/Amsterdam */5 6-19 * * 1-5" }` Stage-1 dispatcher
--         that emits "debtor-email/stage-1.icontroller-cleanup.requested" (line 101);
--       web/lib/inngest/functions/stage-1-icontroller-noise-cleanup.ts:51,69
--         is the handler, triggered by that Stage-1 cleanup event. Its trigger-stage
--         is therefore the Stage-1 cleanup flag — CONFIRMED, matches A1.
--
--   * every OTHER Stage-4 handler (e.g. invoice-copy) -> trigger-stage = stage_3_routing
--       (flag false = live). Dispatched by the Stage-3 predicted-emit -> dispatcher:
--       web/lib/inngest/functions/classifier-invoice-copy-handler.ts:49,101
--         is the handler, triggered by "debtor-email/invoice-copy.requested";
--       web/lib/inngest/functions/stage-3-dispatcher.ts:176-211 emits the
--         registry handler_event (from swarm_intents) for registered intents — this
--         is the Stage-3 routing/predicted-emit dispatch path;
--       web/lib/inngest/functions/debtor-email-coordinator.ts:77-88 reads the
--         stage_3_routing gate BEFORE the predicted-emit: when routing is held the
--         predicted-emit is withheld so the dispatcher (hence every routing-driven
--         handler such as invoice-copy) never fires.
--       So: invoice-copy -> stage_3_routing — CONFIRMED, matches A1. No deviation
--       from RESEARCH A1 was found; the dispatch wiring corroborates the map.
--
-- Legal-by-construction (no live handler on a held stage):
--   debtor stage_1_cleanup:"live" requires stage_1_cleanup flag live (false) -- seeded false (live).
--   debtor invoice-copy:"dry" is not live -> unconstrained.
--   sales/info-routing/support-tickets seed no live handler -> invariant vacuous.
--
-- ════════════════════════════════════════════════════════════════════════════
-- TASK 1a — OQ-3 Path A inertness check FAILED -> SALES ARCHIVE SEED ESCALATED
-- ════════════════════════════════════════════════════════════════════════════
-- OQ-3 Path A intended to seed sales stage_1_archive HELD (true) on the premise
-- that "sales has no wired archive side-effect — the live `false` was an inert/
-- drift flag". Task 1a REQUIRES verifying that inertness before encoding the held
-- seed. THE INERTNESS PREMISE IS FALSE — verified read-only on 2026-06-30 against
-- project mvqjhlxfvtqqubqgdvhz (within the RESEARCH valid-until 2026-07-02):
--
--   * swarms.side_effects for sales-email = []  (no descriptor) — this alone
--     looked inert, BUT:
--   * 12 sales swarm_noise_categories carry a live outlook_label AND
--     action='categorize_archive' (auto_reply, ooo_temporary, ooo_permanent,
--     coupa_invoice_paid_notification, coupa_invoice_approved_notification,
--     iss_ptp_autoreply, frieslandcampina_portal_reject, m365_quarantine,
--     sender_phishing_notice, ...).
--   * web/lib/inngest/functions/classifier-verdict-worker.ts:149-166 fires a LIVE
--     Outlook categorize+archive whenever  archiveLive = (!!category.outlook_label
--     && !isStageBlocked(swarmRow,"stage_1_archive")).  With the live value
--     stage_1_archive=false (NOT blocked) and those categories carrying
--     outlook_label, sales ARCHIVES noise emails LIVE today. The worker's own
--     comment (lines 91-95) states this explicitly. STATE.md confirms sales
--     "Stage 0/1/3 ... LIVE per mailbox".
--
-- CONCLUSION: sales stage_1_archive is LIVE and FIRING, not inert. Per the OQ-3
-- Path A escalation rule ("if sales actually fires a live archive this MUST
-- escalate, not silently seed Live"), this migration:
--   (a) DOES NOT seed sales stage_1_archive HELD (that would STOP live archiving =
--       a deliberate behavior change, violating D-09 "no behavior change at
--       cutover"); AND
--   (b) DOES NOT silently seed sales Live as a normalization either — there is NO
--       sales UPDATE in this migration. The sales row flows through the rename +
--       (no-op) tri-state migrate and RETAINS its current verified-live state
--       (stage_1_archive=false LIVE), so D-09 holds and no behavior changes.
--   (c) FLAGS the contradiction for the 135-05 OPERATOR CHECKPOINT: with archive
--       live+firing, sales derives Live (not the D-05-R "Dry"). The operator must
--       decide before any sales archive flip: either accept sales=Live (drop the
--       D-05-R Dry intent) OR deliberately hold sales archive (a behavior change:
--       sales stops archiving noise) in a follow-up operator-gated write.
-- See the SALES block below (statement 3) for the in-line restatement.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- (1) RENAME dry_run_config -> gating_config (MIGRATE-01). Idempotent: only
--     renames when the old column still exists and the new one does not. The
--     existing DEFAULT '{}'::jsonb and NOT NULL are preserved by RENAME.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'swarms'
           AND column_name = 'dry_run_config')
     AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'swarms'
           AND column_name = 'gating_config') THEN
    ALTER TABLE public.swarms RENAME COLUMN dry_run_config TO gating_config;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- (2) MIGRATE stage_4_handlers bool -> tri-state for every row (MODEL-02).
--     Old polarity: boolean false (live) -> "live"; boolean true (blocked) ->
--     "dry" (NOT "off" — "off" is reserved for explicitly-disabled, Pitfall 3 /
--     OQ-4). Idempotent: values already strings are kept as-is. The
--     stage_4_forward_buckets sub-map is INTENTIONALLY untouched (boolean release
--     map, inverse polarity — NEVER converted, Pitfall 3).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r            record;
  new_handlers jsonb;
  hk           text;
  hv           jsonb;
BEGIN
  FOR r IN
    SELECT swarm_type, gating_config
      FROM public.swarms
     WHERE jsonb_typeof(gating_config -> 'stage_4_handlers') = 'object'
  LOOP
    new_handlers := '{}'::jsonb;
    FOR hk, hv IN
      SELECT key, value FROM jsonb_each(r.gating_config -> 'stage_4_handlers')
    LOOP
      IF jsonb_typeof(hv) = 'boolean' THEN
        new_handlers := new_handlers || jsonb_build_object(
          hk, CASE WHEN hv = 'false'::jsonb THEN 'live' ELSE 'dry' END);
      ELSE
        new_handlers := new_handlers || jsonb_build_object(hk, hv); -- already string
      END IF;
    END LOOP;
    UPDATE public.swarms
       SET gating_config = jsonb_set(gating_config, '{stage_4_handlers}', new_handlers)
     WHERE swarm_type = r.swarm_type;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- (3) SEED the swarms to their verified-live LEGAL state (MIGRATE-03 / D-05..D-09).
--     Verified-live re-queried 2026-06-30 (within valid-until 2026-07-02). Each
--     seeded state is legal-by-construction (no live handler on a held stage).
--     Runs BEFORE the trigger is created so a transient illegal intermediate
--     state can never abort the migration (Pitfall 5).
-- ─────────────────────────────────────────────────────────────────────────────

-- debtor-email -> partly Live (D-06). Outlook-archive LIVE; iController noise
-- cleanup is now an EXPLICIT per-handler tri-state "live" (the 867-delete path),
-- requiring stage_1_cleanup flag live (false). invoice-copy migrated true->"dry".
-- iController intent-labeling held; intent_label LIVE (AI: labels live — NOT the
-- stale 20260603b gated value, Pitfall 1). No stage_2_resolution key (legacy
-- resolver path) — preserved by an explicit full object that omits it.
UPDATE public.swarms
   SET gating_config = jsonb_build_object(
         'stage_1_archive',     false,  -- LIVE (Outlook archive)
         'stage_1_cleanup',     false,  -- LIVE (trigger-stage for the cleanup handler)
         'stage_3_labeling',    true,   -- held
         'stage_3_routing',     false,  -- LIVE
         'stage_3_intent_label', false, -- LIVE (AI: labels — Pitfall 1: NOT the stale true)
         'stage_4_handlers', jsonb_build_object(
            'invoice-copy',   'dry',    -- was boolean true (blocked) -> "dry"
            'stage_1_cleanup', 'live'   -- D-06 explicit live cleanup handler (legal: stage_1_cleanup flag=false)
         )
       ),
       updated_at = now()
 WHERE swarm_type = 'debtor-email';

-- info-routing -> Live (D-07). Outlook-archive LIVE. stage_3_routing stays HELD
-- (true) — info-routing has stage2_entity_resolver=NULL + zero swarm_intents, so
-- opening routing crashes the dispatcher on empty ranked[] (Pitfall 2 — keep
-- held). Liveness comes from archive-live + the released forward buckets, not
-- routing. forward buckets kept as the boolean release map (NOT tri-state).
-- No Stage-4 handler map (router shape) -> invariant vacuous.
UPDATE public.swarms
   SET gating_config = jsonb_build_object(
         'stage_1_archive', false,  -- LIVE
         'stage_3_routing', true,   -- HELD (Pitfall 2 — do NOT flip)
         'stage_4_forward_buckets', jsonb_build_object(
            'verkoop',    true,      -- released (V9.7 0.7 gate)
            'opleidingen', true      -- released
         )
       ),
       updated_at = now()
 WHERE swarm_type = 'info-routing';

-- support-tickets -> Shadow (D-08). Everything off/gated -> fail-closed Shadow.
UPDATE public.swarms
   SET gating_config = '{}'::jsonb,
       updated_at = now()
 WHERE swarm_type = 'support-tickets';

-- sales-email -> SEED INTENTIONALLY OMITTED (OQ-3 Path A ESCALATION — see header
-- Task 1a). stage_1_archive is LIVE and FIRING (verified 2026-06-30: 12 categories
-- carry outlook_label + categorize_archive; classifier-verdict-worker.ts:149-166
-- archiveLive fires live Outlook archive). Seeding stage_1_archive HELD would STOP
-- live noise-archiving = a deliberate behavior change (violates D-09); seeding it
-- Live silently is also disallowed. The sales row retains its verified-live state
-- through the rename + (no-op) tri-state migrate (stage_4_handlers={}), so D-09
-- holds and nothing changes for sales at cutover. With archive live, sales derives
-- Live (not the D-05-R "Dry") — flagged for the 135-05 operator checkpoint, which
-- must reconcile (accept sales=Live, or deliberately hold archive in a follow-up
-- operator-gated write). DO NOT add a sales UPDATE here without operator sign-off.

-- ─────────────────────────────────────────────────────────────────────────────
-- (4) INVARIANT — trigger fn + trigger + violation view, LAST (Pitfall 5 / D-04).
--     The trigger makes an illegal state (handler="live" on a non-live
--     trigger-stage) physically unrepresentable: a raw SQL write RAISEs. The fn
--     is NOT declared with definer privileges (it fires under the writer's
--     rights), so there is no privilege-elevation concern; a fixed search_path is
--     pinned regardless for advisor hygiene (function_search_path_mutable).
--     Trigger fns need no EXECUTE grants (CLAUDE.md).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_handler_trigger_stage_invariant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
  h        record;
  cfg      jsonb := COALESCE(NEW.gating_config, '{}'::jsonb);
  handlers jsonb := COALESCE(cfg -> 'stage_4_handlers', '{}'::jsonb);
  -- routing live when stage_3_routing flag is FALSE (TRUE = held). Default held.
  routing_live boolean := COALESCE((cfg ->> 'stage_3_routing'), 'true')::boolean = false;
BEGIN
  IF jsonb_typeof(handlers) <> 'object' THEN
    RETURN NEW;
  END IF;
  FOR h IN SELECT key, value FROM jsonb_each_text(handlers) LOOP
    IF h.value = 'live' THEN
      -- handler -> trigger-stage map (Task 1, confirmed): stage_1_cleanup checks
      -- its own stage flag; every other handler checks stage_3_routing.
      IF h.key = 'stage_1_cleanup' THEN
        IF COALESCE((cfg ->> 'stage_1_cleanup'), 'true')::boolean = true THEN
          RAISE EXCEPTION
            'gating invariant: handler % is live but its trigger-stage stage_1_cleanup is not live (swarm=%)',
            h.key, NEW.swarm_type;
        END IF;
      ELSIF NOT routing_live THEN
        RAISE EXCEPTION
          'gating invariant: handler % is live but trigger-stage stage_3_routing is not live (swarm=%)',
          h.key, NEW.swarm_type;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_handler_trigger_stage_invariant ON public.swarms;
CREATE TRIGGER trg_enforce_handler_trigger_stage_invariant
  BEFORE INSERT OR UPDATE OF gating_config ON public.swarms
  FOR EACH ROW EXECUTE FUNCTION public.enforce_handler_trigger_stage_invariant();

-- Defense-in-depth / drift detector. Always empty post-migration (the trigger
-- prevents new illegal writes); surfaces any swarm holding an illegal combo if a
-- future migration bypasses the trigger. NEVER definer-rights — the view runs
-- with the calling role's RLS (security_invoker = true, CLAUDE.md).
CREATE OR REPLACE VIEW public.gating_invariant_violations
  WITH (security_invoker = true) AS
SELECT s.swarm_type,
       h.key   AS handler_key,
       h.value AS handler_state,
       s.gating_config ->> 'stage_3_routing' AS stage_3_routing,
       s.gating_config ->> 'stage_1_cleanup' AS stage_1_cleanup
  FROM public.swarms s,
       LATERAL jsonb_each_text(
         COALESCE(s.gating_config -> 'stage_4_handlers', '{}'::jsonb)
       ) AS h(key, value)
 WHERE h.value = 'live'
   AND (
        (h.key =  'stage_1_cleanup'
           AND COALESCE((s.gating_config ->> 'stage_1_cleanup'), 'true')::boolean = true)
     OR (h.key <> 'stage_1_cleanup'
           AND COALESCE((s.gating_config ->> 'stage_3_routing'), 'true')::boolean = true)
   );

COMMIT;
