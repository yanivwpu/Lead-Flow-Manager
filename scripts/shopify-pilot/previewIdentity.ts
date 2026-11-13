/** Read-only entry point. Deliberately no apply option or production write URL. */
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { preview, PILOT_ACCOUNT, PILOT_SHOP } from './reconcileIdentity';

export async function previewFromEnvironment(env: NodeJS.ProcessEnv) {
  if (!env.PILOT_IDENTITY_READ_ONLY_DATABASE_URL || !env.PILOT_IDENTITY_CANONICAL_CONTACT_ID ||
    !env.PILOT_IDENTITY_SOURCE_CONTACT_ID || !env.SHOPIFY_API_SECRET) throw Error('explicit_read_only_target_and_pair_required');
  const pool = new Pool({connectionString:env.PILOT_IDENTITY_READ_ONLY_DATABASE_URL,max:1,connectionTimeoutMillis:5000});
  let client;
  try {
    client = await pool.connect();
    await client.query("SET statement_timeout='10s'");
    const result = await preview(client,{account:PILOT_ACCOUNT,shop:PILOT_SHOP,
      canonical:env.PILOT_IDENTITY_CANONICAL_CONTACT_ID,source:env.PILOT_IDENTITY_SOURCE_CONTACT_ID},env.SHOPIFY_API_SECRET);
    // Raw proposed contact patches contain retained history/identity. Never log them.
    return {mode:'read_only',readyForSeparateApproval:result.blocked.length===0,digest:result.digest,
      blockers:result.blocked,references:result.refs,proposal:result.summary,
      canonicalFields:Object.keys(result.changes.canonical),sourceFields:Object.keys(result.changes.source)};
  } finally {client?.release();await pool.end();}
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (process.argv.length !== 2) {console.error('Read-only preview accepts no command-line arguments.');process.exitCode=1;}
  else try {console.log(JSON.stringify(await previewFromEnvironment(process.env),null,2));}
  catch {console.error('Identity preview unavailable; no records changed. Verify the explicit read-only target and approved pair privately.');process.exitCode=1;}
}
