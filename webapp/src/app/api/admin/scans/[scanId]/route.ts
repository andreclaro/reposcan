import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { scans, users, findings } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";

type RouteParams = { params: Promise<{ scanId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const session = await getServerAuth();

  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { scanId } = await params;

  const [scan] = await db
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
      result: scans.result,
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

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  return NextResponse.json({
    scan: {
      ...scan,
      createdAt: scan.createdAt?.toISOString() ?? null,
      updatedAt: scan.updatedAt?.toISOString() ?? null
    }
  });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await getServerAuth();

  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { scanId } = await params;

  // Check if scan exists
  const [existing] = await db
    .select({ id: scans.id })
    .from(scans)
    .where(eq(scans.scanId, scanId))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  // Delete findings first (cascade should handle this, but be explicit)
  await db.delete(findings).where(eq(findings.scanId, scanId));

  // Delete the scan
  await db.delete(scans).where(eq(scans.scanId, scanId));

  return NextResponse.json({ success: true, deleted: scanId });
}
