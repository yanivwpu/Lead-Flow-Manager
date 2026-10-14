import test from 'node:test';
import assert from 'node:assert/strict';
import {shopifySupportContactUrl,saveSupportContact,SupportContactRequestError} from '../client/src/lib/shopifySupportContactRequest';

test('support contact bypasses production marketing redirects and preserves app/staging/development routing',()=>{
  for(const origin of ['https://www.whachatcrm.com','https://whachatcrm.com'])
    assert.equal(shopifySupportContactUrl(origin),'https://app.whachatcrm.com/api/shopify/support-contact');
  for(const origin of ['https://app.whachatcrm.com','https://fixture-staging.example.invalid','http://localhost:5000','https://evil.example.invalid',''])
    assert.equal(shopifySupportContactUrl(origin),'/api/shopify/support-contact');
});
test('Skip sends no email, requires genuine saved acknowledgment and preserves failures for authentication/permissions',async()=>{
  let calls=0;
  await saveSupportContact({action:'dismiss'},(async(_url,init)=>{
    calls++; assert.equal(init?.credentials,'include');assert.equal(init?.redirect,'error');
    assert.deepEqual(JSON.parse(String(init?.body)),{action:'dismiss'}); return Response.json({saved:true});
  }) as typeof fetch);
  assert.equal(calls,1);
  const failures=[[401,'sessionExpired'],[403,'permissionDenied'],[409,'reconnectRequired'],[400,'invalidEmail'],[503,'error']] as const;
  for(const [status,reason] of failures) await assert.rejects(saveSupportContact({action:'dismiss'},
    (async()=>Response.json({error:'failed'},{status})) as typeof fetch),error=>error instanceof SupportContactRequestError&&error.reason===reason);
  for(const body of [{saved:false},{}, {saved:'true'}]) await assert.rejects(saveSupportContact({action:'dismiss'},
    (async()=>Response.json(body)) as typeof fetch),SupportContactRequestError);
  await assert.rejects(saveSupportContact({action:'dismiss'},(async()=>{throw Error('network unavailable');}) as typeof fetch));
  await saveSupportContact({action:'confirm',email:'support@example.invalid'},(async(_url,init)=>{
    assert.deepEqual(JSON.parse(String(init?.body)),{action:'confirm',email:'support@example.invalid'});return Response.json({saved:true});
  }) as typeof fetch);
});
