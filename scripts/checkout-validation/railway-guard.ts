import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Fail closed: Railway cart dispatch requires a persistent dedicated volume, not ephemeral container storage. */
export async function railwayCartDirectory(env: NodeJS.ProcessEnv = process.env, mounts?: string) {
  if (!env.RAILWAY_SERVICE_ID) return resolve('work/checkout-validation');
  if (env.RAILWAY_SERVICE_ID !== env.CHECKOUT_TEST_RAILWAY_SERVICE_ID ||
      env.CHECKOUT_TEST_RAILWAY_SERVICE_ID !== 'cd3e14a1-c6a1-4532-8c67-8bc502d5aa07')
    throw Error('railway_service_not_attested');
  const path = '/checkout-one-cart';
  const mountinfo = mounts ?? await readFile('/proc/self/mountinfo','utf8');
  // The volume MUST be mounted at the exact dedicated path; a folder inside an ephemeral image is insufficient.
  if (!mountinfo.split('\n').some(line => line.split(' - ')[0]?.split(' ')[4] === path))
    throw Error('dedicated_persistent_volume_not_mounted');
  return resolve(path,'private-claim');
}

export function railwayCheckoutModeAllowed(mode: string, env: NodeJS.ProcessEnv = process.env) {
  if (!env.RAILWAY_SERVICE_ID) return true;
  if (env.RAILWAY_SERVICE_ID !== env.CHECKOUT_TEST_RAILWAY_SERVICE_ID ||
      env.CHECKOUT_TEST_RAILWAY_SERVICE_ID !== 'cd3e14a1-c6a1-4532-8c67-8bc502d5aa07')
    return false;
  return mode === '--preflight' ? env.CHECKOUT_TEST_PHASE === 'PREFLIGHT' :
    mode === '--create-one-cart' && env.CHECKOUT_TEST_PHASE === 'AUTHORIZED_ONE_CART' &&
    env.CHECKOUT_TEST_APPROVED_ONCE === 'CREATE EXACTLY ONE DEVELOPMENT STORE CART';
}
