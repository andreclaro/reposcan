import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { scans, users } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";

type RouteParams = { params: Promise<{ scanId: string }> };

const RETRYABLE_STATUSES = new Set(["failed", "timed_out"]);

export async function POST(_request: Request, { params }: RouteParams) {
  const session = await getServerAuth();

  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { scanId } = await params;

  // Look up existing scan to validate status and get config
  const [existingScan] = await db
    .select({
      id: scans.id,
      scanId: scans.scanId,
      userId: scans.userId,
      userEmail: users.email,
      repoUrl: scans.repoUrl,
      branch: scans.branch,
      auditTypes: scans.auditTypes,
      status: scans.status,
      progress: scans.progress,
      createdAt: scans.createdAt,
      updatedAt: scans.updatedAt
    })
    .from(scans)
    .leftJoin(users, eq(scans.userId, users.id))
    .where(eq(scans.scanId, scanId))
    .limit(1);

  if (!existingScan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  if (!RETRYABLE_STATUSES.has(existingScan.status)) {
    return NextResponse.json(
      { error: "Scan is not in a retryable state" },
      { status: 400 }
    );
  }

  const payload = {
    repo_url: existingScan.repoUrl,
    branch: existingScan.branch,
    audit_types:
      existingScan.auditTypes ?? [
        "sast",
        "dockerfile",
        "terraform",
        "node",
        "go",
        "rust"
      ],
    skip_lfs: false,
    force_rescan: true
  };

  const fastApiBase = process.env.FASTAPI_BASE_URL ?? "http://localhost:8000";

  let scanResponse: Response;
  try {
    scanResponse = await fetch(`${fastApiBase}/scan/${scanId}/retry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to reach scan service" },
      { status: 502 }
    );
  }

  if (!scanResponse.ok) {
    const errorText = await scanResponse.text();
    return NextResponse.json(
      { error: "Scan service error", details: errorText },
      { status: 502 }
    );
  }

  const scanData = (await scanResponse.json()) as {
    scan_id?: string;
    scanId?: string;
    status?: string;
  };

  const serviceScanId = scanData.scan_id ?? scanData.scanId;
  if (!serviceScanId || serviceScanId !== scanId) {
    return NextResponse.json(
      { error: "Scan service response mismatch for retry" },
      { status: 502 }
    );
  }

  // Update existing scan record in-place, resetting relevant fields
  await db
    .update(scans)
    .set({
      status: scanData.status ?? "retrying",
      progress: 0,
      result: null,
      findingsCount: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      infoCount: 0,
      resultsPath: null,
      s3ResultsPath: null,
      commitHash: null,
      updatedAt: new Date()
    })
    .where(eq(scans.scanId, scanId));

  const [updatedScan] = await db
    .select({
      id: scans.id,
      scanId: scans.scanId,
      userId: scans.userId,
      userEmail: users.email,
      repoUrl: scans.repoUrl,
      branch: scans.branch,
      commitHash: scans.commitHash,
      auditTypes: scans.auditTypes,
      status: scans.status,
      progress: scans.progress,
      resultsPath: scans.resultsPath,
      s3ResultsPath: scans.s3ResultsPath,
      findingsCount: scans.findingsCount,
      criticalCount: scans.criticalCount,
      highCount: scans.highCount,
      mediumCount: scans.mediumCount,
      lowCount: scans.lowCount,
      infoCount: scans.infoCount,
      aiAnalysisId: scans.aiAnalysisId,
      createdAt: scans.createdAt,
      updatedAt: scans.updatedAt
    })
    .from(scans)
    .leftJoin(users, eq(scans.userId, users.id))
    .where(eq(scans.scanId, scanId))
    .limit(1);

  if (!updatedScan) {
    return NextResponse.json(
      { error: "Failed to update scan for retry" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    scan: {
      ...updatedScan,
      userEmail: updatedScan.userEmail,
      createdAt: updatedScan.createdAt?.toISOString() ?? null,
      updatedAt: updatedScan.updatedAt?.toISOString() ?? null
    },
    originalStatus: existingScan.status,
    service: scanData
  });
}

