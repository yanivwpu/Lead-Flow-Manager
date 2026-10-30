import {sql} from 'drizzle-orm';
import {readPostPurchasePlans} from '../../shared/postPurchase';
import {readPostPurchaseTemplateBindings} from './postPurchaseTemplateBinding';
import {postPurchaseDeliveryEnabled} from './postPurchaseDeliveryGate';
import {postPurchasePreparationEnabled} from './postPurchaseGate';

export function postPurchaseOperatorReady(env:Record<string,string|undefined>,accountId:string){
  return postPurchaseDeliveryEnabled(env,accountId)&&postPurchasePreparationEnabled(env,accountId)&&
    env.ECOMMERCE_POST_PURCHASE_RECEIPTS_ENABLED==='true'&&
    env.ECOMMERCE_POST_PURCHASE_WEBHOOKS_VERIFIED==='true'&&
    (env.ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY?.length??0)>=32;
}
/** Workspace activation configures future delivery; it never creates customer consent. */
export function postPurchaseActivationReadiness(env:Record<string,string|undefined>,accountId:string,config:Record<string,unknown>,schemaReady:boolean){
  const selected=Object.entries(readPostPurchasePlans(config)).filter(([,p])=>p.selected);
  const bindings=readPostPurchaseTemplateBindings(config);
  const configured=selected.length>0&&selected.every(([j])=>!!bindings[j as keyof typeof bindings]);
  const operatorReady=postPurchaseOperatorReady(env,accountId);
  return {canActivate:operatorReady&&schemaReady&&configured,
    merchantEnabled:config.ecommercePostPurchaseDeliveryEnabled===true,
    deliveryEnabled:operatorReady&&schemaReady&&configured&&config.ecommercePostPurchaseDeliveryEnabled===true,
    blockers:[...(!operatorReady?['operator_release_required']:[]),...(!schemaReady?['schema_required']:[]),
      ...(!configured?['journeys_and_templates_required']:[])],
  };
}
export function parsePostPurchaseActivation(value:unknown):boolean|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const row=value as Record<string,unknown>;
  return Object.keys(row).length===2&&row.action==='set_post_purchase_delivery'&&typeof row.enabled==='boolean'?row.enabled:null;
}
export function savePostPurchaseActivationQuery(accountId:string,shop:string,installationId:string,enabled:boolean){
  return sql`UPDATE integrations SET config=jsonb_set(COALESCE(config,'{}'::jsonb),
    '{ecommercePostPurchaseDeliveryEnabled}',${JSON.stringify(enabled)}::jsonb,true)
    WHERE id=${installationId} AND user_id=${accountId} AND type='shopify' AND is_active IS TRUE
      AND (config->>'shop' IS NULL OR config->>'shop'=${shop}) RETURNING id`;
}
