import { NextResponse } from "next/server";

/**
 * Health check endpoint for Railway and load balancers
 * Returns 200 OK when the service is healthy
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "frontend",
    },
    { status: 200 }
  );
}

// Also support HEAD requests for health checks
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
