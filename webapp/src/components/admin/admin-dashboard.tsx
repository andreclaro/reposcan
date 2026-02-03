"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CircleDashed,
  TriangleAlert,
  RefreshCcw,
  ExternalLink,
  Search,
  Filter,
  X,
  Trash2,
  MoreHorizontal,
  GitBranch,
  GitCommit,
  Clock,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge, FindingsSummary } from "@/components/severity-badge";
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
  /** When false, AI Analysis card (View/Regenerate) is hidden in scan detail. */
  aiAnalysisEnabled?: boolean;
};

const RETRYABLE_STATUSES = new Set(["failed"]);

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInSecs = Math.floor(diffInMs / 1000);
  const diffInMins = Math.floor(diffInSecs / 60);
  const diffInHours = Math.floor(diffInMins / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInSecs < 60) return "Just now";
  if (diffInMins < 60) return `${diffInMins}m ago`;
  if (diffInHours < 24) return `${diffInHours}h ago`;
  if (diffInDays < 7) return `${diffInDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function getGitHubUrl(repoUrl: string, branch?: string | null): string | null {
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

function ScanListItem({
  scan,
  isRefreshing = false,
  onRefresh,
  onDelete,
  onRetry,
  onRescan,
  isRetrying,
  isRescanning,
}: {
  scan: ScanWithUser;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onDelete?: () => void;
  onRetry?: () => void;
  onRescan?: () => void;
  isRetrying?: boolean;
  isRescanning?: boolean;
}) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmValue, setDeleteConfirmValue] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const githubUrl = getGitHubUrl(scan.repoUrl, scan.branch);
  const displayProgress =
    scan.status === "completed"
      ? 100
      : Math.max(0, Math.min(100, scan.progress ?? 0));

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete?.();
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
      setDeleteConfirmValue("");
    }
  };

  const canRetry = RETRYABLE_STATUSES.has(scan.status);

  return (
    <>
      <div
        className={cn(
          "group relative rounded-xl border bg-white p-5 shadow-sm transition-all",
          "hover:shadow-md hover:border-slate-300",
          isRefreshing && "opacity-75"
        )}
      >
        {/* Progress Bar for running scans */}
        {(scan.status === "running" || scan.status === "queued" || scan.status === "retrying") && (
          <div className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden rounded-b-xl">
            <div
              className={cn(
                "h-full transition-all duration-500",
                scan.status === "running" ? "bg-blue-500" : "bg-slate-300"
              )}
              style={{ width: `${displayProgress}%` }}
            />
            {scan.status === "running" && (
              <div className="absolute inset-0 animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            )}
          </div>
        )}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* Left: Repo Info */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Repo URL and Status */}
            <div className="flex flex-wrap items-center gap-2">
              {githubUrl ? (
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm font-medium text-slate-900 hover:text-blue-600 truncate"
                >
                  {scan.repoUrl}
                  <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
                </a>
              ) : (
                <span className="text-sm font-medium text-slate-900 truncate">
                  {scan.repoUrl}
                </span>
              )}
              <StatusBadge status={scan.status} />
            </div>

            {/* Meta Info */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400">User:</span>
                <span className="font-medium text-slate-600">{scan.userEmail ?? "Unknown"}</span>
              </div>
              {scan.branch && (
                <div className="flex items-center gap-1.5">
                  <GitBranch className="h-3.5 w-3.5" />
                  <span>{scan.branch}</span>
                </div>
              )}
              {scan.commitHash && (
                <div className="flex items-center gap-1.5">
                  <GitCommit className="h-3.5 w-3.5" />
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">
                    {scan.commitHash.substring(0, 7)}
                  </code>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span>{formatDate(scan.createdAt)}</span>
              </div>
            </div>

            {/* Findings Summary */}
            {scan.status === "completed" && (
              <FindingsSummary
                critical={scan.criticalCount ?? 0}
                high={scan.highCount ?? 0}
                medium={scan.mediumCount ?? 0}
                low={scan.lowCount ?? 0}
                info={scan.infoCount ?? 0}
              />
            )}

            {/* Progress Text for Active Scans */}
            {(scan.status === "running" || scan.status === "queued") && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                {scan.status === "running" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    <span>Scanning... {displayProgress}%</span>
                  </>
                ) : (
                  <>
                    <Clock className="h-4 w-4 text-slate-400" />
                    <span>Waiting in queue...</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {canRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                disabled={isRetrying}
                className="h-8 gap-1.5"
              >
                <RefreshCcw className={cn("h-3.5 w-3.5", isRetrying && "animate-spin")} />
                <span className="hidden sm:inline">Retry</span>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={onRescan}
              disabled={isRescanning}
              className="h-8 gap-1.5"
            >
              <RefreshCcw className={cn("h-3.5 w-3.5", isRescanning && "animate-spin")} />
              <span className="hidden sm:inline">Rescan</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="h-8 gap-1.5"
            >
              <RefreshCcw
                className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
              />
              <span className="hidden sm:inline">
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </span>
            </Button>

            {scan.status === "completed" ? (
              <Button
                asChild
                size="sm"
                className="h-8 gap-1.5 bg-slate-900 hover:bg-slate-800"
              >
                <Link href={`/app/scans/${scan.scanId}`}>
                  <span className="hidden sm:inline">View</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled
                className="h-8 gap-1.5"
              >
                <span className="hidden sm:inline">View</span>
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 hover:text-slate-600"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete scan
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete scan?</DialogTitle>
            <DialogDescription>
              This will permanently remove the scan record and its results. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg bg-slate-50 p-4 text-sm">
            <div className="truncate">
              <span className="font-medium text-slate-700">Repository:</span>{" "}
              <span className="text-slate-600">{scan.repoUrl}</span>
            </div>
            {scan.userEmail && (
              <div className="mt-1 truncate">
                <span className="font-medium text-slate-700">User:</span>{" "}
                <span className="text-slate-600">{scan.userEmail}</span>
              </div>
            )}
            {scan.branch && (
              <div className="mt-1 truncate">
                <span className="font-medium text-slate-700">Branch:</span>{" "}
                <span className="text-slate-600">{scan.branch}</span>
              </div>
            )}
            {scan.commitHash && (
              <div className="mt-1 truncate">
                <span className="font-medium text-slate-700">Commit:</span>{" "}
                <code className="text-xs">{scan.commitHash.substring(0, 7)}</code>
              </div>
            )}
          </div>

          {scan.commitHash && (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">
                To confirm, type the first{" "}
                <span className="font-semibold">7 characters</span> of the
                commit hash:
              </p>
              <input
                type="text"
                value={deleteConfirmValue}
                onChange={(e) => setDeleteConfirmValue(e.target.value)}
                placeholder={scan.commitHash.substring(0, 7)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setDeleteConfirmValue("");
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={
                isDeleting ||
                (!!scan.commitHash &&
                  deleteConfirmValue.trim() !==
                    scan.commitHash.substring(0, 7))
              }
            >
              {isDeleting ? "Deleting..." : "Delete scan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function AdminDashboard({
  initialScans,
  users,
  aiAnalysisEnabled = false,
}: AdminDashboardProps) {
  const [scans, setScans] = useState<ScanWithUser[]>(initialScans);
  const [refreshingScanIds, setRefreshingScanIds] = useState<Set<string>>(
    () => new Set()
  );
  const [retryingScanIds, setRetryingScanIds] = useState<Set<string>>(
    () => new Set()
  );
  const [rescanningScanIds, setRescanningScanIds] = useState<Set<string>>(
    () => new Set()
  );

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");

  // Status counts from current scans
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    scans.forEach((scan) => {
      counts[scan.status] = (counts[scan.status] || 0) + 1;
    });
    return counts;
  }, [scans]);

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

      // Search filter (repo URL, scan ID, commit hash, user email)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesRepo = scan.repoUrl.toLowerCase().includes(query);
        const matchesScanId = scan.scanId.toLowerCase().includes(query);
        const matchesCommit = scan.commitHash?.toLowerCase().includes(query);
        const matchesUser = scan.userEmail?.toLowerCase().includes(query);
        if (!matchesRepo && !matchesScanId && !matchesCommit && !matchesUser) {
          return false;
        }
      }

      return true;
    });
  }, [scans, statusFilter, userFilter, searchQuery]);

  const hasActiveFilters =
    statusFilter !== "all" ||
    userFilter !== "all" ||
    searchQuery !== "";

  const clearFilters = () => {
    setStatusFilter("all");
    setUserFilter("all");
    setSearchQuery("");
  };

  const startRefreshing = (scanId: string) => {
    setRefreshingScanIds((prev) => {
      const next = new Set(prev);
      next.add(scanId);
      return next;
    });
  };

  const stopRefreshing = (scanId: string) => {
    setRefreshingScanIds((prev) => {
      if (!prev.has(scanId)) return prev;
      const next = new Set(prev);
      next.delete(scanId);
      return next;
    });
  };

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
    setRescanningScanIds((prev) => {
      const next = new Set(prev);
      next.add(scanId);
      return next;
    });
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
    }
  };

  const refreshScan = async (scanId: string) => {
    const minSpinDurationMs = 600;
    const startTime = Date.now();

    startRefreshing(scanId);
    try {
      const response = await fetch(`/api/admin/scans/${scanId}`);

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
    } catch {
      // Silent refresh failures
    } finally {
      const elapsed = Date.now() - startTime;
      const remaining = minSpinDurationMs - elapsed;

      if (remaining > 0) {
        window.setTimeout(() => stopRefreshing(scanId), remaining);
      } else {
        stopRefreshing(scanId);
      }
    }
  };

  // Empty state component
  const EmptyState = () => (
    <Card className="border-dashed border-2 bg-slate-50/50">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 rounded-full bg-slate-100 p-4">
          <Search className="h-8 w-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">No scans yet</h3>
        <p className="mt-2 max-w-sm text-sm text-slate-500">
          No scans have been submitted yet.
        </p>
      </CardContent>
    </Card>
  );

  // Empty filter state
  const EmptyFilterState = () => (
    <Card className="border-dashed border-2 bg-slate-50/50">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 rounded-full bg-slate-100 p-4">
          <Filter className="h-8 w-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">
          No scans match your filters
        </h3>
        <p className="mt-2 max-w-sm text-sm text-slate-500">
          Try adjusting your search or filter criteria to find what you&apos;re
          looking for.
        </p>
        <Button variant="outline" onClick={clearFilters} className="mt-4">
          <X className="mr-2 h-4 w-4" />
          Clear all filters
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8">
      {/* Stats & Filters */}
      {scans.length > 0 && (
        <div className="space-y-4">
          {/* Stats Cards */}
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { key: "all", label: "All", count: scans.length },
              { key: "queued", label: "Queued", count: statusCounts["queued"] || 0 },
              { key: "running", label: "Running", count: statusCounts["running"] || 0 },
              { key: "completed", label: "Completed", count: statusCounts["completed"] || 0 },
              { key: "failed", label: "Failed", count: statusCounts["failed"] || 0 },
              { key: "retrying", label: "Retrying", count: statusCounts["retrying"] || 0 },
            ].map((stat) => (
              <button
                key={stat.key}
                onClick={() => setStatusFilter(stat.key)}
                className={`rounded-xl border p-3 text-left transition-all ${
                  statusFilter === stat.key
                    ? "border-blue-500 bg-blue-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="text-xs font-medium text-slate-500">
                  {stat.label}
                </div>
                <div className="mt-1 text-xl font-bold text-slate-900">
                  {stat.count}
                </div>
              </button>
            ))}
          </div>

          {/* Filter Bar */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-slate-500">
                  <Filter className="h-4 w-4" />
                  <span className="text-sm font-medium">Filters</span>
                </div>

                {/* Search Input */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by repo, scan ID, commit, or user..."
                    className="h-9 pl-9"
                  />
                </div>

                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="queued">Queued</option>
                  <option value="running">Running</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                  <option value="retrying">Retrying</option>
                </select>

                {/* User Filter */}
                <select
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                  className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">All Users</option>
                  {users.map((user) => (
                    <option key={user.userId} value={user.userId}>
                      {user.email}
                    </option>
                  ))}
                </select>

                {/* Clear Filters */}
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="h-9 gap-1 text-slate-500 hover:text-slate-900"
                  >
                    <X className="h-3.5 w-3.5" />
                    Clear
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Scan History */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              All scans
            </h2>
            <p className="text-sm text-slate-500">
              {filteredScans.length} of {scans.length} scans
              {hasActiveFilters && " (filtered)"}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {scans.length === 0 ? (
            <EmptyState />
          ) : filteredScans.length === 0 ? (
            <EmptyFilterState />
          ) : (
            filteredScans.map((scan) => (
              <ScanListItem
                key={scan.scanId}
                scan={scan}
                isRefreshing={refreshingScanIds.has(scan.scanId)}
                onRefresh={() => refreshScan(scan.scanId)}
                onDelete={() => handleDelete(scan.scanId)}
                onRetry={() => handleRetry(scan.scanId)}
                onRescan={() => handleRescan(scan.scanId)}
                isRetrying={retryingScanIds.has(scan.scanId)}
                isRescanning={rescanningScanIds.has(scan.scanId)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
