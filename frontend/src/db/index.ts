import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let _db: Db | null = null;

function getDb(): Db {
  if (_db) return _db;
  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    // Allow production build to succeed without DATABASE_URL (e.g. CI); runtime will fail on first use.
    if (process.env.NEXT_PHASE === "phase-production-build") {
      connectionString = "postgresql://127.0.0.1:1/next_build_placeholder";
    } else {
      throw new Error("DATABASE_URL is not set");
    }
  }
  const client = postgres(connectionString, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  _db = drizzle(client, { schema });
  return _db;
}

/**
 * Lazy-initialized DB client. One connection per Node process (Next.js can run
 * multiple processes in dev). idle_timeout releases connections when idle;
 * ensure Postgres max_connections is high enough (e.g. 200 in docker-compose).
 */
export const db = new Proxy({} as Db, {
  get(_, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/** Real Drizzle instance for adapters that need a concrete instance (e.g. DrizzleAdapter). */
export { getDb };
