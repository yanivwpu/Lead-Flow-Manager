/** Read-only entry point. Deliberately no apply option or production write URL. */
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { preview, PILOT_ACCOUNT, PILOT_SHOP } from './identityPreview';
import { requireReadOnlyRole } from './readOnlyRole';

export function sanitizedPreview(result: Awaited<ReturnType<typeof preview>>) {
  if (!/^[a-f0-9]{64}$/.test(result.digest)) throw Error('invalid_preview_result');
  const blockers = [...new Set([...result.blocked.map(code => code.split(':')[0]),
    ...(result.changes.restricted || result.changes.canonical.automations_paused ? ['recipient_restricted'] : [])])];
  if (blockers.some(code => !/^[a-z_]+$/.test(code))) throw Error('invalid_preview_result');
  const references = result.refs.map(ref => {
    if (!/^[a-z_][a-z0-9_]*$/.test(ref.table) || !/^[a-z_][a-z0-9_]*$/.test(ref.column) || !Number.isSafeInteger(ref.count) || ref.count<0)
      throw Error('invalid_preview_result');
    return {table:ref.table,column:ref.column,count:ref.count};
  });
  return {digest:result.digest,blockers,references};
}

export function sanitizedFailure(error: unknown) {
  const safe = new Set(['explicit_read_only_target_and_pair_required','neon_read_only_binding_required','read_only_database_role_required',
    'scope','privacy_key_required','missing_contact','ownership','shopify_metadata_conflict','source_shopify_identity',
    'phone_identity','other_channel_identity','installation','ambiguous_owner','delivery_or_installation','third_identity',
    'privacy_locked','unsupported_send_fence']);
  const code=error instanceof Error ? error.message.replace(/^pilot_reconciliation_/,'') : '';
  return {digest:null,blockers:[safe.has(code) ? code : 'preview_unavailable'],references:[]};
}

export async function previewFromEnvironment(env: NodeJS.ProcessEnv) {
  if (!env.PILOT_IDENTITY_READ_ONLY_DATABASE_URL || !env.PILOT_IDENTITY_CANONICAL_CONTACT_ID ||
    !env.PILOT_IDENTITY_SOURCE_CONTACT_ID || !env.SHOPIFY_API_SECRET) throw Error('explicit_read_only_target_and_pair_required');
  const url = new URL(env.PILOT_IDENTITY_READ_ONLY_DATABASE_URL);
  if (!['postgres:','postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech')) throw Error('neon_read_only_binding_required');
  // Require verified TLS rather than accepting URL options that weaken it.
  for (const key of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(key);
  const pool = new Pool({connectionString:url.toString(),ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:5000});
  let client;
  try {
    client = await pool.connect();
    await client.query("SET statement_timeout='10s'");
    await requireReadOnlyRole(client);
    const result = await preview(client,{account:PILOT_ACCOUNT,shop:PILOT_SHOP,
      canonical:env.PILOT_IDENTITY_CANONICAL_CONTACT_ID,source:env.PILOT_IDENTITY_SOURCE_CONTACT_ID},env.SHOPIFY_API_SECRET);
    // Raw proposed contact patches contain retained history/identity. Never log them.
    return sanitizedPreview(result);
  } finally {client?.release();await pool.end();}
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (process.argv.length !== 2) {console.log(JSON.stringify({digest:null,blockers:['arguments_not_allowed'],references:[]}));process.exitCode=1;}
  else try {
    const result=await previewFromEnvironment(process.env);
    console.log(JSON.stringify(result,null,2));
    if (result.blockers.length) process.exitCode=1;
  }
  catch (error) {console.log(JSON.stringify(sanitizedFailure(error)));process.exitCode=1;}
}
