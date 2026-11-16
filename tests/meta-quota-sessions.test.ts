import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Pool, types } from 'pg';
// Production SQL explicitly returns UTC timestamptz; fixture timestamps are UTC too.
types.setTypeParser(1114, value => new Date(value + 'Z'));
import { resolveUsagePeriodFromDates } from '../shared/usagePeriod';
// Explicit disposable local DB only. Never reads DATABASE_URL.
const url = process.env.META_QUOTA_TEST_DATABASE_URL;
assert.ok(url, 'Set META_QUOTA_TEST_DATABASE_URL to a disposable localhost database');
const parsed = new URL(url);
assert.ok(['localhost','127.0.0.1'].includes(parsed.hostname));
assert.equal(parsed.pathname, '/meta_quota_test');
const pool = new Pool({ connectionString: url, max: 12 });
const schema = 'quota_' + process.pid;
await pool.query(`CREATE SCHEMA ${schema}`);
const q = async (sql: string, values: any[] = []) => {
  const c = await pool.connect();
  try { await c.query(`SET search_path TO ${schema}`); return await c.query(sql, values); }
  finally { c.release(); }
};
try {
  await q(`CREATE TABLE users(id varchar PRIMARY KEY, current_period_start timestamp, current_period_end timestamp, monthly_conversations int DEFAULT 19);
    CREATE TABLE contacts(id varchar PRIMARY KEY, user_id varchar, whatsapp_id text, phone text, facebook_id text, instagram_id text);
    CREATE TABLE conversations(id varchar PRIMARY KEY, user_id varchar, contact_id varchar, channel text, channel_account_id text, window_expires_at timestamp);
    CREATE TABLE messages(id varchar PRIMARY KEY, user_id varchar, contact_id varchar, conversation_id varchar, direction text, external_message_id text, status text DEFAULT 'delivered', created_at timestamp DEFAULT (now() AT TIME ZONE 'UTC'), UNIQUE(user_id, external_message_id));`);
  await q(readFileSync('migrations/20261116_meta_quota_sessions.sql','utf8'));
  await q(`INSERT INTO users(id) VALUES ('u'),('v');
    INSERT INTO contacts VALUES ('p','u','+15551234567',null,'fb1','ig1'), ('same','u','15551234567',null,null,null),('v','v','15551234567',null,null,null);
    INSERT INTO conversations VALUES ('wa','u','p','whatsapp','number1',null),('wa2','u','same','whatsapp','number2',null),('web','u','p','webchat',null,null),('fb','u','p','facebook',null,null),('ig','u','p','instagram',null,null),('v','v','v','whatsapp',null,null);`);
  let seq=0;
  const msg = (conv='wa', direction='inbound', external?: string, workspace='u', contact='p') => q('INSERT INTO messages(id,user_id,contact_id,conversation_id,direction,external_message_id) VALUES ($1,$2,$3,$4,$5,$6)', ['m'+(++seq),workspace,contact,conv,direction,external ?? 'event'+seq]);
  const count=async()=> Number((await q('SELECT count(*) FROM meta_quota_sessions')).rows[0].count);
  await msg('wa','outbound'); assert.equal(await count(),0,'template alone');
  await msg(); assert.equal(await count(),1,'reply to template / first inbound');
  const expiry = (await q("SELECT expires_at FROM meta_quota_sessions WHERE user_id='u'")).rows[0].expires_at;
  await Promise.all(Array.from({length:20},()=>msg())); assert.equal(await count(),1,'concurrent repeats');
  assert.equal((await q("SELECT expires_at FROM meta_quota_sessions WHERE user_id='u'")).rows[0].expires_at.getTime(),expiry.getTime(),'fixed, not sliding');
  await msg('wa2','inbound',undefined,'u','same'); assert.equal(await count(),1,'same customer across two numbers');
  await msg('web'); await msg('web','outbound'); assert.equal(await count(),1,'website and chatbot excluded');
  await msg('fb'); await msg('ig'); assert.equal(await count(),3,'separate Meta channels');
  await Promise.all(Array.from({length:20},()=>msg('v','inbound',undefined,'v','v'))); assert.equal(await count(),4,'workspace isolation');
  await msg('wa','inbound','duplicate');
  const results=await Promise.allSettled([msg('wa','inbound','race'),msg('wa','inbound','race')]);
  assert.equal(results.filter(r=>r.status==='rejected').length,1,'unique provider webhook race');
  const before=await count(); await assert.rejects(msg('wa','inbound','duplicate')); assert.equal(await count(),before);
  // Replay after message deletion still has a durable provider-event receipt.
  await q("DELETE FROM messages WHERE external_message_id='duplicate'");
  await msg('wa','inbound','duplicate'); assert.equal(await count(),before);
  // Move only fixture timestamps; never a production backfill/reset.
  await q("UPDATE meta_quota_sessions SET started_at=started_at-interval '25 hours', expires_at=expires_at-interval '25 hours' WHERE channel='whatsapp' AND user_id='u'");
  await Promise.all(Array.from({length:20},()=>msg())); assert.equal(await count(),before+1,'new session on existing thread after expiry');
  await assert.rejects(msg('wa','inbound','duplicate')); assert.equal(await count(),before+1,'old replay after expiry');
  assert.equal(resolveUsagePeriodFromDates(new Date('2026-01-31T00:00:00Z'),new Date('2027-01-31T00:00:00Z'),new Date('2026-03-30T00:00:00Z')).periodStart.toISOString(),'2026-02-28T00:00:00.000Z','annual billing preserves day anchor');
  // No period-boundary split: open sessions carry over without incrementing new period.
  await q("UPDATE meta_quota_sessions SET period_start='2000-01-01' WHERE channel='whatsapp' AND user_id='u'");
  await msg(); assert.equal(await count(),before+1,'open session survives renewal / month boundary');
  const periodCases=[
    [null,null,'2026-12-01T00:00:00Z'],
    ['2026-11-16T00:00:00Z','2026-12-16T00:00:00Z','2026-11-20T00:00:00Z'],
    ['2026-01-31T00:00:00Z','2027-01-31T00:00:00Z','2026-03-30T00:00:00Z'],
    ['2026-11-01T00:00:00Z','2026-12-01T00:00:00Z','2026-12-01T00:00:00Z'],
    ['2026-12-10T00:00:00Z','2027-01-10T00:00:00Z','2026-11-01T00:00:00Z'],
  ];
  for (const [s,e,n] of periodCases) {
    const row=(await q('SELECT meta_quota_period_start($1,$2,$3) p',[s,e,n])).rows[0];
    const expected=resolveUsagePeriodFromDates(s ? new Date(s):null,e?new Date(e):null,new Date(n!));
    assert.equal(new Date(row.p).getTime(),expected.periodStart.getTime(),'SQL/JS period parity');
  }
  for (const channel of ['sms','telegram','email','shopify','woocommerce','calendly']) {
    await q('INSERT INTO conversations(id,user_id,contact_id,channel) VALUES ($1,$2,$3,$4)',[channel,'u','p',channel]);
    await msg(channel);
  }
  assert.equal(await count(),before+1,'all non-Meta channels excluded');
  await q("UPDATE meta_quota_sessions SET started_at=started_at-interval '25 hours',expires_at=expires_at-interval '25 hours' WHERE user_id='v'");
  await q("INSERT INTO messages(id,user_id,contact_id,conversation_id,direction,external_message_id,status) VALUES ('failed-status','v','v','v','inbound','failed-status','failed')");
  assert.equal(await count(),before+1,'failed event never starts a session');
  // Trial expiry changes allowance, never sessions or legacy history.
  assert.equal((await q("SELECT monthly_conversations FROM users WHERE id='u'")).rows[0].monthly_conversations,19);
  const sessionBefore=await count(); await q("UPDATE users SET current_period_start=null,current_period_end=null WHERE id='u'"); await msg(); assert.equal(await count(),sessionBefore);
  const c=await pool.connect();
  try {await c.query(`SET search_path TO ${schema}`); await c.query('BEGIN');
    await c.query("INSERT INTO contacts VALUES ('failed','u','999',null,null,null)");
    await c.query("INSERT INTO conversations VALUES ('failed','u','failed','whatsapp',null,null)");
    await c.query("INSERT INTO messages(id,user_id,contact_id,conversation_id,direction,external_message_id) VALUES ('failed','u','failed','failed','inbound','failed')");
    await c.query('ROLLBACK');
  } finally {c.release();}
  assert.equal(await count(),sessionBefore,'failed transaction has no quota');
  assert.equal((await q('SELECT count(*) FROM conversations')).rows[0].count,'12','thread histories preserved');
  // Exercise the real subscription ledger reader and both cutover controls.
  const appUrl = new URL(url!);
  appUrl.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = appUrl.toString();
  const { getMetaQuotaSummary } = await import('../server/metaQuota');
  const { db } = await import('../drizzle/db');
  try {
    const period = resolveUsagePeriodFromDates(null,null).periodStart;
    delete process.env.META_QUOTA_ENFORCEMENT;
    const shadow = await getMetaQuotaSummary('u',period);
    assert.equal(shadow.available,true); assert.equal(shadow.enforced,false);
    process.env.META_QUOTA_ENFORCEMENT='true';
    assert.equal((await getMetaQuotaSummary('u',period)).enforced,false,'flag alone cannot adopt partial coverage');
    await assert.rejects(q("UPDATE meta_quota_rollout SET enforce_from=now() WHERE user_id='u'"),'review required');
    await q("UPDATE meta_quota_rollout SET tracking_started_at=$1::timestamp-interval '40 days',reviewed_at=now(),enforce_from=$1 WHERE user_id='u'",[period.toISOString()]);
    const active = await getMetaQuotaSummary('u',period);
    assert.equal(active.enforced,true); assert.equal(active.sessions,shadow.sessions);
    assert.equal((await q("SELECT monthly_conversations FROM users WHERE id='u'")).rows[0].monthly_conversations,19);
    const { subscriptionService } = await import('../server/subscriptionService');
    const getLimits = subscriptionService.getUserLimits;
    subscriptionService.getUserLimits = async () => ({ isAtLimit:true } as any);
    try { assert.equal((await subscriptionService.canSendMessage('u')).allowed,true,'quota never blocks a valid reply'); }
    finally {subscriptionService.getUserLimits=getLimits;}
  } finally { await db.$client.end(); delete process.env.META_QUOTA_ENFORCEMENT; }
  console.log('Fixture reconciliation', (await q('SELECT (SELECT count(*)::int FROM meta_quota_sessions) sessions, (SELECT count(*)::int FROM meta_quota_events) receipts')).rows[0]);
  console.log('Meta quota: templates, fixed expiry, concurrent messages, duplicate webhooks, exclusions, multi-number/workspace, renewal/monthly/trial boundaries, rollback, period parity PASS');
} finally { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); }
