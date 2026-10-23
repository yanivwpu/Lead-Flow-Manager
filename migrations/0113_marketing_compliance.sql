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
-- Preserve historically recorded *email* unsubscribe flags without upgrading
-- them to a blanket cross-channel DNC. Only explicit DNC flags or DNC stages/tags
-- may block all promotional channels. Marketing sends are blocked by either scope.
-- Because the target ledger is identity scoped, reimports cannot bypass an opt-out.
INSERT INTO marketing_suppressions (workspace_user_id,email_normalized,scope,reason,source)
SELECT user_id, lower(trim(email)),
  CASE WHEN (
    custom_fields @> '{"doNotContact":true}' OR custom_fields @> '{"dnc":true}' OR
    custom_fields @> '{"stop":true}' OR
    concat_ws(' ',tag,pipeline_stage) ~* '\m(do not contact|dnc|stop|remove me)\M'
  ) THEN 'all' ELSE 'email' END,
  'historical_opt_out', 'migration_0113'
FROM contacts WHERE email IS NOT NULL AND trim(email) <> '' AND (
 custom_fields @> '{"unsubscribed":true}' OR custom_fields @> '{"optOut":true}' OR
 custom_fields @> '{"doNotContact":true}' OR custom_fields @> '{"dnc":true}' OR
 custom_fields @> '{"campaignOptOut":true}' OR custom_fields @> '{"marketingOptIn":false}' OR
 custom_fields @> '{"optedOut":true}' OR custom_fields @> '{"unsubscribe":true}' OR custom_fields @> '{"stop":true}' OR
 concat_ws(' ',tag,pipeline_stage) ~* '\m(do not contact|dnc|stop|unsubscribe|unsubscribed|opt out|remove me)\M'
) ON CONFLICT (workspace_user_id,email_normalized) DO UPDATE SET
  scope = CASE WHEN marketing_suppressions.scope='all' OR EXCLUDED.scope='all' THEN 'all' ELSE 'email' END;
-- A phone suppression requires explicit phone/global DNC evidence. An email-only
-- unsubscribe must not silently block a phone/WhatsApp conversation.
INSERT INTO marketing_suppressions (workspace_user_id,email_normalized,scope,reason,source)
SELECT user_id, 'phone:+' || regexp_replace(phone,'[^0-9]','','g'), 'all', 'historical_opt_out', 'migration_0113'
FROM contacts WHERE regexp_replace(phone,'[^0-9]','','g') ~ '^[1-9][0-9]{7,14}$' AND (
 custom_fields @> '{"doNotContact":true}' OR custom_fields @> '{"dnc":true}' OR
 custom_fields @> '{"stop":true}' OR
 concat_ws(' ',tag,pipeline_stage) ~* '\m(do not contact|dnc|stop|remove me)\M'
) ON CONFLICT DO NOTHING;
-- Permanent delivery failures are email-specific, including transactional email.
-- Preserve a global scope if the same historical contact also opted out globally.
INSERT INTO marketing_suppressions (workspace_user_id,email_normalized,scope,reason,source)
SELECT user_id, lower(trim(email)), 'email', 'bounce', 'migration_0113'
FROM contacts WHERE email IS NOT NULL AND trim(email) <> '' AND (
 custom_fields @> '{"emailBounced":true}' OR custom_fields @> '{"bounced":true}' OR
 custom_fields->>'suppressionReason' IN ('bounce','invalid_recipient')
) ON CONFLICT (workspace_user_id,email_normalized) DO UPDATE SET reason='bounce';
