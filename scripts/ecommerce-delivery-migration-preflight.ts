/** Read-only preflight. This script has deliberately NO apply/migrate mode. */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Pool} from 'pg';
import {PgDialect} from 'drizzle-orm/pg-core';
import {postPurchaseDeliveryReadinessQuery} from '../server/ecommerce/postPurchaseDeliveryReadiness';

export const DELIVERY_MIGRATIONS=[
  '20261020_ecommerce_whatsapp_recovery_delivery.sql',
  '20261020_ecommerce_recovery_signed_inbound_consent.sql',
  '20261020_ecommerce_recovery_meta_receipts.sql',
  '20261028_ecommerce_recovery_provider_attempt.sql',
  '20261030_ecommerce_post_purchase_intents.sql',
  '20261030_ecommerce_post_purchase_delivery_fence.sql',
] as const;
export async function deliveryMigrationManifest(){
  return Promise.all(DELIVERY_MIGRATIONS.map(async name=>({name,
    sha256:createHash('sha256').update(await readFile(new URL('../migrations/'+name,import.meta.url))).digest('hex'),
  })));
}
export async function deliveryMigrationPreflight(connectionString:string){
  if(!connectionString)throw Error('ECOMMERCE_MIGRATION_PREFLIGHT_DATABASE_URL_required');
  const url=new URL(connectionString);
  if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('postgres_url_required');
  const pool=new Pool({connectionString,max:1,connectionTimeoutMillis:5000});
  let client;
  try{
    client=await pool.connect();
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout='5s'");
    const version=await client.query("SELECT current_setting('server_version_num')::int AS version, current_setting('transaction_read_only') AS read_only");
    const q=new PgDialect().sqlToQuery(postPurchaseDeliveryReadinessQuery);
    const result=await client.query(q.sql,q.params);
    const prerequisites=await client.query(`SELECT
      to_regclass('users') IS NOT NULL AS users,
      to_regclass('contacts') IS NOT NULL AS contacts,
      to_regclass('integrations') IS NOT NULL AS integrations,
      to_regclass('message_templates') IS NOT NULL AS templates,
      to_regclass('ecommerce_growth_event_inbox') IS NOT NULL AS inbox`);
    return {mode:'read_only',automaticApply:false,messagingAuthorized:false,
      postgresVersion:version.rows[0].version,transactionReadOnly:version.rows[0].read_only==='on',
      prerequisites:prerequisites.rows[0],postPurchase:result.rows[0],migrations:await deliveryMigrationManifest()};
  }finally{
    if(client){try{await client.query('ROLLBACK');}finally{client.release();}}
    await pool.end();
  }
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  try{console.log(JSON.stringify(await deliveryMigrationPreflight(process.env.ECOMMERCE_MIGRATION_PREFLIGHT_DATABASE_URL||''),null,2));}
  catch{console.error('Delivery preflight unavailable; no migration applied. Verify the explicit target and read-only access.');process.exitCode=1;}
}
