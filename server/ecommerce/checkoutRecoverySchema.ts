import {sql} from 'drizzle-orm';

/** Table presence alone cannot prove the ordered consent, receipt and durable
 * provider-attempt migrations are installed. Never claim work on partial DDL.
 */
export function recoveryRuntimeSchemaReadyQuery(schema='public'){
 if(!/^[a-z_][a-z0-9_]{0,62}$/.test(schema))throw Error('invalid_recovery_schema');
 return sql`SELECT
   to_regclass(${schema+'.ecommerce_abandoned_checkout_observations'}) IS NOT NULL
   AND to_regclass(${schema+'.ecommerce_checkout_recovery_intents'}) IS NOT NULL
   AND to_regclass(${schema+'.ecommerce_whatsapp_recovery_consents'}) IS NOT NULL
   AND to_regclass(${schema+'.ecommerce_checkout_recovery_outbox'}) IS NOT NULL
   AND (SELECT count(*) FROM information_schema.columns WHERE table_schema=${schema}
     AND ((table_name='ecommerce_whatsapp_recovery_consents'
           AND column_name IN ('last_verified_inbound_at','last_verified_wamid'))
       OR (table_name='ecommerce_checkout_recovery_outbox'
           AND column_name IN ('meta_delivery_status','meta_delivery_at','provider_attempted_at'))))=5
   AS ready`;
}
