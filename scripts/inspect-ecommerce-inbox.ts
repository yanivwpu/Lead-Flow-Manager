/** Read-only E-commerce inbox migration preflight; never migrates or writes. */
import { Client } from 'pg';
const expected=['id','account_id','shop','topic','delivery_id','journey','state','received_at'];
async function main(){
  if(process.argv.slice(2).join(' ')!=='--read-only' ||
    process.env.ECOMMERCE_PREFLIGHT_ACK!=='staging-read-only' ||
    process.env.ECOMMERCE_EVENT_RECORDING_ENABLED==='true')
    throw Error('operator_readonly_guard');
  const connectionString=process.env.ECOMMERCE_PREFLIGHT_DATABASE_URL;
  if(!connectionString) throw Error('database_url_missing');
  const client=new Client({connectionString,connectionTimeoutMillis:10000,statement_timeout:15000});
  await client.connect();
  try{
    await client.query('BEGIN READ ONLY');
    const rows=await client.query(`SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='ecommerce_growth_event_inbox'`);
    const existing=new Set(rows.rows.map(x=>x.column_name as string));
    const hasAll=expected.every(x=>existing.has(x));
    const indexes=await client.query(`SELECT indexdef FROM pg_indexes
       WHERE schemaname='public' AND tablename='ecommerce_growth_event_inbox'`);
    const dedupe=indexes.rows.some(x=>typeof x.indexdef==='string' &&
       x.indexdef.includes('UNIQUE') &&
       ['account_id','shop','topic','delivery_id'].every(col=>x.indexdef.includes(col)));
    console.log(JSON.stringify({result:'ecommerce_inbox_readonly_preflight',
      tablePresent:rows.rowCount!==0,requiredColumnsPresent:hasAll,uniqueDeliveryConstraintPresent:dedupe,
      ready:hasAll&&dedupe}));
  }finally{
    await client.query('ROLLBACK').catch(()=>{});
    await client.end();
  }
}
main().catch(()=>{console.error(JSON.stringify({result:'ecommerce_inbox_readonly_preflight_failed_closed'}));process.exitCode=1;});
