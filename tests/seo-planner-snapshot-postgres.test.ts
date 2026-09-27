/** PostgreSQL MVCC regression for atomic planner metrics + sync-coverage reads. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
import { clusterAndScoreOpportunities } from "../server/seo/opportunityPlanner";

const url=process.env.SEO_TEST_DATABASE_URL;
if(!url){
  console.log("seo-planner-snapshot-postgres.test.ts: skipped (SEO_TEST_DATABASE_URL is not set)");
}else{
  const reader=new pg.Client({connectionString:url}),writer=new pg.Client({connectionString:url}),suffix=crypto.randomBytes(5).toString("hex"),metrics=`seo_snapshot_metrics_${suffix}`,runs=`seo_snapshot_runs_${suffix}`,lockKey=crypto.randomBytes(4).readInt32BE();
  await Promise.all([reader.connect(),writer.connect()]);
  try{
    await writer.query(`CREATE TABLE ${metrics}(period text,impressions int);CREATE TABLE ${runs}(status text);INSERT INTO ${metrics} VALUES('previous',100)`);
    const readerPid=Number((await reader.query("SELECT pg_backend_pid() pid")).rows[0].pid);
    await writer.query("SELECT pg_advisory_lock($1)",[lockKey]);
    const read=reader.query(`WITH metric_snapshot AS MATERIALIZED (SELECT count(*)::int row_count FROM ${metrics}), gate AS MATERIALIZED (SELECT pg_advisory_lock(${lockKey})), coverage AS MATERIALIZED (SELECT EXISTS(SELECT 1 FROM ${runs} WHERE status='success') verified FROM gate) SELECT metric_snapshot.row_count,coverage.verified FROM metric_snapshot CROSS JOIN coverage`);
    for(let attempt=0;attempt<100;attempt++){const state=(await writer.query("SELECT wait_event FROM pg_stat_activity WHERE pid=$1",[readerPid])).rows[0]?.wait_event;if(state==="advisory")break;if(attempt===99)throw new Error("reader did not reach the deterministic advisory-lock gate");await new Promise(resolve=>setTimeout(resolve,10));}
    await writer.query(`INSERT INTO ${metrics} VALUES('current',0);INSERT INTO ${runs} VALUES('success')`);
    await writer.query("SELECT pg_advisory_unlock($1)",[lockKey]);
    const during=(await read).rows[0];
    assert.deepEqual(during,{row_count:1,verified:false},"one SQL statement cannot combine pre-sync metrics with post-sync verified coverage");
    const after=(await reader.query(`SELECT (SELECT count(*)::int FROM ${metrics}) row_count,EXISTS(SELECT 1 FROM ${runs} WHERE status='success') verified`)).rows[0];
    assert.deepEqual(after,{row_count:2,verified:true},"the next statement observes the completed sync consistently");
    const decline=clusterAndScoreOpportunities([],[{query:"verified decline",page:"/page",clicks:10,impressions:100,position:6}]);
    assert.equal(decline[0]?.type,"decline","a completed sync with verified zero current traffic remains a valid decline");
    console.log("seo-planner-snapshot-postgres.test.ts: all assertions passed");
  }finally{
    await writer.query("SELECT pg_advisory_unlock_all()");
    await writer.query(`DROP TABLE IF EXISTS ${metrics},${runs}`);
    await Promise.all([reader.end(),writer.end()]);
  }
}
