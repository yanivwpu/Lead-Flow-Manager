CREATE TABLE "chats" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"avatar" text NOT NULL,
	"whatsapp_phone" text,
	"last_message" text NOT NULL,
	"time" text NOT NULL,
	"unread" integer DEFAULT 0,
	"tag" text DEFAULT 'New' NOT NULL,
	"follow_up" text,
	"follow_up_date" timestamp,
	"notes" text DEFAULT '',
	"pipeline_stage" text DEFAULT 'Lead' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to" varchar,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conversation_windows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"chat_id" varchar NOT NULL,
	"whatsapp_phone" text NOT NULL,
	"window_start" timestamp NOT NULL,
	"window_end" timestamp NOT NULL,
	"message_count" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "drip_campaigns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT false,
	"trigger_type" text DEFAULT 'manual' NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "drip_enrollments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"chat_id" varchar NOT NULL,
	"current_step_order" integer DEFAULT 0,
	"status" text DEFAULT 'active' NOT NULL,
	"enrolled_at" timestamp DEFAULT now(),
	"next_send_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "drip_sends" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" varchar NOT NULL,
	"step_id" varchar NOT NULL,
	"twilio_sid" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp DEFAULT now(),
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "drip_steps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"step_order" integer DEFAULT 1 NOT NULL,
	"delay_minutes" integer DEFAULT 0 NOT NULL,
	"message_content" text NOT NULL,
	"message_type" text DEFAULT 'text' NOT NULL,
	"template_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"is_active" boolean DEFAULT true,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"twilio_sid" text NOT NULL,
	"name" text NOT NULL,
	"language" text DEFAULT 'en',
	"category" text NOT NULL,
	"status" text NOT NULL,
	"template_type" text DEFAULT 'text',
	"body_text" text,
	"header_type" text,
	"header_content" text,
	"footer_text" text,
	"buttons" jsonb DEFAULT '[]'::jsonb,
	"carousel_cards" jsonb DEFAULT '[]'::jsonb,
	"variables" jsonb DEFAULT '[]'::jsonb,
	"last_synced_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "message_usage" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"chat_id" varchar,
	"direction" text NOT NULL,
	"message_type" text DEFAULT 'text' NOT NULL,
	"twilio_sid" text,
	"twilio_cost" numeric(10, 6) DEFAULT '0',
	"markup_percent" numeric(5, 2) DEFAULT '5.00',
	"total_cost" numeric(10, 6) DEFAULT '0',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recurring_reminders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"chat_id" varchar,
	"title" text NOT NULL,
	"frequency" text NOT NULL,
	"day_of_week" integer,
	"day_of_month" integer,
	"time_of_day" text DEFAULT '09:00' NOT NULL,
	"next_due" timestamp,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "registered_phones" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"phone_number" text NOT NULL,
	"business_name" text,
	"is_verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "registered_phones_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" varchar NOT NULL,
	"member_id" varchar,
	"email" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_at" timestamp DEFAULT now(),
	"joined_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "template_sends" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"chat_id" varchar NOT NULL,
	"template_id" varchar NOT NULL,
	"twilio_message_sid" text,
	"status" text DEFAULT 'sent',
	"variable_values" jsonb DEFAULT '{}'::jsonb,
	"sent_at" timestamp DEFAULT now(),
	"delivered_at" timestamp,
	"read_at" timestamp,
	"failure_reason" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"avatar_url" text,
	"push_enabled" boolean DEFAULT false,
	"email_enabled" boolean DEFAULT false,
	"push_subscription" jsonb,
	"twilio_account_sid" text,
	"twilio_auth_token" text,
	"twilio_whatsapp_number" text,
	"twilio_connected" boolean DEFAULT false,
	"subscription_plan" text DEFAULT 'free',
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_status" text DEFAULT 'active',
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"trial_ends_at" timestamp,
	"lifetime_conversations" integer DEFAULT 0,
	"monthly_conversations" integer DEFAULT 0,
	"monthly_twilio_usage" numeric(10, 2) DEFAULT '0',
	"business_hours_enabled" boolean DEFAULT false,
	"business_hours_start" text DEFAULT '09:00',
	"business_hours_end" text DEFAULT '17:00',
	"business_days" jsonb DEFAULT '[1,2,3,4,5]'::jsonb,
	"timezone" text DEFAULT 'America/New_York',
	"away_message_enabled" boolean DEFAULT false,
	"away_message" text DEFAULT 'Thanks for reaching out! We''re currently away but will respond as soon as we''re back.',
	"auto_reply_enabled" boolean DEFAULT false,
	"auto_reply_message" text DEFAULT 'Thanks for your message! We''ll get back to you shortly.',
	"auto_reply_delay" integer DEFAULT 0,
	"onboarding_completed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" varchar NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"response_status" integer,
	"response_body" text,
	"success" boolean DEFAULT false,
	"delivered_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" text[] NOT NULL,
	"is_active" boolean DEFAULT true,
	"last_triggered_at" timestamp,
	"failure_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workflow_executions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" varchar NOT NULL,
	"chat_id" varchar,
	"trigger_data" jsonb,
	"actions_executed" jsonb,
	"status" text DEFAULT 'success' NOT NULL,
	"error_message" text,
	"executed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"trigger_type" text NOT NULL,
	"trigger_conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"execution_count" integer DEFAULT 0,
	"last_executed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_windows" ADD CONSTRAINT "conversation_windows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_windows" ADD CONSTRAINT "conversation_windows_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drip_campaigns" ADD CONSTRAINT "drip_campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drip_enrollments" ADD CONSTRAINT "drip_enrollments_campaign_id_drip_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."drip_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drip_enrollments" ADD CONSTRAINT "drip_enrollments_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drip_sends" ADD CONSTRAINT "drip_sends_enrollment_id_drip_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."drip_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drip_sends" ADD CONSTRAINT "drip_sends_step_id_drip_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."drip_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drip_steps" ADD CONSTRAINT "drip_steps_campaign_id_drip_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."drip_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_usage" ADD CONSTRAINT "message_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_usage" ADD CONSTRAINT "message_usage_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_reminders" ADD CONSTRAINT "recurring_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_reminders" ADD CONSTRAINT "recurring_reminders_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registered_phones" ADD CONSTRAINT "registered_phones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_member_id_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_sends" ADD CONSTRAINT "template_sends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_sends" ADD CONSTRAINT "template_sends_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_sends" ADD CONSTRAINT "template_sends_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;