import { NextResponse } from "next/server";
import { eq, and, or, isNull, gt } from "drizzle-orm";
import { db } from "@/db";
import { scans, scanShares, findings, aiAnalysis } from "@/db/schema";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { token } = await params;

  // Find the share record (valid if no expiration OR not yet expired)
  const now = new Date();
  const shareRecords = await db
    .select({
      id: scanShares.id,
      scanId: scanShares.scanId,
      shareType: scanShares.shareType,
      expiresAt: scanShares.expiresAt
    })
    .from(scanShares)
    .where(
      and(
        eq(scanShares.token, token),
        or(isNull(scanShares.expiresAt), gt(scanShares.expiresAt, now))
      )
    )
    .limit(1);

  const share = shareRecords[0];
  if (!share) {
    return NextResponse.json(
      { error: "Share link not found or expired" },
      { status: 404 }
    );
  }

  // Fetch the scan
  const scanRecords = await db
    .select()
    .from(scans)
    .where(eq(scans.scanId, share.scanId))
    .limit(1);

  if (scanRecords.length === 0) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const scan = scanRecords[0];

  // Only allow sharing completed scans
  if (scan.status !== "completed") {
    return NextResponse.json(
      { error: "Scan is not yet complete" },
      { status: 400 }
    );
  }

  // Prepare response based on share type
  const response: {
    scan: {
      scanId: string;
      repoUrl: string;
      branch: string | null;
      commitHash: string | null;
      status: string;
      findingsCount: number;
      criticalCount: number;
      highCount: number;
      mediumCount: number;
      lowCount: number;
      infoCount: number;
      createdAt: string | null;
      shareType: string;
    };
    findings?: unknown[];
    aiAnalysis?: unknown;
  } = {
    scan: {
      scanId: scan.scanId,
      repoUrl: scan.repoUrl,
      branch: scan.branch,
      commitHash: scan.commitHash,
      status: scan.status,
      findingsCount: scan.findingsCount ?? 0,
      criticalCount: scan.criticalCount ?? 0,
      highCount: scan.highCount ?? 0,
      mediumCount: scan.mediumCount ?? 0,
      lowCount: scan.lowCount ?? 0,
      infoCount: scan.infoCount ?? 0,
      createdAt: scan.createdAt?.toISOString() ?? null,
      shareType: share.shareType
    }
  };

  // For full shares, include findings
  if (share.shareType === "full") {
    const findingsRecords = await db
      .select({
        id: findings.id,
        scanner: findings.scanner,
        severity: findings.severity,
        category: findings.category,
        title: findings.title,
        description: findings.description,
        filePath: findings.filePath,
        lineStart: findings.lineStart,
        lineEnd: findings.lineEnd,
        codeSnippet: findings.codeSnippet,
        cwe: findings.cwe,
        cve: findings.cve,
        remediation: findings.remediation,
        confidence: findings.confidence,
        metadata: findings.metadata
      })
      .from(findings)
      .where(eq(findings.scanId, share.scanId))
      .orderBy(findings.id);

    response.findings = findingsRecords;

    // Include AI analysis if available
    if (scan.aiAnalysisId) {
      const aiRecords = await db
        .select({
          id: aiAnalysis.id,
          summary: aiAnalysis.summary,
          recommendations: aiAnalysis.recommendations,
          riskScore: aiAnalysis.riskScore,
          topFindings: aiAnalysis.topFindings,
          model: aiAnalysis.model,
          tokensUsed: aiAnalysis.tokensUsed
        })
        .from(aiAnalysis)
        .where(eq(aiAnalysis.id, scan.aiAnalysisId))
        .limit(1);

      if (aiRecords.length > 0) {
        response.aiAnalysis = aiRecords[0];
      }
    }
  }

  return NextResponse.json(response);
}
