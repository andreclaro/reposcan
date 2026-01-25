import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { scans } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";

type ScanStatusPayload = {
  scan_id?: string;
  status?: string;
  progress?: number;
  results_path?: string;
  commit_hash?: string;
  result?: Record<string, unknown>;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const { scanId } = await params;
  const session = await getServerAuth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fastApiBase = process.env.FASTAPI_BASE_URL ?? "http://localhost:8000";

  let statusResponse: Response;

  try {
    statusResponse = await fetch(`${fastApiBase}/scan/${scanId}/status`, {
      method: "GET",
      cache: "no-store"
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to reach scan service" },
      { status: 502 }
    );
  }

  if (!statusResponse.ok) {
    const errorText = await statusResponse.text();
    return NextResponse.json(
      { error: "Scan service error", details: errorText },
      { status: 502 }
    );
  }

  const statusData = (await statusResponse.json()) as ScanStatusPayload;

  const [updatedScan] = await db
    .update(scans)
    .set({
      status: statusData.status ?? "queued",
      progress: statusData.progress ?? 0,
      resultsPath: statusData.results_path ?? null,
      commitHash: statusData.commit_hash ?? null,
      result: statusData.result ?? null,
      updatedAt: new Date()
    })
    .where(and(eq(scans.scanId, scanId), eq(scans.userId, session.user.id)))
    .returning();

  if (!updatedScan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  return NextResponse.json({ scan: updatedScan, service: statusData });
}
