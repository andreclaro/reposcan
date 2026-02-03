"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  RefreshCw,
  Trash2,
  MoreHorizontal,
  GitBranch,
  GitCommit,
  Clock,
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import { StatusBadge, FindingsSummary } from "./severity-badge";
import type { ScanRecord } from "@/types/scans";

interface ScanListItemProps {
  scan: ScanRecord;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onDelete?: () => void;
}

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

// Client-only date component to avoid hydration mismatch
function RelativeDate({ value }: { value?: string | null }) {
  const [formatted, setFormatted] = useState<string>("");
  
  useEffect(() => {
    setFormatted(formatDate(value));
  }, [value]);
  
  // Render a placeholder during SSR that matches the initial client render
  if (!formatted) {
    return <span className="opacity-0">—</span>;
  }
  
  return <span>{formatted}</span>;
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

export function ScanListItem({
  scan,
  isRefreshing = false,
  onRefresh,
  onDelete,
}: ScanListItemProps) {
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
                <RelativeDate value={scan.createdAt} />
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
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="h-8 gap-1.5"
            >
              <RefreshCw
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
                  <span className="hidden sm:inline">View Results</span>
                  <span className="sm:hidden">Results</span>
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
                <span className="hidden sm:inline">View Results</span>
                <span className="sm:hidden">Results</span>
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
