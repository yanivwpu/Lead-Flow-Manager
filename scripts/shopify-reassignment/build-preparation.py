"""Generate reviewable branch-only rehearsal SQL. Never connects to a database."""
from pathlib import Path
import argparse
parser=argparse.ArgumentParser()
parser.add_argument("--rehearsal-branch",default="br-empty-truth-anrppwpf")
args=parser.parse_args()
if not args.rehearsal_branch.startswith("br-") or args.rehearsal_branch=="br-lucky-salad-anatrtle": raise ValueError("isolated branch required")
root=Path(__file__).parent
source='271c48f9-3515-4682-b391-2fead371593d'
target='6868785e-e8af-4152-8e2d-8d031c2e97d0'
shop='whachatcrm.myshopify.com'
integration='ec9d963d-f0f8-4f40-af10-166e2392ebba'
branch=args.rehearsal_branch
usercols=['shopify_shop','shopify_charge_id','shopify_subscription_status','shopify_installed_at','shopify_ai_brain_enabled','shopify_owner_email','billing_plan','subscription_plan','subscription_status']
spec=[('users','id',usercols,None),('integrations','id',['user_id'],1),('contacts','id',['user_id'],3),('conversations','id',['user_id'],2),('messages','id',['user_id'],3),('activity_events','id',['user_id'],11),('catalog_sources','id',['user_id'],1),('catalog_products','id',['user_id'],17),('catalog_variants','id',['user_id'],26),('catalog_media','id',['user_id'],18),('catalog_collections','id',['user_id'],3),('catalog_events','id',['user_id'],0),('shopify_merchant_contacts','user_id',['user_id'],1)]
def scope(t):return f"id IN ('{source}','{target}')" if t=='users' else f"user_id IN ('{source}','{target}')"
def selected(t):return f"id='{integration}'" if t=='integrations' else f"user_id='{source}'"
def digest(t):return f"SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) FROM public.{t} t WHERE {scope(t)}"
header=f"""-- GENERATED: preparation only, deliberately refuses production. Final approval has not been given.
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN IF current_setting('neon.branch_id',true) IS DISTINCT FROM '{branch}' THEN
 RAISE EXCEPTION 'REHEARSAL_BRANCH_ONLY'; END IF; END $$;
SELECT pg_advisory_xact_lock(hashtextextended('{shop}',0));
SELECT id FROM public.users WHERE id IN ('{source}','{target}') ORDER BY id FOR UPDATE;
"""
pre=f"""DO $$ BEGIN
 IF (SELECT count(*) FROM users WHERE id='{source}' AND email='whachatcrm@shopify.whachatcrm.com' AND shopify_shop='{shop}' AND shopify_access_token IS NOT NULL AND stripe_subscription_id IS NULL AND billing_plan='pro' AND subscription_plan='pro' AND subscription_status='active' AND shopify_subscription_status='active' AND shopify_charge_id='gid://shopify/AppSubscription/58073350426')<>1 THEN RAISE EXCEPTION 'SOURCE_DRIFT'; END IF;
 IF (SELECT count(*) FROM users WHERE id='{target}' AND email='marketing@whachatcrm.com' AND shopify_shop IS NULL AND shopify_access_token IS NULL AND shopify_charge_id IS NULL AND stripe_subscription_id IS NULL AND billing_plan='free' AND subscription_plan='free' AND subscription_status='active')<>1 THEN RAISE EXCEPTION 'TARGET_DRIFT'; END IF;
 IF EXISTS(SELECT 1 FROM integrations WHERE user_id='{target}' AND type='shopify') OR (SELECT count(*) FROM integrations WHERE user_id='{source}' AND type='shopify' AND is_active)<>1 OR NOT EXISTS(SELECT 1 FROM integrations WHERE id='{integration}' AND user_id='{source}' AND type='shopify' AND is_active) THEN RAISE EXCEPTION 'INSTALLATION_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM catalog_sources WHERE user_id='{target}' AND provider='shopify') OR EXISTS(SELECT 1 FROM ai_subscriptions WHERE user_id='{target}') THEN RAISE EXCEPTION 'TARGET_SUBSCRIPTION_CATALOG_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM contacts s JOIN contacts t ON t.user_id='{target}' WHERE s.user_id='{source}' AND ((s.custom_fields->>'shopifyCustomerId')=(t.custom_fields->>'shopifyCustomerId') OR nullif(lower(trim(s.email)),'')=nullif(lower(trim(t.email)),'') OR nullif(regexp_replace(s.phone,'[^0-9]','','g'),'')=nullif(regexp_replace(t.phone,'[^0-9]','','g'),''))) THEN RAISE EXCEPTION 'CONTACT_IDENTITY_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM contacts WHERE user_id='{source}' AND source<>'shopify') OR EXISTS(SELECT 1 FROM activity_events WHERE user_id='{source}' AND event_data->>'shop' IS DISTINCT FROM '{shop}') THEN RAISE EXCEPTION 'FOREIGN_SHOP_DATA'; END IF;
END $$;
SELECT id FROM catalog_sources WHERE user_id='{source}' FOR UPDATE;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM catalog_sources WHERE user_id='{source}' AND (shop<>'{shop}' OR lease_token IS NOT NULL OR lease_expires_at>now())) THEN RAISE EXCEPTION 'CATALOG_WORK_IN_FLIGHT'; END IF; END $$;
-- Preserves the existing charge. Owner Admin evidence and optional unknown provider metadata are documented in the approval packet.
CREATE SCHEMA IF NOT EXISTS shopify_reassignment_private;
REVOKE ALL ON SCHEMA shopify_reassignment_private FROM PUBLIC;
CREATE TABLE shopify_reassignment_private.manifest(table_name text PRIMARY KEY,before_digest text,after_digest text,patches jsonb NOT NULL);
REVOKE ALL ON shopify_reassignment_private.manifest FROM PUBLIC;
"""
fks=[('catalog_sources','catalog_source_integration_fk'),('catalog_products','catalog_product_tenant_fk'),('catalog_variants','catalog_variant_tenant_fk'),('catalog_media','catalog_media_tenant_fk'),('catalog_collections','catalog_collection_tenant_fk'),('catalog_events','catalog_event_tenant_fk')]
defer='\n'.join(f'ALTER TABLE {t} ALTER CONSTRAINT {c} DEFERRABLE INITIALLY DEFERRED;' for t,c in fks)
restore='SET CONSTRAINTS ALL IMMEDIATE;\n'+'\n'.join(f'ALTER TABLE {t} ALTER CONSTRAINT {c} NOT DEFERRABLE;' for t,c in fks)
rowlocks='\n'.join(f'SELECT {pk} FROM public.{t} WHERE {scope(t)} FOR UPDATE;' for t,pk,*_ in spec if t!='users')
forward=[header,rowlocks,pre,defer,root.joinpath('ownership-guard.sql').read_text()]
for t,pk,cols,n in spec:
 if n is not None:forward.append(f"DO $$ BEGIN IF (SELECT count(*) FROM {t} WHERE {selected(t)})<>{n} THEN RAISE EXCEPTION 'ROW_COUNT_DRIFT_{t}'; END IF; END $$;")
 cond=scope(t) if t=='users' else selected(t)
 patch="jsonb_build_object("+','.join(f"'{c}',to_jsonb(t)->'{c}'" for c in [pk]+[c for c in cols if c!=pk])+")"
 forward.append(f"INSERT INTO shopify_reassignment_private.manifest SELECT '{t}',({digest(t)}),NULL,coalesce(jsonb_agg({patch}),'[]'::jsonb) FROM {t} t WHERE {cond};")
forward.append(f"INSERT INTO shopify_store_assignments(shop,source_user_id,target_user_id) VALUES('{shop}','{source}','{target}');")
# Move the credential via SQL only; manifest contains no credential values.
forward.append(f"UPDATE users SET shopify_shop=NULL WHERE id='{source}';")
forward.append(f"UPDATE users d SET shopify_access_token=s.shopify_access_token,"+','.join(f"{c}=s.{c}" for c in usercols if c!='shopify_shop')+f",shopify_shop='{shop}' FROM users s WHERE d.id='{target}' AND s.id='{source}';")
forward.append(f"UPDATE users SET shopify_access_token=NULL,shopify_charge_id=NULL,shopify_subscription_status='transferred',shopify_installed_at=NULL,shopify_ai_brain_enabled=false,shopify_owner_email=NULL,billing_plan='free',subscription_plan='free' WHERE id='{source}';")
for t,pk,cols,n in spec:
 if t!='users':forward.append(f"UPDATE {t} SET user_id='{target}' WHERE {selected(t)};")
for t,*_ in spec:forward.append(f"UPDATE shopify_reassignment_private.manifest SET after_digest=({digest(t)}) WHERE table_name='{t}';")
forward.append(f"DO $$ BEGIN IF (SELECT count(*) FROM users WHERE shopify_shop='{shop}' AND id='{target}' AND shopify_access_token IS NOT NULL)<>1 THEN RAISE EXCEPTION 'INVALID_FINAL_OWNER'; END IF; END $$;")
forward.append(restore)
forward.append("SELECT table_name,jsonb_array_length(patches) AS changed_rows FROM shopify_reassignment_private.manifest ORDER BY table_name;")
root.joinpath('forward-rehearsal.sql').write_text('\n'.join(forward)+'\n')
rollback=[header,rowlocks,defer]
for t,*_ in spec:rollback.append(f"DO $$ BEGIN IF ({digest(t)}) IS DISTINCT FROM (SELECT after_digest FROM shopify_reassignment_private.manifest WHERE table_name='{t}') THEN RAISE EXCEPTION 'ROLLBACK_DRIFT_{t}'; END IF; END $$;")
rollback.append(f"UPDATE shopify_store_assignments SET target_user_id=source_user_id,source_user_id=target_user_id WHERE shop='{shop}';")
rollback.append(f"UPDATE users SET shopify_shop=NULL WHERE id='{target}';")
rollback.append(f"UPDATE users s SET shopify_access_token=t.shopify_access_token FROM users t WHERE s.id='{source}' AND t.id='{target}';")
rollback.append(f"UPDATE users SET shopify_access_token=NULL WHERE id='{target}';")
for t,pk,cols,n in spec:
 condition=f"r.{pk}=p->>'{pk}'"
 if t=='shopify_merchant_contacts':condition=f"r.user_id='{target}'"
 sets=','.join(f"{c}=(jsonb_populate_record(NULL::public.{t},p)).{c}" for c in cols)
 rollback.append(f"UPDATE {t} r SET {sets} FROM (SELECT jsonb_array_elements(patches) AS p FROM shopify_reassignment_private.manifest WHERE table_name='{t}') b WHERE {condition};")
for t,*_ in spec:rollback.append(f"DO $$ BEGIN IF ({digest(t)}) IS DISTINCT FROM (SELECT before_digest FROM shopify_reassignment_private.manifest WHERE table_name='{t}') THEN RAISE EXCEPTION 'ROLLBACK_MISMATCH_{t}'; END IF; END $$;")
rollback.append(f"DELETE FROM shopify_store_assignments WHERE shop='{shop}' AND target_user_id='{source}';")
rollback.append(restore)
rollback.append("SELECT 'rollback verified: all touched rows match original checksums' AS result;")
root.joinpath('rollback-rehearsal.sql').write_text('\n'.join(rollback)+'\n')

# Production files are review artifacts. A transaction-local approval marker is deliberately absent by default.
for direction in ['forward','rollback']:
 text=root.joinpath(direction+'-rehearsal.sql').read_text()
 text=text.replace(branch,'br-lucky-salad-anatrtle').replace('REHEARSAL_BRANCH_ONLY','PRODUCTION_BRANCH_REQUIRED')
 text=text.replace('-- GENERATED: preparation only, deliberately refuses production. Final approval has not been given.', '-- GENERATED: production proposal only. DO NOT EXECUTE without explicit owner final approval.')
 marker="DO $$ BEGIN IF current_setting('whachat.reassignment_approval',true) IS DISTINCT FROM 'whachatcrm-marketing-20261025-v1' THEN RAISE EXCEPTION 'EXPLICIT_FINAL_APPROVAL_REQUIRED'; END IF; END $$;\n"
 text=text.replace("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;", "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;\n"+marker,1)
 root.joinpath(direction+'-production.sql').write_text(text)
# Files are fail-closed even under psql autocommit: any guard failure aborts all writes.
for name in ['forward-rehearsal.sql','rollback-rehearsal.sql','forward-production.sql','rollback-production.sql']:
 path=root/name
 path.write_text('BEGIN;\n'+path.read_text()+'\nCOMMIT;\n')
