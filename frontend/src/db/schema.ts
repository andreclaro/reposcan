import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// Plan quotas (e.g. scans_per_month). -1 or high number = unlimited.
export type PlanQuotas = { scans_per_month?: number };

export const plans = pgTable("plan", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  codename: text("codename").unique().notNull(),
  default: boolean("default").default(false),
  monthlyPrice: integer("monthly_price"),
  yearlyPrice: integer("yearly_price"),
  monthlyStripePriceId: text("monthly_stripe_price_id"),
  yearlyStripePriceId: text("yearly_stripe_price_id"),
  trialDays: integer("trial_days"),
  quotas: jsonb("quotas").$type<PlanQuotas>(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow()
});

export const users = pgTable("app_user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  planId: text("plan_id").references(() => plans.id),
  /** When set and user is on Custom plan, overrides plan's scans_per_month (per-customer limit). -1 = unlimited. */
  scansPerMonthOverride: integer("scans_per_month_override"),
  /** When set and user is on Custom plan, custom monthly price in cents (e.g. 5000 = $50). */
  customPriceOverride: integer("custom_price_override"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  trialEndsAt: timestamp("trial_ends_at", { mode: "date" }),
  /** Beta mode: users must be enabled by admin before accessing the service */
  isEnabled: boolean("is_enabled").notNull().default(true)
});

export const accounts = pgTable(
  "account",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state")
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId]
    })
  ]
);

export const sessions = pgTable("session", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull()
});

export const verificationTokens = pgTable(
  "verification_token",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull()
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token]
    })
  ]
);

// AI Analysis table (defined before scans to avoid circular reference)
// Foreign key to scans.scanId is defined in the migration SQL
export const aiAnalysis = pgTable("ai_analysis", {
  id: serial("id").primaryKey(),
  scanId: text("scan_id")
    .unique()
    .notNull(),
  summary: text("summary").notNull(), // Executive summary (markdown)
  recommendations: jsonb("recommendations").$type<
    Array<{
      priority: "critical" | "high" | "medium" | "low";
      action: string;
      findingIds: number[];
      estimatedEffort: "low" | "medium" | "high";
    }>
  >(),
  riskScore: integer("risk_score"), // 0-100 overall risk score
  topFindings: jsonb("top_findings").$type<number[]>(), // Finding IDs for top 10 critical issues
  model: text("model"), // 'claude-3-opus', 'gpt-4', 'claude-3-sonnet', etc.
  modelVersion: text("model_version"), // API version used
  tokensUsed: integer("tokens_used"), // For cost tracking
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow()
});

export const scans = pgTable("scan", {
  id: serial("id").primaryKey(),
  scanId: text("scan_id").unique().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  repoUrl: text("repo_url").notNull(),
  branch: text("branch").default("main"),
  commitHash: text("commit_hash"),
  auditTypes: jsonb("audit_types").$type<string[] | null>().default(null),
  status: text("status").notNull().default("queued"),
  progress: integer("progress").default(0),
  resultsPath: text("results_path"),
  s3ResultsPath: text("s3_results_path"),
  result: jsonb("result").$type<Record<string, unknown> | null>().default(null),
  
  // Findings summary counts
  findingsCount: integer("findings_count").default(0),
  criticalCount: integer("critical_count").default(0),
  highCount: integer("high_count").default(0),
  mediumCount: integer("medium_count").default(0),
  lowCount: integer("low_count").default(0),
  infoCount: integer("info_count").default(0),
  
  // AI analysis reference
  aiAnalysisId: integer("ai_analysis_id").references(() => aiAnalysis.id),
  
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow()
});

// Findings table - normalized, queryable
export const findings = pgTable(
  "finding",
  {
    id: serial("id").primaryKey(),
    scanId: text("scan_id")
      .notNull()
      .references(() => scans.scanId, { onDelete: "cascade" }),
    scanner: text("scanner").notNull(), // 'semgrep', 'trivy', 'npm', 'govulncheck', 'cargo-audit', 'tfsec', 'checkov', 'tflint'
    severity: text("severity").notNull(), // 'critical', 'high', 'medium', 'low', 'info'
    category: text("category"), // 'injection', 'xss', 'auth', 'crypto', 'dependency', 'config', 'secrets', 'rce', 'ssrf', 'idor'
    title: text("title").notNull(),
    description: text("description"),
    filePath: text("file_path"),
    lineStart: integer("line_start"),
    lineEnd: integer("line_end"),
    codeSnippet: text("code_snippet"), // First 500 chars only (full code in S3/local storage if needed)
    cwe: text("cwe"), // CWE-79
    cve: text("cve"), // CVE-2024-1234
    remediation: text("remediation"),
    confidence: text("confidence"), // 'high', 'medium', 'low'
    metadata: jsonb("metadata").$type<Record<string, unknown>>(), // Tool-specific data (rule_id, package_name, etc.)
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow()
  },
  (table) => ({
    scanIdIdx: index("idx_findings_scan_id").on(table.scanId),
    severityIdx: index("idx_findings_severity").on(table.severity),
    categoryIdx: index("idx_findings_category").on(table.category),
    scannerIdx: index("idx_findings_scanner").on(table.scanner),
    cweIdx: index("idx_findings_cwe").on(table.cwe),
    cveIdx: index("idx_findings_cve").on(table.cve)
  })
);

// Usage: one row per user per billing period (calendar month). Only new scan creations count.
export const usageRecords = pgTable(
  "usage_record",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { mode: "date" }).notNull(),
    periodEnd: timestamp("period_end", { mode: "date" }).notNull(),
    scansUsed: integer("scans_used").notNull().default(0),
    scansLimit: integer("scans_limit").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow()
  },
  (table) => [
    unique("usage_record_user_period").on(table.userId, table.periodStart)
  ]
);

// Stripe webhook idempotency: skip duplicate events.
export const stripeEvents = pgTable("stripe_event", {
  id: serial("id").primaryKey(),
  stripeEventId: text("stripe_event_id").unique().notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow()
});

// Scan sharing - public share links for scans
export const scanShares = pgTable(
  "scan_share",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    scanId: text("scan_id")
      .notNull()
      .references(() => scans.scanId, { onDelete: "cascade" }),
    token: text("token").unique().notNull(),
    shareType: text("share_type").notNull().default("full"), // 'full' | 'summary'
    expiresAt: timestamp("expires_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
  },
  (table) => ({
    scanIdIdx: index("idx_scan_shares_scan_id").on(table.scanId),
    tokenIdx: index("idx_scan_shares_token").on(table.token)
  })
);

// Outreach activity tracking for marketing (GitHub issues, etc.)
export const outreachActivity = pgTable(
  "outreach_activity",
  {
    id: serial("id").primaryKey(),
    scanId: text("scan_id")
      .notNull()
      .references(() => scans.scanId, { onDelete: "cascade" }),
    type: text("type").notNull(), // 'github_issue_opened'
    metadata: jsonb("metadata").$type<{
      issueUrl?: string;
      issueNumber?: number;
      shareToken?: string;
      api?: boolean;
      bulk?: boolean;
    }>(),
    createdBy: text("created_by").notNull(), // admin email
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow()
  },
  (table) => ({
    scanIdIdx: index("idx_outreach_activity_scan_id").on(table.scanId),
    typeIdx: index("idx_outreach_activity_type").on(table.type),
    createdAtIdx: index("idx_outreach_activity_created_at").on(table.createdAt)
  })
);
