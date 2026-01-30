-- Billing: plans, usage_records, stripe_events; extend app_user
-- Migration: 0003_add_billing

-- Plans table (Stripe-only)
CREATE TABLE "plan" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"codename" text NOT NULL,
	"default" boolean DEFAULT false,
	"monthly_price" integer,
	"yearly_price" integer,
	"monthly_stripe_price_id" text,
	"yearly_stripe_price_id" text,
	"trial_days" integer,
	"quotas" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "plan_codename_unique" ON "plan"("codename");
--> statement-breakpoint

-- Extend app_user with billing fields
ALTER TABLE "app_user" ADD COLUMN "plan_id" text;
--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "stripe_customer_id" text;
--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "stripe_subscription_id" text;
--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "trial_ends_at" timestamp;
--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- Usage: one row per user per billing period
CREATE TABLE "usage_record" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"scans_used" integer DEFAULT 0 NOT NULL,
	"scans_limit" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "usage_record" ADD CONSTRAINT "usage_record_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "usage_record_user_period" ON "usage_record"("user_id","period_start");
--> statement-breakpoint

-- Stripe webhook idempotency
CREATE TABLE "stripe_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"stripe_event_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_event_stripe_event_id_unique" ON "stripe_event"("stripe_event_id");
--> statement-breakpoint

-- Seed default plans: Free (default, 5 scans), Pro (50), Custom (unlimited)
INSERT INTO "plan" ("id", "name", "codename", "default", "monthly_price", "yearly_price", "quotas") VALUES
	(gen_random_uuid()::text, 'Free', 'free', true, 0, null, '{"scans_per_month": 5}'),
	(gen_random_uuid()::text, 'Pro', 'pro', false, 2900, 29000, '{"scans_per_month": 50}'),
	(gen_random_uuid()::text, 'Custom', 'custom', false, null, null, '{"scans_per_month": -1}');
