-- GHL Marketplace install registry (webhook + CSV import + OAuth linkage)
CREATE TABLE IF NOT EXISTS "ghl_marketplace_installs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agency" text,
  "company_id" text NOT NULL,
  "location_id" text,
  "sub_account_name" text,
  "white_labeled" boolean,
  "agency_owner" text,
  "agency_email" text,
  "install_date" timestamp,
  "installation_status" text,
  "uninstall_date" timestamp,
  "price_plan" text,
  "billing_status" text,
  "integration_id" varchar REFERENCES "integrations"("id") ON DELETE SET NULL,
  "whachat_user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "last_synced_at" timestamp,
  "source" text DEFAULT 'webhook',
  "raw_payload" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ghl_marketplace_installs_location_company_uq"
  ON "ghl_marketplace_installs" ("location_id", "company_id");

CREATE INDEX IF NOT EXISTS "ghl_marketplace_installs_company_id_idx"
  ON "ghl_marketplace_installs" ("company_id");

CREATE INDEX IF NOT EXISTS "ghl_marketplace_installs_whachat_user_id_idx"
  ON "ghl_marketplace_installs" ("whachat_user_id");
