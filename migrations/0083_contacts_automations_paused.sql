-- Durable per-contact Pause Automations (operational; not DNC / Unqualified / composer Manual / Copilot snooze).
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS automations_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS automations_paused_at timestamp,
  ADD COLUMN IF NOT EXISTS automations_paused_by_user_id varchar;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contacts_automations_paused_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE contacts
      ADD CONSTRAINT contacts_automations_paused_by_user_id_users_id_fk
      FOREIGN KEY (automations_paused_by_user_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN contacts.automations_paused IS
  'When true, automated sends (workflows, timers, campaigns, chatbot, AI auto, prospect outreach) are blocked. Manual Inbox sends remain allowed.';
COMMENT ON COLUMN contacts.automations_paused_at IS
  'When automations were last paused; null while active.';
COMMENT ON COLUMN contacts.automations_paused_by_user_id IS
  'Workspace user who last paused automations; null while active.';
