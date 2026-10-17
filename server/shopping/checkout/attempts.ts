import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { CatalogDb } from "../../salesCatalog/commerceStore";
import { CheckoutError, type CheckoutReceipt } from "./contract";
export type ReceiptCodec = { seal(value:CheckoutReceipt,context:string):string; open(value:string,context:string):CheckoutReceipt };
/** Explicit secret injection, no environment fallback. AAD binds receipts to the owned request. */
export function checkoutReceiptCodec(key:Buffer):ReceiptCodec {
  if(key.length!==32)throw new CheckoutError("setup_required");
  return {
    seal(value,context) {
      const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv);cipher.setAAD(Buffer.from(context));
      const body=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);
      return ["v1",iv.toString("base64"),cipher.getAuthTag().toString("base64"),body.toString("base64")].join(":");
    },
    open(value,context) {
      try {
        const [version,iv,tag,body,...extra]=value.split(":");if(version!=="v1"||extra.length)throw Error();
        const cipher=createDecipheriv("aes-256-gcm",key,Buffer.from(iv,"base64"));cipher.setAAD(Buffer.from(context));cipher.setAuthTag(Buffer.from(tag,"base64"));
        const receipt=JSON.parse(Buffer.concat([cipher.update(Buffer.from(body,"base64")),cipher.final()]).toString("utf8"));
        if(typeof receipt.checkoutUrl!=="string"||typeof receipt.providerCartId!=="string"||receipt.paymentStatus!=="unknown")throw Error();
        return receipt;
      }catch {throw new CheckoutError("invalid_response");}
    },
  };
}
export function checkoutRequestKey(context: {userId:string;conversationId:string;sourceId:string;integrationId:string;confirmationId:string;item:unknown}) {
  return createHash("sha256").update(JSON.stringify([context.userId,context.conversationId,context.sourceId,context.integrationId,context.confirmationId,context.item])).digest("hex");
}
/** Durable at-most-one dispatch per confirmed selection, including process crashes. No lease steal. */
export function createCheckoutAttempts(database:CatalogDb,codec:ReceiptCodec) {
  return {async run(context:Parameters<typeof checkoutRequestKey>[0],prepare:()=>Promise<CheckoutReceipt>):Promise<CheckoutReceipt> {
    const key=checkoutRequestKey(context);
    const inserted=await database.execute(sql`INSERT INTO checkout_preparation_attempts(request_key,user_id,conversation_id,status,expires_at) VALUES (${key},${context.userId},${context.conversationId},'preparing',NOW()+interval '30 minutes') ON CONFLICT DO NOTHING RETURNING request_key`);
    if(!inserted.rows.length) {
      const existing=await database.execute(sql`SELECT status,encrypted_receipt,expires_at,retry_at FROM checkout_preparation_attempts WHERE request_key=${key} AND user_id=${context.userId} AND conversation_id=${context.conversationId}`);
      const row=existing.rows[0] as any;
      if(!row)throw new CheckoutError("unavailable");
      if(new Date(row.expires_at).getTime()<=Date.now())throw new CheckoutError("expired");
      if(row.status==='ready')return codec.open(row.encrypted_receipt,key);
      if(row.status==='failed') {
        const retry=await database.execute(sql`UPDATE checkout_preparation_attempts SET status='preparing',retry_at=NULL WHERE request_key=${key} AND user_id=${context.userId} AND conversation_id=${context.conversationId} AND status='failed' AND retry_at<=NOW() RETURNING request_key`);
        if(!retry.rows.length)throw new CheckoutError("already_preparing");
      } else throw new CheckoutError(row.status==='ambiguous'?"ambiguous":"already_preparing");
    }
    // The claim is committed before any network mutation. A crash leaves it blocked, never replayed.
    try {
      const receipt=await prepare();
      const encrypted=codec.seal(receipt,key);
      await database.execute(sql`UPDATE checkout_preparation_attempts SET status='ready',encrypted_receipt=${encrypted} WHERE request_key=${key} AND user_id=${context.userId} AND conversation_id=${context.conversationId} AND status='preparing'`);
      return receipt;
    }catch(error) {
      // Only an explicit pre-execution throttle/access rejection proves no cart was created.
      const safe=error instanceof CheckoutError && ["throttled","setup_required"].includes(error.code);
      await database.execute(sql`UPDATE checkout_preparation_attempts SET status=${safe?'failed':'ambiguous'},retry_at=NOW()+(${safe?(error as CheckoutError).retryMs:30_000} * interval '1 millisecond') WHERE request_key=${key} AND user_id=${context.userId} AND conversation_id=${context.conversationId} AND status='preparing'`);
      throw error instanceof CheckoutError?error:new CheckoutError("ambiguous");
    }
  }};
}
