import { NextResponse } from "next/server";
import { desc, eq, and, like, sql } from "drizzle-orm";

import { db } from "@/db";
import { scans, users } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const session = await getServerAuth();

  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const userId = searchParams.get("userId");
  const search = searchParams.get("search");
  const limit = Math.min(
    500,
    Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10) || 100)
  );
  const offset = Math.max(
    0,
    parseInt(searchParams.get("offset") ?? "0", 10) || 0
  );

  // Build conditions
  const conditions = [];
  if (status && status !== "all") {
    conditions.push(eq(scans.status, status));
  }
  if (userId && userId !== "all") {
    conditions.push(eq(scans.userId, userId));
  }
  if (search) {
    conditions.push(
      sql`(${scans.repoUrl} ILIKE ${"%" + search + "%"} OR ${scans.scanId} ILIKE ${"%" + search + "%"} OR ${scans.commitHash} ILIKE ${"%" + search + "%"})`
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const allScans = await db
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
    .where(whereClause)
    .orderBy(desc(scans.createdAt))
    .limit(limit)
    .offset(offset);

  // Get total count for pagination
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scans)
    .where(whereClause);

  const formattedScans = allScans.map((scan) => ({
    ...scan,
    createdAt: scan.createdAt?.toISOString() ?? null,
    updatedAt: scan.updatedAt?.toISOString() ?? null
  }));

  return NextResponse.json({
    scans: formattedScans,
    total: countResult?.count ?? 0,
    limit,
    offset
  });
}
