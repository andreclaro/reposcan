#!/usr/bin/env node
/**
 * Apply database migration manually
 * Usage: DATABASE_URL=postgresql://... node scripts/apply-migration.mjs [migration_name]
 * Example: node scripts/apply-migration.mjs 0003_add_billing
 * Loads .env.local or .env from webapp root if DATABASE_URL is not set.
 * Default migration: 0000_schema (full schema)
 */
import postgres from "postgres";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local or .env from webapp root so DATABASE_URL is available
if (!process.env.DATABASE_URL) {
  const webappRoot = join(__dirname, "..");
  for (const file of [".env.local", ".env"]) {
    const path = join(webappRoot, file);
    if (existsSync(path)) {
      const content = readFileSync(path, "utf-8");
      for (const line of content.split("\n")) {
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
        }
      }
      break;
    }
  }
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("Error: DATABASE_URL environment variable is required");
  process.exit(1);
}

const migrationName = process.argv[2] || "0000_schema";
const baseName = migrationName.endsWith(".sql") ? migrationName : `${migrationName}.sql`;
const migrationFile = join(__dirname, "../drizzle", baseName);

if (!existsSync(migrationFile)) {
  console.error(`Error: Migration file not found: ${migrationFile}`);
  process.exit(1);
}

const sql = readFileSync(migrationFile, "utf-8");

// Split by statement breakpoints and execute each statement
// Remove comment-only lines but keep SQL statements that may have inline comments
const statements = sql
  .split("--> statement-breakpoint")
  .map((s) => {
    // Remove lines that are only comments (starting with --)
    const lines = s.split("\n");
    const sqlLines = lines.filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith("--");
    });
    return sqlLines.join("\n").trim();
  })
  .filter((s) => s && s.length > 0);

async function applyMigration() {
  const client = postgres(databaseUrl, { max: 1 });

  try {
    console.log(`Applying migration: ${migrationName}`);
    console.log(`Found ${statements.length} statements to execute\n`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          await client.unsafe(statement);
          console.log(`✓ [${i + 1}/${statements.length}] Executed statement`);
        } catch (error) {
          // Ignore "already exists" / idempotent errors (safe to re-run 0000_schema on existing DB)
          const errorMsg = (error.message || String(error)).toLowerCase();
          const isSkip =
            errorMsg.includes("already exists") ||
            errorMsg.includes("duplicate key") ||
            errorMsg.includes("violates unique constraint") ||
            errorMsg.includes("violates foreign key constraint");
          if (isSkip) {
            console.log(`⚠ [${i + 1}/${statements.length}] Skipped (${errorMsg.includes("foreign key") ? "FK constraint" : "already exists"})`);
          } else {
            console.error("✗ [%d/%d] Failed: %s", i + 1, statements.length, String(error.message || error));
            throw error;
          }
        }
      }
    }

    console.log("\n✓ Migration applied successfully");
  } catch (error) {
    console.error("\n✗ Migration failed:", error.message || error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration();
