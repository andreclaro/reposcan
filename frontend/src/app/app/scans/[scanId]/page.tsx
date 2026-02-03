import { notFound, redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";

import OpenGitHubIssueButton from "@/components/open-github-issue-button";
import ScanResults from "@/components/scan-results";
import ScanShareDialog from "@/components/scan-share-dialog";
import { db } from "@/db";
import { scans } from "@/db/schema";
import { getRepoHasIssues } from "@/lib/github";
import { parseGitHubRepo } from "@/lib/github-url";
import { getServerAuth } from "@/lib/server-auth";

type PageProps = {
  params: Promise<{ scanId: string }>;
};

export default async function ScanResultsPage({ params }: PageProps) {
  const { scanId } = await params;
  const session = await getServerAuth();

  if (!session?.user?.id) {
    redirect("/login");
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
  const urlParts = scan.repoUrl ? scan.repoUrl.split("/").filter(Boolean) : [];
  const repoName =
    urlParts.length > 0
      ? (urlParts[urlParts.length - 1] ?? "").replace(/\.git$/, "") || "Repository"
      : "Repository";
  const repoOwner = urlParts.length >= 2 ? urlParts[urlParts.length - 2] ?? "" : "";
  const shortCommitHash = scan.commitHash ? scan.commitHash.slice(0, 7) : null;

  const aiAnalysisEnabled =
    process.env.AI_ANALYSIS_ENABLED?.toLowerCase() === "true";

  const githubRepo = scan.repoUrl ? parseGitHubRepo(scan.repoUrl) : null;
  const hasIssuesEnabled =
    githubRepo &&
    (await getRepoHasIssues(githubRepo.owner, githubRepo.repo));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">
            {repoOwner}/{repoName}
          </h1>
          {shortCommitHash && (
            <p className="text-sm text-muted-foreground font-mono">
              {shortCommitHash} {scan.branch ? `(${scan.branch})` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasIssuesEnabled && (
            <OpenGitHubIssueButton
              repoUrl={scan.repoUrl}
              scanId={scanId}
              findingsCount={scan.findingsCount ?? 0}
              criticalCount={scan.criticalCount ?? 0}
              highCount={scan.highCount ?? 0}
              mediumCount={scan.mediumCount ?? 0}
              lowCount={scan.lowCount ?? 0}
              infoCount={scan.infoCount ?? 0}
              branch={scan.branch}
              commitHash={scan.commitHash}
              scanDate={
                scan.createdAt
                  ? new Date(scan.createdAt).toISOString().slice(0, 10)
                  : null
              }
            />
          )}
          <ScanShareDialog scanId={scanId} scanStatus={scan.status} />
        </div>
      </div>

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
        aiAnalysisEnabled={aiAnalysisEnabled}
      />
    </div>
  );
}
