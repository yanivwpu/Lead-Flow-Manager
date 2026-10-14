import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes,createCipheriv,createDecipheriv } from 'node:crypto';
import { transform } from 'esbuild';

test('actual access-request encryption authenticates task ID and rejects tampering and invalid keys',async () => {
  const source=readFileSync('server/shopifyPrivacyRequests.ts','utf8');
  const begin=source.indexOf('function encryptRequest(');
  const body=source.slice(begin,source.indexOf('export async function enqueuePrivacyRequest',begin));
  const compiled=await transform(body,{loader:'ts',format:'cjs',target:'es2022'});
  const env={SHOPIFY_PRIVACY_REQUEST_KEY:randomBytes(32).toString('hex')};
  const encrypt=new Function('process','randomBytes','createCipheriv',compiled.code+';return encryptRequest;')(
    {env},randomBytes,createCipheriv);
  const payload={shop:'fixture.myshopify.com',customer:{id:'123'},requestId:'fixture'};
  const first=encrypt('task-fixture',payload),second=encrypt('task-fixture',payload);
  assert.notEqual(first,second,'each request uses a fresh IV');
  assert.ok(!first.includes(payload.shop));
  const decrypt=(encoded: string,taskId: string) => {
    const [version,iv,tag,ciphertext]=encoded.split(':');assert.equal(version,'v1');
    const decipher=createDecipheriv('aes-256-gcm',Buffer.from(env.SHOPIFY_PRIVACY_REQUEST_KEY,'hex'),Buffer.from(iv,'hex'));
    decipher.setAAD(Buffer.from(taskId));decipher.setAuthTag(Buffer.from(tag,'hex'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext,'hex')),decipher.final()]).toString());
  };
  assert.deepEqual(decrypt(first,'task-fixture'),payload);
  assert.throws(() => decrypt(first,'foreign-task'));
  const parts=first.split(':');parts[3]=(parts[3].startsWith('00')?'01':'00')+parts[3].slice(2);
  assert.throws(() => decrypt(parts.join(':'),'task-fixture'));
  env.SHOPIFY_PRIVACY_REQUEST_KEY='invalid';assert.throws(() => encrypt('task-fixture',payload));
});
