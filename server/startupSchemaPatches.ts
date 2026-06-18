import { sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  REQUIRED_PUBLIC_LISTING_PATCH_TAGS,
  setPublicListingSchemaReady,
} from "./publicListingSchemaReady";

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
    tag: "0036_demo_bookings_sales_portal_assignment",
    sql: [
      `ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS assigned_at timestamp`,
      `ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS accepted_at timestamp`,
      `ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS decline_reason text`,
      `ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS declined_by_salesperson_id varchar`,
      `ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS declined_at timestamp`,
      `ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS source text DEFAULT 'web'`,
      `ALTER TABLE demo_bookings ALTER COLUMN salesperson_id DROP NOT NULL`,
      `UPDATE demo_bookings SET status = 'pending_acceptance' WHERE status = 'pending'`,
      `UPDATE demo_bookings SET assigned_at = COALESCE(assigned_at, created_at) WHERE status IN ('pending_acceptance', 'accepted') AND assigned_at IS NULL`,
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
  {
    tag: "0045_inventory_listing_compliance",
    sql: `ALTER TABLE inventory_listings ADD COLUMN IF NOT EXISTS listing_compliance jsonb NOT NULL DEFAULT '{}'::jsonb`,
  },
  {
    tag: "0046_inventory_publication_controls",
    sql: [
      `ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS publish_listings_publicly boolean NOT NULL DEFAULT false`,
      `ALTER TABLE inventory_listings ADD COLUMN IF NOT EXISTS publish_publicly boolean NOT NULL DEFAULT false`,
      `ALTER TABLE inventory_listings ADD COLUMN IF NOT EXISTS published_at timestamptz`,
    ].join(";\n"),
  },
  {
    tag: "0047_agent_page",
    sql: [
      `ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS agent_page_enabled boolean NOT NULL DEFAULT false`,
      `ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS agent_page_slug text`,
      `ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS agent_page_display_name text`,
      `ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS agent_page_bio text`,
      `ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS agent_page_market_area text`,
      `ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS agent_page_preferred_lead_capture text NOT NULL DEFAULT 'webchat'`,
      `ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS agent_page_show_home_value_cta boolean NOT NULL DEFAULT true`,
      `ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS agent_page_analytics jsonb NOT NULL DEFAULT '{}'::jsonb`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ai_business_knowledge_agent_page_slug_lower ON ai_business_knowledge (lower(agent_page_slug)) WHERE agent_page_slug IS NOT NULL`,
    ].join(";\n"),
  },
  {
    tag: "0048_agent_page_custom_bio",
    sql: [
      `ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS agent_page_use_custom_bio boolean NOT NULL DEFAULT false`,
      `UPDATE ai_business_knowledge SET agent_page_use_custom_bio = true WHERE agent_page_bio IS NOT NULL AND trim(agent_page_bio) <> ''`,
    ].join(";\n"),
  },
  {
    tag: "0049_business_profile_social_links",
    sql: [
      `ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS facebook_url text`,
      `ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS instagram_url text`,
      `ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS linkedin_url text`,
      `ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS youtube_url text`,
    ].join(";\n"),
  },
];

async function probePublicListingSchemaColumns(): Promise<boolean> {
  try {
    await db.execute(sql`
      SELECT
        l.listing_compliance,
        l.publish_publicly,
        l.published_at,
        w.publish_listings_publicly,
        w.agent_page_enabled,
        w.agent_page_slug
      FROM inventory_listings l
      INNER JOIN ai_business_knowledge w ON w.user_id = l.user_id
      LIMIT 0
    `);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[StartupSchema] FATAL: public listing schema probe failed", { message });
    return false;
  }
}

export async function applyStartupSchemaPatches(): Promise<{ publicListingSchemaReady: boolean }> {
  const patchResults = new Map<string, boolean>();

  for (const patch of STARTUP_COLUMN_PATCHES) {
    try {
      await db.execute(sql.raw(patch.sql));
      console.log(`[StartupSchema] OK ${patch.tag}`);
      patchResults.set(patch.tag, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string })?.code;
      patchResults.set(patch.tag, false);
      if (REQUIRED_PUBLIC_LISTING_PATCH_TAGS.has(patch.tag)) {
        console.error(
          `[StartupSchema] FATAL: required public listing patch failed: ${patch.tag}`,
          { code, message },
        );
      } else {
        console.error(`[StartupSchema] FAILED ${patch.tag}`, { code, message });
      }
    }
  }

  const requiredPatchesOk = [...REQUIRED_PUBLIC_LISTING_PATCH_TAGS].every(
    (tag) => patchResults.get(tag) === true,
  );

  let ready = false;
  if (requiredPatchesOk) {
    ready = await probePublicListingSchemaColumns();
    if (!ready) {
      console.error(
        "[StartupSchema] FATAL: public listing routes must not serve until schema 0045–0047 is ready",
      );
    }
  } else {
    console.error(
      "[StartupSchema] FATAL: public listing / agent page routes blocked — required patches 0045, 0046, 0047 failed",
    );
  }

  setPublicListingSchemaReady(ready);
  return { publicListingSchemaReady: ready };
}
