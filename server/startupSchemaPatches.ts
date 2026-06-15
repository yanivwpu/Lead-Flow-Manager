import { sql } from "drizzle-orm";
import { db } from "../drizzle/db";

/**
 * Idempotent ADD COLUMN patches for production DBs that lag behind shared/schema.
 * Safe to run on every startup (IF NOT EXISTS). Does not replace full migration history.
 */
const STARTUP_COLUMN_PATCHES: { tag: string; sql: string }[] = [
  {
    tag: "0030_contacts_buyer_preference_profile",
    sql: `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS buyer_preference_profile jsonb NOT NULL DEFAULT '{}'::jsonb`,
  },
  {
    tag: "0042_contacts_seller_preference_profile",
    sql: `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS seller_preference_profile jsonb NOT NULL DEFAULT '{}'::jsonb`,
  },
  {
    tag: "0038_inventory_listing_flyer_fields",
    sql: [
      `ALTER TABLE inventory_listings ADD COLUMN IF NOT EXISTS square_feet integer`,
      `ALTER TABLE inventory_listings ADD COLUMN IF NOT EXISTS year_built integer`,
      `ALTER TABLE inventory_listings ADD COLUMN IF NOT EXISTS hoa_fee_cents integer`,
      `ALTER TABLE inventory_listings ADD COLUMN IF NOT EXISTS property_subtype text`,
      `ALTER TABLE inventory_listings ADD COLUMN IF NOT EXISTS listing_details jsonb NOT NULL DEFAULT '{}'::jsonb`,
    ].join(";\n"),
  },
  {
    tag: "0039_ai_business_profile_fields",
    sql: [
      `ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS display_name text`,
      `ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS company_logo text`,
      `ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS public_phone text`,
      `ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS public_email text`,
      `ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS public_website text`,
      `ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS about_text text`,
    ].join(";\n"),
  },
  {
    tag: "0043_calendly_canceled_event_tombstones",
    sql: [
      `CREATE TABLE IF NOT EXISTS calendly_canceled_event_tombstones (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        scheduled_event_uri text NOT NULL,
        invitee_uri text,
        contact_id varchar,
        canceled_at timestamp DEFAULT NOW(),
        cancel_reason text,
        source text NOT NULL DEFAULT 'unknown'
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS calendly_canceled_tombstones_user_event_uri
        ON calendly_canceled_event_tombstones (user_id, scheduled_event_uri)`,
      `CREATE INDEX IF NOT EXISTS calendly_canceled_tombstones_user_invitee_uri
        ON calendly_canceled_event_tombstones (user_id, invitee_uri)
        WHERE invitee_uri IS NOT NULL`,
      `INSERT INTO calendly_canceled_event_tombstones (user_id, scheduled_event_uri, invitee_uri, contact_id, cancel_reason, source)
        SELECT user_id, calendly_scheduled_event_uri, calendly_invitee_uri, contact_id, 'backfill_cancelled_appointment', 'startup_backfill'
        FROM appointments
        WHERE status IN ('cancelled', 'rescheduled')
          AND calendly_scheduled_event_uri IS NOT NULL
          AND TRIM(calendly_scheduled_event_uri) <> ''
        ON CONFLICT DO NOTHING`,
    ].join(";\n"),
  },
  {
    tag: "0041_inventory_listing_public_slug",
    sql: `ALTER TABLE inventory_listings ADD COLUMN IF NOT EXISTS public_slug text`,
  },
];

export async function applyStartupSchemaPatches(): Promise<void> {
  for (const patch of STARTUP_COLUMN_PATCHES) {
    try {
      await db.execute(sql.raw(patch.sql));
      console.log(`[StartupSchema] OK ${patch.tag}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string })?.code;
      console.error(`[StartupSchema] FAILED ${patch.tag}`, { code, message });
    }
  }
}
