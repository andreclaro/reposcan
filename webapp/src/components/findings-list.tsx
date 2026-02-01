"use client";

import { useState, useEffect } from "react";
import {
  AlertTriangle,
  FileCode,
  ExternalLink,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import type { Finding, FindingsSummary } from "@/types/findings";

type FindingsListProps = {
  scanId: string;
};

const severityColors: Record<string, string> = {
  critical: "bg-red-500/10 text-red-600 border-red-500/20",
  high: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  low: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  info: "bg-gray-500/10 text-gray-600 border-gray-500/20",
};

function getCweId(cwe: string | null): string | null {
  if (!cwe) return null;

  // Handle formats like:
  // - "CWE-78"
  // - "CWE-78: Improper Neutralization..."
  // - "78"
  const cweIdMatch =
    cwe.match(/CWE-(\d+)/i)?.[1] ??
    cwe.match(/(\d+)/)?.[1] ??
    null;

  return cweIdMatch;
}

function getCweLabel(cwe: string | null): string | null {
  if (!cwe) return null;

  // Normalize duplicated prefixes like:
  // "CWE-CWE-78: Improper Neutralization..." -> "CWE-78: Improper Neutralization..."
  const duplicateMatch = cwe.match(/^CWE-CWE-(\d+)(:.*)?/i);
  if (duplicateMatch) {
    const id = duplicateMatch[1];
    const suffix = duplicateMatch[2] ?? "";
    return `CWE-${id}${suffix}`;
  }

  return cwe;
}

function getDisplayFilePath(filePath: string | null): string | null {
  if (!filePath) return null;

  const tmpScanPrefix = "/tmp/scan_";

  // Normalize paths coming from the temporary scan directory, e.g.:
  // /tmp/scan_<scanId>_<suffix>/scrcpy/server/src/... -> scrcpy/server/src/...
  if (filePath.startsWith(tmpScanPrefix)) {
    const parts = filePath.split("/");
    if (parts.length > 3) {
      return parts.slice(3).join("/");
    }
  }

  return filePath;
}

export default function FindingsList({ scanId }: FindingsListProps) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [summary, setSummary] = useState<FindingsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFinding, setExpandedFinding] = useState<number | null>(null);
  const [availableFilters, setAvailableFilters] = useState<{
    severities: string[];
    categories: string[];
    scanners: string[];
  }>({
    severities: [],
    categories: [],
    scanners: [],
  });
  const [filters, setFilters] = useState({
    severity: "",
    category: "",
    scanner: "",
  });

  useEffect(() => {
    fetchFindings();
  }, [scanId, filters]);

  const fetchFindings = async () => {
    setLoading(true);
    setError(null);
    logger.debug("[findings-list] fetchFindings start", { scanId, filters });
    try {
      const params = new URLSearchParams();
      if (filters.severity) params.append("severity", filters.severity);
      if (filters.category) params.append("category", filters.category);
      if (filters.scanner) params.append("scanner", filters.scanner);

      const url = `/api/scans/${scanId}/findings?${params.toString()}`;
      logger.debug("[findings-list] fetch", { url, scanId });
      const response = await fetch(url);
      logger.debug("[findings-list] response", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });
      if (!response.ok) {
        logger.warn("[findings-list] error response", {
          status: response.status,
          statusText: response.statusText,
        });
        throw new Error("Failed to fetch findings");
      }
      const data = await response.json();
      logger.debug("[findings-list] data received", {
        hasFindings: !!data.findings,
        findingsLength: data.findings?.length ?? 0,
        hasSummary: !!data.summary,
      });

      const currentFindings: Finding[] = data.findings || [];
      const summ = data.summary || null;

      // Derive filter options from summary (unfiltered counts) so options
      // are available even when the current list is empty (no findings or
      // filters return 0 results).
      if (summ?.by_severity || summ?.by_category || summ?.by_scanner) {
        const severities = summ.by_severity
          ? (Object.entries(summ.by_severity) as [string, number][])
              .filter(([, count]) => count > 0)
              .map(([s]) => s)
          : [];
        const categories = summ.by_category
          ? Object.keys(summ.by_category).filter(
              (c) => (summ!.by_category as Record<string, number>)[c] > 0
            )
          : [];
        const scanners = summ.by_scanner
          ? Object.keys(summ.by_scanner).filter(
              (s) => (summ!.by_scanner as Record<string, number>)[s] > 0
            )
          : [];
        setAvailableFilters({
          severities,
          categories,
          scanners,
        });
      }

      setFindings(currentFindings);
      setSummary(summ);
      logger.debug("[findings-list] fetchFindings success", {
        findingsSet: data.findings?.length ?? 0,
        summarySet: !!data.summary,
      });
    } catch (err) {
      logger.error("[findings-list] fetchFindings error", err);
      setError(err instanceof Error ? err.message : "Failed to load findings");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border bg-background p-8 text-center">
        <p className="text-sm text-muted-foreground">Loading findings...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <button
          onClick={fetchFindings}
          className="mt-4 text-sm text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // Filter options from summary (or fallback to current findings when no summary)
  const severities =
    availableFilters.severities.length > 0
      ? availableFilters.severities
      : Array.from(new Set(findings.map((f) => f.severity)));
  const categories =
    availableFilters.categories.length > 0
      ? availableFilters.categories
      : Array.from(
          new Set(
            findings
              .map((f) => f.category)
              .filter((c): c is string => !!c)
          )
        );
  const scanners =
    availableFilters.scanners.length > 0
      ? availableFilters.scanners
      : Array.from(new Set(findings.map((f) => f.scanner)));

  return (
    <div className="space-y-4">
      {/* Filters — always visible so users can change filters when result set is empty */}
      <div className="rounded-2xl border bg-muted/40 p-3">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs text-muted-foreground">Severity</label>
            <select
              value={filters.severity}
              onChange={(e) =>
                setFilters({ ...filters, severity: e.target.value })
              }
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">All severities</option>
              {severities.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Category</label>
            <select
              value={filters.category}
              onChange={(e) =>
                setFilters({ ...filters, category: e.target.value })
              }
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Scanner</label>
            <select
              value={filters.scanner}
              onChange={(e) =>
                setFilters({ ...filters, scanner: e.target.value })
              }
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">All scanners</option>
              {scanners.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Findings List or empty state */}
      {findings.length === 0 ? (
        <div className="rounded-2xl border bg-background p-8 text-center">
          <AlertTriangle className="mx-auto size-12 text-muted-foreground/50" />
          <p className="mt-4 text-sm font-medium">No findings</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {summary?.total === 0
              ? "This scan did not detect any security issues."
              : "No findings match the current filters. Try changing severity, category, or scanner."}
          </p>
        </div>
      ) : (
      <div className="space-y-3">
        {findings.map((finding) => (
          <div
            key={finding.id}
            className="rounded-xl border bg-background/80 p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                      severityColors[finding.severity] ||
                        severityColors.info
                    )}
                  >
                    <AlertTriangle className="size-3" />
                    {finding.severity}
                  </span>
                  {finding.category && (
                    <span className="text-xs text-muted-foreground">
                      {finding.category}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {finding.scanner}
                  </span>
                </div>
                <h3 className="font-medium">{finding.title}</h3>
                {finding.description && (
                  <p className="text-sm text-muted-foreground">
                    {finding.description}
                  </p>
                )}
                {getDisplayFilePath(finding.filePath) && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileCode className="size-3" />
                    <span>
                      {getDisplayFilePath(finding.filePath)}
                      {finding.lineStart && `:${finding.lineStart}`}
                    </span>
                  </div>
                )}
                {(finding.cwe || finding.cve) && (
                  <div className="flex items-center gap-4 text-xs">
                    {finding.cwe && (
                      (() => {
                        const cweId = getCweId(finding.cwe);
                        const cweLabel = getCweLabel(finding.cwe);
                        if (!cweId) return (
                          <span className="text-xs text-muted-foreground">
                            {cweLabel}
                          </span>
                        );
                        return (
                      <a
                        href={`https://cwe.mitre.org/data/definitions/${cweId}.html`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1"
                      >
                        <AlertTriangle className="size-3" />
                        <span>{cweLabel}</span>
                        <ExternalLink className="size-3" />
                      </a>
                        );
                      })()
                    )}
                    {finding.cve && (
                      <a
                        href={`https://cve.mitre.org/cgi-bin/cvename.cgi?name=${finding.cve}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1"
                      >
                        {finding.cve}
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() =>
                  setExpandedFinding(
                    expandedFinding === finding.id ? null : finding.id
                  )
                }
                className="text-muted-foreground hover:text-foreground"
              >
                {expandedFinding === finding.id ? (
                  <ChevronDown className="size-5" />
                ) : (
                  <ChevronRight className="size-5" />
                )}
              </button>
            </div>

            {/* Expanded Details */}
            {expandedFinding === finding.id && (
              <div className="mt-4 space-y-4 border-t pt-4">
                {finding.codeSnippet && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Code Snippet
                    </p>
                    <pre className="rounded-md border bg-muted/40 p-3 text-xs overflow-x-auto">
                      <code>{finding.codeSnippet}</code>
                    </pre>
                  </div>
                )}
                {finding.remediation && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Remediation
                    </p>
                    <p className="text-sm">{finding.remediation}</p>
                  </div>
                )}
                {finding.metadata && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Scanner Metadata
                    </p>
                    <pre className="rounded-md border bg-muted/40 p-3 text-xs overflow-x-auto">
                      <code>
                        {typeof finding.metadata === 'string'
                          ? finding.metadata
                          : JSON.stringify(finding.metadata, null, 2)}
                      </code>
                    </pre>
                  </div>
                )}
                <div>
                  <a
                    href={`/api/scans/${scanId}/findings/${finding.id}/analysis`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    View detailed code analysis
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
