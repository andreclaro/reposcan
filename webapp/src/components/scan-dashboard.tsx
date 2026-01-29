"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CircleDashed,
  RefreshCcw,
  Trash2,
  TriangleAlert,
  ExternalLink
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseGitHubRepo } from "@/lib/github-url";
import { DEFAULT_AUDIT_TYPES } from "@/lib/validators";
import { cn } from "@/lib/utils";
import type { ScanRecord } from "@/types/scans";

const activeStatuses = new Set(["queued", "running", "retrying"]);

const statusStyles: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-primary/10 text-primary",
  completed: "bg-emerald-500/10 text-emerald-600",
  failed: "bg-destructive/10 text-destructive",
  retrying: "bg-secondary/60 text-secondary-foreground"
};

function StatusBadge({
  status,
  scan
}: {
  status: string;
  scan?: Pick<
    ScanRecord,
    | "findingsCount"
    | "criticalCount"
    | "highCount"
    | "mediumCount"
    | "lowCount"
    | "infoCount"
  >;
}) {
  const showCounts =
    status === "completed" && typeof scan?.findingsCount === "number";

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1",
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
      {showCounts ? (
        <span className="inline-flex items-center gap-1">
          {Boolean(scan?.criticalCount) && (
            <span className="text-[10px] font-semibold text-red-600">
              {scan?.criticalCount}
            </span>
          )}
          {Boolean(scan?.highCount) && (
            <span className="text-[10px] font-semibold text-orange-600">
              {scan?.highCount}
            </span>
          )}
          {Boolean(scan?.mediumCount) && (
            <span className="text-[10px] font-semibold text-yellow-600">
              {scan?.mediumCount}
            </span>
          )}
          {Boolean(scan?.lowCount) && (
            <span className="text-[10px] font-semibold text-blue-600">
              {scan?.lowCount}
            </span>
          )}
          {Boolean(scan?.infoCount) && (
            <span className="text-[10px] font-semibold text-gray-600">
              {scan?.infoCount}
            </span>
          )}
          {!scan?.findingsCount && (
            <span className="text-[10px] font-semibold text-emerald-600">0</span>
          )}
        </span>
      ) : null}
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

type ScanDashboardProps = {
  initialScans: ScanRecord[];
  defaultRepoUrl?: string;
};

export default function ScanDashboard({
  initialScans,
  defaultRepoUrl
}: ScanDashboardProps) {
  const [scans, setScans] = useState<ScanRecord[]>(initialScans);
  const [repoUrl, setRepoUrl] = useState(defaultRepoUrl ?? "");
  // Empty string means "let the backend auto-detect the default branch"
  // until we successfully detect it from GitHub.
  const [branch, setBranch] = useState("");
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [branchIsDirty, setBranchIsDirty] = useState(false);
  const [refreshingScanIds, setRefreshingScanIds] = useState<Set<string>>(
    () => new Set()
  );
  const [scanToDelete, setScanToDelete] = useState<ScanRecord | null>(null);
  const [deleteConfirmValue, setDeleteConfirmValue] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const branchIsDirtyRef = useRef(branchIsDirty);

  const parsedRepo = useMemo(() => parseGitHubRepo(repoUrl), [repoUrl]);
  const repoSlug = parsedRepo ? `${parsedRepo.owner}/${parsedRepo.repo}` : null;
  const branchOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: string[] = [];
    const addOption = (value?: string | null) => {
      if (!value) {
        return;
      }
      const trimmed = value.trim();
      if (!trimmed || seen.has(trimmed)) {
        return;
      }
      seen.add(trimmed);
      options.push(trimmed);
    };

    addOption(defaultBranch);
    addOption(branch);
    branches.forEach(addOption);
    return options;
  }, [defaultBranch, branch, branches]);

  const activeScanIds = useMemo(
    () => scans.filter((scan) => activeStatuses.has(scan.status)),
    [scans]
  );

  const startRefreshing = (scanId: string) => {
    setRefreshingScanIds((prev) => {
      const next = new Set(prev);
      next.add(scanId);
      return next;
    });
  };

  const stopRefreshing = (scanId: string) => {
    setRefreshingScanIds((prev) => {
      if (!prev.has(scanId)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(scanId);
      return next;
    });
  };

  useEffect(() => {
    branchIsDirtyRef.current = branchIsDirty;
  }, [branchIsDirty]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    setDefaultBranch(null);
    setBranches([]);
    setIsLoadingBranches(false);
    setBranchIsDirty(false);
    // Reset to "auto-detect" when the repo changes; a later GitHub
    // lookup will populate the actual default branch (e.g. master).
    setBranch("");
  }, [repoSlug]);

  useEffect(() => {
    if (!parsedRepo || !repoSlug) {
      return;
    }

    let isActive = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        setIsLoadingBranches(true);
        const [repoResponse, branchesResponse] = await Promise.all([
          fetch(
            `https://api.github.com/repos/${parsedRepo.owner}/${parsedRepo.repo}`,
            {
              headers: {
                Accept: "application/vnd.github+json"
              },
              signal: controller.signal
            }
          ),
          fetch(
            `https://api.github.com/repos/${parsedRepo.owner}/${parsedRepo.repo}/branches?per_page=100`,
            {
              headers: {
                Accept: "application/vnd.github+json"
              },
              signal: controller.signal
            }
          )
        ]);

        let detectedBranch = "";
        if (repoResponse.ok) {
          const data = (await repoResponse.json()) as { default_branch?: string };
          detectedBranch =
            typeof data.default_branch === "string"
              ? data.default_branch.trim()
              : "";
        }

        let detectedBranches: string[] = [];
        if (branchesResponse.ok) {
          const data = (await branchesResponse.json()) as Array<{
            name?: string;
          }>;
          detectedBranches = data
            .map((item) => (typeof item.name === "string" ? item.name.trim() : ""))
            .filter(Boolean);
        }

        if (!isActive || !detectedBranch) {
          if (isActive) {
            setBranches(detectedBranches);
          }
          return;
        }

        setDefaultBranch(detectedBranch);
        setBranches(detectedBranches);
        if (!branchIsDirtyRef.current) {
          setBranch(detectedBranch);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      } finally {
        if (isActive) {
          setIsLoadingBranches(false);
        }
      }
    }, 400);

    return () => {
      isActive = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [parsedRepo, repoSlug]);

  useEffect(() => {
    if (activeScanIds.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      activeScanIds.forEach((scan) => {
        void refreshScan(scan.scanId);
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [activeScanIds]);

  const refreshScan = async (scanId: string) => {
    // Ensure the refresh icon animates for at least a short, visible duration
    const minSpinDurationMs = 600;
    const startTime = Date.now();

    startRefreshing(scanId);
    try {
      const response = await fetch(`/api/scan/${scanId}/status`, {
        method: "GET",
        cache: "no-store"
      });

      if (response.ok) {
        const data = await response.json();
        const updated = data.scan as ScanRecord | undefined;

        if (updated) {
          setScans((prev) =>
            prev.map((scan) => (scan.scanId === scanId ? updated : scan))
          );
        }
      }
    } catch (error) {
      // Silent refresh failures
    } finally {
      const elapsed = Date.now() - startTime;
      const remaining = minSpinDurationMs - elapsed;

      if (remaining > 0) {
        window.setTimeout(() => {
          stopRefreshing(scanId);
        }, remaining);
      } else {
        stopRefreshing(scanId);
      }
    }
  };

  const handleCreateScan = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          repoUrl,
          branch
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error ?? "Failed to start scan.");
        return;
      }

      const payload = await response.json();
      const newScan = payload.scan as ScanRecord;

      setScans((prev) => [newScan, ...prev]);
      setRepoUrl("");
      // After a successful scan, reset branch to "auto-detect" so
      // the next repo can pick up its own default branch.
      setBranch("");
    } catch (error) {
      setError("Failed to start scan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (scanId: string) => {
    setIsDeleting(true);
    const response = await fetch(`/api/scan/${scanId}`, {
      method: "DELETE"
    });

    if (response.ok) {
      setScans((prev) => prev.filter((scan) => scan.scanId !== scanId));
    }

    setIsDeleting(false);
    setScanToDelete(null);
    setDeleteConfirmValue("");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-background p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Start a new scan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Default audit types: {DEFAULT_AUDIT_TYPES.join(", ")}.
        </p>
        <form
          onSubmit={handleCreateScan}
          className="mt-4 grid gap-4 md:grid-cols-[1.6fr_0.6fr_auto]"
        >
          <Input
            value={repoUrl}
            onChange={(event) => setRepoUrl(event.target.value)}
            type="url"
            placeholder="https://github.com/org/repo"
            required
            className="h-11"
          />
          <select
            value={branch}
            onChange={(event) => {
              setBranch(event.target.value);
              setBranchIsDirty(true);
            }}
            className={cn(
              "border-input dark:bg-input/30 h-11 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none",
              "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
              "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
            )}
            disabled={!repoSlug || isLoadingBranches}
          >
            {branchOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={isSubmitting} className="h-11">
            {isSubmitting ? "Queueing..." : "Start scan"}
          </Button>
        </form>
        {error ? (
          <p className="mt-3 text-sm text-destructive">{error}</p>
        ) : null}
      </div>

      <div className="rounded-2xl border bg-background shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Scan history</h2>
        </div>
        <div className="divide-y">
          {scans.length === 0 ? (
            <div className="px-6 py-8 text-sm text-muted-foreground">
              No scans yet. Start one above to see results here.
            </div>
          ) : (
            scans.map((scan) => {
              const isRefreshing = refreshingScanIds.has(scan.scanId);
              const displayProgress =
                scan.status === "completed"
                  ? 100
                  : Math.max(0, Math.min(100, scan.progress ?? 0));

              return (
                <div
                  key={scan.scanId}
                  className={cn(
                    "px-6 py-5 transition-opacity",
                    isRefreshing && "opacity-80"
                  )}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{scan.repoUrl}</p>
                        <StatusBadge status={scan.status} scan={scan} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Scan ID: {scan.scanId}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Branch: {scan.branch ?? "main"}
                        {scan.commitHash ? (
                          <>
                            {" "}
                            · Commit:{" "}
                            <code className="text-xs">
                              {scan.commitHash.substring(0, 7)}
                            </code>
                          </>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Progress: {displayProgress}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Created{" "}
                        {hasMounted
                          ? formatDate(scan.createdAt)
                          : scan.createdAt ?? "—"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => refreshScan(scan.scanId)}
                        disabled={isRefreshing}
                      >
                        <RefreshCcw
                          className={cn(
                            "size-4",
                            isRefreshing && "animate-spin"
                          )}
                        />
                        Refresh
                      </Button>
                      {scan.status === "completed" ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/app/scans/${scan.scanId}`}>
                            <ExternalLink className="size-4" />
                            View Results
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled
                        >
                          <ExternalLink className="size-4" />
                          View Results
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setScanToDelete(scan)}
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      {scanToDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Delete scan?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This will permanently remove the scan record and its results from your
              dashboard. This action cannot be undone.
            </p>
            <div className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              <div className="truncate">
                <span className="font-medium">Repository:</span>{" "}
                {scanToDelete.repoUrl}
              </div>
              <div className="truncate">
                <span className="font-medium">Branch:</span>{" "}
                {scanToDelete.branch ?? "main"}
              </div>
              {scanToDelete.commitHash ? (
                <div className="truncate">
                  <span className="font-medium">Commit:</span>{" "}
                  <code className="text-[0.7rem]">
                    {scanToDelete.commitHash.substring(0, 7)}
                  </code>
                </div>
              ) : null}
              <div className="truncate">
                <span className="font-medium">Scan ID:</span> {scanToDelete.scanId}
              </div>
            </div>
            {scanToDelete.commitHash ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-muted-foreground">
                  To confirm, type the first{" "}
                  <span className="font-semibold">
                    7 characters
                  </span>{" "}
                  of the commit hash:
                </p>
                <Input
                  value={deleteConfirmValue}
                  onChange={(event) => setDeleteConfirmValue(event.target.value)}
                  placeholder={scanToDelete.commitHash.substring(0, 7)}
                  className="h-8 text-xs"
                  spellCheck={false}
                />
              </div>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setScanToDelete(null);
                  setDeleteConfirmValue("");
                }}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(scanToDelete.scanId)}
                disabled={
                  isDeleting ||
                  (Boolean(scanToDelete.commitHash) &&
                    deleteConfirmValue.trim() !==
                      scanToDelete.commitHash?.substring(0, 7))
                }
              >
                {isDeleting ? "Deleting..." : "Delete scan"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
