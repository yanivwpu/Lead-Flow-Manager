import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { inspectPrivacyQueue } from '../server/shopifyPrivacyMonitoring';

test('read-only privacy probe detects deadline, stalled work, missing delivery and reconciliation without mutation',async () => {
  const target=process.env.SHOPIFY_TEST_DATABASE_URL;assert.ok(target,'Explicit local disposable PostgreSQL required');
  const url=new URL(target);assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
  assert.equal(url.pathname,'/whachat_shopify_test');
  const namespace='privacy_monitor_'+randomBytes(8).toString('hex');
  const admin=new Pool({connectionString:target});
  await admin.query('CREATE SCHEMA '+namespace);
  url.searchParams.set('options','-c search_path='+namespace);
  const pool=new Pool({connectionString:url.toString()});
  try {
    await pool.query(`CREATE TABLE shopify_privacy_erasure_tasks(id text PRIMARY KEY,completed_at timestamp,
      deadline_at timestamp,status text,request_kind text,next_attempt_at timestamp,lease_expires_at timestamp);
      CREATE TABLE shopify_privacy_alerts(id text PRIMARY KEY,task_id text,resolved_at timestamp,
      email_reconciliation_required boolean,created_at timestamp,email_accepted_at timestamp)`);
    assert.equal((await inspectPrivacyQueue(pool)).ok,true);
    await pool.query(`INSERT INTO shopify_privacy_erasure_tasks VALUES
      ('overdue',NULL,NOW()-interval '1 day','blocked','access_request',NOW(),NULL),
      ('soon',NULL,NOW()+interval '2 days','pending_external','store_erasure',NOW(),NULL),
      ('stalled',NULL,NOW()+interval '10 days','retrying','store_erasure',NOW()-interval '20 minutes',NULL),
      ('done',NOW(),NOW()-interval '1 day','verified_complete','store_erasure',NOW(),NULL);
      INSERT INTO shopify_privacy_alerts VALUES
      ('delivery','overdue',NULL,false,NOW()-interval '20 minutes',NULL),
      ('reconcile','soon',NULL,true,NOW(),NULL),
      ('resolved','done',NOW(),true,NOW()-interval '1 day',NULL)`);
    const before=(await pool.query('SELECT * FROM shopify_privacy_erasure_tasks ORDER BY id')).rows;
    const result=await inspectPrivacyQueue(pool);assert.equal(result.ok,false);
    assert.equal(result.tasks.pending,3);assert.equal(result.tasks.overdue,1);
    assert.equal(result.tasks.approaching_deadline,1);assert.equal(result.tasks.intervention,1);
    assert.equal(result.tasks.stalled,1);assert.equal(result.alerts.delivery_stalled,1);
    assert.equal(result.alerts.reconciliation,1);assert.equal(result.workerLiveness,'unverified');
    assert.equal(result.operatorAcknowledgment,'unverified');
    assert.deepEqual((await pool.query('SELECT * FROM shopify_privacy_erasure_tasks ORDER BY id')).rows,before);
    assert.equal('id' in result.tasks,false);assert.equal('taskId' in result.alerts,false);
    await pool.query('DROP TABLE shopify_privacy_alerts');
    await assert.rejects(() => inspectPrivacyQueue(pool));
  } finally {await pool.end();await admin.query('DROP SCHEMA '+namespace+' CASCADE');await admin.end();}
});
