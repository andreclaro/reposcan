import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * Admin status endpoint - checks health of all system components
 * Returns status for: Frontend, FastAPI Backend, PostgreSQL, Redis
 */
export async function GET() {
  const timestamp = new Date().toISOString();
  
  // Check PostgreSQL (direct connection from frontend)
  let postgresqlStatus = "down";
  try {
    await db.execute(sql`SELECT 1`);
    postgresqlStatus = "up";
  } catch (error) {
    console.error("[admin/status] PostgreSQL check failed:", error);
  }

  // Check FastAPI Backend and its components
  const fastApiBase = process.env.FASTAPI_BASE_URL ?? "http://localhost:8000";
  let fastapiStatus = "down";
  let redisStatus = "unknown";
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${fastApiBase}/health/detailed`, {
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (response.ok) {
      const data = await response.json();
      fastapiStatus = data.api === "up" ? "up" : "down";
      redisStatus = data.redis === "up" ? "up" : "down";
      // Use backend's PostgreSQL status if available, fallback to ours
      if (data.postgresql) {
        postgresqlStatus = data.postgresql;
      }
    }
  } catch (error) {
    console.error("[admin/status] FastAPI check failed:", error);
  }

  // Determine overall status
  const components = {
    frontend: "up",
    fastapi: fastapiStatus,
    postgresql: postgresqlStatus,
    redis: redisStatus,
  };

  const allUp = Object.values(components).every(s => s === "up");
  const anyDown = Object.values(components).some(s => s === "down");
  
  const overall = allUp ? "up" : anyDown ? "degraded" : "unknown";

  return NextResponse.json({
    overall,
    components,
    timestamp,
  });
}
