-- R2 migration: newsletter generation config + Issues
--
-- Run this ONCE in the Supabase dashboard: SQL Editor > New Query > paste > Run.
-- Safe against the existing V1 database - only adds columns/tables.
-- See docs/R2_BUILD-SPEC.md M1 and docs/CONTENT-PIPELINE-ARCHITECTURE.md §4.2.

-- 1. Newsletter generation config + the key Content Builder/Conductor use to
--    POST an Issue in. One key per newsletter (architecture doc §12) - a
--    leaked key only compromises the one newsletter it's scoped to.
alter table email_servers
  add column if not exists topics text,
  add column if not exists voice text,
  add column if not exists content_api_key uuid not null default gen_random_uuid();

alter table email_servers
  add constraint email_servers_content_api_key_key unique (content_api_key);

-- 2. Issues: one row per newsletter x date x type (architecture doc §4.2).
create type issue_type as enum ('daily', 'weekly');
create type issue_status as enum ('draft', 'approved', 'sent', 'skipped');

create table issues (
  id uuid primary key default gen_random_uuid(),
  email_server_id uuid not null references email_servers(id) on delete cascade,
  type issue_type not null,
  status issue_status not null default 'draft',
  -- NULL = no auto-send (weekly, or a daily carrying unresolved Reviewer
  -- flags - architecture doc §9's guardrails).
  send_after timestamptz,
  -- Ordered content blocks (architecture doc §6) as JSON; NULL if raw_html
  -- is set instead (the §6.3 escape hatch).
  blocks jsonb,
  raw_html text,
  -- The Reviewer's findings, if any (architecture doc §11.1/§11.5). NULL or
  -- [] = clean. Never blocks generation - just what send_after reacts to.
  reviewer_flags jsonb,
  created_at timestamptz not null default now(),
  created_by text  -- e.g. "conductor", for the record
);
create index idx_issues_email_server_id on issues (email_server_id);
create index idx_issues_status on issues (status);
create index idx_issues_send_after on issues (send_after);

-- 3. send_history: the composed HTML snapshot (architecture doc §4.3) - the
--    exact bytes that went out, which can differ from the Issue if it was
--    edited before approval. Immutable once written.
alter table send_history
  add column if not exists html_snapshot text,
  add column if not exists issue_id uuid references issues(id);

-- 4. Grants (see schema.sql's note on why this is needed - the service_role
--    connection doesn't get default privileges on SQL-Editor-created tables).
grant select, insert, update, delete on public.issues to service_role;
