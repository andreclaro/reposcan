"use client";

import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  GitBranch,
  GitCommit,
  ExternalLink,
  Calendar,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatusBadge, SeverityBadge, FindingsSummary } from "./severity-badge";
import { cn } from "@/lib/utils";
import type { ScanData } from "@/types/scans";

type ScanSummaryProps = {
  scan: ScanData;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getDisplayProgress(
  status: string,
  progress: number | null
): number | null {
  if (status === "completed") return 100;
  if (progress === null || Number.isNaN(progress)) return null;
  return Math.max(0, Math.min(100, progress));
}

function getGitHubUrl(
  repoUrl: string,
  branch: string | null
): string | null {
  try {
    const url = new URL(repoUrl);
    if (url.hostname.toLowerCase() !== "github.com") return null;

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;

    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, "");
    if (!owner || !repo) return null;

    const branchPath = branch ? `/tree/${branch}` : "";
    return `https://github.com/${owner}/${repo}${branchPath}`;
  } catch {
    return null;
  }
}

export default function ScanSummary({ scan }: ScanSummaryProps) {
  const severityCounts = [
    { label: "Critical", count: scan.criticalCount, key: "critical" as const },
    { label: "High", count: scan.highCount, key: "high" as const },
    { label: "Medium", count: scan.mediumCount, key: "medium" as const },
    { label: "Low", count: scan.lowCount, key: "low" as const },
    { label: "Info", count: scan.infoCount, key: "info" as const },
  ];

  const githubUrl = getGitHubUrl(scan.repoUrl, scan.branch);
  const displayProgress = getDisplayProgress(scan.status, scan.progress);
  const totalFindings =
    (scan.criticalCount ?? 0) +
    (scan.highCount ?? 0) +
    (scan.mediumCount ?? 0) +
    (scan.lowCount ?? 0) +
    (scan.infoCount ?? 0);

  const isRunning = scan.status === "running" || scan.status === "queued";

  return (
    <div className="space-y-6">
      {/* Repository Info Card */}
      <Card className="overflow-hidden border-0 shadow-sm">
        <CardHeader className="bg-slate-50/50 pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-700">
            <GitBranch className="h-4 w-4" />
            Repository Information
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Repository
                </label>
                <div className="mt-1">
                  {githubUrl ? (
                    <a
                      href={githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 hover:text-blue-600"
                    >
                      {scan.repoUrl}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span className="text-sm font-medium text-slate-900">
                      {scan.repoUrl}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-6">
                {scan.branch && (
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Branch</p>
                      <p className="text-sm font-medium text-slate-900">
                        {scan.branch}
                      </p>
                    </div>
                  </div>
                )}

                {scan.commitHash && (
                  <div className="flex items-center gap-2">
                    <GitCommit className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Commit</p>
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700">
                        {scan.commitHash.substring(0, 7)}
                      </code>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Status
                  </label>
                  <div className="mt-1">
                    <StatusBadge status={scan.status} />
                  </div>
                </div>

                {displayProgress !== null && (
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Progress
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">
                        {displayProgress}%
                      </span>
                      {isRunning && (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      )}
                    </div>
                    {/* Progress Bar */}
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={cn(
                          "h-full transition-all duration-500",
                          isRunning ? "bg-blue-500" : "bg-emerald-500"
                        )}
                        style={{ width: `${displayProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Created
                  </label>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-sm text-slate-700">
                      {formatDate(scan.createdAt)}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Updated
                  </label>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-sm text-slate-700">
                      {formatDate(scan.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Findings Summary Card */}
      <Card className="overflow-hidden border-0 shadow-sm">
        <CardHeader className="bg-slate-50/50 pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-700">
            <AlertCircle className="h-4 w-4" />
            Findings Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total vulnerabilities found</p>
              <p className="text-3xl font-bold text-slate-900">
                {scan.findingsCount ?? 0}
              </p>
            </div>
            {totalFindings === 0 && scan.status === "completed" && (
              <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <span className="font-medium text-emerald-700">
                  No issues found
                </span>
              </div>
            )}
          </div>

          {totalFindings > 0 && (
            <>
              <Separator className="mb-6" />

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {severityCounts.map(({ label, count, key }) => (
                  <div
                    key={label}
                    className={cn(
                      "relative overflow-hidden rounded-xl border p-4 transition-all",
                      count && count > 0
                        ? "bg-white shadow-sm"
                        : "bg-slate-50/50"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-600">
                        {label}
                      </span>
                      <SeverityBadge severity={key} showIcon={false} size="sm" />
                    </div>
                    <p
                      className={cn(
                        "mt-2 text-2xl font-bold",
                        key === "critical" && count && count > 0
                          ? "text-red-600"
                          : key === "high" && count && count > 0
                          ? "text-orange-600"
                          : "text-slate-700"
                      )}
                    >
                      {count ?? 0}
                    </p>
                    {/* Severity indicator bar */}
                    {count && count > 0 && (
                      <div
                        className={cn(
                          "absolute bottom-0 left-0 h-1",
                          key === "critical" && "bg-red-500",
                          key === "high" && "bg-orange-500",
                          key === "medium" && "bg-yellow-500",
                          key === "low" && "bg-blue-500",
                          key === "info" && "bg-slate-400"
                        )}
                        style={{
                          width: `${Math.min(100, (count / (scan.findingsCount || 1)) * 100)}%`,
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Visual Bar Chart */}
              <div className="mt-6">
                <div className="flex h-4 overflow-hidden rounded-full">
                  {scan.criticalCount ? (
                    <div
                      className="bg-red-500"
                      style={{
                        width: `${(scan.criticalCount / totalFindings) * 100}%`,
                      }}
                    />
                  ) : null}
                  {scan.highCount ? (
                    <div
                      className="bg-orange-500"
                      style={{
                        width: `${(scan.highCount / totalFindings) * 100}%`,
                      }}
                    />
                  ) : null}
                  {scan.mediumCount ? (
                    <div
                      className="bg-yellow-500"
                      style={{
                        width: `${(scan.mediumCount / totalFindings) * 100}%`,
                      }}
                    />
                  ) : null}
                  {scan.lowCount ? (
                    <div
                      className="bg-blue-500"
                      style={{
                        width: `${(scan.lowCount / totalFindings) * 100}%`,
                      }}
                    />
                  ) : null}
                  {scan.infoCount ? (
                    <div
                      className="bg-slate-400"
                      style={{
                        width: `${(scan.infoCount / totalFindings) * 100}%`,
                      }}
                    />
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {[
                    scan.criticalCount ? { color: "bg-red-500", label: "Critical" } : null,
                    scan.highCount ? { color: "bg-orange-500", label: "High" } : null,
                    scan.mediumCount ? { color: "bg-yellow-500", label: "Medium" } : null,
                    scan.lowCount ? { color: "bg-blue-500", label: "Low" } : null,
                    scan.infoCount ? { color: "bg-slate-400", label: "Info" } : null,
                  ]
                    .filter((item): item is { color: string; label: string } => item !== null)
                    .map((item) => (
                      <div key={item.label} className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${item.color}`} />
                        <span className="text-slate-500">{item.label}</span>
                      </div>
                    ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
