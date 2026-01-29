"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CircleDashed,
  ChevronDown,
  ChevronRight,
  RefreshCcw,
  TriangleAlert,
  ExternalLink,
  Search,
  Filter
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AdminScanDetail from "@/components/admin/admin-scan-detail";
import { cn } from "@/lib/utils";

type ScanWithUser = {
  id: number;
  scanId: string;
  userId: string;
  userEmail: string | null;
  repoUrl: string;
  branch: string | null;
  commitHash: string | null;
  auditTypes: string[] | null;
  status: string;
  progress: number | null;
  resultsPath: string | null;
  s3ResultsPath: string | null;
  findingsCount: number | null;
  criticalCount: number | null;
  highCount: number | null;
  mediumCount: number | null;
  lowCount: number | null;
  infoCount: number | null;
  aiAnalysisId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type AdminDashboardProps = {
  initialScans: ScanWithUser[];
  users: { userId: string; email: string }[];
  statusCounts: { status: string; count: number }[];
};

const statusStyles: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-primary/10 text-primary",
  completed: "bg-emerald-500/10 text-emerald-600",
  failed: "bg-destructive/10 text-destructive",
  retrying: "bg-secondary/60 text-secondary-foreground"
};

const RETRYABLE_STATUSES = new Set(["failed"]);

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        statusStyles[status] ?? "bg-muted text-muted-foreground"
      )}
    >
      {status === "running" || status === "queued" || status === "retrying" ? (
        <CircleDashed className="size-3" />
      ) : status === "completed" ? (
        <CheckCircle2 className="size-3" />
      ) : status === "failed" ? (
        <TriangleAlert className="size-3" />
      ) : null}
      {status}
    </span>
  );
}

function FindingsCounts({
  scan
}: {
  scan: Pick<
    ScanWithUser,
    | "findingsCount"
    | "criticalCount"
    | "highCount"
    | "mediumCount"
    | "lowCount"
    | "infoCount"
  >;
}) {
  if (typeof scan.findingsCount !== "number") {
    return <span className="text-muted-foreground">—</span>;
  }

  if (scan.findingsCount === 0) {
    return <span className="font-medium text-emerald-600">0</span>;
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {Boolean(scan.criticalCount) && (
        <span className="text-xs font-semibold text-red-600">
          {scan.criticalCount}C
        </span>
      )}
      {Boolean(scan.highCount) && (
        <span className="text-xs font-semibold text-orange-600">
          {scan.highCount}H
        </span>
      )}
      {Boolean(scan.mediumCount) && (
        <span className="text-xs font-semibold text-yellow-600">
          {scan.mediumCount}M
        </span>
      )}
      {Boolean(scan.lowCount) && (
        <span className="text-xs font-semibold text-blue-600">
          {scan.lowCount}L
        </span>
      )}
      {Boolean(scan.infoCount) && (
        <span className="text-xs font-semibold text-gray-500">
          {scan.infoCount}I
        </span>
      )}
    </span>
  );
}

function formatDate(value?: string | null) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export default function AdminDashboard({
  initialScans,
  users,
  statusCounts
}: AdminDashboardProps) {
  const [scans, setScans] = useState<ScanWithUser[]>(initialScans);
  const [expandedScanId, setExpandedScanId] = useState<string | null>(null);
  const [rescanningScanIds, setRescanningScanIds] = useState<Set<string>>(() => new Set());
  const [retryingScanIds, setRetryingScanIds] = useState<Set<string>>(
    () => new Set()
  );

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");

  const filteredScans = useMemo(() => {
    return scans.filter((scan) => {
      // Status filter
      if (statusFilter !== "all" && scan.status !== statusFilter) {
        return false;
      }

      // User filter
      if (userFilter !== "all" && scan.userId !== userFilter) {
        return false;
      }

      // Search filter (repo URL, scan ID, commit hash)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesRepo = scan.repoUrl.toLowerCase().includes(query);
        const matchesScanId = scan.scanId.toLowerCase().includes(query);
        const matchesCommit = scan.commitHash?.toLowerCase().includes(query);
        if (!matchesRepo && !matchesScanId && !matchesCommit) {
          return false;
        }
      }

      return true;
    });
  }, [scans, statusFilter, userFilter, searchQuery]);

  const totalCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    statusCounts.forEach(({ status, count }) => {
      counts[status] = count;
    });
    return counts;
  }, [statusCounts]);

  const handleRetry = async (scanId: string) => {
    setRetryingScanIds((prev) => {
      const next = new Set(prev);
      next.add(scanId);
      return next;
    });
    try {
      const response = await fetch(`/api/admin/scans/${scanId}/retry`, {
        method: "POST"
      });

      if (response.ok) {
        const data = await response.json();
        if (data.scan) {
          setScans((prev) =>
            prev.map((scan) =>
              scan.scanId === scanId ? { ...scan, ...data.scan } : scan
            )
          );
        }
      }
    } finally {
      setRetryingScanIds((prev) => {
        const next = new Set(prev);
        next.delete(scanId);
        return next;
      });
    }
  };

  const handleRescan = async (scanId: string) => {
    setRescanningScanIds((prev) => new Set(prev).add(scanId));
    try {
      const response = await fetch(`/api/admin/scans/${scanId}/rescan`, {
        method: "POST"
      });

      if (response.ok) {
        const data = await response.json();
        if (data.scan) {
          setScans((prev) => [data.scan, ...prev]);
        }
      }
    } finally {
      setRescanningScanIds((prev) => {
        const next = new Set(prev);
        next.delete(scanId);
        return next;
      });
    }
  };

  const handleDelete = async (scanId: string) => {
    const response = await fetch(`/api/admin/scans/${scanId}`, {
      method: "DELETE"
    });

    if (response.ok) {
      setScans((prev) => prev.filter((scan) => scan.scanId !== scanId));
      if (expandedScanId === scanId) {
        setExpandedScanId(null);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        {["queued", "running", "completed", "failed", "retrying"].map(
          (status) => (
            <div
              key={status}
              className="rounded-xl border bg-background p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize text-muted-foreground">
                  {status}
                </span>
                <StatusBadge status={status} />
              </div>
              <p className="mt-2 text-2xl font-bold">{totalCounts[status] ?? 0}</p>
            </div>
          )
        )}
      </div>

      {/* Filters */}
      <div className="rounded-xl border bg-background p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters</span>
          </div>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by repo, scan ID, or commit..."
              className="h-9 pl-9"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="retrying">Retrying</option>
          </select>

          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="all">All Users</option>
            {users.map((user) => (
              <option key={user.userId} value={user.userId}>
                {user.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Scans Table */}
      <div className="rounded-xl border bg-background shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">
            All Scans{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({filteredScans.length} of {scans.length})
            </span>
          </h2>
        </div>

        <div className="divide-y">
          {filteredScans.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              No scans match the current filters.
            </div>
          ) : (
            filteredScans.map((scan) => {
              const isExpanded = expandedScanId === scan.scanId;
              const isRescanning = rescanningScanIds.has(scan.scanId);

              return (
                <div key={scan.scanId}>
                  <div
                    className={cn(
                      "px-6 py-4 transition-colors hover:bg-muted/30 cursor-pointer",
                      isExpanded && "bg-muted/20"
                    )}
                    onClick={() =>
                      setExpandedScanId(isExpanded ? null : scan.scanId)
                    }
                  >
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">
                            {scan.repoUrl}
                          </p>
                          <StatusBadge status={scan.status} />
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>ID: {scan.scanId.substring(0, 8)}...</span>
                          <span>Branch: {scan.branch ?? "auto"}</span>
                          {scan.commitHash && (
                            <span>
                              Commit:{" "}
                              <code>{scan.commitHash.substring(0, 7)}</code>
                            </span>
                          )}
                          <span>User: {scan.userEmail ?? "Unknown"}</span>
                          <span>Created: {formatDate(scan.createdAt)}</span>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <FindingsCounts scan={scan} />
                        <div className="mt-1 text-xs text-muted-foreground">
                          {scan.progress ?? 0}%
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {RETRYABLE_STATUSES.has(scan.status) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRetry(scan.scanId)}
                            disabled={retryingScanIds.has(scan.scanId)}
                            aria-label="Retry scan"
                            title="Retry this failed scan"
                          >
                            <RefreshCcw
                              className={cn(
                                "size-4",
                                retryingScanIds.has(scan.scanId) && "animate-spin"
                              )}
                            />
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRescan(scan.scanId)}
                          disabled={isRescanning}
                          aria-label="Re-scan"
                          title="Re-scan (bypass cache)"
                        >
                          <RefreshCcw
                            className={cn(
                              "size-4",
                              isRescanning && "animate-spin"
                            )}
                          />
                        </Button>
                        {scan.status === "completed" && (
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/app/scans/${scan.scanId}`}>
                              <ExternalLink className="size-4" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <AdminScanDetail
                      scan={scan}
                      onRescan={() => handleRescan(scan.scanId)}
                      onDelete={() => handleDelete(scan.scanId)}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
