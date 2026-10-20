import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {parseSignedRecoveryReceipt,applySignedRecoveryReceiptQuery} from '../server/ecommerce/checkoutRecoveryMetaReceipts';
import {recoveryPhoneDigest} from '../server/ecommerce/checkoutRecoveryMessagingEligibility';
const secret='r'.repeat(40),shop='store.myshopify.com',other='other.myshopify.com';
const msg='wamid.HBgLMjI0MzQ1Njc4OTAA';
test('PostgreSQL: signed receipts are monotonic, replay safe, recipient and tenant scoped with no resend',async()=>{
 const url=process.env.ECOMMERCE_TEST_DATABASE_URL||process.env.SHOPIFY_TEST_DATABASE_URL;
 if(!url)throw Error('recovery_receipts_postgres_required');
 const schema='ecommerce_recovery_receipts_test';
 const client=new Client({connectionString:url});await client.connect();
 try{
   await client.query('BEGIN');
   await client.query('CREATE SCHEMA '+schema);
   await client.query('SET LOCAL search_path='+schema);
   for(const file of [
     'migrations/20261020_ecommerce_abandoned_checkout_observations.sql',
     'migrations/20261020_ecommerce_checkout_recovery_intents.sql',
     'migrations/20261020_ecommerce_whatsapp_recovery_delivery.sql',
     'migrations/20261020_ecommerce_recovery_meta_receipts.sql',
   ])await client.query(await readFile(file,'utf8'));
   await client.query('COMMIT');
   await client.query('SET search_path='+schema);
   const db=drizzle(client);
   async function seed(account:string,store:string,id:string,contact:string,customer:string,wamid:string){
     const gid='gid://shopify/AbandonedCheckout/'+id;
     await client.query("INSERT INTO ecommerce_abandoned_checkout_observations(account_id,shop,checkout_gid,last_activity_at,next_review_at) VALUES($1,$2,$3,NOW(),NOW())",[account,store,gid]);
     const intent=await client.query("INSERT INTO ecommerce_checkout_recovery_intents(account_id,shop,checkout_gid,status,verified_at) VALUES($1,$2,$3,'ready',NOW()) RETURNING id",[account,store,gid]);
     await client.query("INSERT INTO ecommerce_whatsapp_recovery_consents(account_id,shop,contact_id,shopify_customer_gid,evidence_source,recipient_hmac,granted_at) VALUES($1,$2,$3,$4,'verified_whatsapp_explicit_opt_in',$5,NOW())",[
       account,store,contact,'gid://shopify/Customer/'+customer,recoveryPhoneDigest(secret,'+15551234567')
     ]);
     await client.query("INSERT INTO ecommerce_checkout_recovery_outbox(intent_id,account_id,shop,checkout_gid,contact_id,template_id,state,claim_token,claimed_at,provider_message_id) VALUES($1,$2,$3,$4,$5,'tpl','accepted',gen_random_uuid(),NOW()-INTERVAL '1 minute',$6)",[
       intent.rows[0].id,account,store,gid,contact,wamid
     ]);
   }
   await seed('tenant-a',shop,'123','contact-a','456',msg);
   await seed('tenant-b',other,'124','contact-b','457','wamid.DifferentProvider987');
   const now=Date.now(),candidate={signatureValid:true,hasRawBody:true,phoneNumberId:'123456789012345',
     messageId:msg,recipientId:'15551234567',status:'sent',timestamp:String(Math.floor(now/1000))};
   const run=async(account:string,store:string,status:string,recipientId='15551234567')=>{
     const receipt=parseSignedRecoveryReceipt({...candidate,status,recipientId},secret,now)!;
     return db.execute(applySignedRecoveryReceiptQuery({accountId:account,shop:store,receipt}));
   };
   assert.equal((await run('tenant-b',other,'delivered')).rows.length,0,'wrong owner cannot consume status');
   assert.equal((await run('tenant-a',shop,'sent','15559990000')).rows.length,0,'different recipient cannot consume status');
   assert.equal((await run('tenant-a',shop,'sent')).rows.length,1);
   assert.equal((await run('tenant-a',shop,'sent')).rows.length,0,'exact webhook replay ignored');
   assert.equal((await run('tenant-a',shop,'read')).rows.length,1,'read is allowed to jump over delivered');
   assert.equal((await run('tenant-a',shop,'delivered')).rows.length,0,'late delivery cannot downgrade read');
   assert.equal((await run('tenant-a',shop,'failed')).rows.length,0,'read is terminal');
   const one=await client.query("SELECT state,meta_delivery_status FROM ecommerce_checkout_recovery_outbox WHERE account_id='tenant-a'");
   assert.deepEqual(one.rows,[{state:'accepted',meta_delivery_status:'read'}]);
   const otherState=await client.query("SELECT meta_delivery_status FROM ecommerce_checkout_recovery_outbox WHERE account_id='tenant-b'");
   assert.equal(otherState.rows[0].meta_delivery_status,null);
   // Provider failure is terminal receipt metadata, never a new outbox send.
   await client.query("UPDATE ecommerce_checkout_recovery_outbox SET meta_delivery_status=NULL,meta_delivery_at=NULL WHERE account_id='tenant-a'");
   assert.equal((await run('tenant-a',shop,'failed')).rows.length,1);
   assert.equal((await run('tenant-a',shop,'sent')).rows.length,0);
   const final=await client.query("SELECT state,meta_delivery_status FROM ecommerce_checkout_recovery_outbox WHERE account_id='tenant-a'");
   assert.deepEqual(final.rows,[{state:'accepted',meta_delivery_status:'failed'}]);
   const count=await client.query('SELECT count(*)::int AS n FROM ecommerce_checkout_recovery_outbox');
   assert.equal(count.rows[0].n,2);
 }finally{
   await client.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE').catch(()=>{});
   await client.end();
 }
});
