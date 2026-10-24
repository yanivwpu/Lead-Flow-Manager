-- Run only against the independently mapped production connection.
-- Read-only: never enables the pilot or changes Shopify ownership/subscriptions.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '2s';
SELECT current_database() AS database_name,
       current_setting('neon.branch_id', true) AS branch_id;
SELECT u.id AS workspace_id, u.email,
       u.shopify_shop,
       (u.shopify_access_token IS NOT NULL AND u.shopify_access_token <> '') AS has_shopify_token,
       (SELECT count(*) FROM team_members m WHERE m.member_id=u.id AND m.owner_id<>u.id AND m.status='active') AS other_active_memberships,
       (SELECT count(*) FROM integrations i WHERE i.user_id=u.id AND i.type='shopify' AND i.is_active=true) AS active_shopify_integrations
FROM users u WHERE lower(trim(u.email))='marketing@whachatcrm.com' LIMIT 3;
SELECT name, to_regclass('public.' || name)::text AS installed_relation
FROM (VALUES ('ecommerce_growth_event_inbox'),('ecommerce_growth_order_task_settings'),
  ('ecommerce_growth_order_support_tasks'),('ecommerce_growth_order_task_schedule'),
  ('ecommerce_abandoned_checkout_observations'),('ecommerce_checkout_recovery_intents')) AS expected(name);
ROLLBACK;
