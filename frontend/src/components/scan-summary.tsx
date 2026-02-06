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
    <div className="space-y-4">
      {/* Compact Repository Info Card */}
      <Card className="overflow-hidden border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Repository & Branch */}
            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Repository
                </label>
                <div className="mt-0.5">
                  {githubUrl ? (
                    <a
                      href={githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-medium text-slate-900 hover:text-blue-600 truncate max-w-[250px]"
                    >
                      {scan.repoUrl.replace(/^https:\/\//, "")}
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  ) : (
                    <span className="text-sm font-medium text-slate-900 truncate max-w-[250px] block">
                      {scan.repoUrl}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {scan.branch && (
                  <div className="flex items-center gap-1">
                    <GitBranch className="h-3 w-3 text-slate-400" />
                    <span className="text-sm text-slate-700">{scan.branch}</span>
                  </div>
                )}
                {scan.commitHash && (
                  <div className="flex items-center gap-1">
                    <GitCommit className="h-3 w-3 text-slate-400" />
                    <code className="rounded bg-slate-100 px-1 text-xs font-mono text-slate-700">
                      {scan.commitHash.substring(0, 7)}
                    </code>
                  </div>
                )}
              </div>
            </div>

            {/* Status & Progress */}
            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Status
                </label>
                <div className="mt-0.5">
                  <StatusBadge status={scan.status} />
                </div>
              </div>
              {displayProgress !== null && (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">Progress:</span>
                    <span className="text-sm font-medium text-slate-900">
                      {displayProgress}%
                    </span>
                    {isRunning && (
                      <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                    )}
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
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

            {/* Created & Updated */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-3 w-3 text-slate-400" />
                <div>
                  <span className="text-xs text-slate-500">Created: </span>
                  <span className="text-sm text-slate-700">
                    {formatDate(scan.createdAt)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3 text-slate-400" />
                <div>
                  <span className="text-xs text-slate-500">Updated: </span>
                  <span className="text-sm text-slate-700">
                    {formatDate(scan.updatedAt)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compact Findings Summary Card — only shown when scan is completed */}
      {scan.status === "completed" && <Card className="overflow-hidden border-0 shadow-sm">
        <CardHeader className="bg-slate-50/50 py-3 px-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <AlertCircle className="h-4 w-4" />
            Findings Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-slate-500">Total vulnerabilities:</span>
              <span className="text-2xl font-bold text-slate-900">
                {scan.findingsCount ?? 0}
              </span>
            </div>
            {totalFindings === 0 && scan.status === "completed" && (
              <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-700">
                  No issues found
                </span>
              </div>
            )}
          </div>

          {totalFindings > 0 && (
            <>
              <Separator className="mb-4" />

              {/* Compact severity grid */}
              <div className="grid grid-cols-5 gap-2">
                {severityCounts.map(({ label, count, key }) => (
                  <div
                    key={label}
                    className={cn(
                      "relative overflow-hidden rounded-lg border p-2 text-center transition-all",
                      count && count > 0
                        ? "bg-white shadow-sm"
                        : "bg-slate-50/50"
                    )}
                  >
                    <div className="text-xs font-medium text-slate-500">{label}</div>
                    <p
                      className={cn(
                        "text-xl font-bold",
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
                          "absolute bottom-0 left-0 h-0.5",
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

              {/* Compact Visual Bar Chart */}
              <div className="mt-4">
                <div className="flex h-3 overflow-hidden rounded-full">
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
              </div>
            </>
          )}
        </CardContent>
      </Card>}
    </div>
  );
}
