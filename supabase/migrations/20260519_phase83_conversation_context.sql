-- Phase 83 D-04: per-email prior-message context (last 2 prior messages in
-- the same Graph conversation). Separate from email_pipeline.emails so
-- Phase 87 retro-classification can JOIN cleanly without JSONB-array
-- maintenance overhead.
CREATE TABLE IF NOT EXISTS email_pipeline.conversation_context (
  email_id          UUID NOT NULL REFERENCES email_pipeline.emails(id) ON DELETE CASCADE,
  position          SMALLINT NOT NULL,
  source_message_id TEXT NOT NULL,
  sender_email      TEXT,
  subject           TEXT,
  received_at       TIMESTAMPTZ,
  body_text         TEXT,
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (email_id, position),
  CHECK (position >= 1 AND position <= 5)
);

CREATE INDEX IF NOT EXISTS conversation_context_email_id_idx
  ON email_pipeline.conversation_context (email_id);

COMMENT ON TABLE email_pipeline.conversation_context IS
  'Phase 83 D-04: last N prior messages in the Graph conversation that contained an inbound email. Position 1 = most recent prior. Always populated when conversationId is non-null at ingest.';

-- Phase 83 hot-fix: ingest writers and the backfill script run as service_role
-- (anon is intentionally scoped to the learnings table per CLAUDE.md). Without
-- explicit grants on the email_pipeline schema, server-side writes return
-- `permission denied for table conversation_context` and silently drop priors.
GRANT USAGE ON SCHEMA email_pipeline TO service_role;
GRANT ALL ON email_pipeline.conversation_context TO service_role;
