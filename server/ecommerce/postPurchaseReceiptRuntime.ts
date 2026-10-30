import {db} from '../../drizzle/db';
import {createPostPurchaseReceipt} from './postPurchaseReceipt';
export const recordPostPurchaseReceiptFromVerifiedMeta=createPostPurchaseReceipt({database:db,env:process.env,
  secret:()=>process.env.ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY||'',
});
