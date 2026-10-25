BEGIN;
-- GENERATED: production proposal only. DO NOT EXECUTE without explicit owner final approval.
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
DO $$ BEGIN IF current_setting('whachat.reassignment_approval',true) IS DISTINCT FROM 'whachatcrm-marketing-20261025-v1' THEN RAISE EXCEPTION 'EXPLICIT_FINAL_APPROVAL_REQUIRED'; END IF; END $$;

SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN IF current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-lucky-salad-anatrtle' THEN
 RAISE EXCEPTION 'PRODUCTION_BRANCH_REQUIRED'; END IF; END $$;
SELECT pg_advisory_xact_lock(hashtextextended('whachatcrm.myshopify.com',0));
SELECT id FROM public.users WHERE id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0') ORDER BY id FOR UPDATE;

SELECT id FROM public.integrations WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0') FOR UPDATE;
SELECT id FROM public.contacts WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0') FOR UPDATE;
SELECT id FROM public.conversations WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0') FOR UPDATE;
SELECT id FROM public.messages WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0') FOR UPDATE;
SELECT id FROM public.activity_events WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0') FOR UPDATE;
SELECT id FROM public.catalog_sources WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0') FOR UPDATE;
SELECT id FROM public.catalog_products WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0') FOR UPDATE;
SELECT id FROM public.catalog_variants WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0') FOR UPDATE;
SELECT id FROM public.catalog_media WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0') FOR UPDATE;
SELECT id FROM public.catalog_collections WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0') FOR UPDATE;
SELECT id FROM public.catalog_events WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0') FOR UPDATE;
SELECT user_id FROM public.shopify_merchant_contacts WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0') FOR UPDATE;
DO $$ BEGIN
 IF (SELECT count(*) FROM users WHERE id='271c48f9-3515-4682-b391-2fead371593d' AND email='whachatcrm@shopify.whachatcrm.com' AND shopify_shop='whachatcrm.myshopify.com' AND shopify_access_token IS NOT NULL AND stripe_subscription_id IS NULL AND billing_plan='pro' AND subscription_plan='pro' AND subscription_status='active' AND shopify_subscription_status='active' AND shopify_charge_id='gid://shopify/AppSubscription/58073350426')<>1 THEN RAISE EXCEPTION 'SOURCE_DRIFT'; END IF;
 IF (SELECT count(*) FROM users WHERE id='6868785e-e8af-4152-8e2d-8d031c2e97d0' AND email='marketing@whachatcrm.com' AND shopify_shop IS NULL AND shopify_access_token IS NULL AND shopify_charge_id IS NULL AND stripe_subscription_id IS NULL AND billing_plan='free' AND subscription_plan='free' AND subscription_status='active')<>1 THEN RAISE EXCEPTION 'TARGET_DRIFT'; END IF;
 IF EXISTS(SELECT 1 FROM integrations WHERE user_id='6868785e-e8af-4152-8e2d-8d031c2e97d0' AND type='shopify') OR (SELECT count(*) FROM integrations WHERE user_id='271c48f9-3515-4682-b391-2fead371593d' AND type='shopify' AND is_active)<>1 OR NOT EXISTS(SELECT 1 FROM integrations WHERE id='ec9d963d-f0f8-4f40-af10-166e2392ebba' AND user_id='271c48f9-3515-4682-b391-2fead371593d' AND type='shopify' AND is_active) THEN RAISE EXCEPTION 'INSTALLATION_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM catalog_sources WHERE user_id='6868785e-e8af-4152-8e2d-8d031c2e97d0' AND provider='shopify') OR EXISTS(SELECT 1 FROM ai_subscriptions WHERE user_id='6868785e-e8af-4152-8e2d-8d031c2e97d0') THEN RAISE EXCEPTION 'TARGET_SUBSCRIPTION_CATALOG_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM contacts s JOIN contacts t ON t.user_id='6868785e-e8af-4152-8e2d-8d031c2e97d0' WHERE s.user_id='271c48f9-3515-4682-b391-2fead371593d' AND ((s.custom_fields->>'shopifyCustomerId')=(t.custom_fields->>'shopifyCustomerId') OR nullif(lower(trim(s.email)),'')=nullif(lower(trim(t.email)),'') OR nullif(regexp_replace(s.phone,'[^0-9]','','g'),'')=nullif(regexp_replace(t.phone,'[^0-9]','','g'),''))) THEN RAISE EXCEPTION 'CONTACT_IDENTITY_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM contacts WHERE user_id='271c48f9-3515-4682-b391-2fead371593d' AND source<>'shopify') OR EXISTS(SELECT 1 FROM activity_events WHERE user_id='271c48f9-3515-4682-b391-2fead371593d' AND event_data->>'shop' IS DISTINCT FROM 'whachatcrm.myshopify.com') THEN RAISE EXCEPTION 'FOREIGN_SHOP_DATA'; END IF;
END $$;
SELECT id FROM catalog_sources WHERE user_id='271c48f9-3515-4682-b391-2fead371593d' FOR UPDATE;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM catalog_sources WHERE user_id='271c48f9-3515-4682-b391-2fead371593d' AND (shop<>'whachatcrm.myshopify.com' OR lease_token IS NOT NULL OR lease_expires_at>now())) THEN RAISE EXCEPTION 'CATALOG_WORK_IN_FLIGHT'; END IF; END $$;
-- Preserves the existing charge. Owner Admin evidence and optional unknown provider metadata are documented in the approval packet.
CREATE SCHEMA IF NOT EXISTS shopify_reassignment_private;
REVOKE ALL ON SCHEMA shopify_reassignment_private FROM PUBLIC;
CREATE TABLE shopify_reassignment_private.manifest(table_name text PRIMARY KEY,before_digest text,after_digest text,patches jsonb NOT NULL);
REVOKE ALL ON shopify_reassignment_private.manifest FROM PUBLIC;

ALTER TABLE catalog_sources ALTER CONSTRAINT catalog_source_integration_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE catalog_products ALTER CONSTRAINT catalog_product_tenant_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE catalog_variants ALTER CONSTRAINT catalog_variant_tenant_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE catalog_media ALTER CONSTRAINT catalog_media_tenant_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE catalog_collections ALTER CONSTRAINT catalog_collection_tenant_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE catalog_events ALTER CONSTRAINT catalog_event_tenant_fk DEFERRABLE INITIALLY DEFERRED;
-- Preparation only. Not a startup migration. Apply with the approved store cutover.
CREATE TABLE IF NOT EXISTS public.shopify_store_assignments (
  shop text PRIMARY KEY,
  source_user_id varchar NOT NULL REFERENCES public.users(id),
  target_user_id varchar NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(source_user_id<>target_user_id)
);
REVOKE ALL ON public.shopify_store_assignments FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.enforce_shopify_store_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.shopify_shop IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.shopify_store_assignments a
    WHERE a.shop=NEW.shopify_shop AND a.target_user_id<>NEW.id
  ) THEN RAISE EXCEPTION 'SHOPIFY_STORE_ASSIGNED_ELSEWHERE'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_shopify_store_assignment ON public.users;
CREATE TRIGGER enforce_shopify_store_assignment BEFORE INSERT OR UPDATE OF shopify_shop ON public.users
FOR EACH ROW EXECUTE FUNCTION public.enforce_shopify_store_assignment();

INSERT INTO shopify_reassignment_private.manifest SELECT 'users',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.users t WHERE id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')),NULL,coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(t)->'id','shopify_shop',to_jsonb(t)->'shopify_shop','shopify_charge_id',to_jsonb(t)->'shopify_charge_id','shopify_subscription_status',to_jsonb(t)->'shopify_subscription_status','shopify_installed_at',to_jsonb(t)->'shopify_installed_at','shopify_ai_brain_enabled',to_jsonb(t)->'shopify_ai_brain_enabled','shopify_owner_email',to_jsonb(t)->'shopify_owner_email','billing_plan',to_jsonb(t)->'billing_plan','subscription_plan',to_jsonb(t)->'subscription_plan','subscription_status',to_jsonb(t)->'subscription_status')),'[]'::jsonb) FROM users t WHERE id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0');
DO $$ BEGIN IF (SELECT count(*) FROM integrations WHERE id='ec9d963d-f0f8-4f40-af10-166e2392ebba')<>1 THEN RAISE EXCEPTION 'ROW_COUNT_DRIFT_integrations'; END IF; END $$;
INSERT INTO shopify_reassignment_private.manifest SELECT 'integrations',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.integrations t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')),NULL,coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(t)->'id','user_id',to_jsonb(t)->'user_id')),'[]'::jsonb) FROM integrations t WHERE id='ec9d963d-f0f8-4f40-af10-166e2392ebba';
DO $$ BEGIN IF (SELECT count(*) FROM contacts WHERE user_id='271c48f9-3515-4682-b391-2fead371593d')<>3 THEN RAISE EXCEPTION 'ROW_COUNT_DRIFT_contacts'; END IF; END $$;
INSERT INTO shopify_reassignment_private.manifest SELECT 'contacts',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.contacts t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')),NULL,coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(t)->'id','user_id',to_jsonb(t)->'user_id')),'[]'::jsonb) FROM contacts t WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
DO $$ BEGIN IF (SELECT count(*) FROM conversations WHERE user_id='271c48f9-3515-4682-b391-2fead371593d')<>2 THEN RAISE EXCEPTION 'ROW_COUNT_DRIFT_conversations'; END IF; END $$;
INSERT INTO shopify_reassignment_private.manifest SELECT 'conversations',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.conversations t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')),NULL,coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(t)->'id','user_id',to_jsonb(t)->'user_id')),'[]'::jsonb) FROM conversations t WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
DO $$ BEGIN IF (SELECT count(*) FROM messages WHERE user_id='271c48f9-3515-4682-b391-2fead371593d')<>3 THEN RAISE EXCEPTION 'ROW_COUNT_DRIFT_messages'; END IF; END $$;
INSERT INTO shopify_reassignment_private.manifest SELECT 'messages',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.messages t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')),NULL,coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(t)->'id','user_id',to_jsonb(t)->'user_id')),'[]'::jsonb) FROM messages t WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
DO $$ BEGIN IF (SELECT count(*) FROM activity_events WHERE user_id='271c48f9-3515-4682-b391-2fead371593d')<>11 THEN RAISE EXCEPTION 'ROW_COUNT_DRIFT_activity_events'; END IF; END $$;
INSERT INTO shopify_reassignment_private.manifest SELECT 'activity_events',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.activity_events t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')),NULL,coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(t)->'id','user_id',to_jsonb(t)->'user_id')),'[]'::jsonb) FROM activity_events t WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
DO $$ BEGIN IF (SELECT count(*) FROM catalog_sources WHERE user_id='271c48f9-3515-4682-b391-2fead371593d')<>1 THEN RAISE EXCEPTION 'ROW_COUNT_DRIFT_catalog_sources'; END IF; END $$;
INSERT INTO shopify_reassignment_private.manifest SELECT 'catalog_sources',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.catalog_sources t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')),NULL,coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(t)->'id','user_id',to_jsonb(t)->'user_id')),'[]'::jsonb) FROM catalog_sources t WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
DO $$ BEGIN IF (SELECT count(*) FROM catalog_products WHERE user_id='271c48f9-3515-4682-b391-2fead371593d')<>17 THEN RAISE EXCEPTION 'ROW_COUNT_DRIFT_catalog_products'; END IF; END $$;
INSERT INTO shopify_reassignment_private.manifest SELECT 'catalog_products',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.catalog_products t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')),NULL,coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(t)->'id','user_id',to_jsonb(t)->'user_id')),'[]'::jsonb) FROM catalog_products t WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
DO $$ BEGIN IF (SELECT count(*) FROM catalog_variants WHERE user_id='271c48f9-3515-4682-b391-2fead371593d')<>26 THEN RAISE EXCEPTION 'ROW_COUNT_DRIFT_catalog_variants'; END IF; END $$;
INSERT INTO shopify_reassignment_private.manifest SELECT 'catalog_variants',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.catalog_variants t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')),NULL,coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(t)->'id','user_id',to_jsonb(t)->'user_id')),'[]'::jsonb) FROM catalog_variants t WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
DO $$ BEGIN IF (SELECT count(*) FROM catalog_media WHERE user_id='271c48f9-3515-4682-b391-2fead371593d')<>18 THEN RAISE EXCEPTION 'ROW_COUNT_DRIFT_catalog_media'; END IF; END $$;
INSERT INTO shopify_reassignment_private.manifest SELECT 'catalog_media',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.catalog_media t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')),NULL,coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(t)->'id','user_id',to_jsonb(t)->'user_id')),'[]'::jsonb) FROM catalog_media t WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
DO $$ BEGIN IF (SELECT count(*) FROM catalog_collections WHERE user_id='271c48f9-3515-4682-b391-2fead371593d')<>3 THEN RAISE EXCEPTION 'ROW_COUNT_DRIFT_catalog_collections'; END IF; END $$;
INSERT INTO shopify_reassignment_private.manifest SELECT 'catalog_collections',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.catalog_collections t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')),NULL,coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(t)->'id','user_id',to_jsonb(t)->'user_id')),'[]'::jsonb) FROM catalog_collections t WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
DO $$ BEGIN IF (SELECT count(*) FROM catalog_events WHERE user_id='271c48f9-3515-4682-b391-2fead371593d')<>0 THEN RAISE EXCEPTION 'ROW_COUNT_DRIFT_catalog_events'; END IF; END $$;
INSERT INTO shopify_reassignment_private.manifest SELECT 'catalog_events',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.catalog_events t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')),NULL,coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(t)->'id','user_id',to_jsonb(t)->'user_id')),'[]'::jsonb) FROM catalog_events t WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
DO $$ BEGIN IF (SELECT count(*) FROM shopify_merchant_contacts WHERE user_id='271c48f9-3515-4682-b391-2fead371593d')<>1 THEN RAISE EXCEPTION 'ROW_COUNT_DRIFT_shopify_merchant_contacts'; END IF; END $$;
INSERT INTO shopify_reassignment_private.manifest SELECT 'shopify_merchant_contacts',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.shopify_merchant_contacts t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')),NULL,coalesce(jsonb_agg(jsonb_build_object('user_id',to_jsonb(t)->'user_id')),'[]'::jsonb) FROM shopify_merchant_contacts t WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
INSERT INTO shopify_store_assignments(shop,source_user_id,target_user_id) VALUES('whachatcrm.myshopify.com','271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0');
UPDATE users SET shopify_shop=NULL WHERE id='271c48f9-3515-4682-b391-2fead371593d';
UPDATE users d SET shopify_access_token=s.shopify_access_token,shopify_charge_id=s.shopify_charge_id,shopify_subscription_status=s.shopify_subscription_status,shopify_installed_at=s.shopify_installed_at,shopify_ai_brain_enabled=s.shopify_ai_brain_enabled,shopify_owner_email=s.shopify_owner_email,billing_plan=s.billing_plan,subscription_plan=s.subscription_plan,subscription_status=s.subscription_status,shopify_shop='whachatcrm.myshopify.com' FROM users s WHERE d.id='6868785e-e8af-4152-8e2d-8d031c2e97d0' AND s.id='271c48f9-3515-4682-b391-2fead371593d';
UPDATE users SET shopify_access_token=NULL,shopify_charge_id=NULL,shopify_subscription_status='transferred',shopify_installed_at=NULL,shopify_ai_brain_enabled=false,shopify_owner_email=NULL,billing_plan='free',subscription_plan='free' WHERE id='271c48f9-3515-4682-b391-2fead371593d';
UPDATE integrations SET user_id='6868785e-e8af-4152-8e2d-8d031c2e97d0' WHERE id='ec9d963d-f0f8-4f40-af10-166e2392ebba';
UPDATE contacts SET user_id='6868785e-e8af-4152-8e2d-8d031c2e97d0' WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
UPDATE conversations SET user_id='6868785e-e8af-4152-8e2d-8d031c2e97d0' WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
UPDATE messages SET user_id='6868785e-e8af-4152-8e2d-8d031c2e97d0' WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
UPDATE activity_events SET user_id='6868785e-e8af-4152-8e2d-8d031c2e97d0' WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
UPDATE catalog_sources SET user_id='6868785e-e8af-4152-8e2d-8d031c2e97d0' WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
UPDATE catalog_products SET user_id='6868785e-e8af-4152-8e2d-8d031c2e97d0' WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
UPDATE catalog_variants SET user_id='6868785e-e8af-4152-8e2d-8d031c2e97d0' WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
UPDATE catalog_media SET user_id='6868785e-e8af-4152-8e2d-8d031c2e97d0' WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
UPDATE catalog_collections SET user_id='6868785e-e8af-4152-8e2d-8d031c2e97d0' WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
UPDATE catalog_events SET user_id='6868785e-e8af-4152-8e2d-8d031c2e97d0' WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
UPDATE shopify_merchant_contacts SET user_id='6868785e-e8af-4152-8e2d-8d031c2e97d0' WHERE user_id='271c48f9-3515-4682-b391-2fead371593d';
UPDATE shopify_reassignment_private.manifest SET after_digest=(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.users t WHERE id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')) WHERE table_name='users';
UPDATE shopify_reassignment_private.manifest SET after_digest=(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.integrations t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')) WHERE table_name='integrations';
UPDATE shopify_reassignment_private.manifest SET after_digest=(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.contacts t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')) WHERE table_name='contacts';
UPDATE shopify_reassignment_private.manifest SET after_digest=(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.conversations t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')) WHERE table_name='conversations';
UPDATE shopify_reassignment_private.manifest SET after_digest=(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.messages t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')) WHERE table_name='messages';
UPDATE shopify_reassignment_private.manifest SET after_digest=(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.activity_events t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')) WHERE table_name='activity_events';
UPDATE shopify_reassignment_private.manifest SET after_digest=(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.catalog_sources t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')) WHERE table_name='catalog_sources';
UPDATE shopify_reassignment_private.manifest SET after_digest=(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.catalog_products t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')) WHERE table_name='catalog_products';
UPDATE shopify_reassignment_private.manifest SET after_digest=(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.catalog_variants t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')) WHERE table_name='catalog_variants';
UPDATE shopify_reassignment_private.manifest SET after_digest=(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.catalog_media t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')) WHERE table_name='catalog_media';
UPDATE shopify_reassignment_private.manifest SET after_digest=(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.catalog_collections t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')) WHERE table_name='catalog_collections';
UPDATE shopify_reassignment_private.manifest SET after_digest=(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.catalog_events t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')) WHERE table_name='catalog_events';
UPDATE shopify_reassignment_private.manifest SET after_digest=(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.shopify_merchant_contacts t WHERE user_id IN ('271c48f9-3515-4682-b391-2fead371593d','6868785e-e8af-4152-8e2d-8d031c2e97d0')) WHERE table_name='shopify_merchant_contacts';
DO $$ BEGIN IF (SELECT count(*) FROM users WHERE shopify_shop='whachatcrm.myshopify.com' AND id='6868785e-e8af-4152-8e2d-8d031c2e97d0' AND shopify_access_token IS NOT NULL)<>1 THEN RAISE EXCEPTION 'INVALID_FINAL_OWNER'; END IF; END $$;
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE catalog_sources ALTER CONSTRAINT catalog_source_integration_fk NOT DEFERRABLE;
ALTER TABLE catalog_products ALTER CONSTRAINT catalog_product_tenant_fk NOT DEFERRABLE;
ALTER TABLE catalog_variants ALTER CONSTRAINT catalog_variant_tenant_fk NOT DEFERRABLE;
ALTER TABLE catalog_media ALTER CONSTRAINT catalog_media_tenant_fk NOT DEFERRABLE;
ALTER TABLE catalog_collections ALTER CONSTRAINT catalog_collection_tenant_fk NOT DEFERRABLE;
ALTER TABLE catalog_events ALTER CONSTRAINT catalog_event_tenant_fk NOT DEFERRABLE;
SELECT table_name,jsonb_array_length(patches) AS changed_rows FROM shopify_reassignment_private.manifest ORDER BY table_name;

COMMIT;
