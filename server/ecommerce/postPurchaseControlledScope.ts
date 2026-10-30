import {timingSafeEqual} from 'node:crypto';

type Env=Record<string,string|undefined>;
export type ControlledPostPurchaseScope={intentId:string;recipientHmac:string;expiresAt:number};
/** Operator-only private acceptance scope. Never accept these values from merchant JSON. */
export function readControlledPostPurchaseScope(env:Env):ControlledPostPurchaseScope|null{
  const intentId=env.ECOMMERCE_POST_PURCHASE_CONTROLLED_INTENT_ID??'';
  const recipientHmac=env.ECOMMERCE_POST_PURCHASE_CONTROLLED_RECIPIENT_HMAC??'';
  const expiry=env.ECOMMERCE_POST_PURCHASE_CONTROLLED_EXPIRES_AT??'';
  const expiresAt=Date.parse(expiry);
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(expiry)||!Number.isFinite(expiresAt)||expiresAt<=Date.now())return null;
  if(env.ECOMMERCE_POST_PURCHASE_DELIVERY_MODE!=='controlled-one-intent'||
    !/^[1-9][0-9]{0,18}$/.test(intentId)||!/^[a-f0-9]{64}$/.test(recipientHmac))return null;
  return {intentId,recipientHmac,expiresAt};
}
export function postPurchaseControlledScopeReady(env:Env):boolean{
  const configured=[env.ECOMMERCE_POST_PURCHASE_DELIVERY_MODE,
    env.ECOMMERCE_POST_PURCHASE_CONTROLLED_INTENT_ID,
    env.ECOMMERCE_POST_PURCHASE_CONTROLLED_RECIPIENT_HMAC,env.ECOMMERCE_POST_PURCHASE_CONTROLLED_EXPIRES_AT].some(v=>v!==undefined);
  return env.RAILWAY_ENVIRONMENT_NAME!=='production'&&!configured || readControlledPostPurchaseScope(env)!==null;
}
export function controlledPostPurchaseRecipientMatches(scope:ControlledPostPurchaseScope,digest:string):boolean{
  return /^[a-f0-9]{64}$/.test(digest)&&/^[a-f0-9]{64}$/.test(scope.recipientHmac)&&
    timingSafeEqual(Buffer.from(digest,'hex'),Buffer.from(scope.recipientHmac,'hex'));
}
export function sameControlledPostPurchaseScope(a:ControlledPostPurchaseScope|null,b:ControlledPostPurchaseScope|null):boolean{
  return a===null?b===null:b!==null&&a.intentId===b.intentId&&a.recipientHmac===b.recipientHmac&&a.expiresAt===b.expiresAt;
}
