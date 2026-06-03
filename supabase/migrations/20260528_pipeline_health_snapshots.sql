BEGIN;

-- Stores one row per swarm × mode per health check tick.
-- The routine reads the previous row to compute queue_depth delta
-- and decide on alert status before INSERTing the new row.

CREATE TABLE IF NOT EXISTS public.pipeline_health_snapshots (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at            timestamptz NOT NULL DEFAULT now(),
  swarm_type            text        NOT NULL,
  mode                  text        NOT NULL CHECK (mode IN ('live', 'dry_run')),
  queue_depth           integer     NOT NULL DEFAULT 0,
  failures_6h           integer     NOT NULL DEFAULT 0,
  throughput_6h         integer     NOT NULL DEFAULT 0,
  heartbeat_age_minutes integer,
  status                text        NOT NULL CHECK (status IN ('ok', 'warning', 'error')),
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pipeline_health_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pipeline_health_snapshots_service_all ON public.pipeline_health_snapshots;
CREATE POLICY pipeline_health_snapshots_service_all
  ON public.pipeline_health_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- The routine summary UI may read this table directly.
DROP POLICY IF EXISTS pipeline_health_snapshots_auth_select ON public.pipeline_health_snapshots;
CREATE POLICY pipeline_health_snapshots_auth_select
  ON public.pipeline_health_snapshots
  FOR SELECT
  TO authenticated
  USING (true);

-- Keep only 90 days of history; older rows are noise.
CREATE INDEX IF NOT EXISTS pipeline_health_snapshots_checked_at_idx
  ON public.pipeline_health_snapshots (checked_at DESC);

CREATE INDEX IF NOT EXISTS pipeline_health_snapshots_swarm_mode_idx
  ON public.pipeline_health_snapshots (swarm_type, mode, checked_at DESC);

COMMIT;
