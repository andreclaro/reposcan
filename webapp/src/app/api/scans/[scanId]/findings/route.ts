import { NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";

import { db } from "@/db";
import { findings } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger.server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const session = await getServerAuth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { scanId } = await params;
  const { searchParams } = new URL(request.url);

  // Query parameters for filtering
  const severity = searchParams.get("severity");
  const category = searchParams.get("category");
  const scanner = searchParams.get("scanner");
  const limit = Math.min(
    500,
    Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10) || 100)
  );
  const offset = Math.max(
    0,
    parseInt(searchParams.get("offset") ?? "0", 10) || 0
  );

  logger.debug("[findings] API start", {
    scanId,
    severity,
    category,
    scanner,
    limit,
    offset,
    userId: session?.user?.id,
  });

  try {
    // Verify scan belongs to user
    const { scans } = await import("@/db/schema");
    const scan = await db
      .select()
      .from(scans)
      .where(and(eq(scans.scanId, scanId), eq(scans.userId, session.user.id)))
      .limit(1);

    logger.debug("[findings] scan check", {
      scanFound: scan.length > 0,
      scanId,
    });

    if (scan.length === 0) {
      return NextResponse.json(
        { error: "Scan not found" },
        { status: 404 }
      );
    }

    // Build query conditions
    const conditions = [eq(findings.scanId, scanId)];

    if (severity) {
      conditions.push(eq(findings.severity, severity));
    }
    if (category) {
      conditions.push(eq(findings.category, category));
    }
    if (scanner) {
      conditions.push(eq(findings.scanner, scanner));
    }

    // Fetch findings
    const findingsList = await db
      .select()
      .from(findings)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset);

    logger.debug("[findings] query result", {
      findingsCount: findingsList.length,
      conditionsCount: conditions.length,
    });

    // Summary via aggregated queries (avoids loading all rows)
    const baseWhere = eq(findings.scanId, scanId);
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(findings)
      .where(baseWhere);

    const total = totalRow?.count ?? 0;

    const severityRows = await db
      .select({
        severity: findings.severity,
        count: sql<number>`count(*)::int`,
      })
      .from(findings)
      .where(baseWhere)
      .groupBy(findings.severity);

    const bySeverity = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    for (const row of severityRows) {
      if (row.severity in bySeverity) {
        bySeverity[row.severity as keyof typeof bySeverity] = row.count;
      }
    }

    const categoryRows = await db
      .select({
        category: sql<string>`coalesce(${findings.category}, 'unknown')`,
        count: sql<number>`count(*)::int`,
      })
      .from(findings)
      .where(baseWhere)
      .groupBy(sql`coalesce(${findings.category}, 'unknown')`);

    const byCategory: Record<string, number> = {};
    for (const row of categoryRows) {
      byCategory[row.category] = row.count;
    }

    const scannerRows = await db
      .select({
        scanner: findings.scanner,
        count: sql<number>`count(*)::int`,
      })
      .from(findings)
      .where(baseWhere)
      .groupBy(findings.scanner);

    const byScanner: Record<string, number> = {};
    for (const row of scannerRows) {
      byScanner[row.scanner] = row.count;
    }

    const summary = {
      total,
      by_severity: bySeverity,
      by_category: byCategory,
      by_scanner: byScanner,
    };

    const responseData = {
      findings: findingsList,
      summary,
      pagination: {
        limit,
        offset,
        total,
      },
    };

    logger.debug("[findings] response", {
      findingsCount: findingsList.length,
      summaryTotal: summary.total,
    });

    return NextResponse.json(responseData);
  } catch (error) {
    logger.error("Error fetching findings:", error);
    return NextResponse.json(
      { error: "Failed to fetch findings" },
      { status: 500 }
    );
  }
}
