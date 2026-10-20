/**
 * WhatsApp checkout recovery consent: inbound webhook must have verified Meta
 * X-Hub-Signature-256 over captured raw bytes. No SMS/email preference or
 * outbound CRM message can create consent.
 */
export type RecoveryConsentAction='grant'|'revoke';
export type VerifiedInboundConsentCandidate={
  signatureValid:boolean;hasRawBody:boolean;type:string;
  phoneNumberId:string;from:string;messageId:string;
  timestamp:string;text:string|null|undefined;
};
export function recoveryConsentCaptureEnabled(env:{
  RAILWAY_ENVIRONMENT_NAME?:string;APP_URL?:string;
  ECOMMERCE_RECOVERY_CONSENT_CAPTURE_ENABLED?:string;
}):boolean {
  return env.RAILWAY_ENVIRONMENT_NAME==='staging' &&
    env.APP_URL?.replace(/\/$/,'')==='https://whachatcrm-staging-app-staging.up.railway.app' &&
    env.ECOMMERCE_RECOVERY_CONSENT_CAPTURE_ENABLED==='true';
}
/** A customer's affirmative reply must state both channel and purpose.
 * Generic YES, Shopify checkout marketing setting, and interactive buttons do
 * NOT count. A clear merchant-specific notice must be displayed separately.
 */
export function classifyRecoveryConsentInbound(
 event:VerifiedInboundConsentCandidate,now=Date.now()
):{action:RecoveryConsentAction;eventAt:Date}|null {
  if(!event.signatureValid||!event.hasRawBody||event.type!=='text' ||
    !/^[1-9][0-9]{5,24}$/.test(event.phoneNumberId) ||
    !/^[1-9][0-9]{7,14}$/.test(event.from) ||
    !/^wamid\.[A-Za-z0-9._-]{8,250}$/.test(event.messageId) ||
    !/^[1-9][0-9]{8,11}$/.test(event.timestamp))
    return null;
  const seconds=Number(event.timestamp),when=seconds*1000;
  if(!Number.isSafeInteger(seconds)||when>now+120_000 || when<now-15*60_000)
    return null;
  if(typeof event.text!=='string'||event.text.length>128)return null;
  const normalized=event.text.trim().replace(/\s+/g,' ').toUpperCase();
  const action:RecoveryConsentAction|null=
    normalized==='YES WHATSAPP CHECKOUT REMINDERS'?'grant':
    ['STOP','STOP CHECKOUT REMINDERS','UNSUBSCRIBE'].includes(normalized)?'revoke':null;
  return action?{action,eventAt:new Date(when)}:null;
}
