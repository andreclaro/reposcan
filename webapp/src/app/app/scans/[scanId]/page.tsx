import { notFound, redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";

import ScanResults from "@/components/scan-results";
import { db } from "@/db";
import { scans } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";

type PageProps = {
  params: Promise<{ scanId: string }>;
};

export default async function ScanResultsPage({ params }: PageProps) {
  const { scanId } = await params;
  const session = await getServerAuth();

  if (!session?.user?.id) {
    redirect("/api/auth/signin");
  }

  // Fetch scan and verify ownership
  const scanRecords = await db
    .select()
    .from(scans)
    .where(and(eq(scans.scanId, scanId), eq(scans.userId, session.user.id)))
    .limit(1);

  if (scanRecords.length === 0) {
    notFound();
  }

  const scan = scanRecords[0];
  const repoPath =
    scan.repoUrl?.split("github.com/")[1]?.replace(/\.git$/, "") ??
    scan.repoUrl;
  const shortCommitHash = scan.commitHash ? scan.commitHash.slice(0, 7) : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Scan Results</h1>

      <ScanResults
        scanId={scanId}
        scan={{
          id: scan.id,
          scanId: scan.scanId,
          repoUrl: scan.repoUrl,
          branch: scan.branch,
          commitHash: scan.commitHash,
          status: scan.status,
          progress: scan.progress,
          findingsCount: scan.findingsCount ?? 0,
          criticalCount: scan.criticalCount ?? 0,
          highCount: scan.highCount ?? 0,
          mediumCount: scan.mediumCount ?? 0,
          lowCount: scan.lowCount ?? 0,
          infoCount: scan.infoCount ?? 0,
          aiAnalysisId: scan.aiAnalysisId,
          createdAt: scan.createdAt?.toISOString() ?? null,
          updatedAt: scan.updatedAt?.toISOString() ?? null,
        }}
      />
    </div>
  );
}
