"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Github,
  Plus,
  Search,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Filter,
  X,
  Lock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScanListItem } from "./scan-list-item";
import { parseGitHubRepo } from "@/lib/github-url";
import { DEFAULT_AUDIT_TYPES } from "@/lib/validators";
import { HIDE_PLANS } from "@/lib/config";
import type { ScanRecord } from "@/types/scans";

const activeStatuses = new Set(["queued", "running", "retrying"]);

type ScanDashboardProps = {
  initialScans: ScanRecord[];
  defaultRepoUrl?: string;
};

export default function ScanDashboard({
  initialScans,
  defaultRepoUrl,
}: ScanDashboardProps) {
  const [scans, setScans] = useState<ScanRecord[]>(initialScans);
  const [repoUrl, setRepoUrl] = useState(defaultRepoUrl ?? "");
  const [branch, setBranch] = useState("");
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [branchIsDirty, setBranchIsDirty] = useState(false);
  const [refreshingScanIds, setRefreshingScanIds] = useState<Set<string>>(
    () => new Set()
  );
  const [error, setError] = useState<string | null>(null);
  const [errorUpgradeUrl, setErrorUpgradeUrl] = useState<string | null>(null);
  const [cachedMessage, setCachedMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const branchIsDirtyRef = useRef(branchIsDirty);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [findingsFilter, setFindingsFilter] = useState<string>("all");

  const parsedRepo = useMemo(() => parseGitHubRepo(repoUrl), [repoUrl]);
  const repoSlug = parsedRepo ? `${parsedRepo.owner}/${parsedRepo.repo}` : null;

  const branchOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: string[] = [];
    const addOption = (value?: string | null) => {
      if (!value) return;
      const trimmed = value.trim();
      if (!trimmed || seen.has(trimmed)) return;
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

  // Filtered scans
  const filteredScans = useMemo(() => {
    return scans.filter((scan) => {
      // Status filter
      if (statusFilter !== "all" && scan.status !== statusFilter) {
        return false;
      }

      // Findings filter
      if (findingsFilter !== "all") {
        const hasFindings = (scan.findingsCount ?? 0) > 0;
        if (findingsFilter === "with-findings" && !hasFindings) {
          return false;
        }
        if (findingsFilter === "no-findings" && hasFindings) {
          return false;
        }
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
  }, [scans, statusFilter, findingsFilter, searchQuery]);

  // Status counts for stats
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    scans.forEach((scan) => {
      counts[scan.status] = (counts[scan.status] || 0) + 1;
    });
    return counts;
  }, [scans]);

  const hasActiveFilters =
    statusFilter !== "all" ||
    findingsFilter !== "all" ||
    searchQuery !== "";

  const clearFilters = () => {
    setStatusFilter("all");
    setFindingsFilter("all");
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

  useEffect(() => {
    branchIsDirtyRef.current = branchIsDirty;
  }, [branchIsDirty]);

  useEffect(() => {
    setDefaultBranch(null);
    setBranches([]);
    setIsLoadingBranches(false);
    setBranchIsDirty(false);
    setBranch("");
  }, [repoSlug]);

  useEffect(() => {
    if (!parsedRepo || !repoSlug) return;

    let isActive = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        setIsLoadingBranches(true);
        const [repoResponse, branchesResponse] = await Promise.all([
          fetch(
            `https://api.github.com/repos/${parsedRepo.owner}/${parsedRepo.repo}`,
            {
              headers: { Accept: "application/vnd.github+json" },
              signal: controller.signal,
            }
          ),
          fetch(
            `https://api.github.com/repos/${parsedRepo.owner}/${parsedRepo.repo}/branches?per_page=100`,
            {
              headers: { Accept: "application/vnd.github+json" },
              signal: controller.signal,
            }
          ),
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
            .map((item) =>
              typeof item.name === "string" ? item.name.trim() : ""
            )
            .filter(Boolean);
        }

        if (!isActive || !detectedBranch) {
          if (isActive) setBranches(detectedBranches);
          return;
        }

        setDefaultBranch(detectedBranch);
        setBranches(detectedBranches);
        if (!branchIsDirtyRef.current) {
          setBranch(detectedBranch);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
      } finally {
        if (isActive) setIsLoadingBranches(false);
      }
    }, 400);

    return () => {
      isActive = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [parsedRepo, repoSlug]);

  useEffect(() => {
    if (activeScanIds.length === 0) return;

    const interval = setInterval(() => {
      activeScanIds.forEach((scan) => {
        void refreshScan(scan.scanId);
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [activeScanIds]);

  const refreshScan = async (scanId: string) => {
    const minSpinDurationMs = 600;
    const startTime = Date.now();

    startRefreshing(scanId);
    try {
      const response = await fetch(`/api/scan/${scanId}/status`, {
        method: "GET",
        cache: "no-store",
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

  const handleCreateScan = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setErrorUpgradeUrl(null);
    setCachedMessage(null);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl, branch, isPrivate }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error ?? "Failed to start scan.");
        setErrorUpgradeUrl(
          payload.code === "SCAN_LIMIT_REACHED"
            ? payload.upgradeUrl ?? "/plans"
            : null
        );
        return;
      }

      const payload = await response.json();
      const newScan = payload.scan as ScanRecord;
      const isCached = payload.cached === true;

      if (isCached) {
        setCachedMessage(
          "This repository/commit was already scanned. Showing existing results."
        );
        setScans((prev) => [
          newScan,
          ...prev.filter((s) => s.scanId !== newScan.scanId),
        ]);
      } else {
        setScans((prev) => [newScan, ...prev]);
      }

      setRepoUrl("");
      setBranch("");
      setIsPrivate(false);
    } catch {
      setError("Failed to start scan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (scanId: string) => {
    const response = await fetch(`/api/scan/${scanId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      setScans((prev) => prev.filter((scan) => scan.scanId !== scanId));
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
          Start your first security scan to discover potential vulnerabilities
          in your repositories.
        </p>
        <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span>Free for open source</span>
        </div>
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
      {/* New Scan Form */}
      <Card className="overflow-hidden border-0 shadow-lg shadow-slate-200/50">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
              <Github className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Start a new scan
              </h2>
              <p className="text-sm text-slate-500">
                Scans run: {DEFAULT_AUDIT_TYPES.join(", ")}
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateScan} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
              <div className="relative">
                <Github className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  type="text"
                  placeholder="https://github.com/org/repo or org/repo"
                  required
                  className="h-11 pl-10"
                />
              </div>

              <select
                value={branch}
                onChange={(e) => {
                  setBranch(e.target.value);
                  setBranchIsDirty(true);
                }}
                className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                disabled={!repoSlug || isLoadingBranches}
              >
                {branchOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                {branchOptions.length === 0 && (
                  <option value="">
                    {isLoadingBranches ? "Loading..." : "Branch"}
                  </option>
                )}
              </select>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-11 gap-2 bg-slate-900 hover:bg-slate-800"
              >
                {isSubmitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Queueing...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Start scan
                  </>
                )}
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-700">This is a private repository</span>
              </div>
              <Switch
                checked={isPrivate}
                onCheckedChange={setIsPrivate}
                disabled={isSubmitting}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <p>{error}</p>
                  {errorUpgradeUrl && !HIDE_PLANS && (
                    <a
                      href={errorUpgradeUrl}
                      className="mt-1 inline-flex items-center gap-1 font-medium underline hover:no-underline"
                    >
                      View plans and upgrade
                      <ArrowRight className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {cachedMessage && (
              <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                <CheckCircle2 className="h-4 w-4" />
                <span>{cachedMessage}</span>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

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
                    placeholder="Search by repo, scan ID, or commit..."
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

                {/* Findings Filter */}
                <select
                  value={findingsFilter}
                  onChange={(e) => setFindingsFilter(e.target.value)}
                  className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">All Scans</option>
                  <option value="with-findings">With Findings</option>
                  <option value="no-findings">No Findings</option>
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
              Scan history
            </h2>
            <p className="text-sm text-slate-500">
              {filteredScans.length} of {scans.length} scans
              {hasActiveFilters && " (filtered)"}
            </p>
          </div>
          {activeScanIds.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
              </span>
              {activeScanIds.length} active
            </div>
          )}
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
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
