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
import { DEFAULT_AUDIT_TYPES } from "@/lib/validators";
import { cn } from "@/lib/utils";

type ScanRecord = {
  id: number;
  scanId: string;
  userId: string;
  repoUrl: string;
  branch: string | null;
  commitHash: string | null;
  auditTypes: string[] | null;
  status: string;
  progress: number | null;
  resultsPath: string | null;
  result: Record<string, unknown> | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const activeStatuses = new Set(["queued", "running", "retrying"]);

const statusStyles: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-primary/10 text-primary",
  completed: "bg-emerald-500/10 text-emerald-600",
  failed: "bg-destructive/10 text-destructive",
  retrying: "bg-secondary/60 text-secondary-foreground"
};

type ParsedGitHubRepo = {
  owner: string;
  repo: string;
};

function parseGitHubRepo(input: string): ParsedGitHubRepo | null {
  if (!input) {
    return null;
  }

  try {
    const url = new URL(input);
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

    return { owner, repo };
  } catch {
    return null;
  }
}

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
  const [branch, setBranch] = useState("main");
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [branchIsDirty, setBranchIsDirty] = useState(false);
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
    setBranch("main");
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
    try {
      const response = await fetch(`/api/scan/${scanId}/status`, {
        method: "GET",
        cache: "no-store"
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      const updated = data.scan as ScanRecord | undefined;

      if (!updated) {
        return;
      }

      setScans((prev) =>
        prev.map((scan) => (scan.scanId === scanId ? updated : scan))
      );
    } catch (error) {
      // Silent refresh failures
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
      setBranch("main");
    } catch (error) {
      setError("Failed to start scan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (scanId: string) => {
    const response = await fetch(`/api/scan/${scanId}`, {
      method: "DELETE"
    });

    if (response.ok) {
      setScans((prev) => prev.filter((scan) => scan.scanId !== scanId));
    }
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
            scans.map((scan) => (
              <div key={scan.scanId} className="px-6 py-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{scan.repoUrl}</p>
                      <StatusBadge status={scan.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Scan ID: {scan.scanId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Branch: {scan.branch ?? "main"} · Created{" "}
                      {hasMounted
                        ? formatDate(scan.createdAt)
                        : scan.createdAt ?? "—"}
                    </p>
                    {scan.commitHash ? (
                      <p className="text-xs text-muted-foreground">
                        Commit: <code className="text-xs">{scan.commitHash.substring(0, 7)}</code>
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Progress: {scan.progress ?? 0}%
                      {scan.resultsPath ? ` · ${scan.resultsPath}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => refreshScan(scan.scanId)}
                    >
                      <RefreshCcw className="size-4" />
                      Refresh
                    </Button>
                    {scan.status === "running" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled
                      >
                        <ExternalLink className="size-4" />
                        View Results
                      </Button>
                    ) : (
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                      >
                        <Link href={`/app/scans/${scan.scanId}`}>
                          <ExternalLink className="size-4" />
                          View Results
                        </Link>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(scan.scanId)}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
