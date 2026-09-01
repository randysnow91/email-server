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
  unsubscribed boolean not null default false,
  -- Identifies a subscriber from a public unsubscribe link with no login.
  -- Separate from `id` so it can be rotated and so the PK never travels in
  -- a URL. Added in M5 - see supabase/migrations/001_m5_unsubscribe_token.sql.
  unsubscribe_token uuid not null default gen_random_uuid()
);
create index idx_subscribers_email_server_id on subscribers (email_server_id);
create index idx_subscribers_email on subscribers (email);
create index idx_subscribers_unsubscribed on subscribers (unsubscribed);
-- Prevents the same email being added twice to the same newsletter, and is
-- what turns a duplicate signup into a clean 409 error instead of a silent
-- second row.
alter table subscribers add constraint subscribers_email_server_id_email_key unique (email_server_id, email);
alter table subscribers add constraint subscribers_unsubscribe_token_key unique (unsubscribe_token);

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
-- One row per section type per newsletter - lets "Save" be a clean
-- create-or-update (upsert) instead of risking duplicate rows.
alter table email_sections add constraint email_sections_email_server_id_section_type_key unique (email_server_id, section_type);

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

-- Grants: tables created via the SQL Editor don't automatically pick up the
-- default privileges Supabase's Table Editor UI would set. The app connects
-- as service_role (see src/lib/supabase.ts), so it needs explicit access.
-- No RLS is enabled on these tables (V1 has no per-user data - see §4.1/§5.1
-- in docs/V1_BUILD-SPEC.MD), so a grant is the only gate here.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.email_servers to service_role;
grant select, insert, update, delete on public.subscribers to service_role;
grant select, insert, update, delete on public.email_sections to service_role;
grant select, insert, update, delete on public.send_history to service_role;
