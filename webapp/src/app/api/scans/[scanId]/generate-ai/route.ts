import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { scans } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";

type RouteParams = { params: Promise<{ scanId: string }> };

/**
 * POST: Queue (re-)generation of AI analysis for a scan.
 * Requires the authenticated user to own the scan.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const session = await getServerAuth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { scanId } = await params;

  const [existing] = await db
    .select({
      scanId: scans.scanId,
      status: scans.status,
      findingsCount: scans.findingsCount,
    })
    .from(scans)
    .where(
      and(eq(scans.scanId, scanId), eq(scans.userId, session.user.id))
    )
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  if (existing.status !== "completed") {
    return NextResponse.json(
      { error: "Scan must be completed to generate AI analysis" },
      { status: 400 }
    );
  }

  if ((existing.findingsCount ?? 0) === 0) {
    return NextResponse.json(
      { error: "Scan has no findings to analyze" },
      { status: 400 }
    );
  }

  const fastApiBase = process.env.FASTAPI_BASE_URL ?? "http://localhost:8000";

  let response: Response;
  try {
    response = await fetch(`${fastApiBase}/scan/${scanId}/generate-ai`, {
      method: "POST",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to reach scan service" },
      { status: 502 }
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: "Scan service error", details: errorText },
      { status: response.status === 400 ? 400 : 502 }
    );
  }

  const data = (await response.json()) as {
    scan_id?: string;
    status?: string;
    message?: string;
  };

  return NextResponse.json({
    scanId: data.scan_id ?? scanId,
    status: data.status ?? "queued",
    message: data.message ?? "AI analysis generation queued",
  });
}
