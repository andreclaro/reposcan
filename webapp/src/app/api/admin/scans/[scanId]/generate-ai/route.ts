import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { scans } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";

type RouteParams = { params: Promise<{ scanId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const session = await getServerAuth();

  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { scanId } = await params;

  const [existing] = await db
    .select({
      scanId: scans.scanId,
      status: scans.status,
      findingsCount: scans.findingsCount,
      aiAnalysisId: scans.aiAnalysisId,
    })
    .from(scans)
    .where(eq(scans.scanId, scanId))
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
