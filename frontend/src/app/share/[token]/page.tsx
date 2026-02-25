import { notFound } from "next/navigation";
import Link from "next/link";
import { Shield, ExternalLink, AlertTriangle, Brain, BarChart3, CheckCircle2 } from "lucide-react";
import { db } from "@/db";
import { scans, scanShares, findings, aiAnalysis } from "@/db/schema";
import { eq, and, or, isNull, gt, inArray } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SeverityBadge } from "@/components/severity-badge";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
};

async function getSharedScan(token: string) {
  const now = new Date();

  // Find the share record (valid if no expiration OR not yet expired)
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
  if (!share) return null;

  // Fetch the scan
  const scanRecords = await db
    .select()
    .from(scans)
    .where(eq(scans.scanId, share.scanId))
    .limit(1);

  if (scanRecords.length === 0) return null;

  const scan = scanRecords[0];
  if (scan.status !== "completed") return null;

  return { scan, share };
}

export default async function SharedScanPage({ params }: PageProps) {
  const { token } = await params;
  const data = await getSharedScan(token);

  if (!data) {
    notFound();
  }

  const { scan, share } = data;
  const repoName = scan.repoUrl?.split("/").pop()?.replace(/\.git$/, "") ?? "Repository";
  const repoOwner = scan.repoUrl?.split("/").slice(-2)[0] ?? "";
  const shortCommitHash = scan.commitHash ? scan.commitHash.slice(0, 7) : null;

  // Fetch findings for full shares
  let findingsList: typeof findings.$inferSelect[] = [];
  let aiAnalysisData: typeof aiAnalysis.$inferSelect | null = null;
  let topFindingsList: typeof findings.$inferSelect[] = [];

  if (share.shareType === "full") {
    findingsList = await db
      .select()
      .from(findings)
      .where(eq(findings.scanId, scan.scanId))
      .orderBy(findings.id);

    if (scan.aiAnalysisId) {
      const aiRecords = await db
        .select()
        .from(aiAnalysis)
        .where(eq(aiAnalysis.id, scan.aiAnalysisId))
        .limit(1);
      if (aiRecords.length > 0) {
        aiAnalysisData = aiRecords[0];
        
        // Fetch top findings if available
        if (aiAnalysisData.topFindings && Array.isArray(aiAnalysisData.topFindings)) {
          const topFindingIds = aiAnalysisData.topFindings as number[];
          if (topFindingIds.length > 0) {
            topFindingsList = await db
              .select()
              .from(findings)
              .where(and(
                eq(findings.scanId, scan.scanId),
                inArray(findings.id, topFindingIds)
              ));
          }
        }
      }
    }
  }

  // Get risk score color
  const getRiskColor = (score: number) => {
    if (score >= 75) return "text-red-600";
    if (score >= 50) return "text-orange-600";
    if (score >= 25) return "text-yellow-600";
    return "text-green-600";
  };

  const getRiskLabel = (score: number) => {
    if (score >= 75) return "Critical";
    if (score >= 50) return "High";
    if (score >= 25) return "Medium";
    return "Low";
  };

  const recommendations = aiAnalysisData?.recommendations as Array<{
    priority: "critical" | "high" | "medium" | "low";
    action: string;
    findingIds: number[];
    estimatedEffort: "low" | "medium" | "high";
  }> | null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-semibold text-slate-900">
              RepoScan
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Badge variant="secondary" className="text-xs">
              {share.shareType === "full" ? "Full Report" : "Summary Only"}
            </Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Title Section */}
        <div className="mb-8 space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">
            {repoOwner}/{repoName}
          </h1>
          {shortCommitHash && (
            <p className="text-sm text-slate-500 font-mono">
              {shortCommitHash} {scan.branch ? `(${scan.branch})` : ""}
            </p>
          )}
          <p className="text-xs text-slate-400">
            Shared security scan report
          </p>
        </div>

        {/* Scan Summary */}
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-slate-500" />
            <h2 className="text-lg font-semibold">Scan Summary</h2>
          </div>

          {scan.findingsCount === 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-4 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">
                No vulnerabilities found! Great job.
              </span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Total count */}
              <p className="text-slate-600">
                Total vulnerabilities: <span className="font-semibold text-slate-900">{scan.findingsCount}</span>
              </p>

              {/* Severity cards */}
              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: "Critical", count: scan.criticalCount ?? 0, color: "border-red-500", textColor: "text-red-600", bgColor: "bg-red-500" },
                  { label: "High", count: scan.highCount ?? 0, color: "border-orange-500", textColor: "text-orange-600", bgColor: "bg-orange-500" },
                  { label: "Medium", count: scan.mediumCount ?? 0, color: "border-yellow-500", textColor: "text-yellow-600", bgColor: "bg-yellow-500" },
                  { label: "Low", count: scan.lowCount ?? 0, color: "border-blue-500", textColor: "text-blue-600", bgColor: "bg-blue-500" },
                  { label: "Info", count: scan.infoCount ?? 0, color: "border-slate-400", textColor: "text-slate-600", bgColor: "bg-slate-400" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`rounded-lg border bg-white p-4 text-center border-b-4 ${item.color}`}
                  >
                    <p className="text-sm text-slate-500">{item.label}</p>
                    <p className={`text-2xl font-bold ${item.textColor}`}>{item.count}</p>
                  </div>
                ))}
              </div>

              {/* Stacked bar chart */}
              <div className="h-3 w-full rounded-full overflow-hidden flex">
                {(() => {
                  const total = scan.findingsCount ?? 0;
                  if (total === 0) return null;
                  const critical = scan.criticalCount ?? 0;
                  const high = scan.highCount ?? 0;
                  const medium = scan.mediumCount ?? 0;
                  const low = scan.lowCount ?? 0;
                  const info = scan.infoCount ?? 0;
                  return (
                    <>
                      {critical > 0 && <div className="bg-red-500" style={{ width: `${(critical / total) * 100}%` }} />}
                      {high > 0 && <div className="bg-orange-500" style={{ width: `${(high / total) * 100}%` }} />}
                      {medium > 0 && <div className="bg-yellow-500" style={{ width: `${(medium / total) * 100}%` }} />}
                      {low > 0 && <div className="bg-blue-500" style={{ width: `${(low / total) * 100}%` }} />}
                      {info > 0 && <div className="bg-slate-400" style={{ width: `${(info / total) * 100}%` }} />}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Full Report Content */}
        {share.shareType === "full" && (
          <>
            {/* AI Analysis */}
            {aiAnalysisData && (
              <div className="mb-8 space-y-6">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-slate-500" />
                  <h2 className="text-lg font-semibold">AI Analysis</h2>
                </div>

                {/* Risk Score */}
                {aiAnalysisData.riskScore !== null && (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-6">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Risk Score</span>
                          <span className={`text-2xl font-bold ${getRiskColor(aiAnalysisData.riskScore)}`}>
                            {aiAnalysisData.riskScore}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              aiAnalysisData.riskScore >= 75 ? "bg-red-600" :
                              aiAnalysisData.riskScore >= 50 ? "bg-orange-600" :
                              aiAnalysisData.riskScore >= 25 ? "bg-yellow-600" : "bg-green-600"
                            }`}
                            style={{ width: `${aiAnalysisData.riskScore}%` }}
                          />
                        </div>
                        <p className={`text-xs font-medium ${getRiskColor(aiAnalysisData.riskScore)}`}>
                          {getRiskLabel(aiAnalysisData.riskScore)} Risk
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Executive Summary */}
                <Card className="border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Executive Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {aiAnalysisData.summary}
                    </p>
                  </CardContent>
                </Card>

                {/* Top Findings */}
                {topFindingsList.length > 0 && (
                  <Card className="border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base">Top Critical Findings</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {topFindingsList.map((finding) => (
                          <div key={finding.id} className="rounded-lg border bg-slate-50 p-3">
                            <p className="text-sm font-medium text-slate-900">{finding.title}</p>
                            <Badge
                              variant="secondary"
                              className={`mt-2 text-xs ${
                                finding.severity === "critical"
                                  ? "bg-red-100 text-red-700"
                                  : finding.severity === "high"
                                    ? "bg-orange-100 text-orange-700"
                                    : "bg-yellow-100 text-yellow-700"
                              }`}
                            >
                              {finding.severity}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Recommendations */}
                {recommendations && recommendations.length > 0 && (
                  <Card className="border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base">Prioritized Recommendations</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {recommendations.map((rec, index) => (
                          <div key={index} className="rounded-lg border bg-slate-50 p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge
                                variant="secondary"
                                className={`text-xs ${
                                  rec.priority === "critical"
                                    ? "bg-red-100 text-red-700"
                                    : rec.priority === "high"
                                      ? "bg-orange-100 text-orange-700"
                                      : rec.priority === "medium"
                                        ? "bg-yellow-100 text-yellow-700"
                                        : "bg-blue-100 text-blue-700"
                                }`}
                              >
                                {rec.priority}
                              </Badge>
                              <span className="text-xs text-slate-500">
                                Effort: {rec.estimatedEffort}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-slate-900">{rec.action}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Model Info */}
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <div>
                    {aiAnalysisData.model && (
                      <span>Model: {aiAnalysisData.model}</span>
                    )}
                  </div>
                  {aiAnalysisData.tokensUsed !== null && (
                    <span>Tokens used: {aiAnalysisData.tokensUsed.toLocaleString()}</span>
                  )}
                </div>
              </div>
            )}

            {/* Findings List */}
            {findingsList.length > 0 && (
              <div>
                <div className="mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-slate-500" />
                  <h2 className="text-lg font-semibold">
                    Findings ({findingsList.length})
                  </h2>
                </div>
                <div className="space-y-4">
                  {findingsList.map((finding) => (
                    <Card key={finding.id} className="border-0 shadow-sm">
                      <CardContent className="p-5">
                        <div className="flex items-start gap-4">
                          <SeverityBadge severity={finding.severity} size="md" />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-slate-900">
                              {finding.title}
                            </h3>
                            {finding.description && (
                              <p className="mt-1 text-sm text-slate-500">
                                {finding.description}
                              </p>
                            )}
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {finding.category && (
                                <Badge variant="secondary" className="text-xs">
                                  {finding.category}
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {finding.scanner}
                              </Badge>
                              {finding.filePath && (
                                <span className="text-xs text-slate-400">
                                  {finding.filePath}
                                  {finding.lineStart && `:${finding.lineStart}`}
                                </span>
                              )}
                            </div>
                            {finding.remediation && (
                              <div className="mt-4 rounded-lg border-l-4 border-emerald-400 bg-emerald-50 p-3 text-sm text-slate-700">
                                <strong>Remediation:</strong> {finding.remediation}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Summary Only Notice */}
        {share.shareType === "summary" && (
          <Card className="border-0 shadow-sm bg-slate-100">
            <CardContent className="p-6 text-center">
              <p className="text-sm text-slate-500">
                This is a summary-only share. Detailed findings and AI analysis
                are not included.
              </p>
            </CardContent>
          </Card>
        )}

        <Separator className="my-8" />

        {/* Footer */}
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-slate-400">
            Powered by RepoScan
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/">
              Get your own security scans
              <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
