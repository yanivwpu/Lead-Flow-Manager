-- Review/apply only to an isolated staging database first. No automatic release.
CREATE TABLE marketing_sender_profiles (
  workspace_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mailbox_id varchar NOT NULL REFERENCES email_mailboxes(id) ON DELETE CASCADE,
  brand text NOT NULL,
  postal_address text NOT NULL CHECK (length(trim(postal_address)) BETWEEN 10 AND 1000),
  verified_at timestamp NOT NULL,
  verified_by varchar NOT NULL REFERENCES users(id),
  PRIMARY KEY (workspace_user_id, mailbox_id)
);
-- Intentionally no contact FK: deletion and reimport must not erase opt-outs.
CREATE TABLE marketing_suppressions (
  workspace_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_normalized text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('email', 'all')),
  reason text NOT NULL,
  source text NOT NULL,
  suppressed_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_user_id, email_normalized)
);
-- Historical flags cannot be silently cleared by duplicate imports.
INSERT INTO marketing_suppressions (workspace_user_id,email_normalized,scope,reason,source)
SELECT user_id, lower(trim(email)), 'all', 'historical_opt_out', 'migration_0113'
FROM contacts WHERE email IS NOT NULL AND trim(email) <> '' AND (
 custom_fields @> '{"unsubscribed":true}' OR custom_fields @> '{"optOut":true}' OR
 custom_fields @> '{"doNotContact":true}' OR custom_fields @> '{"dnc":true}' OR
 custom_fields @> '{"campaignOptOut":true}' OR custom_fields @> '{"marketingOptIn":false}' OR
 custom_fields @> '{"optedOut":true}' OR custom_fields @> '{"unsubscribe":true}' OR custom_fields @> '{"stop":true}' OR
 concat_ws(' ',tag,pipeline_stage) ~* '\m(do not contact|dnc|stop|unsubscribe|unsubscribed|opt out|remove me)\M'
) ON CONFLICT DO NOTHING;
-- Phone identity keys are namespaced; do not infer country codes.
INSERT INTO marketing_suppressions (workspace_user_id,email_normalized,scope,reason,source)
SELECT user_id, 'phone:+' || regexp_replace(phone,'[^0-9]','','g'), 'all', 'historical_opt_out', 'migration_0113'
FROM contacts WHERE regexp_replace(phone,'[ ().-]','','g') ~ '^\+?[1-9][0-9]{7,14}$' AND (
 custom_fields @> '{"unsubscribed":true}' OR custom_fields @> '{"optOut":true}' OR
 custom_fields @> '{"doNotContact":true}' OR custom_fields @> '{"dnc":true}' OR
 custom_fields @> '{"campaignOptOut":true}' OR custom_fields @> '{"marketingOptIn":false}' OR
 custom_fields @> '{"optedOut":true}' OR custom_fields @> '{"unsubscribe":true}' OR custom_fields @> '{"stop":true}' OR
 concat_ws(' ',tag,pipeline_stage) ~* '\m(do not contact|dnc|stop|unsubscribe|unsubscribed|opt out|remove me)\M'
) ON CONFLICT DO NOTHING;
