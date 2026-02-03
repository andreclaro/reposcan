-- Add findings and AI analysis tables
-- Migration: 0001_add_findings_and_ai_analysis

-- Findings table - normalized, queryable
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
CREATE INDEX "idx_findings_scan_id" ON "finding"("scan_id");--> statement-breakpoint
CREATE INDEX "idx_findings_severity" ON "finding"("severity");--> statement-breakpoint
CREATE INDEX "idx_findings_category" ON "finding"("category");--> statement-breakpoint
CREATE INDEX "idx_findings_scanner" ON "finding"("scanner");--> statement-breakpoint
CREATE INDEX "idx_findings_cwe" ON "finding"("cwe");--> statement-breakpoint
CREATE INDEX "idx_findings_cve" ON "finding"("cve");--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_scan_id_scan_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scan"("scan_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- AI Analysis table
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

-- Update scans table with new fields
ALTER TABLE "scan" ADD COLUMN "findings_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "scan" ADD COLUMN "critical_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "scan" ADD COLUMN "high_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "scan" ADD COLUMN "medium_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "scan" ADD COLUMN "low_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "scan" ADD COLUMN "info_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "scan" ADD COLUMN "ai_analysis_id" integer;--> statement-breakpoint
ALTER TABLE "scan" ADD COLUMN "s3_results_path" text;--> statement-breakpoint
ALTER TABLE "scan" ADD CONSTRAINT "scan_ai_analysis_id_ai_analysis_id_fk" FOREIGN KEY ("ai_analysis_id") REFERENCES "public"."ai_analysis"("id") ON DELETE no action ON UPDATE no action;
