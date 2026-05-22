-- =============================================================================
-- Realtor Growth Engine — SINGLE-USER reset (Neon SQL Editor)
-- Target: yahabegood@gmail.com
--
-- Removes RGE purchase/install/onboarding state so you can test purchase + install again.
-- Does NOT touch: contacts, conversations, messages, chats, subscriptions, Stripe customer,
-- general message_templates, or non-RGE workflows.
--
-- HOW TO RUN SAFELY:
--   1) Run only the PREVIEW section first (through the first ROLLBACK).
--   2) Confirm user_match_count = 1 and previews look correct.
--   3) Uncomment COMMIT and comment ROLLBACK in the MUTATION section.
-- =============================================================================

-- ─── PREVIEW (read-only) ─────────────────────────────────────────────────────

BEGIN;

CREATE TEMP TABLE _rge_reset_user ON COMMIT DROP AS
SELECT id AS user_id, email, name
FROM users
WHERE lower(trim(email)) = lower(trim('yahabegood@gmail.com'));

SELECT count(*) AS user_match_count, (SELECT user_id FROM _rge_reset_user LIMIT 1) AS user_id
FROM _rge_reset_user;
-- STOP if user_match_count <> 1

SELECT * FROM _rge_reset_user;

-- Entitlement / install / onboarding
SELECT id, template_id, status, purchased_at, onboarding_submitted_at, created_at
FROM template_entitlements te
JOIN _rge_reset_user t ON te.user_id = t.user_id
WHERE te.template_id = 'realtor-growth-engine';

SELECT id, template_id, install_status, installed_at, left(install_log, 200) AS install_log_preview, created_at
FROM template_installs ti
JOIN _rge_reset_user u ON ti.user_id = u.user_id
WHERE ti.template_id = 'realtor-growth-engine';

SELECT id, template_id, status, submitted_at
FROM realtor_onboarding_submissions ros
JOIN _rge_reset_user u ON ros.user_id = u.user_id
WHERE ros.template_id = 'realtor-growth-engine';

-- Concierge / ops setup task (Sales Portal pipeline)
SELECT id, template_id, status, salesperson_id, submission_id, onboarding_submitted_at, session_booked_at, completed_at, created_at
FROM growth_engine_setup_tasks gest
JOIN _rge_reset_user u ON gest.user_id = u.user_id
WHERE gest.template_id = 'realtor-growth-engine';

-- Per-user template assets (pipeline, tags defs, message template copies, prefs, routing, ai_rules)
SELECT asset_type, asset_key, created_at
FROM user_template_data utd
JOIN _rge_reset_user u ON utd.user_id = u.user_id
WHERE utd.template_id = 'realtor-growth-engine'
ORDER BY asset_type, asset_key;

-- RGE workflows only (W1, W3–W8 in DB; W2 runs in message engine, not a row)
SELECT w.id, w.name, w.is_active, w.trigger_type, w.trigger_conditions->>'templateKey' AS template_key,
       jsonb_array_length(w.actions) AS action_count, w.created_at
FROM workflows w
JOIN _rge_reset_user u ON w.user_id = u.user_id
WHERE w.description LIKE 'Realtor Growth Engine:%'
   OR w.trigger_conditions->>'templateId' = 'realtor-growth-engine'
ORDER BY w.name;

-- Pending automation jobs tied to RGE
SELECT nr.id, nr.workflow_id, nr.status, nr.run_at, w.name AS workflow_name
FROM no_reply_jobs nr
JOIN workflows w ON w.id = nr.workflow_id
JOIN _rge_reset_user u ON nr.user_id = u.user_id
WHERE w.description LIKE 'Realtor Growth Engine:%'
   OR w.trigger_conditions->>'templateId' = 'realtor-growth-engine';

SELECT atj.id, atj.kind, atj.status, atj.run_at, atj.dedup_key
FROM automation_timer_jobs atj
JOIN _rge_reset_user u ON atj.user_id = u.user_id
WHERE atj.kind IN ('w2_qualification', 'w2_routing');

-- Workflows that will be kept (sanity check)
SELECT count(*) AS other_workflows_kept
FROM workflows w
JOIN _rge_reset_user u ON w.user_id = u.user_id
WHERE NOT (
  w.description LIKE 'Realtor Growth Engine:%'
  OR w.trigger_conditions->>'templateId' = 'realtor-growth-engine'
);

ROLLBACK;  -- end preview


-- ─── MUTATION (destructive) ─────────────────────────────────────────────────
-- Uncomment COMMIT at the bottom when previews look correct.

BEGIN;

CREATE TEMP TABLE _rge_reset_user ON COMMIT DROP AS
SELECT id AS user_id, email, name
FROM users
WHERE lower(trim(email)) = lower(trim('yahabegood@gmail.com'));

DO $$
DECLARE
  n integer;
  uid varchar;
BEGIN
  SELECT count(*), max(user_id) INTO n, uid FROM _rge_reset_user;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 user for yahabegood@gmail.com, found %', n;
  END IF;
  RAISE NOTICE 'RGE reset target user_id=%', uid;
END $$;

-- 1) Pending no-reply jobs for RGE workflows (explicit; workflows CASCADE also applies)
DELETE FROM no_reply_jobs nr
USING workflows w, _rge_reset_user u
WHERE nr.workflow_id = w.id
  AND nr.user_id = u.user_id
  AND (
    w.description LIKE 'Realtor Growth Engine:%'
    OR w.trigger_conditions->>'templateId' = 'realtor-growth-engine'
  );

-- 2) W2 qualification / routing timers for this user
DELETE FROM automation_timer_jobs atj
USING _rge_reset_user u
WHERE atj.user_id = u.user_id
  AND atj.kind IN ('w2_qualification', 'w2_routing');

-- 3) RGE workflows (+ workflow_executions CASCADE)
DELETE FROM workflows w
USING _rge_reset_user u
WHERE w.user_id = u.user_id
  AND (
    w.description LIKE 'Realtor Growth Engine:%'
    OR w.trigger_conditions->>'templateId' = 'realtor-growth-engine'
  );

-- 4) Installed template data (message templates copy, pipeline, tag defs, fields, prefs, routing, ai_rules)
DELETE FROM user_template_data utd
USING _rge_reset_user u
WHERE utd.user_id = u.user_id
  AND utd.template_id = 'realtor-growth-engine';

-- 5) Onboarding form submissions
DELETE FROM realtor_onboarding_submissions ros
USING _rge_reset_user u
WHERE ros.user_id = u.user_id
  AND ros.template_id = 'realtor-growth-engine';

-- 6) Install row
DELETE FROM template_installs ti
USING _rge_reset_user u
WHERE ti.user_id = u.user_id
  AND ti.template_id = 'realtor-growth-engine';

-- 7) Purchase / entitlement (re-buy will create a new row)
DELETE FROM template_entitlements te
USING _rge_reset_user u
WHERE te.user_id = u.user_id
  AND te.template_id = 'realtor-growth-engine';

-- 8) Concierge setup / onboarding progress (Sales Portal task)
DELETE FROM growth_engine_setup_tasks gest
USING _rge_reset_user u
WHERE gest.user_id = u.user_id
  AND gest.template_id = 'realtor-growth-engine';

-- Post-check (should all be zero / empty)
SELECT 'template_entitlements' AS tbl, count(*) AS remaining
FROM template_entitlements te JOIN _rge_reset_user u ON te.user_id = u.user_id
WHERE te.template_id = 'realtor-growth-engine'
UNION ALL
SELECT 'template_installs', count(*)
FROM template_installs ti JOIN _rge_reset_user u ON ti.user_id = u.user_id
WHERE ti.template_id = 'realtor-growth-engine'
UNION ALL
SELECT 'user_template_data', count(*)
FROM user_template_data utd JOIN _rge_reset_user u ON utd.user_id = u.user_id
WHERE utd.template_id = 'realtor-growth-engine'
UNION ALL
SELECT 'realtor_onboarding_submissions', count(*)
FROM realtor_onboarding_submissions ros JOIN _rge_reset_user u ON ros.user_id = u.user_id
WHERE ros.template_id = 'realtor-growth-engine'
UNION ALL
SELECT 'growth_engine_setup_tasks', count(*)
FROM growth_engine_setup_tasks gest JOIN _rge_reset_user u ON gest.user_id = u.user_id
WHERE gest.template_id = 'realtor-growth-engine'
UNION ALL
SELECT 'rge_workflows', count(*)
FROM workflows w JOIN _rge_reset_user u ON w.user_id = u.user_id
WHERE w.description LIKE 'Realtor Growth Engine:%'
   OR w.trigger_conditions->>'templateId' = 'realtor-growth-engine';

ROLLBACK;
-- COMMIT;
