-- Email Server — V1 database schema
-- Run this once in the Supabase dashboard: SQL Editor > New Query > paste > Run.
-- Matches docs/V1_BUILD-SPEC.MD §5.1 (v1.1). No auth/RLS in V1 — see §4.1.

-- Enum types (Postgres requires these declared before use, unlike MySQL's inline ENUM)
create type subscription_preference as enum ('daily', 'weekly', 'both');
create type section_type as enum ('subject', 'header', 'title', 'about', 'main_body', 'ad', 'editor', 'footer');
create type content_source as enum ('manual', 'linked', 'generated');
create type send_status as enum ('pending', 'in_progress', 'completed', 'failed');

-- Email_Servers: account metadata (one per newsletter, e.g. "AI PM Perspective", "Dog Rescue")
create table email_servers (
  id uuid primary key default gen_random_uuid(),
  name varchar(255) not null,
  description text,
  created_at timestamptz not null default now(),
  active boolean not null default true
  -- R4 adds: user_id uuid references auth.users(id), once real auth exists
);

-- Subscribers: list of subscribers per account
create table subscribers (
  id uuid primary key default gen_random_uuid(),
  email_server_id uuid not null references email_servers(id) on delete cascade,
  email varchar(255) not null,
  name varchar(255),
  subscription_preference subscription_preference not null default 'daily',
  -- preference is fixed at 'daily' for all V1 subscribers; selection UI is R3
  created_at timestamptz not null default now(),
  unsubscribed boolean not null default false
);
create index idx_subscribers_email_server_id on subscribers (email_server_id);
create index idx_subscribers_email on subscribers (email);
create index idx_subscribers_unsubscribed on subscribers (unsubscribed);

-- Email_Sections: template sections
create table email_sections (
  id uuid primary key default gen_random_uuid(),
  email_server_id uuid not null references email_servers(id) on delete cascade,
  section_type section_type not null,
  content text,
  content_source content_source not null default 'manual',
  -- unused in R1 (all content is manual); reserved for R2 Content Builder
  source_url text,
  generated_by varchar(255),
  -- both nullable, unused in R1; reserved for R2 provenance
  updated_at timestamptz not null default now()
);
create index idx_email_sections_email_server_id on email_sections (email_server_id);
create index idx_email_sections_section_type on email_sections (section_type);

-- Send_History: log of every send
create table send_history (
  id uuid primary key default gen_random_uuid(),
  email_server_id uuid not null references email_servers(id) on delete cascade,
  sent_date timestamptz not null default now(),
  is_test boolean not null default false,
  recipient_count int,
  success_count int not null default 0,
  failed_count int not null default 0,
  status send_status not null default 'pending',
  error_message text
);
create index idx_send_history_email_server_id on send_history (email_server_id);
create index idx_send_history_sent_date on send_history (sent_date);
