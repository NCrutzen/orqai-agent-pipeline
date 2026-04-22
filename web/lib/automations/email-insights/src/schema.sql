-- email_insights schema: reusable across mailboxes (debtor, sales, support, ...)
-- Extracts atomic questions/complaints per email, clusters them, surfaces top-N.

create schema if not exists email_insights;

create extension if not exists vector;

-- One row per atomic intent extracted from a mail.
-- A mail can have 0-N questions and 0-N complaints.
create table if not exists email_insights.extracted_intents (
  id            uuid primary key default gen_random_uuid(),
  email_id      uuid not null references email_pipeline.emails(id) on delete cascade,
  domain        text not null,                       -- 'debtor', 'sales', ...
  type          text not null check (type in ('question','complaint')),
  normalized    text not null,                       -- canonical phrasing, language per config
  embedding     vector(1536),                        -- OpenAI text-embedding-3-small dims, filled by step 2
  cluster_id    uuid,                                -- filled by step 3
  extracted_at  timestamptz not null default now()
);

create index if not exists extracted_intents_domain_type_idx
  on email_insights.extracted_intents (domain, type);
create index if not exists extracted_intents_email_idx
  on email_insights.extracted_intents (email_id);
create index if not exists extracted_intents_cluster_idx
  on email_insights.extracted_intents (cluster_id);
-- HNSW for semantic search / clustering inspection
create index if not exists extracted_intents_embedding_idx
  on email_insights.extracted_intents using hnsw (embedding vector_cosine_ops);

-- One row per cluster (= generalized question or complaint).
create table if not exists email_insights.intent_clusters (
  id              uuid primary key default gen_random_uuid(),
  domain          text not null,
  type            text not null check (type in ('question','complaint')),
  canonical       text not null,                     -- human-readable generalized phrasing
  member_count    int  not null default 0,
  sample_quote_ids uuid[] not null default '{}',     -- up to 3 extracted_intents.id samples
  created_at      timestamptz not null default now()
);

create index if not exists intent_clusters_domain_type_idx
  on email_insights.intent_clusters (domain, type);
create index if not exists intent_clusters_count_idx
  on email_insights.intent_clusters (member_count desc);

-- Tracks which mails have been processed per domain (idempotent resumes).
create table if not exists email_insights.processed_emails (
  email_id     uuid not null references email_pipeline.emails(id) on delete cascade,
  domain       text not null,
  processed_at timestamptz not null default now(),
  primary key (email_id, domain)
);
