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
    tag: "0055_demo_bookings_calendly",
    sql: [
      `ALTER TABLE demo_bookings ALTER COLUMN scheduled_date DROP NOT NULL`,
      `ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS calendly_scheduled_event_uri text`,
      `ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS calendly_invitee_uri text`,
      `ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS meeting_link text`,
      `ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS calendly_payload jsonb`,
      `ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS calendly_confirmed_at timestamp`,
    ].join(";\n"),
  },
  {
    tag: "0056_prospect_import_jobs",
    sql: `CREATE TABLE IF NOT EXISTS prospect_import_jobs (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      destination_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      initiated_by_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider text NOT NULL DEFAULT 'gohighlevel',
      source_location_id text,
      source_integration_id varchar,
      status text NOT NULL DEFAULT 'pending',
      filters jsonb NOT NULL DEFAULT '{}'::jsonb,
      import_options jsonb NOT NULL DEFAULT '{}'::jsonb,
      selected_external_ids jsonb,
      preview_total integer DEFAULT 0,
      progress_current integer DEFAULT 0,
      progress_total integer DEFAULT 0,
      result_imported integer DEFAULT 0,
      result_skipped integer DEFAULT 0,
      result_duplicates integer DEFAULT 0,
      result_errors integer DEFAULT 0,
      result_details jsonb DEFAULT '{}'::jsonb,
      error_message text,
      created_at timestamp DEFAULT now(),
      started_at timestamp,
      completed_at timestamp
    )`,
  },
  {
    tag: "0057_prospect_import_phase15",
    sql: [
      `ALTER TABLE prospect_import_jobs ADD COLUMN IF NOT EXISTS batch_name text`,
      `ALTER TABLE prospect_import_jobs ADD COLUMN IF NOT EXISTS import_reason text`,
      `ALTER TABLE prospect_import_jobs ADD COLUMN IF NOT EXISTS undo_status text NOT NULL DEFAULT 'none'`,
      `ALTER TABLE prospect_import_jobs ADD COLUMN IF NOT EXISTS undone_at timestamp`,
      `ALTER TABLE prospect_import_jobs ADD COLUMN IF NOT EXISTS undone_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL`,
      `CREATE TABLE IF NOT EXISTS prospect_import_templates (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        created_by_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        template_name text NOT NULL,
        provider text NOT NULL DEFAULT 'gohighlevel',
        filters jsonb NOT NULL DEFAULT '{}'::jsonb,
        default_internal_tag text,
        default_import_reason text,
        default_import_limit integer DEFAULT 100,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS prospect_import_templates_user_idx ON prospect_import_templates (created_by_user_id, updated_at DESC)`,
    ].join(";\n"),
  },
  {
    tag: "0058_prospect_intelligence",
    sql: [
      `CREATE TABLE IF NOT EXISTS prospect_intelligence (
        contact_id varchar PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
        import_job_id varchar REFERENCES prospect_import_jobs(id) ON DELETE SET NULL,
        analysis_status text NOT NULL DEFAULT 'pending',
        review_status text NOT NULL DEFAULT 'pending',
        industry text,
        business_type text,
        company_name text,
        job_title text,
        agency_likelihood integer,
        shopify_merchant_likelihood integer,
        real_estate_likelihood integer,
        local_business_likelihood integer,
        saas_likelihood integer,
        potential_fit text,
        lead_score integer,
        priority text,
        recommended_offer text,
        suggested_outreach_angle text,
        suggested_first_message text,
        reasoning_summary text,
        needs_review boolean NOT NULL DEFAULT false,
        confidence integer,
        ai_model text,
        ai_version text,
        prompt_tokens integer,
        completion_tokens integer,
        raw_result jsonb DEFAULT '{}'::jsonb,
        error_message text,
        approved_at timestamp,
        approved_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
        analyzed_at timestamp,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS prospect_intelligence_priority_idx ON prospect_intelligence (priority)`,
      `CREATE INDEX IF NOT EXISTS prospect_intelligence_lead_score_idx ON prospect_intelligence (lead_score DESC)`,
      `CREATE INDEX IF NOT EXISTS prospect_intelligence_import_job_idx ON prospect_intelligence (import_job_id)`,
      `CREATE INDEX IF NOT EXISTS prospect_intelligence_status_idx ON prospect_intelligence (analysis_status)`,
      `CREATE TABLE IF NOT EXISTS prospect_intelligence_jobs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        import_job_id varchar NOT NULL REFERENCES prospect_import_jobs(id) ON DELETE CASCADE,
        initiated_by_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status text NOT NULL DEFAULT 'pending',
        contact_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        progress_current integer DEFAULT 0,
        progress_total integer DEFAULT 0,
        result_analyzed integer DEFAULT 0,
        result_high_priority integer DEFAULT 0,
        result_medium_priority integer DEFAULT 0,
        result_low_priority integer DEFAULT 0,
        result_needs_review integer DEFAULT 0,
        result_errors integer DEFAULT 0,
        ai_model text,
        prompt_tokens_total integer DEFAULT 0,
        completion_tokens_total integer DEFAULT 0,
        error_message text,
        created_at timestamp DEFAULT now(),
        started_at timestamp,
        completed_at timestamp
      )`,
      `CREATE INDEX IF NOT EXISTS prospect_intelligence_jobs_import_idx ON prospect_intelligence_jobs (import_job_id, created_at DESC)`,
    ].join(";\n"),
  },
  {
    tag: "0059_prospect_import_preview_jobs",
    sql: [
      `CREATE TABLE IF NOT EXISTS prospect_import_preview_jobs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        integration_id varchar NOT NULL,
        location_id text NOT NULL,
        destination_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        initiated_by_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        filters jsonb NOT NULL DEFAULT '{}'::jsonb,
        filter_fingerprint text NOT NULL,
        scan_scope text NOT NULL DEFAULT '1000',
        import_limit integer NOT NULL DEFAULT 100,
        applied_template_hint text,
        status text NOT NULL DEFAULT 'pending',
        progress_scanned integer DEFAULT 0,
        progress_target integer DEFAULT 0,
        progress_matches integer DEFAULT 0,
        ghl_reported_total integer,
        last_page integer DEFAULT 1,
        scan_stopped_early boolean DEFAULT false,
        scan_complete boolean DEFAULT false,
        skipped_by_filters integer DEFAULT 0,
        matched_snapshots jsonb DEFAULT '[]'::jsonb,
        all_matched_external_ids jsonb DEFAULT '[]'::jsonb,
        skipped_diagnostics jsonb DEFAULT '[]'::jsonb,
        preview_result jsonb,
        error_message text,
        scanned_at timestamp,
        created_at timestamp DEFAULT now(),
        started_at timestamp,
        completed_at timestamp
      )`,
      `CREATE INDEX IF NOT EXISTS prospect_import_preview_jobs_fingerprint_idx ON prospect_import_preview_jobs (filter_fingerprint, status)`,
      `CREATE INDEX IF NOT EXISTS prospect_import_preview_jobs_integration_idx ON prospect_import_preview_jobs (integration_id, location_id, created_at DESC)`,
      `ALTER TABLE prospect_import_jobs ADD COLUMN IF NOT EXISTS preview_job_id varchar`,
    ].join(";\n"),
  },
  {
    tag: "0060_native_email_channel",
    sql: [
      `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS subject text`,
      `ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL`,
      `CREATE TABLE IF NOT EXISTS email_mailboxes (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        connected_by_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider text NOT NULL DEFAULT 'gmail',
        email_address text NOT NULL,
        display_name text,
        provider_account_id text,
        access_token_encrypted text NOT NULL,
        refresh_token_encrypted text,
        token_expires_at timestamp,
        scopes text,
        sync_cursor text,
        last_sync_at timestamp,
        sync_status text NOT NULL DEFAULT 'disconnected',
        sync_error text,
        sync_progress_current integer DEFAULT 0,
        sync_progress_total integer DEFAULT 0,
        webhook_subscription_id text,
        webhook_expires_at timestamp,
        is_primary boolean NOT NULL DEFAULT true,
        visibility text NOT NULL DEFAULT 'workspace',
        signature_html text,
        sync_from_date timestamp,
        initial_sync_mode text NOT NULL DEFAULT 'last_7_days',
        messages_sent_today integer DEFAULT 0,
        messages_sent_hour integer DEFAULT 0,
        send_count_day_key text,
        send_count_hour_key text,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS email_mailboxes_workspace_provider_email_uq
        ON email_mailboxes (workspace_user_id, provider, lower(email_address))`,
      `CREATE INDEX IF NOT EXISTS email_mailboxes_workspace_status_idx
        ON email_mailboxes (workspace_user_id, sync_status)`,
      `CREATE TABLE IF NOT EXISTS email_message_details (
        message_id varchar PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
        subject text,
        html_body text,
        text_body text,
        from_address text,
        to_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
        cc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
        bcc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
        reply_to_address text,
        rfc_message_id text,
        in_reply_to text,
        references_header jsonb NOT NULL DEFAULT '[]'::jsonb,
        provider_thread_id text,
        snippet text,
        has_attachments boolean NOT NULL DEFAULT false,
        attachment_metadata jsonb NOT NULL DEFAULT '[]'::jsonb,
        selected_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS email_message_details_thread_idx
        ON email_message_details (provider_thread_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS email_message_details_rfc_message_id_uq
        ON email_message_details (rfc_message_id)
        WHERE rfc_message_id IS NOT NULL AND trim(rfc_message_id) <> ''`,
      `CREATE UNIQUE INDEX IF NOT EXISTS conversations_email_mailbox_thread_uq
        ON conversations (user_id, channel_account_id, external_thread_id)
        WHERE channel = 'email'
          AND channel_account_id IS NOT NULL
          AND external_thread_id IS NOT NULL`,
      `CREATE TABLE IF NOT EXISTS email_oauth_states (
        state text PRIMARY KEY,
        workspace_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        connected_by_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_verifier text,
        redirect_uri text,
        created_at timestamp DEFAULT now(),
        expires_at timestamp NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS email_oauth_states_expires_idx ON email_oauth_states (expires_at)`,
    ].join(";\n"),
  },
  {
    tag: "0061_gmail_push_watch",
    sql: [
      `ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS gmail_watch_history_id text`,
      `ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS gmail_watch_expiration timestamp`,
      `ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS gmail_watch_status text NOT NULL DEFAULT 'not_configured'`,
      `ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS gmail_watch_last_registered_at timestamp`,
      `ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS gmail_watch_last_notification_at timestamp`,
      `ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS gmail_watch_last_error text`,
      `ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS sync_pending boolean NOT NULL DEFAULT false`,
      `ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS sync_lock_until timestamp`,
      `ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS sync_lock_owner text`,
      `ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS observed_remote_history_id text`,
      `CREATE INDEX IF NOT EXISTS email_mailboxes_gmail_watch_expiration_idx
        ON email_mailboxes (gmail_watch_expiration)
        WHERE provider = 'gmail'`,
      `CREATE INDEX IF NOT EXISTS email_mailboxes_gmail_email_norm_idx
        ON email_mailboxes (provider, lower(email_address))`,
    ].join(";\n"),
  },
  {
    tag: "0062_prospect_intelligence_outreach_lifecycle",
    sql: [
      `ALTER TABLE prospect_intelligence ADD COLUMN IF NOT EXISTS outreach_status text NOT NULL DEFAULT 'not_sent'`,
      `ALTER TABLE prospect_intelligence ADD COLUMN IF NOT EXISTS outreach_sent_at timestamp`,
      `ALTER TABLE prospect_intelligence ADD COLUMN IF NOT EXISTS outreach_conversation_id varchar`,
      `ALTER TABLE prospect_intelligence ADD COLUMN IF NOT EXISTS outreach_message_id varchar`,
      `ALTER TABLE prospect_intelligence ADD COLUMN IF NOT EXISTS replied_at timestamp`,
      `CREATE INDEX IF NOT EXISTS prospect_intelligence_outreach_conversation_idx
        ON prospect_intelligence (outreach_conversation_id)
        WHERE outreach_conversation_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS prospect_intelligence_outreach_status_idx
        ON prospect_intelligence (outreach_status)`,
      `CREATE INDEX IF NOT EXISTS prospect_intelligence_review_status_idx
        ON prospect_intelligence (review_status)`,
    ].join(";\n"),
  },
  {
    tag: "0063_prospect_bulk_outreach",
    sql: [
      `CREATE TABLE IF NOT EXISTS prospect_outreach_settings (
        workspace_user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        preferred_channel text NOT NULL DEFAULT 'auto',
        daily_send_limit integer NOT NULL DEFAULT 40,
        hourly_send_limit integer NOT NULL DEFAULT 12,
        min_delay_seconds integer NOT NULL DEFAULT 90,
        max_delay_seconds integer NOT NULL DEFAULT 180,
        queue_running boolean NOT NULL DEFAULT false,
        paused boolean NOT NULL DEFAULT false,
        updated_at timestamp DEFAULT now(),
        created_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS prospect_bulk_analysis_jobs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        initiated_by_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status text NOT NULL DEFAULT 'pending',
        contact_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        selection_mode text NOT NULL DEFAULT 'selected',
        force_reanalyze boolean NOT NULL DEFAULT false,
        progress_current integer DEFAULT 0,
        progress_total integer DEFAULT 0,
        result_completed integer DEFAULT 0,
        result_needs_review integer DEFAULT 0,
        result_failed integer DEFAULT 0,
        result_skipped integer DEFAULT 0,
        error_message text,
        created_at timestamp DEFAULT now(),
        started_at timestamp,
        completed_at timestamp
      )`,
      `CREATE INDEX IF NOT EXISTS prospect_bulk_analysis_jobs_workspace_idx
        ON prospect_bulk_analysis_jobs (workspace_user_id, created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS prospect_outreach_batches (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
        status text NOT NULL DEFAULT 'queued',
        preferred_channel text NOT NULL DEFAULT 'auto',
        selected_count integer NOT NULL DEFAULT 0,
        queued_count integer NOT NULL DEFAULT 0,
        skipped_count integer NOT NULL DEFAULT 0,
        sent_count integer NOT NULL DEFAULT 0,
        failed_count integer NOT NULL DEFAULT 0,
        skip_summary jsonb DEFAULT '{}'::jsonb,
        created_at timestamp DEFAULT now(),
        started_at timestamp,
        completed_at timestamp
      )`,
      `CREATE INDEX IF NOT EXISTS prospect_outreach_batches_workspace_idx
        ON prospect_outreach_batches (workspace_user_id, created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS prospect_outreach_queue_items (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        batch_id varchar NOT NULL REFERENCES prospect_outreach_batches(id) ON DELETE CASCADE,
        workspace_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        contact_id varchar NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        selected_channel text NOT NULL,
        sender_mailbox_id varchar,
        recipient_identity text NOT NULL,
        recipient_identity_normalized text NOT NULL,
        subject_snapshot text,
        message_snapshot text NOT NULL,
        recommended_offer text,
        outreach_angle text,
        queue_status text NOT NULL DEFAULT 'queued',
        attempts integer NOT NULL DEFAULT 0,
        max_attempts integer NOT NULL DEFAULT 3,
        last_error text,
        dedup_key text NOT NULL,
        sequence_step integer NOT NULL DEFAULT 1,
        scheduled_at timestamp,
        started_at timestamp,
        sent_at timestamp,
        conversation_id varchar,
        message_id varchar,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS prospect_outreach_queue_active_dedup_uidx
        ON prospect_outreach_queue_items (workspace_user_id, dedup_key)
        WHERE queue_status IN ('queued', 'sending', 'paused', 'failed')`,
      `CREATE INDEX IF NOT EXISTS prospect_outreach_queue_due_idx
        ON prospect_outreach_queue_items (queue_status, scheduled_at)
        WHERE queue_status = 'queued'`,
      `CREATE INDEX IF NOT EXISTS prospect_outreach_queue_workspace_status_idx
        ON prospect_outreach_queue_items (workspace_user_id, queue_status)`,
      `CREATE INDEX IF NOT EXISTS prospect_outreach_queue_contact_idx
        ON prospect_outreach_queue_items (contact_id)`,
      `CREATE INDEX IF NOT EXISTS prospect_outreach_queue_batch_idx
        ON prospect_outreach_queue_items (batch_id)`,
    ].join(";\n"),
  },
  {
    tag: "0064_prospect_outreach_queue_running",
    sql: [
      `ALTER TABLE prospect_outreach_settings
        ADD COLUMN IF NOT EXISTS queue_running boolean NOT NULL DEFAULT false`,
    ].join(";\n"),
  },
  {
    tag: "0065_prospect_bulk_analysis_durable",
    sql: [
      `ALTER TABLE prospect_bulk_analysis_jobs
        ADD COLUMN IF NOT EXISTS item_results jsonb NOT NULL DEFAULT '{}'::jsonb`,
      `ALTER TABLE prospect_bulk_analysis_jobs
        ADD COLUMN IF NOT EXISTS filters_snapshot jsonb`,
      `ALTER TABLE prospect_bulk_analysis_jobs
        ADD COLUMN IF NOT EXISTS lease_owner text`,
      `ALTER TABLE prospect_bulk_analysis_jobs
        ADD COLUMN IF NOT EXISTS lease_expires_at timestamp`,
      `ALTER TABLE prospect_bulk_analysis_jobs
        ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`,
      `ALTER TABLE prospect_bulk_analysis_jobs
        ADD COLUMN IF NOT EXISTS parent_job_id varchar`,
      `CREATE INDEX IF NOT EXISTS prospect_bulk_analysis_jobs_claim_idx
        ON prospect_bulk_analysis_jobs (status, lease_expires_at, created_at)`,
    ].join(";\n"),
  },
  {
    tag: "0068_prospect_enrichment",
    sql: [
      `ALTER TABLE prospect_intelligence
        ADD COLUMN IF NOT EXISTS enrichment_status text NOT NULL DEFAULT 'none'`,
      `ALTER TABLE prospect_intelligence
        ADD COLUMN IF NOT EXISTS enrichment_provider text`,
      `ALTER TABLE prospect_intelligence
        ADD COLUMN IF NOT EXISTS enrichment_triggered_by text`,
      `ALTER TABLE prospect_intelligence
        ADD COLUMN IF NOT EXISTS website_analyzed_at timestamp`,
      `ALTER TABLE prospect_intelligence
        ADD COLUMN IF NOT EXISTS website_url_used text`,
      `ALTER TABLE prospect_intelligence
        ADD COLUMN IF NOT EXISTS enrichment_email_found boolean NOT NULL DEFAULT false`,
      `ALTER TABLE prospect_intelligence
        ADD COLUMN IF NOT EXISTS enrichment_phone_found boolean NOT NULL DEFAULT false`,
      `ALTER TABLE prospect_intelligence
        ADD COLUMN IF NOT EXISTS enrichment_result jsonb NOT NULL DEFAULT '{}'::jsonb`,
      `ALTER TABLE prospect_intelligence
        ADD COLUMN IF NOT EXISTS enrichment_error_message text`,
      `ALTER TABLE prospect_intelligence
        ADD COLUMN IF NOT EXISTS enrichment_job_id varchar`,
      `CREATE INDEX IF NOT EXISTS prospect_intelligence_enrichment_status_idx
        ON prospect_intelligence (enrichment_status)`,
      `CREATE TABLE IF NOT EXISTS prospect_enrichment_jobs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        contact_id varchar NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        initiated_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
        status text NOT NULL DEFAULT 'pending',
        provider text NOT NULL DEFAULT 'website_public',
        trigger_source text NOT NULL DEFAULT 'approve',
        progress_current integer NOT NULL DEFAULT 0,
        progress_total integer NOT NULL DEFAULT 4,
        lease_owner text,
        lease_expires_at timestamp,
        result jsonb NOT NULL DEFAULT '{}'::jsonb,
        error_message text,
        created_at timestamp DEFAULT now(),
        started_at timestamp,
        completed_at timestamp,
        cancelled_at timestamp,
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS prospect_enrichment_jobs_claim_idx
        ON prospect_enrichment_jobs (status, lease_expires_at, created_at)`,
      `CREATE INDEX IF NOT EXISTS prospect_enrichment_jobs_workspace_contact_idx
        ON prospect_enrichment_jobs (workspace_user_id, contact_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS prospect_enrichment_jobs_contact_status_idx
        ON prospect_enrichment_jobs (contact_id, status)`,
    ].join(";\n"),
  },
  {
    tag: "0069_prospect_outreach_instructions",
    sql: [
      `ALTER TABLE prospect_outreach_settings
        ADD COLUMN IF NOT EXISTS outreach_instructions jsonb NOT NULL DEFAULT '{}'::jsonb`,
      `ALTER TABLE prospect_intelligence
        ADD COLUMN IF NOT EXISTS suggested_outreach_subject text`,
    ].join(";\n"),
  },
  {
    tag: "0072_ai_website_knowledge_sources",
    sql: `ALTER TABLE ai_business_knowledge
      ADD COLUMN IF NOT EXISTS website_knowledge_sources jsonb NOT NULL DEFAULT '[]'::jsonb`,
  },
  {
    tag: "0074_auth_signup_hardening",
    sql: [
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamp`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamp`,
      // Safe backfill: never mark pending public signups (no trial yet) as verified.
      // Existing users typically have trial_started_at, paid plan, Shopify, or completed onboarding.
      `UPDATE users SET email_verified_at = COALESCE(created_at, NOW())
        WHERE email_verified_at IS NULL
          AND (
            trial_started_at IS NOT NULL
            OR COALESCE(billing_plan, 'free') NOT IN ('free')
            OR COALESCE(subscription_plan, 'free') NOT IN ('free')
            OR shopify_shop IS NOT NULL
            OR onboarding_completed = true
          )`,
      `UPDATE users SET welcome_email_sent_at = COALESCE(created_at, NOW())
        WHERE welcome_email_sent_at IS NULL
          AND email_verified_at IS NOT NULL`,
      `CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash text NOT NULL,
        expires_at timestamp NOT NULL,
        used_at timestamp,
        created_at timestamp DEFAULT now()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS email_verification_tokens_token_hash_uidx ON email_verification_tokens (token_hash)`,
      `CREATE INDEX IF NOT EXISTS email_verification_tokens_user_idx ON email_verification_tokens (user_id)`,
      `CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash text NOT NULL,
        expires_at timestamp NOT NULL,
        used_at timestamp,
        created_at timestamp DEFAULT now()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_token_hash_uidx ON password_reset_tokens (token_hash)`,
      `CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens (user_id)`,
      `CREATE TABLE IF NOT EXISTS auth_security_events (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type text NOT NULL,
        user_id varchar,
        normalized_email text,
        ip_address text,
        user_agent text,
        outcome text NOT NULL,
        reason_code text,
        request_id text,
        created_at timestamp DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS auth_security_events_created_idx ON auth_security_events (created_at)`,
      `CREATE INDEX IF NOT EXISTS auth_security_events_type_idx ON auth_security_events (event_type)`,
    ].join(";\n"),
  },
  {
    tag: "0073_ai_brain_structured_facts",
    sql: [
      `ALTER TABLE ai_business_knowledge
        ADD COLUMN IF NOT EXISTS knowledge_v2_enabled boolean NOT NULL DEFAULT false`,
      `ALTER TABLE ai_business_knowledge
        ADD COLUMN IF NOT EXISTS knowledge_freshness_policy jsonb NOT NULL DEFAULT '{}'::jsonb`,
      `CREATE TABLE IF NOT EXISTS ai_website_knowledge_sources (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        url text NOT NULL,
        normalized_url text NOT NULL,
        slot_key text,
        title text,
        custom_label text,
        detected_type text NOT NULL DEFAULT 'other',
        status text NOT NULL DEFAULT 'pending',
        is_enabled boolean NOT NULL DEFAULT true,
        content_hash text,
        char_count integer NOT NULL DEFAULT 0,
        scan_version integer NOT NULL DEFAULT 0,
        error_code text,
        error_message text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        first_added_at timestamp DEFAULT now(),
        last_scanned_at timestamp,
        last_successful_scan_at timestamp,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ai_website_knowledge_sources_user_url_idx
        ON ai_website_knowledge_sources (user_id, normalized_url)`,
      `CREATE INDEX IF NOT EXISTS ai_website_knowledge_sources_user_enabled_idx
        ON ai_website_knowledge_sources (user_id, is_enabled)`,
      `CREATE TABLE IF NOT EXISTS business_knowledge_facts (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source_id varchar REFERENCES ai_website_knowledge_sources(id) ON DELETE SET NULL,
        fact_type text NOT NULL,
        fact_key text NOT NULL,
        data jsonb NOT NULL DEFAULT '{}'::jsonb,
        state text NOT NULL DEFAULT 'draft',
        proposed_action text,
        origin text NOT NULL DEFAULT 'ai_extracted',
        confidence double precision NOT NULL DEFAULT 0.5,
        is_pinned boolean NOT NULL DEFAULT false,
        user_edited boolean NOT NULL DEFAULT false,
        conflict_group text,
        conflict_resolution text,
        superseded_by_fact_id varchar,
        source_url text,
        source_title text,
        excerpt text,
        provenance jsonb NOT NULL DEFAULT '[]'::jsonb,
        first_seen_at timestamp DEFAULT now(),
        last_verified_at timestamp DEFAULT now(),
        published_at timestamp,
        retired_at timestamp,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS business_knowledge_facts_user_state_type_idx
        ON business_knowledge_facts (user_id, state, fact_type)`,
      `CREATE INDEX IF NOT EXISTS business_knowledge_facts_user_fact_key_idx
        ON business_knowledge_facts (user_id, fact_key)`,
      `CREATE INDEX IF NOT EXISTS business_knowledge_facts_user_source_idx
        ON business_knowledge_facts (user_id, source_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS business_knowledge_facts_user_key_state_live_idx
        ON business_knowledge_facts (user_id, fact_key, state)
        WHERE state IN ('draft', 'published')`,
      `CREATE TABLE IF NOT EXISTS ai_knowledge_scan_jobs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status text NOT NULL DEFAULT 'pending',
        source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        item_results jsonb NOT NULL DEFAULT '{}'::jsonb,
        lease_owner text,
        lease_expires_at timestamp,
        progress_current integer NOT NULL DEFAULT 0,
        progress_total integer NOT NULL DEFAULT 0,
        facts_proposed integer NOT NULL DEFAULT 0,
        error_message text,
        created_at timestamp DEFAULT now(),
        started_at timestamp,
        completed_at timestamp,
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS ai_knowledge_scan_jobs_claim_idx
        ON ai_knowledge_scan_jobs (status, lease_expires_at, created_at)`,
      `CREATE INDEX IF NOT EXISTS ai_knowledge_scan_jobs_user_created_idx
        ON ai_knowledge_scan_jobs (user_id, created_at)`,
    ].join(";\n"),
  },
  {
    tag: "0071_prospect_ai_discovery_usage_ledger",
    sql: [
      `CREATE TABLE IF NOT EXISTS prospect_ai_discovery_usage_events (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        search_id varchar REFERENCES prospect_ai_discovery_searches(id) ON DELETE SET NULL,
        result_id varchar REFERENCES prospect_ai_discovery_results(id) ON DELETE SET NULL,
        units integer NOT NULL DEFAULT 1,
        reason text NOT NULL DEFAULT 'discover',
        note text,
        created_at timestamp DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS prospect_ai_discovery_usage_events_workspace_created_idx
        ON prospect_ai_discovery_usage_events (workspace_user_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS prospect_ai_discovery_usage_events_workspace_reason_idx
        ON prospect_ai_discovery_usage_events (workspace_user_id, reason)`,
      // One aggregated backfill row per search; skip searches that already have discover/backfill events.
      `INSERT INTO prospect_ai_discovery_usage_events (
        workspace_user_id, search_id, units, reason, created_at
      )
      SELECT
        r.workspace_user_id,
        r.search_id,
        COUNT(*)::integer,
        'backfill',
        MIN(r.created_at)
      FROM prospect_ai_discovery_results r
      WHERE NOT EXISTS (
        SELECT 1
        FROM prospect_ai_discovery_usage_events e
        WHERE e.search_id = r.search_id
          AND e.reason IN ('discover', 'backfill')
      )
      GROUP BY r.workspace_user_id, r.search_id`,
    ].join(";\n"),
  },
  {
    tag: "0075_workspace_offers",
    sql: [
      `CREATE TABLE IF NOT EXISTS workspace_offers (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        internal_name text NOT NULL,
        display_name text NOT NULL,
        description text,
        benefits jsonb NOT NULL DEFAULT '[]'::jsonb,
        price_display text,
        billing_cadence text NOT NULL DEFAULT 'once',
        checkout_url text,
        follow_up_url text,
        availability text NOT NULL DEFAULT 'available',
        active boolean NOT NULL DEFAULT true,
        sort_order integer NOT NULL DEFAULT 0,
        category text,
        tags jsonb NOT NULL DEFAULT '[]'::jsonb,
        ai_guidance text,
        archived_at timestamp,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS workspace_offers_user_active_sort_idx
        ON workspace_offers (user_id, active, sort_order)`,
      `CREATE INDEX IF NOT EXISTS workspace_offers_user_archived_idx
        ON workspace_offers (user_id, archived_at)`,
    ].join(";\n"),
  },
  {
    tag: "0076_email_form_source_metadata",
    sql: [
      `ALTER TABLE email_message_details ADD COLUMN IF NOT EXISTS reply_to_name text`,
      `ALTER TABLE email_message_details ADD COLUMN IF NOT EXISTS source_type text`,
      `ALTER TABLE email_message_details ADD COLUMN IF NOT EXISTS source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb`,
      `CREATE INDEX IF NOT EXISTS email_message_details_source_type_idx
        ON email_message_details (source_type)
        WHERE source_type IS NOT NULL`,
    ].join(";\n"),
  },
  {
    tag: "0077_prospect_intelligence_lifecycle",
    sql: [
      `ALTER TABLE prospect_intelligence ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active'`,
      `ALTER TABLE prospect_intelligence ADD COLUMN IF NOT EXISTS archived_at timestamp`,
      `ALTER TABLE prospect_intelligence ADD COLUMN IF NOT EXISTS archived_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL`,
      `ALTER TABLE prospect_intelligence ADD COLUMN IF NOT EXISTS archive_reason text`,
      `ALTER TABLE prospect_intelligence ADD COLUMN IF NOT EXISTS archive_note text`,
      `ALTER TABLE prospect_intelligence ADD COLUMN IF NOT EXISTS trashed_at timestamp`,
      `ALTER TABLE prospect_intelligence ADD COLUMN IF NOT EXISTS trashed_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL`,
      `ALTER TABLE prospect_intelligence ADD COLUMN IF NOT EXISTS deleted_at timestamp`,
      `ALTER TABLE prospect_intelligence ADD COLUMN IF NOT EXISTS deleted_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL`,
      `ALTER TABLE prospect_intelligence ADD COLUMN IF NOT EXISTS restored_at timestamp`,
      `CREATE INDEX IF NOT EXISTS prospect_intelligence_lifecycle_status_idx
        ON prospect_intelligence (lifecycle_status)`,
      `CREATE INDEX IF NOT EXISTS prospect_intelligence_archived_at_idx
        ON prospect_intelligence (archived_at)
        WHERE archived_at IS NOT NULL`,
    ].join(";\n"),
  },
  {
    tag: "0078_whatsapp_oauth_architecture_version",
    sql: `ALTER TABLE whatsapp_oauth_states ADD COLUMN IF NOT EXISTS architecture_version text NOT NULL DEFAULT 'v2'`,
  },
  {
    tag: "0079_users_inbox_new_activity",
    sql: [
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS inbox_new_activity_count integer NOT NULL DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_inbox_checked_at timestamp`,
    ].join(";\n"),
  },
  {
    tag: "0080_trial_expiration_email",
    sql: [
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_expiration_email_sent_at timestamp`,
      `UPDATE users
        SET trial_expiration_email_sent_at = COALESCE(trial_ends_at, NOW())
        WHERE trial_expiration_email_sent_at IS NULL
          AND trial_ends_at IS NOT NULL
          AND trial_ends_at <= NOW()`,
    ].join(";\n"),
  },
  {
    tag: "0081_conversation_usage_period",
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS conversation_usage_period_start timestamp`,
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

export async function applyStartupSchemaPatches(): Promise<{
  publicListingSchemaReady: boolean;
  trialExpirationEmailPatchOk: boolean;
}> {
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
  return {
    publicListingSchemaReady: ready,
    trialExpirationEmailPatchOk: patchResults.get("0080_trial_expiration_email") === true,
  };
}
