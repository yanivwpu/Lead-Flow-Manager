-- Metadata only. Run with psql -X -v ON_ERROR_STOP=1 -f this-file.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
SELECT current_setting('transaction_read_only') AS read_only,
       current_setting('server_version') AS postgres_version;
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND (table_name IN (
 'shopify_shop_trials','shopify_merchant_contacts','shopify_privacy_erasure_tasks',
 'shopify_privacy_alerts','shopify_privacy_customer_locks','shopify_privacy_request_payloads')
 OR (table_name='users' AND column_name IN ('id','email','shopify_shop','shopify_installed_at',
 'trial_started_at','trial_ends_at','trial_plan','shopify_owner_email','shopify_welcome_email_sent_at',
 'shopify_activation_email_day5_sent_at','shopify_activation_email_day10_sent_at')))
ORDER BY table_name, ordinal_position;
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public'
AND tablename IN ('shopify_shop_trials','shopify_merchant_contacts','shopify_privacy_erasure_tasks',
 'shopify_privacy_alerts','shopify_privacy_customer_locks','shopify_privacy_request_payloads')
ORDER BY tablename,indexname;
SELECT c.relname,con.conname,pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('shopify_shop_trials','shopify_merchant_contacts',
 'shopify_privacy_erasure_tasks','shopify_privacy_alerts','shopify_privacy_request_payloads')
ORDER BY c.relname,con.conname;
SELECT viewname,definition FROM pg_views WHERE schemaname='public'
AND viewname='shopify_privacy_current_issues';
-- Missing relations are returned as NULL, not silently treated as migrated.
SELECT name,to_regclass('public.' || name) IS NOT NULL AS present FROM unnest(ARRAY[
 'shopify_shop_trials','shopify_merchant_contacts','shopify_privacy_erasure_tasks',
 'shopify_privacy_alerts','shopify_privacy_customer_locks','shopify_privacy_request_payloads',
 'shopify_privacy_current_issues']) AS name;
ROLLBACK;
