/** Run from an independently monitored scheduler with a least-privilege readonly URL.
 * Exit 0: queue has no intervention signals; 1: intervention; 2: probe unavailable.
 * No mail, provider calls, schema changes, task processing or completion receipts.
 */
import { Pool } from 'pg';
import { inspectPrivacyQueue } from '../server/shopifyPrivacyMonitoring';
const target=process.env.SHOPIFY_PRIVACY_MONITOR_DATABASE_URL;
if (!target) {
  console.error(JSON.stringify({event:'privacy_monitor_unavailable',code:'missing_readonly_connection'}));
  process.exitCode=2;
} else {
  const pool=new Pool({connectionString:target,connectionTimeoutMillis:10000,max:1});
  try {
    const status=await inspectPrivacyQueue(pool);
    console.log(JSON.stringify({event:'privacy_queue_monitor',checkedAt:new Date().toISOString(),...status}));
    if (!status.ok) process.exitCode=1;
  } catch {
    console.error(JSON.stringify({event:'privacy_monitor_unavailable',code:'probe_failed'}));
    process.exitCode=2;
  } finally {await pool.end();}
}
