-- Safe additive migration (no DROP, no type changes, no data loss).
-- Fixes production drift: Postgres error "column re_engagement does not exist" for Inbox and
-- Templates re-engagement flows (see shared/reEngagement.ts, server/channelService.ts).
--
-- Column type is jsonb (default '{}'), not boolean: the application stores structured CRM
-- follow-up metadata (template send state, timestamps). Use drizzle-kit push only in dev if
-- desired; production should apply this SQL file (or equivalent) only.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS re_engagement jsonb NOT NULL DEFAULT '{}'::jsonb;
