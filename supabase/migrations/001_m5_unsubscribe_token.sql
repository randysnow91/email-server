-- M5 migration: per-subscriber unsubscribe token
--
-- Run this ONCE in the Supabase dashboard: SQL Editor > New Query > paste > Run.
-- Safe to run against the existing M0-M4 database - it only adds a column.
--
-- The token is what lets an unsubscribe link in an email identify a
-- subscriber without any login. It is separate from the row's `id` so it
-- can be rotated later without touching foreign keys, and so the primary
-- key never travels in a public URL.

-- 1. Add the column. Postgres evaluates gen_random_uuid() once per existing
--    row here, so every current subscriber gets its own distinct token.
alter table subscribers
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();

-- 2. No two subscribers can share a token (also makes token lookups fast).
alter table subscribers
  add constraint subscribers_unsubscribe_token_key unique (unsubscribe_token);
