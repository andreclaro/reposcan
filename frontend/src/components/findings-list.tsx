"use client";

import { useState, useEffect } from "react";
import {
  AlertTriangle,
  FileCode,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Filter,
  Search,
  X,
  Bug,
  Code,
  Wrench,
  Info,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { SeverityBadge } from "./severity-badge";
import type { Finding, FindingsSummary } from "@/types/findings";

type FindingsListProps = {
  scanId: string;
};

const severityOrder = ["critical", "high", "medium", "low", "info"];

function getCweId(cwe: string | null): string | null {
  if (!cwe) return null;
  const cweIdMatch =
    cwe.match(/CWE-(\d+)/i)?.[1] ?? cwe.match(/(\d+)/)?.[1] ?? null;
  return cweIdMatch;
}

function getCweLabel(cwe: string | null): string | null {
  if (!cwe) return null;
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
  if (filePath.startsWith(tmpScanPrefix)) {
    const parts = filePath.split("/");
    if (parts.length > 3) {
      return parts.slice(3).join("/");
    }
  }
  return filePath;
}

function getFileExtension(filePath: string | null): string {
  if (!filePath) return "";
  const parts = filePath.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function getLanguageIcon(extension: string) {
  const langMap: Record<string, string> = {
    js: "JS",
    ts: "TS",
    jsx: "JSX",
    tsx: "TSX",
    py: "Py",
    go: "Go",
    rs: "Rust",
    java: "Java",
    rb: "Ruby",
    php: "PHP",
    cs: "C#",
    cpp: "C++",
    c: "C",
    swift: "Swift",
    kt: "Kotlin",
  };
  return langMap[extension] || extension.toUpperCase();
}

export default function FindingsList({ scanId }: FindingsListProps) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [summary, setSummary] = useState<FindingsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFinding, setExpandedFinding] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({
    severity: "",
    category: "",
    scanner: "",
  });
  const [availableFilters, setAvailableFilters] = useState({
    severities: [] as string[],
    categories: [] as string[],
    scanners: [] as string[],
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
      if (searchQuery) params.append("search", searchQuery);

      const url = `/api/scans/${scanId}/findings?${params.toString()}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Failed to fetch findings");
      }

      const data = await response.json();
      const currentFindings: Finding[] = data.findings || [];
      const summ = data.summary || null;

      if (summ?.by_severity || summ?.by_category || summ?.by_scanner) {
        const severities = summ.by_severity
          ? (Object.entries(summ.by_severity) as [string, number][])
              .filter(([, count]) => count > 0)
              .map(([s]) => s)
              .sort((a, b) => severityOrder.indexOf(a) - severityOrder.indexOf(b))
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
        setAvailableFilters({ severities, categories, scanners });
      }

      setFindings(currentFindings);
      setSummary(summ);
    } catch (err) {
      logger.error("[findings-list] fetchFindings error", err);
      setError(err instanceof Error ? err.message : "Failed to load findings");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchFindings();
  };

  const clearFilters = () => {
    setFilters({ severity: "", category: "", scanner: "" });
    setSearchQuery("");
  };

  const hasActiveFilters =
    filters.severity || filters.category || filters.scanner || searchQuery;

  if (loading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
          </div>
          <p className="mt-4 text-center text-sm text-slate-500">
            Loading findings...
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-8 text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-400" />
          <p className="mt-4 text-sm font-medium text-red-700">{error}</p>
          <Button
            variant="outline"
            onClick={fetchFindings}
            className="mt-4"
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Empty state - no findings at all
  if (summary?.total === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-emerald-50 p-4">
            <ShieldCheck className="h-10 w-10 text-emerald-500" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-900">
            No vulnerabilities found
          </h3>
          <p className="mt-2 max-w-sm text-sm text-slate-500">
            Great news! This scan didn&apos;t detect any security issues in your
            repository.
          </p>
        </CardContent>
      </Card>
    );
  }

  const severities =
    availableFilters.severities.length > 0
      ? availableFilters.severities
      : Array.from(new Set(findings.map((f) => f.severity)));
  const categories =
    availableFilters.categories.length > 0
      ? availableFilters.categories
      : Array.from(
          new Set(findings.map((f) => f.category).filter((c): c is string => !!c))
        );
  const scanners =
    availableFilters.scanners.length > 0
      ? availableFilters.scanners
      : Array.from(new Set(findings.map((f) => f.scanner)));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                placeholder="Search findings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </form>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            
            {/* Severity Filter */}
            <select
              value={filters.severity}
              onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
              className="h-8 rounded-full border border-slate-200 bg-white px-3 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All severities</option>
              {severities.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>

            {/* Category Filter */}
            {categories.length > 0 && (
              <select
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                className="h-8 rounded-full border border-slate-200 bg-white px-3 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}

            {/* Scanner Filter */}
            {scanners.length > 0 && (
              <select
                value={filters.scanner}
                onChange={(e) => setFilters({ ...filters, scanner: e.target.value })}
                className="h-8 rounded-full border border-slate-200 bg-white px-3 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">All scanners</option>
                {scanners.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-8 gap-1 text-xs"
              >
                <X className="h-3 w-3" />
                Clear
              </Button>
            )}

            <span className="ml-auto text-xs text-slate-500">
              {findings.length} {findings.length === 1 ? "finding" : "findings"}
              {summary && summary.total !== findings.length && ` of ${summary.total}`}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Findings List */}
      {findings.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="h-10 w-10 text-slate-300" />
            <h3 className="mt-4 text-base font-semibold text-slate-900">
              No findings match
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Try adjusting your filters to see more results.
            </p>
            <Button variant="outline" onClick={clearFilters} className="mt-4">
              Clear all filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {findings.map((finding) => {
            const isExpanded = expandedFinding === finding.id;
            const filePath = getDisplayFilePath(finding.filePath);
            const fileExt = getFileExtension(filePath);

            return (
              <Card
                key={finding.id}
                className={cn(
                  "overflow-hidden border-0 shadow-sm transition-shadow",
                  isExpanded ? "shadow-md" : "hover:shadow-md"
                )}
              >
                <CardContent className="p-0">
                  {/* Header */}
                  <div
                    className="cursor-pointer p-4"
                    onClick={() =>
                      setExpandedFinding(isExpanded ? null : finding.id)
                    }
                  >
                    <div className="flex items-start gap-3">
                      <SeverityBadge severity={finding.severity} size="md" />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-medium text-slate-900">
                            {finding.title}
                          </h3>
                          <button className="flex-shrink-0 text-slate-400 hover:text-slate-600">
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5" />
                            ) : (
                              <ChevronRight className="h-5 w-5" />
                            )}
                          </button>
                        </div>

                        {finding.description && (
                          <p className="mt-1 text-sm text-slate-500 line-clamp-2">
                            {finding.description}
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {finding.category && (
                            <Badge variant="secondary" className="text-xs">
                              {finding.category}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {finding.scanner}
                          </Badge>
                          {filePath && (
                            <div className="flex items-center gap-1 text-xs text-slate-500">
                              <FileCode className="h-3.5 w-3.5" />
                              <span className="truncate max-w-[200px]">
                                {filePath}
                                {finding.lineStart && `:${finding.lineStart}`}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t bg-slate-50/50 p-4">
                      <div className="space-y-4">
                        {/* CWE/CVE Links */}
                        {(finding.cwe || finding.cve) && (
                          <div className="flex flex-wrap gap-3">
                            {finding.cwe && (() => {
                              const cweId = getCweId(finding.cwe);
                              const cweLabel = getCweLabel(finding.cwe);
                              if (!cweId) return (
                                <Badge variant="outline" className="text-xs">
                                  {cweLabel}
                                </Badge>
                              );
                              return (
                                <a
                                  href={`https://cwe.mitre.org/data/definitions/${cweId}.html`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                                >
                                  {cweLabel}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              );
                            })()}
                            {finding.cve && (
                              <a
                                href={`https://cve.mitre.org/cgi-bin/cvename.cgi?name=${finding.cve}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                              >
                                {finding.cve}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        )}

                        {/* Code Snippet */}
                        {finding.codeSnippet && (
                          <div>
                            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-600">
                              <Code className="h-4 w-4" />
                              Code Snippet
                            </div>
                            <div className="relative overflow-hidden rounded-lg border bg-slate-900">
                              <div className="flex items-center gap-1.5 border-b border-slate-800 bg-slate-800/50 px-3 py-2">
                                <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
                                <div className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
                                <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
                                {fileExt && (
                                  <span className="ml-2 text-xs text-slate-500">
                                    {getLanguageIcon(fileExt)}
                                  </span>
                                )}
                              </div>
                              <pre className="overflow-x-auto p-4 text-xs text-slate-300">
                                <code>{finding.codeSnippet}</code>
                              </pre>
                            </div>
                          </div>
                        )}

                        {/* Remediation */}
                        {finding.remediation && (
                          <div>
                            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-600">
                              <Wrench className="h-4 w-4" />
                              Remediation
                            </div>
                            <div className="rounded-lg border-l-4 border-emerald-400 bg-emerald-50 p-3 text-sm text-slate-700">
                              {finding.remediation}
                            </div>
                          </div>
                        )}

                        {/* Metadata */}
                        {finding.metadata && (
                          <div>
                            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-600">
                              <Info className="h-4 w-4" />
                              Scanner Metadata
                            </div>
                            <pre className="max-h-40 overflow-auto rounded-lg border bg-slate-100 p-3 text-xs text-slate-600">
                              <code>
                                {typeof finding.metadata === "string"
                                  ? finding.metadata
                                  : JSON.stringify(finding.metadata, null, 2)}
                              </code>
                            </pre>
                          </div>
                        )}

                        {/* Analysis Link */}
                        <div className="pt-2">
                          <a
                            href={`/api/scans/${scanId}/findings/${finding.id}/analysis`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
                          >
                            View detailed code analysis
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
