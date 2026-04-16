import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

const schema = `
  -- Emails table: stores all fetched emails from shared mailboxes
  create table if not exists emails (
    id uuid primary key default gen_random_uuid(),
    source_id text unique not null,
    mailbox text not null,
    direction text not null check (direction in ('incoming', 'sent')),
    subject text,
    body_text text,
    body_html text,
    sender_email text,
    sender_name text,
    recipients jsonb,
    received_at timestamptz,
    has_attachments boolean default false,
    is_read boolean default false,
    importance text,
    conversation_id text,
    internet_message_id text,
    categories jsonb default '[]'::jsonb,
    raw_json jsonb,
    created_at timestamptz default now()
  );

  -- Indexes for common query patterns
  create index if not exists idx_emails_mailbox on emails(mailbox);
  create index if not exists idx_emails_direction on emails(direction);
  create index if not exists idx_emails_conversation on emails(conversation_id);
  create index if not exists idx_emails_received on emails(received_at);
  create index if not exists idx_emails_sender on emails(sender_email);
`;

async function setupDatabase() {
  console.log("Setting up database schema...");

  const { error } = await supabase.rpc("exec_sql", { sql: schema });

  if (error) {
    // If RPC not available, print SQL for manual execution
    console.log("Could not execute via RPC. Run this SQL in Supabase SQL Editor:\n");
    console.log(schema);
    return;
  }

  console.log("Database schema created successfully.");
}

setupDatabase();
