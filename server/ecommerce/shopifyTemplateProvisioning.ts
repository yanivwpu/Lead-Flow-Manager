import {merchantProductionAvailable,merchantReleaseCurrent} from './merchantRelease';
import { consentCaptureSchemaQuery } from './consentCaptureSchema';
import { productionConsentCaptureBlocker } from './consentCaptureGate';
import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { getEffectivePlanForUser } from "../../shared/trialEntitlements";
import { parseMetaGraphTemplateForLibrary } from "../../shared/metaTemplateSend";
import { SHOPIFY_GROWTH_TEMPLATES, type ShopifyGrowthTemplate, type ShopifyTemplateJourney,
  type ShopifyTemplateSetup, type ShopifyTemplateProgress } from "../../shared/shopifyGrowthTemplates";
import { matchPostPurchaseTemplate } from "./postPurchaseEligibility";
import { validateRecoveryMetaTemplate, type RecoveryTemplateShape } from "./checkoutRecoveryMetaTemplate";
import { eligiblePostPurchaseLibraryTemplate, readPostPurchaseTemplateBindings, savePostPurchaseTemplateBindingQuery } from "./postPurchaseTemplateBinding";
import {readPostPurchasePlans,type PostPurchaseJourney,type JourneyPlan} from "../../shared/postPurchase";
import {savePostPurchasePlanQuery} from "./postPurchasePlans";
import {postPurchaseActivationReadiness,postPurchaseOperatorReady,savePostPurchaseActivationQuery} from "./postPurchaseActivation";
import {postPurchaseDeliveryReadinessQuery} from "./postPurchaseDeliveryReadiness";
import {recoveryRuntimeSchemaReadyQuery} from "./checkoutRecoverySchema";
import {readProductionRecoveryScope,commerceConnectionFingerprint} from "./checkoutRecoveryProductionRelease";
import {recoveryWorkerEnabled} from "./checkoutRecoveryWorkerScheduler";
import { CONSENT_PURPOSES, enrollmentLink, enrollmentNotice, isPostPurchasePurpose,
  type EnrollmentDraft, type EnrollmentView } from '../../shared/shopifyConsentEnrollment';
import { enrollmentCaptureReadiness, enrollmentCaptureBlocker, savedEnrollment, stampEnrollment } from './shopifyConsentEnrollment';
import { readControlledPostPurchaseScope } from './postPurchaseControlledScope';
import { postPurchaseTablesQuery, postPurchaseTables } from './postPurchaseQueries';
import { isEcommercePilotOwner } from './pilotAccess';

export type TemplateTx = { execute: (query: SQL) => Promise<{ rows: Record<string, unknown>[] }> };
export type TemplateDatabase = TemplateTx & { transaction: <T>(fn: (tx: TemplateTx) => Promise<T>) => Promise<T> };
type Env = Record<string, string | undefined>;
type Item = Omit<ShopifyTemplateProgress,'journey'> & {journey:ShopifyTemplateJourney|PostPurchaseJourney;attemptedAt?: number; providerId?: string };
type WabaState = { authorizedFor?: string; authorizedAt?: number; nextCheckAt?: number;
  phoneId?:string;installedAt?:number;
  leaseId?: string; leaseUntil?: number; items: Partial<Record<ShopifyTemplateJourney|PostPurchaseJourney, Item>> };
type State = { version: 1; wabas: Record<string, WabaState> };
type TemplateInstallation = { accountId: string; shop: string; installationId: string; config: Record<string, unknown> };
export type TemplateMerchant = TemplateInstallation & {
  wabaId: string; phoneId:string;installedAt:number; fingerprint: string };
export type TemplateProvider = {
  list: (merchant: TemplateMerchant) => Promise<unknown[]>;
  create: (merchant: TemplateMerchant, template: ShopifyGrowthTemplate) => Promise<{ id: string }>;
};
export const object = (v: unknown): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
const numericId = (v: unknown): v is string => typeof v === "string" && /^[1-9][0-9]{0,30}$/.test(v);
const millis=(value:unknown)=>value instanceof Date?value.getTime():Date.parse(String(value));

/** Operator scope for management only. No wildcard cohort or implicit public release. */
export function shopifyTemplateSetupAllowed(env: Env, accountId: string): boolean {
  if (merchantProductionAvailable(env,accountId)) return true;
  if (env.ECOMMERCE_TEMPLATE_PROVISIONING_ENABLED !== "true") return false;
  const stage = env.ECOMMERCE_TEMPLATE_PROVISIONING_STAGE;
  if (stage === "general") return env.ECOMMERCE_TEMPLATE_PUBLIC_RELEASE_APPROVED === "true";
  const ids = (env.ECOMMERCE_TEMPLATE_PROVISIONING_ACCOUNT_IDS ?? "").split(",");
  return (stage === "internal_pilot" || stage === "limited_cohort") && ids.length <= 100 &&
    ids.every(id => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) && ids.includes(accountId);
}

/** Exclude disconnected, expired, ambiguous and no-longer-entitled accounts
 * before LIMIT so an ineligible merchant cannot starve the cohort's work. The
 * transaction still repeats the full authorization check before any mutation.
 */
export function dueShopifyTemplateSetupsQuery(now:number,ids:string[],general:boolean,merchants=false,pilotAccount=""){
  return sql`SELECT i.user_id FROM integrations i JOIN users u ON u.id=i.user_id
    JOIN ecommerce_shopify_workspace_activations a ON a.account_id=u.id AND a.installation_id=i.id AND a.shop=u.shopify_shop
    CROSS JOIN LATERAL (SELECT i.config->'ecommerceTemplateSetup'->'wabas'->u.meta_business_account_id AS state) s
    WHERE i.type='shopify' AND i.is_active IS TRUE AND u.meta_connected IS TRUE AND u.deletion_requested_at IS NULL
      AND u.shopify_access_token IS NOT NULL AND u.meta_access_token IS NOT NULL AND COALESCE(u.whatsapp_provider,'meta')<>'twilio'
      AND lower(COALESCE(u.shopify_subscription_status,'')) NOT IN ('uninstalled','redacted')
      AND (u.meta_token_expires_at IS NULL OR u.meta_token_expires_at>NOW())
      AND s.state->>'phoneId'=u.meta_phone_number_id
      AND s.state->>'installedAt'=FLOOR(EXTRACT(EPOCH FROM u.shopify_installed_at)*1000)::bigint::text
      AND (SELECT count(*) FROM integrations x WHERE x.user_id=u.id AND x.type='shopify' AND x.is_active IS TRUE)=1
      AND CASE WHEN u.plan_override_enabled IS TRUE THEN u.plan_override='pro'
        WHEN COALESCE(u.billing_plan,'free')<>'free' AND (lower(COALESCE(u.subscription_status,'')) IN ('active','trialing')
          OR lower(COALESCE(u.shopify_subscription_status,''))='active') THEN u.billing_plan='pro'
        ELSE u.trial_ends_at>NOW() AND COALESCE(u.trial_status,'')<>'expired' END
      AND (${general?sql`TRUE`:sql`i.user_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))`} OR
        ${merchants} AND i.user_id<>${pilotAccount} AND u.shopify_shop<>'whachatcrm-live-test.myshopify.com'
          AND i.config->'ecommerceMerchantRelease'->>'version'='1')
      AND s.state->>'authorizedFor' IS NOT NULL
      AND CASE WHEN s.state->>'leaseUntil' ~ '^[0-9]{1,16}$' THEN (s.state->>'leaseUntil')::bigint ELSE 0 END <= ${now}
      AND CASE WHEN s.state->>'nextCheckAt' ~ '^[0-9]{1,16}$' THEN (s.state->>'nextCheckAt')::bigint ELSE 0 END <= ${now}
    ORDER BY CASE WHEN s.state->>'nextCheckAt' ~ '^[0-9]{1,16}$' THEN (s.state->>'nextCheckAt')::bigint ELSE 0 END,i.id LIMIT 3`;
}

function state(config: Record<string, unknown>): State {
  const saved = object(config.ecommerceTemplateSetup);
  return { version: 1, wabas: { ...object(saved.wabas) } };
}
function waba(m: TemplateMerchant): WabaState {
  const row = object(state(m.config).wabas[m.wabaId]);
  return { ...row, items: { ...object(row.items) } };
}
function shape(row: Record<string, any>): RecoveryTemplateShape {
  // Library status may be stale after a pause; actual live approval remains mandatory.
  return { name: row.name, language: row.language, status: "approved", category: row.category,
    bodyText: row.body_text, headerType: row.header_type, templateType: row.template_type,
    buttons: row.buttons, carouselCards: row.carousel_cards };
}
/** Merchant-selected content is validated by the same delivery guards. */
export function compatibleShopifyTemplate(local: RecoveryTemplateShape, live: unknown, journey: ShopifyTemplateJourney|PostPurchaseJourney): boolean {
  if (!/^[a-z][a-z0-9_]{0,511}$/.test(local.name ?? "") ||
      !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(local.language ?? "")) return false;
  return journey === "checkoutRecovery" ? validateRecoveryMetaTemplate(local, live).ok :
    matchPostPurchaseTemplate(local, live, journey);
}
export function packageTemplateCompatible(template: ShopifyGrowthTemplate, raw: unknown): boolean {
  const live = object(raw);
  return numericId(live.id) && ["en", "en_US"].includes(live.language) && compatibleShopifyTemplate({
    name: live.name, language: live.language, status: "approved", category: template.category,
    bodyText: template.bodyText, templateType: "text", headerType: "none", buttons: [], carouselCards: [],
  }, raw, template.journey);
}
export function templateProvisioningFailure(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  return ["meta_credentials_expired", "meta_management_permission_required", "meta_connection_changed",
    "meta_template_inventory_incomplete", "meta_rate_limited"].includes(code) ? code : "meta_temporarily_unavailable";
}

/** Durable state lives in the existing installation config. No sender import.
 * All state/binding writes serialize with Shopify uninstall/erasure and current
 * Meta owner credentials. A committed attempt fence precedes the provider POST;
 * rollback, timeout, crash or restart can only reconcile it, never resubmit it.
 */
export function createShopifyTemplateProvisioner(deps: {
  database: TemplateDatabase; provider: TemplateProvider; env: Env; now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  /** Pausing needs current ownership/privacy protection, never send prerequisites. */
  async function lockedInstallation<T>(accountId: string,
    fn: (tx: TemplateTx, installation: TemplateInstallation, owner: Record<string, unknown>) => Promise<T>): Promise<T | null> {
    return deps.database.transaction(async tx => {
      const hint = (await tx.execute(sql`SELECT shopify_shop FROM users WHERE id=${accountId}`)).rows[0]?.shopify_shop;
      if (typeof hint !== "string" || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(hint)) return null;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${hint},0))`);
      const owner = (await tx.execute(sql`SELECT id,shopify_shop,shopify_access_token,shopify_subscription_status,
        shopify_installed_at,deletion_requested_at,meta_connected,meta_access_token,meta_business_account_id,
        meta_phone_number_id,meta_token_expires_at,whatsapp_provider,
        jsonb_build_object('billingPlan',billing_plan,'subscriptionStatus',subscription_status,
          'planOverrideEnabled',plan_override_enabled,'planOverride',plan_override,'trialEndsAt',trial_ends_at,
          'trialStatus',trial_status,'trialPlan',trial_plan,'shopifyShop',shopify_shop,
          'shopifySubscriptionStatus',shopify_subscription_status) AS entitlement
        FROM users WHERE id=${accountId} AND shopify_shop=${hint} FOR SHARE`)).rows[0];
      if (!owner || owner.deletion_requested_at ||
          ["uninstalled", "redacted"].includes(String(owner.shopify_subscription_status).toLowerCase())) return null;
      const installations = await tx.execute(sql`SELECT id,config FROM integrations WHERE user_id=${accountId}
        AND type='shopify' AND is_active IS TRUE LIMIT 2 FOR UPDATE`);
      if (installations.rows.length !== 1) return null;
      const installation = installations.rows[0], config = object(installation.config);
      if ([config.shop, config.shopUrl].some(shop => shop != null && shop !== hint)) return null;
      return fn(tx, { accountId, shop: hint, installationId: String(installation.id), config }, owner);
    });
  }
  async function currentMerchant(tx: TemplateTx, installation: TemplateInstallation,
    owner: Record<string, unknown>): Promise<TemplateMerchant | null> {
    if (!owner.shopify_access_token || !Number.isFinite(millis(owner.shopify_installed_at)) ||
        getEffectivePlanForUser(owner.entitlement as Parameters<typeof getEffectivePlanForUser>[0], new Date(now())) !== "pro") return null;
    const activation = await tx.execute(sql`SELECT account_id FROM ecommerce_shopify_workspace_activations
      WHERE account_id=${installation.accountId} AND installation_id=${installation.installationId} AND shop=${installation.shop} LIMIT 1`);
    if (activation.rows.length !== 1) return null;
    if (owner.meta_connected !== true || !owner.meta_access_token || !numericId(owner.meta_business_account_id) ||
        !numericId(owner.meta_phone_number_id) || owner.whatsapp_provider === "twilio") return null;
    const expiry = owner.meta_token_expires_at == null ? null : new Date(String(owner.meta_token_expires_at)).getTime();
    if (expiry !== null && (!Number.isFinite(expiry) || expiry <= now())) throw Error("meta_credentials_expired");
    const wabaId = owner.meta_business_account_id;
    // Also serialize different installations/workers using this same merchant WABA.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"shopify-template:" + wabaId},0))`);
    const fingerprint = commerceConnectionFingerprint({ ...installation, wabaId,
      phoneId:owner.meta_phone_number_id,installedAt:owner.shopify_installed_at });
    return { ...installation, wabaId, fingerprint, phoneId:owner.meta_phone_number_id,
      installedAt:millis(owner.shopify_installed_at) };
  }
  async function locked<T>(accountId: string, fn: (tx: TemplateTx, merchant: TemplateMerchant) => Promise<T>): Promise<T | null> {
    return lockedInstallation(accountId, async (tx, installation, owner) => {
      const merchant = await currentMerchant(tx, installation, owner);
      return merchant ? fn(tx, merchant) : null;
    });
  }
  async function persist(tx: TemplateTx, m: TemplateMerchant, s: WabaState) {
    const saved = state(m.config); saved.wabas[m.wabaId] = s;
    await tx.execute(sql`UPDATE integrations SET config=jsonb_set(COALESCE(config,'{}'::jsonb),
      '{ecommerceTemplateSetup}',${JSON.stringify(saved)}::jsonb,true)
      WHERE id=${m.installationId} AND user_id=${m.accountId} AND type='shopify' AND is_active IS TRUE`);
  }
  async function authorize(accountId: string): Promise<boolean> {
    if (!shopifyTemplateSetupAllowed(deps.env, accountId)) return false;
    return await locked(accountId, async (tx, m) => {
      if (Object.keys(state(m.config).wabas).length >= 20 && !state(m.config).wabas[m.wabaId]) return false;
      const s = waba(m);
      s.authorizedFor = m.fingerprint; s.authorizedAt = now(); s.nextCheckAt = now();
      s.phoneId=m.phoneId;s.installedAt=m.installedAt;
      // Reauthorization NEVER clears attemptedAt, provider IDs, or live worker leases.
      await persist(tx, m, s);
      if(merchantProductionAvailable(deps.env,m.accountId,m.shop)&&!merchantReleaseCurrent(deps.env,m))await tx.execute(sql`UPDATE integrations SET config=jsonb_set(config,
        '{ecommerceMerchantRelease}',${JSON.stringify({version:1,connection:m.fingerprint,authorizedAt:new Date(now()).toISOString()})}::jsonb,true)
        WHERE id=${m.installationId} AND user_id=${accountId} AND type='shopify' AND is_active IS TRUE`);
      return true;
    }) ?? false;
  }
  async function controlledPostPurchaseJourney(tx: TemplateTx, m: TemplateMerchant, intentsReady: boolean): Promise<unknown> {
    const scope = readControlledPostPurchaseScope(deps.env);
    if (!scope || !intentsReady) return null;
    return (await tx.execute(sql`SELECT journey FROM ecommerce_post_purchase_intents
      WHERE id=${scope.intentId}::bigint AND account_id=${m.accountId} AND shop=${m.shop}
        AND installation_id=${m.installationId} LIMIT 1`)).rows[0]?.journey ?? null;
  }
  async function deliveryReadiness(tx:TemplateTx,m:TemplateMerchant){
    const schema=(await tx.execute(postPurchaseDeliveryReadinessQuery)).rows[0];
    const selfService=merchantReleaseCurrent(deps.env,m);
    const post=postPurchaseActivationReadiness(deps.env,m.accountId,m.config,
      schema?.outbox===true&&schema?.intents===true&&schema?.consents===true,selfService);
    const production=readProductionRecoveryScope(deps.env), s=waba(m), recovery=s.items.checkoutRecovery;
    const bindings=readPostPurchaseTemplateBindings(m.config);
    const selected=Object.entries(readPostPurchasePlans(m.config)).filter(([,p])=>p.selected);
    const selectedTemplatesCurrent=selected.length>0&&selected.every(([journey])=>{
      const item=s.items[journey as ShopifyTemplateJourney];
      return item?.status==='ready'&&item.templateId===bindings[journey as PostPurchaseJourney]&&
        typeof item.checkedAt==='number'&&now()-item.checkedAt<=30*60_000;
    });
    const scopeMatchesSelection = selfService || deps.env.RAILWAY_ENVIRONMENT_NAME !== 'production' ||
      selected.length === 1 && selected[0][0] === await controlledPostPurchaseJourney(tx, m, schema?.intents === true);
    const enrollment=savedEnrollment(m.config.ecommerceConsentEnrollment);
    const enrollmentCurrent=!!enrollment&&enrollment.connection===m.fingerprint&&enrollment.savedBy===m.accountId;
    const consentSetupPost=!selfService||enrollmentCurrent&&selected.every(([journey])=>enrollment.purposes[journey as PostPurchaseJourney]?.selected);
    const consentSetupRecovery=!selfService||enrollmentCurrent&&enrollment.purposes.checkoutRecovery.selected;
    const postReady = consentSetupPost && post.canActivate && selectedTemplatesCurrent && s.authorizedFor === m.fingerprint && scopeMatchesSelection;
    const recoverySchema=(await tx.execute(recoveryRuntimeSchemaReadyQuery())).rows[0]?.ready===true;
    const recoveryReleased=selfService||!!production&&production.accountId===m.accountId&&production.shop===m.shop ||
      recoveryWorkerEnabled(deps.env)&&deps.env.ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID===m.accountId;
    const recoveryReady=consentSetupRecovery&&recoveryReleased&&recoverySchema&&s.authorizedFor===m.fingerprint&&
      recovery?.status==='ready'&&recovery.templateId===m.config.ecommerceCheckoutRecoveryTemplateId&&
      typeof recovery.checkedAt==='number'&&now()-recovery.checkedAt<=30*60_000;
    return {
      postPurchase:{canActivate:postReady,merchantEnabled:post.merchantEnabled,
        deliveryEnabled:postReady&&post.merchantEnabled&&
          (selfService?m.config.ecommercePostPurchaseDeliveryConnection===m.fingerprint:!m.config.ecommercePostPurchaseDeliveryConnection||m.config.ecommercePostPurchaseDeliveryConnection===m.fingerprint),
        reason:!consentSetupPost?'consent_setup_required':post.blockers[0]??(!scopeMatchesSelection?'controlled_journey_release_required':
          !selectedTemplatesCurrent||s.authorizedFor!==m.fingerprint?'verification_required':'merchant_activation_required')},
      checkoutRecovery:{canActivate:recoveryReady,merchantEnabled:m.config.ecommerceCheckoutRecoveryDeliveryEnabled===true,
        deliveryEnabled:recoveryReady&&m.config.ecommerceCheckoutRecoveryDeliveryEnabled===true&&m.config.ecommerceCheckoutRecoveryDeliveryConnection===m.fingerprint,
        reason:!consentSetupRecovery?'consent_setup_required':!recoveryReleased?'operator_release_required':!recoverySchema?'schema_required':!recoveryReady?'verification_required':'merchant_activation_required'},
    };
  }
  async function savePlan(accountId:string,journey:PostPurchaseJourney,plan:JourneyPlan):Promise<boolean>{
    return await locked(accountId,async(tx,m)=>{
      if(m.config.ecommercePostPurchaseDeliveryEnabled===true&&plan.selected&&!readPostPurchasePlans(m.config)[journey].selected)return false;
      const saved=await tx.execute(savePostPurchasePlanQuery({accountId,shop:m.shop,integrationId:m.installationId,journey,plan}));
      return saved.rows.length===1;
    })??false;
  }
  /** Enrollment configuration uses the same owner, installation, privacy and WABA
   * locks as setup. It never writes consent, outbox, activation or credentials. */
  async function saveEnrollment(accountId: string, draft: EnrollmentDraft): Promise<boolean> {
    return await locked(accountId, async (tx, m) => {
      const saved = stampEnrollment(draft, accountId, m.shop, m.fingerprint, now());
      if (!saved) return false;
      const result = await tx.execute(sql`UPDATE integrations SET config=jsonb_set(COALESCE(config,'{}'::jsonb),
        '{ecommerceConsentEnrollment}',${JSON.stringify(saved)}::jsonb,true)
        WHERE id=${m.installationId} AND user_id=${accountId} AND type='shopify' AND is_active IS TRUE RETURNING id`);
      return result.rows.length === 1;
    }) ?? false;
  }
  async function enrollmentView(accountId: string): Promise<EnrollmentView | null> {
    return locked(accountId, async (tx, m) => {
      const saved = savedEnrollment(m.config.ecommerceConsentEnrollment);
      const current = !!saved && saved.connection === m.fingerprint && saved.savedBy === accountId;
      // Read only the connected merchant's display number, never a caller-supplied
      // destination or the numeric Graph phone_number_id. Missing metadata fails closed.
      const metadata = (await tx.execute(sql`SELECT meta_display_phone_number AS display_phone, email AS owner_email
        FROM users u WHERE id=${accountId} AND meta_phone_number_id=${m.phoneId}
          AND meta_business_account_id=${m.wabaId} FOR SHARE`)).rows[0];
      const phone = metadata?.display_phone;
      const selfService=merchantReleaseCurrent(deps.env,m);
      const capture = enrollmentCaptureReadiness(deps.env, accountId, m.shop, m.fingerprint,selfService);
      const postTables = postPurchaseTables((await tx.execute(postPurchaseTablesQuery)).rows[0]);
      const evidenceSchema = (await tx.execute(consentCaptureSchemaQuery)).rows[0];
      const captureSchema = {
        postPurchase: postTables.intents && postTables.orders && postTables.consents && evidenceSchema?.post_purchase === true,
        checkoutRecovery: evidenceSchema?.recovery === true,
      };
      if (!selfService && deps.env.RAILWAY_ENVIRONMENT_NAME === 'production' &&
        productionConsentCaptureBlocker(deps.env, accountId, m.shop, m.fingerprint) !== null && !isEcommercePilotOwner({ id: accountId,
        email: typeof metadata?.owner_email === 'string' ? metadata.owner_email : null }, deps.env)) capture.postPurchase = false;
      const delivery = await deliveryReadiness(tx, m), s = waba(m);
      const plans = readPostPurchasePlans(m.config), bindings = readPostPurchaseTemplateBindings(m.config);
      const recoveryScope = readProductionRecoveryScope(deps.env, now());
      const recoveryReleased = selfService || !!recoveryScope && recoveryScope.accountId === accountId && recoveryScope.shop === m.shop ||
        recoveryWorkerEnabled(deps.env) && deps.env.ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID === accountId;
      // A production release authorizes one existing intent, not every purpose.
      // Return only its journey; never expose recipient digests or order identity.
      const postReleased = selfService || postPurchaseOperatorReady(deps.env, accountId);
      const releasedJourney = postReleased && deps.env.RAILWAY_ENVIRONMENT_NAME === 'production' ?
        await controlledPostPurchaseJourney(tx, m, postTables.intents) : null;
      return {
        shop: m.shop, draft: saved ? { locale: saved.locale, sourceUrl: saved.sourceUrl, merchantName: saved.merchantName, purposes: saved.purposes } : null,
        revision: saved?.revision ?? null, savedAt: saved?.savedAt ?? null, connectionCurrent: current,
        phoneAvailable: enrollmentLink(phone, 'orderConfirmation') !== null,
        rows: CONSENT_PURPOSES.map(purpose => {
          const kind = isPostPurchasePurpose(purpose) ? 'postPurchase' : 'checkoutRecovery';
          const state = delivery[kind], item = s.items[purpose];
          const binding = isPostPurchasePurpose(purpose) ? bindings[purpose] : m.config.ecommerceCheckoutRecoveryTemplateId;
          const templateReady = s.authorizedFor === m.fingerprint && item?.status === 'ready' && !!binding &&
            item.templateId === binding && typeof item.checkedAt === 'number' && now() - item.checkedAt <= 30 * 60_000;
          const selected = isPostPurchasePurpose(purpose) ? plans[purpose].selected : state.merchantEnabled;
          const operatorReleased = kind === 'postPurchase' ? postReleased &&
            (selfService || deps.env.RAILWAY_ENVIRONMENT_NAME !== 'production' || releasedJourney === purpose) : recoveryReleased;
          return { purpose, selected, templateReady, merchantEnabled: selected && state.merchantEnabled,
            operatorReleased, captureReady: capture[kind] && captureSchema[kind], activationBlocked: !operatorReleased || !state.canActivate || !templateReady || (isPostPurchasePurpose(purpose) && !selected),
            recipientConsent: 'required_per_recipient' as const,
            blockers: [...(!selected ? ['journey_not_selected'] : []), ...(!templateReady ? ['template_verification_required'] : []),
              ...(!operatorReleased ? ['operator_release_required'] : []), ...(!capture[kind] ? [enrollmentCaptureBlocker(deps.env, accountId, m.shop, m.fingerprint)] : []),
              ...(!captureSchema[kind] ? ['consent_schema_required'] : []),
              ...(!state.canActivate ? [state.reason] : []), ...(!state.merchantEnabled ? ['merchant_activation_required'] : []),
              'recipient_consent_required'],
            notice: saved?.purposes[purpose].selected ? enrollmentNotice(m.shop, purpose, saved) : null,
            link: current && saved?.purposes[purpose].selected && capture[kind] && captureSchema[kind] ? enrollmentLink(phone, purpose) : null };
        }),
      };
    });
  }
  async function setDelivery(accountId:string,kind:'postPurchase'|'checkoutRecovery',enabled:boolean):Promise<boolean>{
    if(!enabled)return await lockedInstallation(accountId,async(tx,installation)=>
      (await saveDelivery(tx,installation,kind,false)).rows.length===1)??false;
    return await locked(accountId,async(tx,m)=>{
      if(enabled){
        const readiness=await deliveryReadiness(tx,m);
        if(!readiness[kind].canActivate)return false;
        // Current WABA approval/shape is checked under the same owner/privacy lock
        // as activation. Existing manually selected templates remain supported.
        const inventory=(await deps.provider.list(m)).map(object);
        const journeys=kind==='checkoutRecovery'?['checkoutRecovery' as const]:
          (Object.entries(readPostPurchasePlans(m.config)).filter(([,p])=>p.selected).map(([j])=>j as PostPurchaseJourney));
        for(const journey of journeys){
          const id=journey==='checkoutRecovery'?m.config.ecommerceCheckoutRecoveryTemplateId:readPostPurchaseTemplateBindings(m.config)[journey];
          const local=(await tx.execute(sql`SELECT * FROM message_templates WHERE id=${id??null} AND user_id=${accountId} LIMIT 2 FOR SHARE`)).rows;
          const matches=local.length===1?inventory.filter(t=>local[0].twilio_sid===`meta_${t.id}_${t.language}`):[];
          if(local.length!==1||matches.length!==1||String(local[0].status).toLowerCase()!=='approved'||
            !compatibleShopifyTemplate(shape(local[0]),matches[0],journey))return false;
        }
      }
      const saved=await saveDelivery(tx,m,kind,enabled);
      if(enabled&&merchantReleaseCurrent(deps.env,m)&&(m.config[kind==='postPurchase'?'ecommercePostPurchaseDeliveryEnabled':'ecommerceCheckoutRecoveryDeliveryEnabled']!==true||
          m.config[kind==='postPurchase'?'ecommercePostPurchaseDeliveryConnection':'ecommerceCheckoutRecoveryDeliveryConnection']!==m.fingerprint))
        await tx.execute(sql`UPDATE integrations SET config=jsonb_set(config,
          ${kind==='postPurchase'?'{ecommercePostPurchaseActivatedAt}':'{ecommerceCheckoutRecoveryActivatedAt}'}::text[],
          ${JSON.stringify(new Date(now()).toISOString())}::jsonb,true) WHERE id=${m.installationId} AND user_id=${accountId}`);
      if(enabled)await tx.execute(sql`UPDATE integrations SET config=jsonb_set(config,
        ${kind==='postPurchase'?'{ecommercePostPurchaseDeliveryConnection}':'{ecommerceCheckoutRecoveryDeliveryConnection}'}::text[],
        ${JSON.stringify(m.fingerprint)}::jsonb,true) WHERE id=${m.installationId} AND user_id=${accountId}`);
      return saved.rows.length===1;
    })??false;
  }
  function saveDelivery(tx:TemplateTx,m:TemplateInstallation,kind:'postPurchase'|'checkoutRecovery',enabled:boolean){
    return kind==='postPurchase'?tx.execute(savePostPurchaseActivationQuery(m.accountId,m.shop,m.installationId,enabled)):
      tx.execute(sql`UPDATE integrations SET config=jsonb_set(COALESCE(config,'{}'::jsonb),'{ecommerceCheckoutRecoveryDeliveryEnabled}',
        ${JSON.stringify(enabled)}::jsonb,true) WHERE id=${m.installationId} AND user_id=${m.accountId}
          AND type='shopify' AND is_active IS TRUE RETURNING id`);
  }
  async function setTemplate(accountId:string,journey:ShopifyTemplateJourney,templateId:string|null):Promise<boolean>{
    return await locked(accountId,async(tx,m)=>{
      if(!shopifyTemplateSetupAllowed(deps.env,accountId)||
        m.config[journey==='checkoutRecovery'?'ecommerceCheckoutRecoveryDeliveryEnabled':'ecommercePostPurchaseDeliveryEnabled']===true)return false;
      const s=waba(m);if(s.authorizedFor!==m.fingerprint)return false;
      let local:Record<string,any>|undefined;
      if(templateId){
        const rows=(await tx.execute(sql`SELECT * FROM message_templates WHERE id=${templateId} AND user_id=${accountId} LIMIT 2 FOR SHARE`)).rows;
        local=rows.length===1?rows[0]:undefined;
        const inventory=(await deps.provider.list(m)).map(object);
        const matches=local?inventory.filter(t=>local!.twilio_sid===`meta_${t.id}_${t.language}`):[];
        if(!local||String(local.status).toLowerCase()!=='approved'||matches.length!==1||!compatibleShopifyTemplate(shape(local),matches[0],journey))return false;
      }
      if(journey==='checkoutRecovery'){
        await tx.execute(sql`UPDATE integrations SET config=jsonb_set(config,'{ecommerceCheckoutRecoveryTemplateId}',${JSON.stringify(templateId)}::jsonb,true)
          WHERE id=${m.installationId} AND user_id=${accountId}`);
        await tx.execute(sql`UPDATE integrations SET config=jsonb_set(config,'{ecommercePostPurchaseTemplateAutoDisabled}',
          COALESCE(config->'ecommercePostPurchaseTemplateAutoDisabled','{}'::jsonb)||jsonb_build_object('checkoutRecovery',${templateId===null}),true)
          WHERE id=${m.installationId} AND user_id=${accountId}`);
      }else await tx.execute(savePostPurchaseTemplateBindingQuery({accountId,shop:m.shop,integrationId:m.installationId,journey,templateId}));
      s.items[journey]={...s.items[journey],journey,name:String(local?.name??''),templateId:templateId??undefined,
        checkedAt:now(),status:templateId?'ready':'paused',reason:templateId?'approved_and_bound':'merchant_template_paused'};
      await persist(tx,m,s);return true;
    })??false;
  }
  async function messagingSummary(tx:TemplateTx,m:TemplateMerchant){
    try{
    const schema=(await tx.execute(postPurchaseDeliveryReadinessQuery)).rows[0];
    const recovery=(await tx.execute(recoveryRuntimeSchemaReadyQuery())).rows[0]?.ready===true;
    if(!schema?.outbox||!recovery)return null;
    const rows=await tx.execute(sql`SELECT count(*) FILTER(WHERE state='pending')::int AS pending,
      count(*) FILTER(WHERE state='accepted')::int AS accepted,
      count(*) FILTER(WHERE state='uncertain')::int AS uncertain,
      count(*) FILTER(WHERE meta_delivery_status IN ('delivered','read'))::int AS delivered,
      count(*) FILTER(WHERE meta_delivery_status='failed')::int AS failed FROM (
        SELECT state,meta_delivery_status FROM ecommerce_post_purchase_outbox WHERE account_id=${m.accountId} AND shop=${m.shop} AND installation_id=${m.installationId}
        UNION ALL SELECT state,meta_delivery_status FROM ecommerce_checkout_recovery_outbox WHERE account_id=${m.accountId} AND shop=${m.shop}
      ) deliveries`);
    const row=rows.rows[0];return row?{pending:Number(row.pending),accepted:Number(row.accepted),uncertain:Number(row.uncertain),delivered:Number(row.delivered),failed:Number(row.failed)}:null;
    }catch{return null;}
  }
  async function view(accountId: string): Promise<ShopifyTemplateSetup> {
    const available = shopifyTemplateSetupAllowed(deps.env, accountId);
    const fallback = (connected = false, reason = "connect_whatsapp", installation?:TemplateInstallation): ShopifyTemplateSetup => ({
      available, connected, authorized: false, rows: SHOPIFY_GROWTH_TEMPLATES.map(t => ({
        journey: t.journey, name: t.name, status: "unavailable", reason,
      })),
      ...(installation?{postPurchasePlans:readPostPurchasePlans(installation.config),delivery:{
        postPurchase:{canActivate:false,merchantEnabled:installation.config.ecommercePostPurchaseDeliveryEnabled===true,deliveryEnabled:false,reason},
        checkoutRecovery:{canActivate:false,merchantEnabled:installation.config.ecommerceCheckoutRecoveryDeliveryEnabled===true,deliveryEnabled:false,reason},
      }}:{}),
    });
    try {
      return await lockedInstallation(accountId, async (tx, installation, owner) => {
        let m:TemplateMerchant|null;
        try { m=await currentMerchant(tx,installation,owner); }
        catch(error){return fallback(owner.meta_connected===true,templateProvisioningFailure(error),installation);}
        if(!m)return fallback(false,'connect_whatsapp',installation);
        const s = waba(m), authorized = s.authorizedFor === m.fingerprint;
        const libraryReady=authorized&&(await tx.execute(sql`SELECT to_regclass('message_templates') IS NOT NULL AS ready`)).rows[0]?.ready===true;
        const library=libraryReady?(await tx.execute(sql`SELECT * FROM message_templates WHERE user_id=${accountId} AND lower(status)='approved' ORDER BY name,id LIMIT 200`)).rows:[];
        return { available, connected: true, authorized,postPurchasePlans:readPostPurchasePlans(m.config),
          delivery:await deliveryReadiness(tx,m),messaging:await messagingSummary(tx,m),
          rows: SHOPIFY_GROWTH_TEMPLATES.map(t => {
            const item = s.items[t.journey];
            if (!authorized || !item) return { journey: t.journey, name: t.name,
              status: "unavailable" as const, reason: available ? "authorize_template_setup" : "operator_release_required" };
            if (!available || (item.status === "ready" && (!item.checkedAt || now() - item.checkedAt > 30 * 60_000)))
              return { journey: t.journey, name: item.name, status: "unavailable" as const, reason: "verification_required" };
            // Only public progress fields, never WABA identifiers, credentials or leases.
            return { journey: t.journey, name: item.name, status: item.status,
              reason: item.reason, templateId: item.templateId, checkedAt: item.checkedAt,
              choices:library.filter(row=>t.journey==='checkoutRecovery'?typeof row.twilio_sid==='string'&&row.twilio_sid.startsWith('meta_')&&
                String(row.category).toLowerCase()==='marketing'&&typeof row.body_text==='string'&&row.body_text.includes('{{1}}')&&
                !/\{\{(?!1\}\})/.test(row.body_text)&&(!row.header_type||row.header_type==='none')&&(!row.template_type||row.template_type==='text')&&
                (!row.buttons||Array.isArray(row.buttons)&&!row.buttons.length)&&(!row.carousel_cards||Array.isArray(row.carousel_cards)&&!row.carousel_cards.length):
                eligiblePostPurchaseLibraryTemplate(row,t.journey)).map(row=>({id:String(row.id),name:String(row.name),language:String(row.language),bodyText:String(row.body_text)})) };
          }) };
      }) ?? fallback();
    } catch (error) { return fallback(true, templateProvisioningFailure(error)); }
  }
  async function reconcile(accountId: string): Promise<"disabled" | "busy" | "reconciled"> {
    if (!shopifyTemplateSetupAllowed(deps.env, accountId)) return "disabled";
    const leaseId = randomUUID();
    const claimed = await locked(accountId, async (tx, m) => {
      const s = waba(m);
      if (s.authorizedFor !== m.fingerprint || (s.leaseUntil ?? 0) > now() || (s.nextCheckAt ?? 0) > now()) return null;
      s.leaseId = leaseId; s.leaseUntil = now() + 120_000;
      await persist(tx, m, s); return m;
    });
    if (!claimed) return "busy";
    try {
      const inventory = await deps.provider.list(claimed);
      let created = false;
      for (const template of SHOPIFY_GROWTH_TEMPLATES) {
        await locked(accountId, async (tx, m) => {
          const s = waba(m);
          if (!shopifyTemplateSetupAllowed(deps.env,accountId) || m.fingerprint !== claimed.fingerprint || s.authorizedFor !== m.fingerprint || s.leaseId !== leaseId) return;
          const previous = s.items[template.journey];
          const item: Item = { ...previous, journey: template.journey, name: template.name,
            status: "action_required", reason: "template_changed", checkedAt: now() };
          const binding = template.journey === "checkoutRecovery" ? m.config.ecommerceCheckoutRecoveryTemplateId :
            readPostPurchaseTemplateBindings(m.config)[template.journey];
          if(!binding&&object(m.config.ecommercePostPurchaseTemplateAutoDisabled)[template.journey]===true){
            s.items[template.journey]={...item,status:'paused',reason:'merchant_template_paused'};
            await persist(tx,m,s);return;
          }
          let live: Record<string, any> | undefined;
          let local: Record<string, any> | undefined;
          if (typeof binding === "string" && binding) {
            const owned = await tx.execute(sql`SELECT * FROM message_templates WHERE user_id=${accountId} AND id=${binding} LIMIT 2 FOR UPDATE`);
            local = owned.rows.length === 1 ? owned.rows[0] : undefined;
            const matches = local ? inventory.map(object).filter(t => local!.twilio_sid === `meta_${t.id}_${t.language}`) : [];
            live = matches.length === 1 && numericId(matches[0].id) ? matches[0] : undefined;
            if (!local || !live || !compatibleShopifyTemplate({...shape(local),category:String(live.category)}, live, template.journey)) {
              item.reason = "selected_template_requires_attention";
            }
          } else {
            const candidates = inventory.map(object).filter(t => t.name === template.name && ["en", "en_US"].includes(t.language));
            const approved = inventory.map(object).filter(t => packageTemplateCompatible(template, t)).sort((a,b)=>
              Number(b.name===template.name)-Number(a.name===template.name)||Number(b.language==='en')-Number(a.language==='en')||
              String(a.name).localeCompare(String(b.name))||String(a.id).localeCompare(String(b.id)));
            if (approved.length) live = approved[0];
            else if (candidates.length) {
              live = candidates.length === 1 ? candidates[0] : undefined;
              item.reason = "existing_template_conflict";
            } else if (previous?.attemptedAt) {
              item.reason = previous.providerId ? "submitted_template_not_visible" : "submission_uncertain";
            } else if (!created) {
              // Autocommitted before the separate network transaction below.
              item.attemptedAt = now(); item.status = "awaiting_approval"; item.reason = "submission_pending";
              created = true;
            } else { item.status = "awaiting_approval"; item.reason = "setup_queued"; }
          }
          if (live) {
            const status = String(live.status).toUpperCase();
            if (status === "PENDING" || status === "IN_APPEAL") {
              item.status = "awaiting_approval"; item.reason = "meta_review_pending";
            } else if (status === "PAUSED" || status === "DISABLED") {
              item.status = "paused"; item.reason = "meta_template_paused";
            } else if (status === "REJECTED") item.reason = "meta_template_rejected";
            else if ((local && compatibleShopifyTemplate({...shape(local),category:String(live.category)}, live, template.journey)) ||
                (!binding && packageTemplateCompatible(template, live))) {
              const parsed = parseMetaGraphTemplateForLibrary({ name: live.name, components: live.components });
              const sid = `meta_${live.id}_${live.language}`;
              const rows = await tx.execute(sql`SELECT id FROM message_templates WHERE user_id=${accountId} AND twilio_sid=${sid} LIMIT 2 FOR UPDATE`);
              if (rows.rows.length > 1) throw Error("duplicate_library_template");
              let id = rows.rows[0]?.id;
              if (!id) id = (await tx.execute(sql`INSERT INTO message_templates
                (user_id,twilio_sid,name,language,category,status,template_type,body_text,footer_text,header_type,buttons,carousel_cards,variables)
                VALUES (${accountId},${sid},${live.name},${live.language},${String(live.category).toLowerCase()},'approved',
                  'text',${parsed.bodyText},${parsed.footerText},NULL,'[]'::jsonb,'[]'::jsonb,${JSON.stringify(parsed.variables)}::jsonb)
                RETURNING id`)).rows[0]?.id;
              else await tx.execute(sql`UPDATE message_templates SET status='approved',last_synced_at=NOW(),
                name=${live.name},language=${live.language},category=${String(live.category).toLowerCase()},
                body_text=${parsed.bodyText},footer_text=${parsed.footerText},template_type='text',header_type=NULL,
                buttons='[]'::jsonb,carousel_cards='[]'::jsonb,variables=${JSON.stringify(parsed.variables)}::jsonb
                WHERE id=${id} AND user_id=${accountId}`);
              if (!id) throw Error("template_sync_failed");
              if (!binding) {
                if (template.journey === "checkoutRecovery") await tx.execute(sql`UPDATE integrations SET config=jsonb_set(config,
                  '{ecommerceCheckoutRecoveryTemplateId}',${JSON.stringify(String(id))}::jsonb,true)
                  WHERE id=${m.installationId} AND user_id=${accountId} AND is_active IS TRUE`);
                else await tx.execute(savePostPurchaseTemplateBindingQuery({ integrationId: m.installationId,
                  accountId, shop: m.shop, journey: template.journey, templateId: String(id),automatic:true }));
              }
              item.status = "ready"; item.reason = "approved_and_bound"; item.templateId = String(id);
            } else if (String(live.category).toUpperCase() !== template.category) item.reason = "meta_category_changed";
            if (numericId(live.id)) item.providerId = live.id;
            // Block stale library approval, preserving merchant content and selections.
            if (item.status !== "ready" && local) await tx.execute(sql`UPDATE message_templates SET status=${status.toLowerCase()},category=${String(live.category).toLowerCase()},
              last_synced_at=NOW() WHERE id=${local.id} AND user_id=${accountId}`);
          }
          s.items[template.journey] = item; await persist(tx, m, s);
        });
        // A single new POST per tick. The attempt marker was committed above.
        await locked(accountId, async (tx, m) => {
          const s = waba(m), item = s.items[template.journey];
          if (!shopifyTemplateSetupAllowed(deps.env,accountId) || m.fingerprint !== claimed.fingerprint || s.authorizedFor !== m.fingerprint || s.leaseId !== leaseId ||
              item?.reason !== "submission_pending" || item.providerId) return;
          // Mark ambiguous *before* the request; failure to commit afterwards cannot clear the fence.
          // Only this lease reaches this block; later ticks see attemptedAt and reconcile only.
          try {
            const result = await deps.provider.create(m, template);
            if (!numericId(result.id)) throw Error("meta_invalid_create_response");
            item.providerId = result.id; item.reason = "meta_review_pending";
          } catch (error) {
            item.status = "action_required"; item.reason = templateProvisioningFailure(error);
          }
          await persist(tx, m, s);
        });
      }
      await locked(accountId, async (tx, m) => {
        const s = waba(m); if (s.leaseId !== leaseId) return;
        // Existing, merchant-configured Marketing journeys use the same strict
        // library/live validation. No new variants or review/win-back templates
        // are created, and their separate purpose consent remains in the worker.
        for(const journey of ['reviewRequest','repeatPurchase','winBack'] as const){
          const id=readPostPurchaseTemplateBindings(m.config)[journey];
          if(!id)continue;
          const rows=(await tx.execute(sql`SELECT * FROM message_templates WHERE id=${id} AND user_id=${accountId} LIMIT 2 FOR SHARE`)).rows;
          const matches=rows.length===1?inventory.map(object).filter(t=>rows[0].twilio_sid===`meta_${t.id}_${t.language}`):[];
          const live=matches.length===1?matches[0]:null;
          const approved=rows.length===1&&!!live&&compatibleShopifyTemplate(shape(rows[0]),live,journey);
          const paused=live&&['PAUSED','DISABLED'].includes(live.status);
          s.items[journey]={journey,name:String(rows[0]?.name??''),templateId:id,checkedAt:now(),
            status:approved?'ready':paused?'paused':'action_required',reason:approved?'approved_and_bound':'selected_template_requires_attention'};
        }
        s.leaseUntil = 0; s.nextCheckAt = now() + (created ? 60_000 : 5 * 60_000); await persist(tx, m, s);
      });
    } catch (error) {
      await locked(accountId, async (tx, m) => {
        const s = waba(m); if (s.leaseId !== leaseId) return;
        s.items = Object.fromEntries(SHOPIFY_GROWTH_TEMPLATES.map(t => [t.journey, {
          ...s.items[t.journey], journey: t.journey, name: t.name, status: "action_required",
          reason: templateProvisioningFailure(error), checkedAt: now(),
        }]));
        s.leaseUntil = 0; s.nextCheckAt = now() + 15 * 60_000; await persist(tx, m, s);
      });
    }
    return "reconciled";
  }
  /** Internal adapter only. Never serialize the token into a merchant/public view. */
  async function consentInstallation(accountId: string) {
    return lockedInstallation(accountId, async (tx, installation, owner) => {
      const merchant = await currentMerchant(tx, installation, owner);
      return merchant ? { shop: merchant.shop, token: String(owner.shopify_access_token),
        connection: merchant.fingerprint, setup: object(merchant.config.ecommerceConsentThemeSetup) } : null;
    });
  }
  async function recordConsentThemeAction(accountId: string, action: 'open_editor' | 'confirm_saved') {
    return await locked(accountId, async (tx, m) => {
      const old = object(m.config.ecommerceConsentThemeSetup);
      const state = old.connection === m.fingerprint ? old : {};
      const field = action === 'open_editor' ? 'editorOpenedAt' : 'merchantConfirmedAt';
      // Repeated setup clicks keep one record and do not duplicate a block.
      const updated = { ...state, connection: m.fingerprint, [field]: state[field] ?? new Date(now()).toISOString() };
      await tx.execute(sql`UPDATE integrations SET config=jsonb_set(COALESCE(config,'{}'::jsonb),
        '{ecommerceConsentThemeSetup}',${JSON.stringify(updated)}::jsonb,true)
        WHERE id=${m.installationId} AND user_id=${accountId} AND is_active IS TRUE`);
      return true;
    }) ?? false;
  }
  return { authorize, view, reconcile, savePlan, setDelivery,setTemplate, saveEnrollment, enrollmentView,
    consentInstallation, recordConsentThemeAction };
}
