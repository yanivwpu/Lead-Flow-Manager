// LOCAL disposable database only; never a staging/production migration runner.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
const target=process.env.SHOPIFY_TEST_DATABASE_URL;
assert.ok(target);const url=new URL(target);
assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
assert.equal(url.pathname,'/whachat_shopify_test');
const pool=new Pool({connectionString:target});
const migrations=['0082_shopify_onboarding_emails.sql','0084_shopify_shop_trials.sql',
  '0104_shopify_contact_privacy.sql','0105_shopify_privacy_automation.sql','0106_shopify_privacy_alert_email.sql'];
try {
  assert.equal((await pool.query("SELECT to_regclass('public.users') AS existing")).rows[0].existing,null,
    'Refuse an existing public users table');
  await pool.query(`CREATE TABLE users(id varchar PRIMARY KEY,email text,shopify_shop text,
    shopify_installed_at timestamp,trial_started_at timestamp,trial_ends_at timestamp,trial_plan text)`);
  await pool.query(`INSERT INTO users VALUES
    ('dated','dated@example.invalid','dated.myshopify.com','2026-01-01','2026-01-01','2026-01-15','pro_ai'),
    ('unknown','unknown@example.invalid','unknown.myshopify.com','2026-01-01',NULL,NULL,NULL),
    ('conflict1','c1@example.invalid','conflict.myshopify.com','2026-01-01','2026-01-01','2026-01-15','pro_ai'),
    ('conflict2','c2@example.invalid','conflict.myshopify.com','2026-01-02','2026-01-02','2026-01-16','pro_ai')`);
  for (const file of migrations) {
    await pool.query(readFileSync('migrations/'+file,'utf8'));
    await pool.query(readFileSync('migrations/'+file,'utf8'));
  }
  assert.equal((await pool.query("SELECT status FROM shopify_shop_trials WHERE canonical_shop='dated.myshopify.com'")).rows[0].status,'backfilled');
  assert.equal((await pool.query("SELECT status FROM shopify_shop_trials WHERE canonical_shop='unknown.myshopify.com'")).rows[0].status,'blocked_unknown_history');
  assert.equal((await pool.query("SELECT status FROM shopify_shop_trials WHERE canonical_shop='conflict.myshopify.com'")).rows[0].status,'blocked_conflict');
  await pool.query("INSERT INTO users(id,email,shopify_shop,shopify_installed_at) VALUES('new','new@example.invalid','new.myshopify.com',NOW())");
  await pool.query("INSERT INTO shopify_privacy_erasure_tasks(id,deadline_at) VALUES('fixture','2026-12-01')");
  await pool.query("INSERT INTO shopify_privacy_customer_locks(identity_hash) VALUES('fixture-suppression')");
  await pool.query("INSERT INTO shopify_privacy_alerts(id,task_id,reason,status,action_code,resolved_at) VALUES('old','fixture','access_request','blocked','access_request',NOW())");
  const before=(await pool.query('SELECT * FROM shopify_shop_trials ORDER BY canonical_shop')).rows;
  await pool.query("INSERT INTO shopify_privacy_alerts(id,task_id,reason,status,action_code) VALUES('active','fixture','access_request','blocked','access_request')");
  for (const file of migrations) await pool.query(readFileSync('migrations/'+file,'utf8'));
  assert.equal((await pool.query("SELECT deadline_at::text d FROM shopify_privacy_erasure_tasks WHERE id='fixture'")).rows[0].d,'2026-12-01 00:00:00');
  assert.equal((await pool.query('SELECT count(*)::int n FROM shopify_privacy_customer_locks')).rows[0].n,1);
  assert.deepEqual((await pool.query("SELECT * FROM shopify_shop_trials WHERE canonical_shop<>'new.myshopify.com' ORDER BY canonical_shop")).rows,before);
  assert.equal((await pool.query("SELECT shopify_welcome_email_sent_at FROM users WHERE id='new'")).rows[0].shopify_welcome_email_sent_at,null);
  assert.equal((await pool.query('SELECT count(*)::int n FROM shopify_privacy_alerts')).rows[0].n,2);
  console.log(JSON.stringify({gate:'local-migration-fixture',ordered:migrations,fullReplay:true,
    legacyTrialsPreserved:true,suppressionPreserved:true,deadlinePreserved:true,
    resolvedAndActiveAlertsPreserved:true,newMerchantNotRestamped:true}));
} finally {await pool.end();}
