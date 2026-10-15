-- Phase 1B: additive shared commerce records; never alters workspace_offers or customer/order tables.
CREATE TABLE IF NOT EXISTS "catalog_sources" ("id" varchar PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
"user_id" varchar NOT NULL,
"integration_id" varchar NOT NULL,
"provider" text NOT NULL,
"shop" text NOT NULL,
"status" text NOT NULL DEFAULT 'permission_required',
"granted_scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
"initial_sync_completed_at" timestamp,
"last_sync_at" timestamp,
"next_attempt_at" timestamp NOT NULL DEFAULT now(),
"requested_at" timestamp NOT NULL DEFAULT now(),
"last_requested_at" timestamp,
"lease_token" text,
"lease_expires_at" timestamp,
"attempts" integer NOT NULL DEFAULT 0,
"error_code" text,
"checkpoint" jsonb NOT NULL DEFAULT '{}'::jsonb,
"currency" text,
"allowed_hosts" jsonb NOT NULL DEFAULT '[]'::jsonb,
"generation" text,
"created_at" timestamp NOT NULL DEFAULT now(),
FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
FOREIGN KEY ("integration_id") REFERENCES "integrations" ("id") ON DELETE CASCADE);
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_source_installation" ON "catalog_sources" USING btree ("user_id","provider","shop");
CREATE INDEX IF NOT EXISTS "catalog_source_due" ON "catalog_sources" USING btree ("next_attempt_at");
CREATE TABLE IF NOT EXISTS "catalog_products" ("id" varchar PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
"user_id" varchar NOT NULL,
"source_id" varchar NOT NULL,
"external_id" text NOT NULL,
"title" text NOT NULL,
"description" text NOT NULL DEFAULT '',
"product_type" text,
"vendor" text,
"status" text NOT NULL,
"published" boolean NOT NULL DEFAULT false,
"product_url" text,
"options" jsonb NOT NULL DEFAULT '[]'::jsonb,
"provider_tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
"variant_count" integer NOT NULL DEFAULT 0,
"search_text" text NOT NULL DEFAULT '',
"complete" boolean NOT NULL DEFAULT false,
"provider_updated_at" timestamp NOT NULL,
"synced_at" timestamp NOT NULL DEFAULT now(),
"deleted_at" timestamp,
"seen_generation" text,
"hydration_generation" text,
"ai_guidance" text,
"notes" text,
"merchant_tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
FOREIGN KEY ("source_id") REFERENCES "catalog_sources" ("id") ON DELETE CASCADE);
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_product_external" ON "catalog_products" USING btree ("source_id","external_id");
CREATE INDEX IF NOT EXISTS "catalog_product_tenant" ON "catalog_products" USING btree ("user_id","source_id","id");
CREATE INDEX IF NOT EXISTS "catalog_product_search" ON "catalog_products" USING gin (to_tsvector('simple', "catalog_products"."search_text"));
CREATE TABLE IF NOT EXISTS "catalog_variants" ("id" varchar PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
"user_id" varchar NOT NULL,
"source_id" varchar NOT NULL,
"product_id" varchar NOT NULL,
"external_id" text NOT NULL,
"title" text NOT NULL,
"sku" text,
"options" jsonb NOT NULL DEFAULT '[]'::jsonb,
"price" numeric,
"compare_at_price" numeric,
"currency" text,
"inventory_item_id" text,
"tracked" boolean,
"quantity" integer,
"sellable_online_quantity" integer,
"inventory_policy" text,
"available_for_sale" boolean,
"requires_components" boolean NOT NULL DEFAULT false,
"provider_updated_at" timestamp NOT NULL,
"verified_at" timestamp NOT NULL,
"generation" text NOT NULL,
FOREIGN KEY ("source_id") REFERENCES "catalog_sources" ("id") ON DELETE CASCADE,
FOREIGN KEY ("product_id") REFERENCES "catalog_products" ("id") ON DELETE CASCADE);
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_variant_external" ON "catalog_variants" USING btree ("source_id","external_id");
CREATE INDEX IF NOT EXISTS "catalog_variant_parent" ON "catalog_variants" USING btree ("user_id","source_id","product_id","external_id");
CREATE INDEX IF NOT EXISTS "catalog_variant_inventory" ON "catalog_variants" USING btree ("source_id","inventory_item_id");
CREATE INDEX IF NOT EXISTS "catalog_variant_price" ON "catalog_variants" USING btree ("source_id","price");
CREATE TABLE IF NOT EXISTS "catalog_media" ("id" varchar PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
"user_id" varchar NOT NULL,
"source_id" varchar NOT NULL,
"product_id" varchar NOT NULL,
"external_id" text NOT NULL,
"url" text NOT NULL,
"alt_text" text,
"generation" text NOT NULL,
FOREIGN KEY ("product_id") REFERENCES "catalog_products" ("id") ON DELETE CASCADE);
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_media_external" ON "catalog_media" USING btree ("product_id","external_id");
CREATE TABLE IF NOT EXISTS "catalog_collections" ("id" varchar PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
"user_id" varchar NOT NULL,
"source_id" varchar NOT NULL,
"external_id" text NOT NULL,
"title" text NOT NULL,
FOREIGN KEY ("source_id") REFERENCES "catalog_sources" ("id") ON DELETE CASCADE);
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_collection_external" ON "catalog_collections" USING btree ("source_id","external_id");
CREATE TABLE IF NOT EXISTS "catalog_memberships" ("id" varchar PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
"product_id" varchar NOT NULL,
"collection_id" varchar NOT NULL,
"generation" text NOT NULL,
FOREIGN KEY ("product_id") REFERENCES "catalog_products" ("id") ON DELETE CASCADE,
FOREIGN KEY ("collection_id") REFERENCES "catalog_collections" ("id") ON DELETE CASCADE);
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_membership_unique" ON "catalog_memberships" USING btree ("product_id","collection_id");
CREATE TABLE IF NOT EXISTS "catalog_events" ("id" varchar PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
"source_id" varchar NOT NULL,
"user_id" varchar NOT NULL,
"event_id" text NOT NULL,
"topic" text NOT NULL,
"resource_id" text NOT NULL,
"received_at" timestamp NOT NULL DEFAULT now(),
"processed_at" timestamp,
FOREIGN KEY ("source_id") REFERENCES "catalog_sources" ("id") ON DELETE CASCADE);
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_event_dedupe" ON "catalog_events" USING btree ("source_id","event_id");
CREATE INDEX IF NOT EXISTS "catalog_event_due" ON "catalog_events" USING btree ("source_id","processed_at");
CREATE UNIQUE INDEX IF NOT EXISTS catalog_integration_owner ON integrations(id,user_id);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_source_owner ON catalog_sources(id,user_id);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_product_owner ON catalog_products(id,source_id,user_id);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_collection_owner ON catalog_collections(id,source_id,user_id);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='catalog_source_integration_fk' AND conrelid='catalog_sources'::regclass) THEN ALTER TABLE catalog_sources ADD CONSTRAINT catalog_source_integration_fk FOREIGN KEY (integration_id,user_id) REFERENCES integrations(id,user_id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='catalog_product_tenant_fk' AND conrelid='catalog_products'::regclass) THEN ALTER TABLE catalog_products ADD CONSTRAINT catalog_product_tenant_fk FOREIGN KEY (source_id,user_id) REFERENCES catalog_sources(id,user_id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='catalog_variant_tenant_fk' AND conrelid='catalog_variants'::regclass) THEN ALTER TABLE catalog_variants ADD CONSTRAINT catalog_variant_tenant_fk FOREIGN KEY (product_id,source_id,user_id) REFERENCES catalog_products(id,source_id,user_id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='catalog_media_tenant_fk' AND conrelid='catalog_media'::regclass) THEN ALTER TABLE catalog_media ADD CONSTRAINT catalog_media_tenant_fk FOREIGN KEY (product_id,source_id,user_id) REFERENCES catalog_products(id,source_id,user_id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='catalog_collection_tenant_fk' AND conrelid='catalog_collections'::regclass) THEN ALTER TABLE catalog_collections ADD CONSTRAINT catalog_collection_tenant_fk FOREIGN KEY (source_id,user_id) REFERENCES catalog_sources(id,user_id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='catalog_event_tenant_fk' AND conrelid='catalog_events'::regclass) THEN ALTER TABLE catalog_events ADD CONSTRAINT catalog_event_tenant_fk FOREIGN KEY (source_id,user_id) REFERENCES catalog_sources(id,user_id) ON DELETE CASCADE; END IF; END $$;
