import { NextResponse } from "next/server";
import { db } from "@/db";
import { aiAnalysis } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getServerAuth } from "@/lib/server-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const session = await getServerAuth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { scanId } = await params;

  try {
    // Verify scan belongs to user
    const { scans } = await import("@/db/schema");
    const scan = await db
      .select()
      .from(scans)
      .where(and(eq(scans.scanId, scanId), eq(scans.userId, session.user.id)))
      .limit(1);

    if (scan.length === 0) {
      return NextResponse.json(
        { error: "Scan not found" },
        { status: 404 }
      );
    }

    const analysis = await db
      .select()
      .from(aiAnalysis)
      .where(eq(aiAnalysis.scanId, scanId))
      .limit(1);

    if (analysis.length === 0) {
      return NextResponse.json(
        { error: "AI analysis not found for this scan" },
        { status: 404 }
      );
    }

    const result = analysis[0];

    // Fetch top findings if IDs are provided
    let topFindingsData: any[] = [];
    if (result.topFindings && Array.isArray(result.topFindings) && result.topFindings.length > 0) {
      const { findings: findingsTable } = await import("@/db/schema");
      
      try {
        // Fetch all top findings in one query
        topFindingsData = await db
          .select()
          .from(findingsTable)
          .where(
            and(
              eq(findingsTable.scanId, scanId),
              inArray(findingsTable.id, result.topFindings as number[])
            )
          );
      } catch (error) {
        console.warn("Error fetching top findings:", error);
      }
    }

    return NextResponse.json({
      summary: result.summary,
      riskScore: result.riskScore,
      recommendations: result.recommendations || [],
      topFindings: topFindingsData || [],
      model: result.model,
      modelVersion: result.modelVersion,
      tokensUsed: result.tokensUsed,
      createdAt: result.createdAt,
    });
  } catch (error) {
    console.error("Error fetching AI analysis:", error);
    return NextResponse.json(
      { error: "Failed to fetch AI analysis" },
      { status: 500 }
    );
  }
}
