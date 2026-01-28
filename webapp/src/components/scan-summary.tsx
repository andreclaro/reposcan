"use client";

import { CheckCircle2, XCircle, Clock, GitBranch, Hash, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

type ScanData = {
  id: number;
  scanId: string;
  repoUrl: string;
  branch: string | null;
  commitHash: string | null;
  status: string;
  progress: number | null;
  findingsCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  createdAt: string | null;
  updatedAt: string | null;
};

type ScanSummaryProps = {
  scan: ScanData;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  // Use consistent format to avoid hydration mismatches
  // Format: YYYY-MM-DD HH:MM:SS
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: "bg-muted text-muted-foreground",
    running: "bg-primary/10 text-primary",
    completed: "bg-emerald-500/10 text-emerald-600",
    failed: "bg-destructive/10 text-destructive",
    retrying: "bg-secondary/60 text-secondary-foreground",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        styles[status] ?? "bg-muted text-muted-foreground"
      )}
    >
      {status === "completed" ? (
        <CheckCircle2 className="size-3" />
      ) : status === "failed" ? (
        <XCircle className="size-3" />
      ) : (
        <Clock className="size-3" />
      )}
      {status}
    </span>
  );
}

function getDisplayProgress(status: string, progress: number | null): number | null {
  if (status === "completed") {
    return 100;
  }
  if (progress === null || Number.isNaN(progress)) {
    return null;
  }
  return Math.max(0, Math.min(100, progress));
}

function getGitHubUrl(repoUrl: string, branch: string | null): string | null {
  try {
    const url = new URL(repoUrl);
    if (url.hostname.toLowerCase() !== "github.com") {
      return null;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) {
      return null;
    }

    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, "");
    if (!owner || !repo) {
      return null;
    }

    const branchPath = branch ? `/tree/${branch}` : "";
    return `https://github.com/${owner}/${repo}${branchPath}`;
  } catch {
    return null;
  }
}

export default function ScanSummary({ scan }: ScanSummaryProps) {
  const severityCounts = [
    { label: "Critical", count: scan.criticalCount, color: "text-red-600" },
    { label: "High", count: scan.highCount, color: "text-orange-600" },
    { label: "Medium", count: scan.mediumCount, color: "text-yellow-600" },
    { label: "Low", count: scan.lowCount, color: "text-blue-600" },
    { label: "Info", count: scan.infoCount, color: "text-gray-600" },
  ];

  const githubUrl = getGitHubUrl(scan.repoUrl, scan.branch);
  const displayProgress = getDisplayProgress(scan.status, scan.progress);

  return (
    <div className="space-y-5 lg:space-y-6">
      {/* Scan Metadata */}
      <div className="rounded-2xl border bg-background/80 p-5 shadow-sm lg:p-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Repository
              </p>
              {githubUrl ? (
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  {scan.repoUrl}
                  <ExternalLink className="size-3" />
                </a>
              ) : (
                <p className="mt-1 text-sm font-medium">{scan.repoUrl}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <GitBranch className="size-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Branch</p>
                <p className="text-sm font-medium">{scan.branch ?? "main"}</p>
              </div>
            </div>
            {scan.commitHash && (
              <div className="flex items-center gap-2">
                <Hash className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Commit</p>
                  <code className="text-xs font-mono">
                    {scan.commitHash.substring(0, 7)}
                  </code>
                </div>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Scan ID</p>
              <code className="text-xs font-mono">{scan.scanId}</code>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <div className="mt-1">
                <StatusBadge status={scan.status} />
              </div>
            </div>
            {displayProgress !== null && (
              <div>
                <p className="text-xs text-muted-foreground">Progress</p>
                <p className="mt-1 text-sm font-medium">{displayProgress}%</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="mt-1 text-sm font-medium">
                {formatDate(scan.createdAt)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last Updated</p>
              <p className="mt-1 text-sm font-medium">
                {formatDate(scan.updatedAt)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Findings Summary */}
      <div className="rounded-2xl border bg-background/80 p-5 shadow-sm lg:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Findings summary
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Snapshot of security findings by severity.
            </p>
          </div>
          <div className="rounded-xl border bg-muted/40 px-4 py-3 text-right">
            <p className="text-xs text-muted-foreground">Total Findings</p>
            <p className="mt-1 text-2xl font-semibold">{scan.findingsCount}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {severityCounts.map(({ label, count, color }) => (
            <div
              key={label}
              className="rounded-lg border bg-muted/30 px-3 py-3"
            >
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={cn("mt-1 text-xl font-semibold", color)}>{count}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
