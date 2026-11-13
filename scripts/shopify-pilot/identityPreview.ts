/** Read-only extraction of PR #301 preview at feaf05b6. No apply function or runtime hook. */
import { createHash, createHmac } from 'node:crypto';
import { commerceContactSuppressed } from '../../server/ecommerce/checkoutRecoveryMessagingEligibility';

export const PILOT_ACCOUNT = '51f64011-eb3a-48a4-bb10-031abd3c0cdc';
export const PILOT_SHOP = 'whachatcrm-live-test.myshopify.com';
export type Client = { query: (sql: string, values?: any[]) => Promise<{ rows: any[] }> };
export type Scope = { account: string; shop: string; canonical: string; source: string };
type Column = { table_name: string; column_name: string; data_type: string };
const movable = new Set(['conversations', 'messages', 'activity_events', 'no_reply_jobs']);
const history = new Set(['conversations', 'messages', 'activity_events']);
const terminalJobs = new Set(['completed', 'cancelled', 'skipped']);
const q = (s: string) => '"' + s.replaceAll('"', '""') + '"';
const object = (x: any): Record<string, any> => x && typeof x === 'object' && !Array.isArray(x) ? x : {};
function stable(x: any): string {
  if (x instanceof Date) return JSON.stringify(x.toISOString());
  if (Array.isArray(x)) return '[' + x.map(stable).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + stable(x[k])).join(',') + '}';
  return JSON.stringify(x);
}
const hash = (x: any) => createHash('sha256').update(stable(x)).digest('hex');
function fail(code: string): never { throw new Error('pilot_reconciliation_' + code); }
function sanitized(error: unknown): Error {
  return error instanceof Error && /^pilot_reconciliation_[a-z_]+$/.test(error.message)
    ? error : new Error('pilot_reconciliation_transaction_failed');
}
function validate(s: Scope) {
  if (s.account !== PILOT_ACCOUNT || s.shop !== PILOT_SHOP || !s.canonical || !s.source || s.canonical === s.source ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(s.canonical) || !/^[a-zA-Z0-9_-]{1,128}$/.test(s.source)) fail('scope');
}
function identity(c: any, shop: string): string | null {
  const cf = object(c.custom_fields), sd = object(c.source_details), id = cf.shopifyCustomerId ?? sd.shopifyCustomerId;
  if (typeof id !== 'string' || !/^[1-9][0-9]{0,19}$/.test(id)) return null;
  if ((cf.shopifyCustomerId != null && cf.shopifyCustomerId !== id) || (sd.shopifyCustomerId != null && sd.shopifyCustomerId !== id) ||
    (cf.shopifyShop != null && cf.shopifyShop !== shop) || (sd.shop != null && sd.shop !== shop) ||
    (cf.shopifyShop ?? sd.shop) !== shop) fail('shopify_metadata_conflict');
  return id;
}
export function contactChanges(a: any, b: any, s: Scope, ledgerRestricted: boolean) {
  if (a.id !== s.canonical || b.id !== s.source || a.user_id !== s.account || b.user_id !== s.account) fail('ownership');
  const customer = identity(a, s.shop);
  if (!customer || identity(b, s.shop) || Object.keys(object(b.custom_fields)).some(k => /^shopify/i.test(k)) ||
    object(b.source_details).shopifyCustomerId != null || object(b.source_details).shop != null) fail('source_shopify_identity');
  const wa = b.whatsapp_id;
  if (typeof wa !== 'string' || !/^972[1-9][0-9]{7,9}$/.test(wa) || a.whatsapp_id ||
    typeof a.phone !== 'string' || typeof b.phone !== 'string' ||
    !/^\+?[1-9][0-9]{7,14}$/.test(a.phone) || !/^\+?[1-9][0-9]{7,14}$/.test(b.phone) ||
    a.phone.replace(/^\+/, '') !== wa || b.phone.replace(/^\+/, '') !== wa) fail('phone_identity');
  // Other channel identities require their own review, never silently discard one.
  for (const field of ['instagram_id', 'facebook_id', 'telegram_id', 'ghl_id', 'webchat_id'])
    if (b[field]) fail('other_channel_identity');
  const fields = { ...object(a.custom_fields) };
  for (const key of ['doNotContact', 'dnc', 'optOut', 'optedOut', 'unsubscribed', 'unsubscribe', 'stop', 'campaignOptOut'])
    if (a.custom_fields?.[key] === true || b.custom_fields?.[key] === true) fields[key] = true;
  if (a.custom_fields?.marketingOptIn === false || b.custom_fields?.marketingOptIn === false) fields.marketingOptIn = false;
  const restricted = ledgerRestricted || [a, b].some(c => commerceContactSuppressed({
    // Operational pause stays pause; it must not silently become durable DNC.
    automationsPaused: false, customFields: c.custom_fields, tag: c.tag, pipelineStage: c.pipeline_stage,
  }));
  if (restricted) fields.doNotContact = true;
  // Full original rows live ONLY under canonical Shopify-owned data so its
  // existing customer/store erasure removes the retained personal information.
  const sourceDetails = { ...object(a.source_details), identityReconciliation: { version: 1, shop: s.shop, originalCanonical: a, originalSource: b } };
  const canonical = { phone: '+' + wa, whatsapp_id: wa, custom_fields: fields, source_details: sourceDetails,
    automations_paused: a.automations_paused || b.automations_paused,
    automations_paused_at: a.automations_paused ? a.automations_paused_at : b.automations_paused ? b.automations_paused_at : a.automations_paused_at,
    automations_paused_by_user_id: a.automations_paused ? a.automations_paused_by_user_id : b.automations_paused ? b.automations_paused_by_user_id : a.automations_paused_by_user_id };
  // Retain B's PK, never delete it; a neutral paused shell has no matchable identity.
  const source = { name: 'Reconciled contact', phone: null, whatsapp_id: null, email: null, avatar: null,
    source: 'manual', primary_channel: 'whatsapp', primary_channel_override: null, last_incoming_channel: null,
    last_incoming_at: null, avatar_fetched_at: null, notes: '', tag: 'Reconciled', pipeline_stage: 'Closed',
    follow_up: null, follow_up_date: null, lead_score: null, assigned_to: null,
    automations_paused: true, automations_paused_at: null, automations_paused_by_user_id: null,
    buyer_preference_profile: {}, seller_preference_profile: {}, webchat_context: {}, custom_fields: {},
    source_details: { contactLifecycle: 'inbox_only' } };
  return { customer, canonical, source, restricted };
}

export async function inspect(client: Client, s: Scope, privacySecret: string) {
  validate(s);
  if (!privacySecret) fail('privacy_key_required');
  const people = (await client.query('SELECT * FROM contacts WHERE id=ANY($1::varchar[]) ORDER BY id', [[s.canonical, s.source]])).rows;
  const a = people.find(c => c.id === s.canonical), b = people.find(c => c.id === s.source);
  if (!a || !b) fail('missing_contact');
  const initial = contactChanges(a, b, s, false);
  const owner = (await client.query(`SELECT id,shopify_shop,shopify_installed_at,meta_connected,meta_business_account_id,meta_phone_number_id,
    deletion_requested_at,shopify_subscription_status,shopify_access_token IS NOT NULL AS token_present
    FROM users WHERE id=$1`, [s.account])).rows[0];
  if (!owner || owner.shopify_shop !== s.shop || !owner.token_present || !owner.meta_connected || owner.deletion_requested_at ||
    ['uninstalled','redacted'].includes(owner.shopify_subscription_status)) fail('installation');
  if ((await client.query('SELECT id FROM users WHERE shopify_shop=$1 OR (meta_connected=true AND meta_phone_number_id=$2)',[s.shop,owner.meta_phone_number_id])).rows.length !== 1) fail('ambiguous_owner');
  const installations = (await client.query("SELECT id,config FROM integrations WHERE user_id=$1 AND type='shopify' AND is_active=true", [s.account])).rows;
  if (installations.length !== 1 || ['shop','shopUrl'].some(k => installations[0].config?.[k] != null && installations[0].config[k] !== s.shop) ||
    installations[0].config?.ecommercePostPurchaseDeliveryEnabled === true || installations[0].config?.ecommerceCheckoutRecoveryDeliveryEnabled === true) fail('delivery_or_installation');
  const duplicate = await client.query(`SELECT id FROM contacts WHERE user_id=$1 AND id<>ALL($2::varchar[]) AND
    (regexp_replace(coalesce(phone,''),'[^0-9]','','g')=$3 OR regexp_replace(coalesce(whatsapp_id,''),'[^0-9]','','g')=$3 OR
    (coalesce(custom_fields->>'shopifyCustomerId',source_details->>'shopifyCustomerId')=$4 AND
     coalesce(custom_fields->>'shopifyShop',source_details->>'shop')=$5)) LIMIT 1`,
  [s.account,[s.canonical,s.source],b.whatsapp_id,initial.customer,s.shop]);
  if (duplicate.rows.length) fail('third_identity');
  const tokens = ['id:' + initial.customer, 'phone:' + b.whatsapp_id,
    ...[a.email,b.email].filter(Boolean).map(e => 'email:' + e.trim().toLowerCase())];
  const privacyHashes = tokens.map(token => createHmac('sha256', privacySecret).update('shopify-privacy-v1:' + JSON.stringify([s.shop,token])).digest('hex'));
  if ((await client.query('SELECT 1 FROM shopify_privacy_customer_locks WHERE identity_hash=ANY($1::text[]) LIMIT 1',[privacyHashes])).rows.length) fail('privacy_locked');
  const keys = ['phone:+' + b.whatsapp_id, 'phone:' + b.whatsapp_id, ...[a.email,b.email].filter(Boolean).map(e => e.trim().toLowerCase())];
  const ledger = (await client.query('SELECT scope,reason FROM marketing_suppressions WHERE workspace_user_id=$1 AND email_normalized=ANY($2::text[]) ORDER BY scope,reason',[s.account,keys])).rows;
  const changes = contactChanges(a,b,s,ledger.some(row => row.scope === 'all'));
  const columns: Column[] = (await client.query(`SELECT table_name,column_name,data_type FROM information_schema.columns
    WHERE table_schema='public' ORDER BY table_name,column_name`)).rows;
  // Include nonstandard FK names as well as application scalar/JSON/snapshot references.
  const fks = (await client.query(`SELECT cl.relname AS table_name,att.attname AS column_name FROM pg_constraint fk
    JOIN pg_class cl ON cl.oid=fk.conrelid JOIN pg_namespace ns ON ns.oid=cl.relnamespace
    JOIN pg_attribute att ON att.attrelid=fk.conrelid AND att.attnum=ANY(fk.conkey)
    WHERE fk.contype='f' AND fk.confrelid='public.contacts'::regclass AND ns.nspname='public' ORDER BY cl.relname,att.attname`)).rows;
  const refs: any[] = [], blocked: string[] = [];
  for (const c of columns) {
    const scalar = c.column_name.endsWith('contact_id') || c.column_name === 'entity_id' ||
      fks.some(f => f.table_name === c.table_name && f.column_name === c.column_name);
    const json = ['json','jsonb'].includes(c.data_type);
    const idArray = c.data_type === 'ARRAY' && c.column_name.endsWith('contact_ids');
    const idList = !json && !idArray && c.column_name.endsWith('contact_ids');
    if (!scalar && !json && !idArray && !idList) continue;
    const table = 'public.' + q(c.table_name), col = q(c.column_name);
    const hasOwner = columns.some(x => x.table_name === c.table_name && x.column_name === 'user_id');
    const canMove = movable.has(c.table_name) && c.column_name === 'contact_id' && hasOwner;
    const predicate = scalar ? `${col}=$1` : idArray ? `$1=ANY(${col}::text[])` : `position($1 in ${col}::text)>0`;
    const rows = (await client.query(`SELECT count(*)::int AS n,md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY to_jsonb(t)::text),'')) AS digest
      FROM ${table} t WHERE ${predicate}`, [s.source])).rows[0];
    refs.push({ table: c.table_name, column: c.column_name, count: rows.n, digest: rows.digest });
    if (!rows.n) continue;
    if (canMove) {
      if ((await client.query(`SELECT 1 FROM ${table} WHERE ${col}=$1 AND user_id<>$2 LIMIT 1`,[s.source,s.account])).rows.length) blocked.push('foreign_reference');
    } else if (c.table_name === 'automation_send_dedup' && c.column_name === 'contact_id') {
      // Handled below: keep original keys and add canonical aliases, never reset a fence.
    } else if (json && history.has(c.table_name) && hasOwner) {
      if ((await client.query(`SELECT 1 FROM ${table} WHERE ${predicate} AND NOT(user_id=$2 AND contact_id=ANY($3::varchar[])) LIMIT 1`,[s.source,s.account,[s.canonical,s.source]])).rows.length) blocked.push('foreign_snapshot');
    } else if (json && c.table_name === 'contacts') {
      if ((await client.query(`SELECT 1 FROM ${table} WHERE ${predicate} AND id<>ALL($2::varchar[]) LIMIT 1`,[s.source,[s.canonical,s.source]])).rows.length) blocked.push('unhandled_contact_snapshot');
    } else blocked.push('unhandled_reference:' + c.table_name + '.' + c.column_name);
  }
  // No consent or delivery record may be moved, rewritten or duplicated.
  // Canonical commerce records are left untouched, including suppressed intents.
  const jobs = (await client.query('SELECT status FROM no_reply_jobs WHERE contact_id=$1',[s.source])).rows;
  if (jobs.some(j => !terminalJobs.has(j.status))) blocked.push('active_no_reply_job');
  const fences = (await client.query('SELECT * FROM automation_send_dedup WHERE contact_id=$1 ORDER BY dedup_key',[s.source])).rows;
  const aliases = fences.map(f => {
    const parts = f.dedup_key.split(':');
    if (f.user_id !== s.account || !['completed','skipped'].includes(f.status) ||
      !['wf_msg_tpl','wf_msg_tpl_meta'].includes(parts[0]) || parts[3] !== s.source) fail('unsupported_send_fence');
    parts[3] = s.canonical;
    return { ...f, dedup_key: parts.join(':'), contact_id: s.canonical };
  });
  for (const alias of aliases) {
    const collision = (await client.query('SELECT * FROM automation_send_dedup WHERE dedup_key=$1',[alias.dedup_key])).rows[0];
    if (collision && (collision.user_id !== s.account || collision.contact_id !== s.canonical || !['completed','skipped'].includes(collision.status))) blocked.push('dedup_collision');
  }
  const digest = hash({s,people,owner,installations,columns,fks,refs,ledger,jobs,fences,aliases,blocked});
  return { digest, blocked: [...new Set(blocked)], refs, changes, aliases,
    summary: { canonical: 'A', retainedSource: 'B (neutral paused shell)', deleteContacts: false, consentWrites: false,
      commerceWrites: false, phone: 'existing verified WhatsApp identity normalized to E.164',
      restrictionsPreserved: true, additionalSendFences: aliases.length } };
}

export async function preview(client: Client, scope: Scope, privacySecret: string) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try { return await inspect(client,scope,privacySecret); }
  catch (error) { throw sanitized(error); }
  finally { await client.query('ROLLBACK'); }
}

