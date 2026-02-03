-- Full schema (squashed). Use on a fresh database only.
-- Replaces 0000..0007; for idempotent plan re-seed use seed_plans.sql.

-- 1. Plan (no deps)
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

-- 2. App user (refs plan)
CREATE TABLE "app_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp,
	"image" text,
	"created_at" timestamp DEFAULT now(),
	"plan_id" text,
	"scans_per_month_override" integer,
	"custom_price_override" integer,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"trial_ends_at" timestamp,
	"is_enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "app_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- 3. Account
CREATE TABLE "account" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- 4. Session
CREATE TABLE "session" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- 5. Verification token
CREATE TABLE "verification_token" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_token_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint

-- 6. Scan
CREATE TABLE "scan" (
	"id" serial PRIMARY KEY NOT NULL,
	"scan_id" text NOT NULL,
	"user_id" text NOT NULL,
	"repo_url" text NOT NULL,
	"branch" text DEFAULT 'main',
	"commit_hash" text,
	"audit_types" jsonb DEFAULT 'null'::jsonb,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0,
	"results_path" text,
	"s3_results_path" text,
	"result" jsonb DEFAULT 'null'::jsonb,
	"findings_count" integer DEFAULT 0,
	"critical_count" integer DEFAULT 0,
	"high_count" integer DEFAULT 0,
	"medium_count" integer DEFAULT 0,
	"low_count" integer DEFAULT 0,
	"info_count" integer DEFAULT 0,
	"ai_analysis_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "scan_scan_id_unique" UNIQUE("scan_id")
);
--> statement-breakpoint
ALTER TABLE "scan" ADD CONSTRAINT "scan_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- 7. Finding
CREATE TABLE "finding" (
	"id" serial PRIMARY KEY NOT NULL,
	"scan_id" text NOT NULL,
	"scanner" text NOT NULL,
	"severity" text NOT NULL,
	"category" text,
	"title" text NOT NULL,
	"description" text,
	"file_path" text,
	"line_start" integer,
	"line_end" integer,
	"code_snippet" text,
	"cwe" text,
	"cve" text,
	"remediation" text,
	"confidence" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "idx_findings_scan_id" ON "finding"("scan_id");
--> statement-breakpoint
CREATE INDEX "idx_findings_severity" ON "finding"("severity");
--> statement-breakpoint
CREATE INDEX "idx_findings_category" ON "finding"("category");
--> statement-breakpoint
CREATE INDEX "idx_findings_scanner" ON "finding"("scanner");
--> statement-breakpoint
CREATE INDEX "idx_findings_cwe" ON "finding"("cwe");
--> statement-breakpoint
CREATE INDEX "idx_findings_cve" ON "finding"("cve");
--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_scan_id_scan_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scan"("scan_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- 8. AI analysis
CREATE TABLE "ai_analysis" (
	"id" serial PRIMARY KEY NOT NULL,
	"scan_id" text NOT NULL,
	"summary" text NOT NULL,
	"recommendations" jsonb,
	"risk_score" integer,
	"top_findings" jsonb,
	"model" text,
	"model_version" text,
	"tokens_used" integer,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "ai_analysis_scan_id_unique" UNIQUE("scan_id")
);
--> statement-breakpoint
ALTER TABLE "ai_analysis" ADD CONSTRAINT "ai_analysis_scan_id_scan_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scan"("scan_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scan" ADD CONSTRAINT "scan_ai_analysis_id_ai_analysis_id_fk" FOREIGN KEY ("ai_analysis_id") REFERENCES "public"."ai_analysis"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- 9. Usage record
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

-- 10. Stripe event
CREATE TABLE "stripe_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"stripe_event_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_event_stripe_event_id_unique" ON "stripe_event"("stripe_event_id");
--> statement-breakpoint

-- 11. Scan share
CREATE TABLE "scan_share" (
	"id" text PRIMARY KEY NOT NULL,
	"scan_id" text NOT NULL,
	"token" text NOT NULL,
	"share_type" text DEFAULT 'full' NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"created_by" text NOT NULL,
	CONSTRAINT "scan_share_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "scan_share" ADD CONSTRAINT "scan_share_scan_id_scan_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scan"("scan_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scan_share" ADD CONSTRAINT "scan_share_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_scan_shares_scan_id" ON "scan_share"("scan_id");
--> statement-breakpoint
CREATE INDEX "idx_scan_shares_token" ON "scan_share"("token");
--> statement-breakpoint

-- Scan indexes (cache + admin)
CREATE INDEX IF NOT EXISTS idx_scan_repo_commit ON scan(repo_url, commit_hash) WHERE commit_hash IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_scan_created_at ON scan(created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_scan_user_id ON scan(user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_scan_status ON scan(status);
--> statement-breakpoint

-- Seed default plans
INSERT INTO "plan" ("id", "name", "codename", "default", "monthly_price", "yearly_price", "quotas") VALUES
	(gen_random_uuid()::text, 'Free', 'free', true, 0, null, '{"scans_per_month": 5}'),
	(gen_random_uuid()::text, 'Pro', 'pro', false, 2900, 29000, '{"scans_per_month": 50}'),
	(gen_random_uuid()::text, 'Custom', 'custom', false, null, null, '{"scans_per_month": -1}');
