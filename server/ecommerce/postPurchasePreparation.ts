import {eligiblePostPurchaseLibraryTemplate} from './postPurchaseTemplateBinding';
import {isEcommercePilotOwner} from './pilotAccess';
import {sql,type SQL} from 'drizzle-orm';
import {isShopifyContactInstallationActive} from '../../shared/shopifyContactPrivacy';
import {normalizeShopifyShopDomain} from '../../shared/shopifyBilling';
import {readPostPurchasePlans,JOURNEY_POLICY,POST_PURCHASE_JOURNEYS,type PostPurchaseJourney} from '../../shared/postPurchase';
import {classifyCommerceWebhook} from './eventIntake';
import {commerceEventInboxUpsertQuery} from './durableEventInbox';
import {planPostPurchaseTimeline} from './postPurchaseTimeline';
import {postPurchasePreparationEnabled} from './postPurchaseGate';
import {parsePostPurchaseOrderEvent,type PostPurchaseOrderEvent,type FreshPostPurchaseOrder,recheckPostPurchaseOrder} from './postPurchaseOrder';
import {postPurchaseTablesQuery,postPurchaseTables,upsertPostPurchaseOrderQuery,insertPostPurchaseIntentQuery,
  duePostPurchaseIntentsQuery,suppressChangedPostPurchaseOrdersQuery,type PostPurchaseMerchant} from './postPurchaseQueries';
import {eligiblePostPurchaseRecipient,matchPostPurchaseTemplate} from './postPurchaseEligibility';
import {classifyPostPurchaseConsent,grantPostPurchaseConsentQuery,revokePostPurchaseConsentQuery} from './postPurchaseConsent';
import type {VerifiedInboundConsentCandidate} from './checkoutRecoveryInboundConsentGate';
import {recoveryPhoneDigest,type RecoveryContact,type WhatsAppRecoveryConsent} from './checkoutRecoveryMessagingEligibility';
import type {ShopifyOrderTopic} from '../shopifyOrderWebhookHandler';
export type PostPurchaseTx={execute:(query:SQL)=>Promise<{rows:Record<string,unknown>[]}>};
export type PostPurchaseDatabase={transaction:<T>(fn:(tx:PostPurchaseTx)=>Promise<T>)=>Promise<T>};
type Merchant=PostPurchaseMerchant&{accessToken:string;config:Record<string,unknown>;installedAt:number;metaConnected:boolean;metaPhoneId:string};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const date=(v:unknown):number=>v instanceof Date?v.valueOf():typeof v==='string'?Date.parse(v):NaN;
const iso=(v:unknown)=>Number.isFinite(date(v))?new Date(date(v)).toISOString():'';
export function createPostPurchasePreparation(deps:{
  database:PostPurchaseDatabase;env:Record<string,string|undefined>;secret:()=>string;now?:()=>number;
  privacyLocked:(tx:PostPurchaseTx,shop:string,customerId:string)=>Promise<boolean>;
  recheck?:typeof recheckPostPurchaseOrder;templates:(accountId:string)=>Promise<unknown[]>;
}){
  const now=deps.now??Date.now;
  async function merchant(tx:PostPurchaseTx,shop:string,stopOnly=false):Promise<Merchant|null>{
    const rows=await tx.execute(sql`SELECT id,email,shopify_shop,shopify_access_token,shopify_subscription_status,
      deletion_requested_at,shopify_installed_at,meta_connected,meta_phone_number_id FROM users WHERE shopify_shop=${shop} LIMIT 2 FOR SHARE`);
    if(rows.rows.length!==1)return null;const user=rows.rows[0],accountId=String(user.id);
    if(!postPurchasePreparationEnabled({...deps.env,...(stopOnly?{ECOMMERCE_POST_PURCHASE_PREP_ENABLED:'true',ECOMMERCE_POST_PURCHASE_PRODUCTION_RELEASE_APPROVED:'true',ECOMMERCE_PILOT_ENABLED:'true'}:{})},accountId))return null;
    if(deps.env.RAILWAY_ENVIRONMENT_NAME==='production'&&
      !isEcommercePilotOwner({id:accountId,email:typeof user.email==='string'?user.email:null},stopOnly?{...deps.env,ECOMMERCE_PILOT_ENABLED:'true'}:deps.env))return null;
    if(!stopOnly&&!isShopifyContactInstallationActive({shopifyShop:shop,shopifyAccessToken:user.shopify_access_token as string|null,
      shopifySubscriptionStatus:user.shopify_subscription_status as string|null,deletionRequestedAt:user.deletion_requested_at as Date|null}))return null;
    if(user.deletion_requested_at)return null;
    const active=await tx.execute(sql`SELECT id,config FROM integrations WHERE user_id=${accountId} AND type='shopify' AND is_active IS TRUE LIMIT 2 FOR SHARE`);
    if(active.rows.length!==1)return null;const config=object(active.rows[0].config);
    for(const key of ['shop','shopUrl'])if(config[key]!=null&&normalizeShopifyShopDomain(String(config[key]))!==shop)return null;
    const installedAt=date(user.shopify_installed_at);if(!Number.isFinite(installedAt))return null;
    return {accountId,shop,installationId:String(active.rows[0].id),accessToken:String(user.shopify_access_token||''),config,installedAt,
      metaConnected:user.meta_connected===true,metaPhoneId:String(user.meta_phone_number_id||'')};
  }
  async function locked<T>(shop:string,fn:(tx:PostPurchaseTx)=>Promise<T>):Promise<T>{
    return deps.database.transaction(async tx=>{
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop},0))`);return fn(tx);
    });
  }
  async function schema(tx:PostPurchaseTx){
    const tables=postPurchaseTables((await tx.execute(postPurchaseTablesQuery)).rows[0]);
    if(!tables.intents||!tables.orders||!tables.consents)throw Error('post_purchase_schema_missing');
  }
  async function contact(tx:PostPurchaseTx,m:Merchant,customerId:string):Promise<RecoveryContact|null>{
    const rows=await tx.execute(sql`SELECT id,user_id,phone,whatsapp_id,custom_fields,source_details,automations_paused,tag,pipeline_stage
      FROM contacts WHERE user_id=${m.accountId}
        AND COALESCE(custom_fields->>'shopifyCustomerId',source_details->>'shopifyCustomerId')=${customerId.slice('gid://shopify/Customer/'.length)}
        AND COALESCE(custom_fields->>'shopifyShop',source_details->>'shop')=${m.shop} LIMIT 2 FOR SHARE`);
    if(rows.rows.length!==1)return null;const row=rows.rows[0],custom=object(row.custom_fields),source=object(row.source_details);
    // Conflicting explicit metadata or duplicate/shared phones fail closed.
    for(const [data,idKey,shopKey] of [[custom,'shopifyCustomerId','shopifyShop'],[source,'shopifyCustomerId','shop']] as const){
      if(data[idKey]!=null&&String(data[idKey])!==customerId.slice('gid://shopify/Customer/'.length))return null;
      if(data[shopKey]!=null&&data[shopKey]!==m.shop)return null;
    }
    const duplicates=await tx.execute(sql`SELECT id FROM contacts WHERE user_id=${m.accountId} AND phone=${row.phone} AND id<>${row.id} LIMIT 1`);
    if(duplicates.rows.length)return null;
    return {id:String(row.id),userId:String(row.user_id),phone:row.phone as string|null,whatsappId:row.whatsapp_id as string|null,
      shopifyCustomerId:customerId,automationsPaused:row.automations_paused!==false,tag:row.tag as string|null,
      pipelineStage:row.pipeline_stage as string|null,customFields:custom};
  }
  async function liveTemplates(m:Merchant):Promise<unknown[]>{
    if(!m.metaConnected)return [];
    try{return await deps.templates(m.accountId);}catch{return [];}
  }
  async function evaluate(tx:PostPurchaseTx,m:Merchant,event:PostPurchaseOrderEvent,fresh:FreshPostPurchaseOrder,journey:PostPurchaseJourney,
    rowId:string,live:unknown[]){
    const plans=readPostPurchasePlans(m.config),c=await contact(tx,m,event.customerId);
    const binding=object(m.config.ecommercePostPurchaseTemplates)[journey];
    const templates=typeof binding==='string'?await tx.execute(sql`SELECT id,twilio_sid,name,language,category,status,body_text,header_type,template_type,buttons,carousel_cards
      FROM message_templates WHERE id=${binding} AND user_id=${m.accountId} FOR SHARE`):{rows:[]};
    const t=templates.rows[0];
    const template=t&&eligiblePostPurchaseLibraryTemplate(t,journey)?{name:String(t.name),language:String(t.language),category:String(t.category),status:String(t.status),
      bodyText:typeof t.body_text==='string'?t.body_text:null,headerType:t.header_type as string|null,
      templateType:t.template_type as string|null,buttons:t.buttons,carouselCards:t.carousel_cards}:null;
    const matches=template?live.filter(value=>{const v=object(value);return v.name===template.name&&v.language===template.language;}):[];
    const liveTemplate=matches.length===1?matches[0]:null;
    let consent:WhatsAppRecoveryConsent|null=null;
    if(c&&c.phone&&deps.secret().length>=32){
      let digest:string|null=null;try{digest=recoveryPhoneDigest(deps.secret(),c.phone);}catch{/* invalid channel identity blocks */}
      if(digest){const proofs=await tx.execute(sql`SELECT * FROM ecommerce_post_purchase_consents
        WHERE account_id=${m.accountId} AND shop=${m.shop} AND recipient_hmac=${digest} AND purpose=${journey} FOR SHARE`);
        const proof=proofs.rows[0];
        if(proof)consent={accountId:String(proof.account_id),shop:String(proof.shop),contactId:String(proof.contact_id),
          shopifyCustomerId:String(proof.customer_gid),purpose:String(proof.purpose),channel:proof.channel as 'whatsapp',
          source:proof.evidence_source as WhatsAppRecoveryConsent['source'],phoneDigest:String(proof.recipient_hmac),
          grantedAt:iso(proof.granted_at),revokedAt:proof.revoked_at==null?null:iso(proof.revoked_at)};
      }
    }
    const eligible=eligiblePostPurchaseRecipient({journey,accountId:m.accountId,shop:m.shop,customerId:event.customerId,
      contact:c,consent,template,live:liveTemplate,secret:deps.secret(),now:now()});
    const matched=matchPostPurchaseTemplate(template,liveTemplate,journey);
    const timeline=planPostPurchaseTimeline(plans,{
      accountId:m.accountId,shop:m.shop,installationActive:true,merchantPaused:m.config.ecommercePostPurchasePaused===true,
      event:{verified:true,accountId:m.accountId,shop:m.shop,topic:event.topic,deliveryId:event.deliveryId,
        orderId:event.orderId,customerId:event.customerId,occurredAt:event.occurredAt},
      order:{accountId:m.accountId,shop:m.shop,id:fresh.orderId,customerId:fresh.customerId,status:fresh.status,
        updatedAt:fresh.updatedAt,checkedAt:now(),purchasedAt:fresh.purchasedAt,latestPurchaseAt:fresh.latestPurchaseAt},
      recipient:{accountId:m.accountId,customerId:c?.shopifyCustomerId??'',identityVerified:!!c&&!!c.whatsappId&&'+'+c.whatsappId===c.phone,
        channel:'whatsapp',stopped:consent?.revokedAt!=null,erased:false,paused:c?.automationsPaused??true,
        consentPurposes:eligible.ok?[journey]:[]},
      templates:{[journey]:{localApproved:matched,liveApproved:matched,exactBodyMatched:matched,
        category:template?.category.toUpperCase()??'',language:template?.language??''}},previousKeys:[],now:now(),
    }).find(x=>x.journey===journey)!;
    const reasons=[...new Set([...timeline.reasons,...(!eligible.ok?[eligible.reason]:[])])];
    const terminal=reasons.includes('order_status_changed') || consent?.revokedAt!=null ||
      (reasons.includes('purchase_recheck_required_or_new_purchase')&&fresh.latestPurchaseAt!==null&&fresh.latestPurchaseAt>fresh.purchasedAt);
    const state=terminal?'suppressed':reasons.length===0?'preview_ready':reasons.every(x=>x==='waiting_for_timing')?'scheduled':'blocked';
    const dueAt=timeline.dueAt??now();
    await tx.execute(sql`UPDATE ecommerce_post_purchase_intents SET state=${state},reasons=${JSON.stringify(reasons)}::jsonb,
      contact_id=${c?.id??null},template_id=${template?t!.id:null},due_at=${new Date(dueAt)},checked_at=${new Date(now())},
      next_review_at=${new Date(Math.max(now()+90_000,dueAt))}
      WHERE id=${rowId}::bigint AND account_id=${m.accountId} AND shop=${m.shop} AND installation_id=${m.installationId} AND state<>'suppressed'`);
    return state==='preview_ready'&&eligible.ok&&c&&template ? {
      contactId:c.id,templateId:String(t!.id),phone:eligible.recipientPhone,
      templateName:eligible.templateName,language:eligible.templateLanguage,
      components:template.bodyText?.includes('{{1}}')
        ? [{type:'body',parameters:[{type:'text',text:event.orderId.slice('gid://shopify/Order/'.length)}]}] : [],
    } : null;
  }
  /** Called ONLY from existing raw-body HMAC verifier. No request route accepts trusted snapshots. */
  async function ingest(shop:string,topic:ShopifyOrderTopic,deliveryId:string,body:unknown){
    if(!postPurchasePreparationEnabled(deps.env))return 'disabled';
    const event=parsePostPurchaseOrderEvent(topic,deliveryId,body,now());if(!event)return 'ignored';
    return locked(shop,async tx=>{
      const m=await merchant(tx,shop);if(!m||event.occurredAt<m.installedAt)return 'ignored';await schema(tx);
      if(await deps.privacyLocked(tx,shop,event.customerId))return 'suppressed';
      const fresh=await (deps.recheck??recheckPostPurchaseOrder)({shop,accessToken:m.accessToken,orderId:event.orderId,customerId:event.customerId,now:now()});
      if(!fresh||fresh.orderId!==event.orderId||fresh.customerId!==event.customerId||fresh.updatedAt<event.occurredAt)throw Error('post_purchase_fresh_order_unavailable');
      if((topic==='orders/cancelled'&&fresh.status!=='cancelled')||(topic==='orders/fulfilled'&&fresh.status==='open'))
        throw Error('post_purchase_event_status_not_confirmed');
      const saved=await tx.execute(upsertPostPurchaseOrderQuery(m,fresh));if(saved.rows.length!==1)return 'ignored';
      const decision=classifyCommerceWebhook({verified:true,accountId:m.accountId,shopDomain:shop,topic,webhookId:deliveryId});
      if(decision.status!=='candidate')return 'ignored';
      const inbox=await tx.execute(commerceEventInboxUpsertQuery(decision));
      await tx.execute(suppressChangedPostPurchaseOrdersQuery(m,fresh));
      if(fresh.latestPurchaseAt!==null)await tx.execute(sql`UPDATE ecommerce_post_purchase_intents SET state='suppressed',reasons='["new_purchase"]'::jsonb
        WHERE account_id=${m.accountId} AND shop=${shop} AND customer_gid=${event.customerId} AND order_gid<>${event.orderId}
          AND journey IN ('reviewRequest','repeatPurchase','winBack') AND occurred_at<${new Date(fresh.latestPurchaseAt)} AND state<>'suppressed'`);
      const plans=readPostPurchasePlans(m.config),c=await contact(tx,m,event.customerId),live=await liveTemplates(m);
      for(const journey of POST_PURCHASE_JOURNEYS){
        if(JOURNEY_POLICY[journey].topic!==topic||!plans[journey].selected)continue;
        const inserted=await tx.execute(insertPostPurchaseIntentQuery(m,event,{eventId:String(inbox.rows[0].id),journey,
          dueAt:event.occurredAt+plans[journey].delayMinutes*60_000,contactId:c?.id??null}));
        if(inserted.rows.length)await evaluate(tx,m,event,fresh,journey,String(inserted.rows[0].id),live);
      }
      return 'recorded';
    });
  }
  /** Bounded cross-instance preparation. Shop lock + row lock + next_review_at prevent overlapping work.
   * A crash rolls back the review; there is no provider attempt or send capability.
   */
  async function tick(){
    if(!postPurchasePreparationEnabled(deps.env))return;
    const scope=await deps.database.transaction(tx=>tx.execute(sql`SELECT shopify_shop FROM users WHERE id=${deps.env.ECOMMERCE_POST_PURCHASE_ACCOUNT_ID}`));
    const shop=scope.rows[0]?.shopify_shop;if(typeof shop!=='string')return;
    await locked(shop,async tx=>{
      const m=await merchant(tx,shop);if(!m)return;await schema(tx);
      const rows=await tx.execute(duePostPurchaseIntentsQuery(m));if(!rows.rows.length)return;
      const live=await liveTemplates(m);
      for(const row of rows.rows){
        const event={topic:row.topic as ShopifyOrderTopic,deliveryId:String(row.delivery_id),orderId:String(row.order_gid),customerId:String(row.customer_gid),occurredAt:date(row.occurred_at)};
        if(await deps.privacyLocked(tx,shop,event.customerId)){
          await tx.execute(sql`DELETE FROM ecommerce_post_purchase_orders WHERE account_id=${m.accountId} AND shop=${shop} AND order_gid=${event.orderId}`);continue;
        }
        const fresh=await (deps.recheck??recheckPostPurchaseOrder)({shop,accessToken:m.accessToken,orderId:event.orderId,customerId:event.customerId,now:now()});
        if(!fresh||fresh.orderId!==event.orderId||fresh.customerId!==event.customerId||fresh.updatedAt<event.occurredAt){
          await tx.execute(sql`UPDATE ecommerce_post_purchase_intents SET state='blocked',reasons='["fresh_order_check_required"]'::jsonb,
            checked_at=NULL,next_review_at=${new Date(now()+90_000)} WHERE id=${row.id}::bigint`);continue;
        }
        const saved=await tx.execute(upsertPostPurchaseOrderQuery(m,fresh));
        if(!saved.rows.length){
          await tx.execute(sql`UPDATE ecommerce_post_purchase_intents SET state='suppressed',reasons='["order_status_changed"]'::jsonb WHERE id=${row.id}::bigint`);continue;
        }
        await tx.execute(suppressChangedPostPurchaseOrdersQuery(m,fresh));
        await evaluate(tx,m,event,fresh,row.journey as PostPurchaseJourney,String(row.id),live);
      }
    });
  }
  async function captureConsent(accountId:string,contactId:string|null,candidate:VerifiedInboundConsentCandidate){
    const proof=classifyPostPurchaseConsent(candidate,now());if(!proof)return 'ignored';
    const stop=proof.action==='revoke';
    if(!postPurchasePreparationEnabled({...deps.env,...(stop?{ECOMMERCE_POST_PURCHASE_PREP_ENABLED:'true',ECOMMERCE_POST_PURCHASE_PRODUCTION_RELEASE_APPROVED:'true',ECOMMERCE_PILOT_ENABLED:'true'}:{})},accountId))return 'disabled';
    const owner=await deps.database.transaction(tx=>tx.execute(sql`SELECT shopify_shop FROM users WHERE id=${accountId}`));
    const shop=owner.rows[0]?.shopify_shop;if(typeof shop!=='string'||deps.secret().length<32)return 'ignored';
    return locked(shop,async tx=>{
      const m=await merchant(tx,shop,stop);if(!m||m.accountId!==accountId||!m.metaConnected||m.metaPhoneId!==candidate.phoneNumberId)return 'ignored';
      await schema(tx);
      if(proof.eventAt.valueOf()<m.installedAt)return 'ignored';
      const base={accountId,shop,phone:'+'+candidate.from,secret:deps.secret(),at:proof.eventAt,wamid:candidate.messageId};
      if(stop){
        const revoked=await tx.execute(revokePostPurchaseConsentQuery(base));
        for(const row of revoked.rows)if(row.contact_id)await tx.execute(sql`UPDATE ecommerce_post_purchase_intents SET state='suppressed',reasons='["recipient_stopped"]'::jsonb
          WHERE account_id=${accountId} AND shop=${shop} AND contact_id=${row.contact_id} AND journey=${row.purpose} AND state<>'suppressed'`);
        return 'revoked';
      }
      if(!contactId)return 'ignored';
      const raw=await tx.execute(sql`SELECT custom_fields,source_details FROM contacts WHERE id=${contactId} AND user_id=${accountId}`);
      const source=object(raw.rows[0]?.source_details),custom=object(raw.rows[0]?.custom_fields);
      const numeric=custom.shopifyCustomerId??source.shopifyCustomerId;
      if(typeof numeric!=='string'||!/^[1-9][0-9]{0,19}$/.test(numeric))return 'ignored';
      const customerId='gid://shopify/Customer/'+numeric;
      const c=await contact(tx,m,customerId);
      if(!c||c.id!==contactId||c.phone!==base.phone||c.whatsappId!==candidate.from||c.automationsPaused||
        await deps.privacyLocked(tx,shop,customerId))return 'ignored';
      const saved=await tx.execute(grantPostPurchaseConsentQuery({...base,journey:proof.journey,contactId,customerId}));
      return saved.rows.length?'granted':'ignored';
    });
  }
  /** Internal sender authorization; caller holds the same shop privacy lock and outbox lock.
   * All facts are reloaded from server state. No queued snapshot authorizes a send.
   */
  async function authorizeDelivery(tx:PostPurchaseTx,scope:{accountId:string;shop:string;installationId:string},intentId:string){
    const m=await merchant(tx,scope.shop);
    if(!m||m.accountId!==scope.accountId||m.installationId!==scope.installationId||
      m.config.ecommercePostPurchaseDeliveryEnabled!==true)return null;
    await schema(tx);
    const found=await tx.execute(sql`SELECT i.*,e.delivery_id FROM ecommerce_post_purchase_intents i
      JOIN ecommerce_growth_event_inbox e ON e.id=i.event_id AND e.account_id=i.account_id AND e.shop=i.shop
      WHERE i.id=${intentId}::bigint AND i.account_id=${m.accountId} AND i.shop=${m.shop}
        AND i.installation_id=${m.installationId} AND i.state='preview_ready' FOR UPDATE OF i`);
    const row=found.rows[0];if(!row)return null;
    const event={topic:row.topic as ShopifyOrderTopic,deliveryId:String(row.delivery_id),orderId:String(row.order_gid),
      customerId:String(row.customer_gid),occurredAt:date(row.occurred_at)};
    if(event.occurredAt<m.installedAt||await deps.privacyLocked(tx,m.shop,event.customerId))return null;
    const checkedAt=now();
    const fresh=await (deps.recheck??recheckPostPurchaseOrder)({shop:m.shop,accessToken:m.accessToken,
      orderId:event.orderId,customerId:event.customerId,now:now()});
    if(!fresh||fresh.orderId!==event.orderId||fresh.customerId!==event.customerId||fresh.updatedAt<event.occurredAt)return null;
    const live=await liveTemplates(m);
    if(now()-checkedAt>60_000)return null;
    return evaluate(tx,m,event,fresh,row.journey as PostPurchaseJourney,String(row.id),live);
  }
  return {ingest,tick,captureConsent,authorizeDelivery};
}
