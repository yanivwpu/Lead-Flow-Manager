// Standalone operator CLI. No dotenv, app bootstrap, workers, routes or sender imports.
import { readFile } from 'node:fs/promises';
import { consumeDispatch, savePrivateReceipt, savePrivateSelection } from './checkout-validation/private-files';
import { bootstrapAdminPreflight, assertBootstrapCommand } from './checkout-validation/admin-bootstrap';
import { resolve } from 'node:path';
import { railwayCartDirectory, railwayCheckoutModeAllowed } from './checkout-validation/railway-guard';
import { resolveReadOnlyCheckoutInstallation } from './checkout-validation/read-only-installation';
import { fileURLToPath } from 'node:url';
import { runValidation, SHOP, META } from './checkout-validation/harness';
import { SHOPIFY_INVENTORY_BATCH_QUERY } from '../server/salesCatalog/shopify/inventory';
import { createCatalogRequest } from '../server/salesCatalog/shopify/api';

let preflightStage: 'command' | 'volume' | 'database_config' | 'database_connect' | 'database_transaction' | 'admin_bootstrap' | 'selection_saved' = 'command';
async function main() {
  const [mode, selectionPath, approvalPath, ...extra] = process.argv.slice(2);
  if(mode==='--bootstrap-preflight') {
    assertBootstrapCommand(process.argv.slice(2));
    preflightStage='volume';
    const directory=await railwayCartDirectory();
    preflightStage='database_config';
    const connectionString=process.env.CHECKOUT_TEST_READONLY_DATABASE_URL;
    if(!connectionString) throw Error('readonly_database_required');
    const {Client}=await import('pg');
    const {drizzle}=await import('drizzle-orm/node-postgres');
    const client=new Client({connectionString,connectionTimeoutMillis:10000,statement_timeout:15000});
    try {
      preflightStage='database_connect';
      await client.connect();
      preflightStage='database_transaction';
      await client.query('BEGIN READ ONLY');
      preflightStage='admin_bootstrap';
      const result=await bootstrapAdminPreflight({database:drizzle(client),requestFetch:fetch,env:process.env,
        saveSelection:async selection=>{preflightStage='selection_saved';await savePrivateSelection(directory,selection);}});
      console.log(JSON.stringify(result));
    } finally {await client.query('ROLLBACK').catch(()=>{});await client.end();}
    return;
  }
  if (!['--preflight','--create-one-cart'].includes(mode) || !selectionPath || extra.length ||
      (mode==='--create-one-cart')!==!!approvalPath || process.env.CI || !railwayCheckoutModeAllowed(mode))
    throw Error('operator_command_required');
  const selection = JSON.parse(await readFile(selectionPath,'utf8'));
  const approval = approvalPath ? JSON.parse(await readFile(approvalPath,'utf8')) : undefined;
  const connectionString = process.env.CHECKOUT_TEST_READONLY_DATABASE_URL;
  if (!connectionString) throw Error('readonly_database_required');
  const { Client } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const client = new Client({connectionString,connectionTimeoutMillis:10000,statement_timeout:15000});
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const database = drizzle(client);
    // Fixed per-checkout directory; no per-run nonce that could silently bypass the one-shot claim.
    const directory = await railwayCartDirectory();
    const result = await runValidation(selection,{
      approval,
      installation:()=>resolveReadOnlyCheckoutInstallation(database,selection.userId,SHOP),
      requestFor:(shop,token)=>createCatalogRequest({request:async(query,options)=>{
        if (shop!==SHOP || ![META,SHOPIFY_INVENTORY_BATCH_QUERY].includes(query)) throw Error('admin_read_not_allowed');
        const response = await fetch(`https://${SHOP}/admin/api/2026-01/graphql.json`,{
          method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
          headers:{'Content-Type':'application/json','X-Shopify-Access-Token':token},
          body:JSON.stringify({query,variables:options?.variables}),
        });
        if (!response.ok || response.headers.get('x-shopify-api-version')!=='2026-01') throw Error('admin_unavailable');
        return response.json();
      }}),
      storefrontFetch:fetch,
      consume:()=>consumeDispatch(directory),
      saveReceipt:receipt=>savePrivateReceipt(directory,receipt),
    });
    console.log(JSON.stringify(result));
  } finally {await client.query('ROLLBACK').catch(()=>{});await client.end();}
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(()=>{console.error(JSON.stringify({result:'preflight_or_validation_failed_closed',stage:preflightStage,selectionSha256:null}));process.exitCode=1;});

