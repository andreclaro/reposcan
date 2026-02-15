CREATE TABLE "github_app_installation" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"installation_id" integer NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text NOT NULL,
	"account_id" integer NOT NULL,
	"repositories" jsonb,
	"suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "github_app_installation_installation_id_unique" UNIQUE("installation_id")
);
--> statement-breakpoint
CREATE TABLE "outreach_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"scan_id" text NOT NULL,
	"type" text NOT NULL,
	"metadata" jsonb,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
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
CREATE TABLE "scanner_setting" (
	"id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"free_enabled" boolean DEFAULT true NOT NULL,
	"pro_enabled" boolean DEFAULT true NOT NULL,
	"custom_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "github_app_installation" ADD CONSTRAINT "github_app_installation_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_activity" ADD CONSTRAINT "outreach_activity_scan_id_scan_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scan"("scan_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_share" ADD CONSTRAINT "scan_share_scan_id_scan_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scan"("scan_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_share" ADD CONSTRAINT "scan_share_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_github_app_installation_user_id" ON "github_app_installation" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_github_app_installation_installation_id" ON "github_app_installation" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "idx_outreach_activity_scan_id" ON "outreach_activity" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "idx_outreach_activity_type" ON "outreach_activity" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_outreach_activity_created_at" ON "outreach_activity" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_scan_shares_scan_id" ON "scan_share" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "idx_scan_shares_token" ON "scan_share" USING btree ("token");