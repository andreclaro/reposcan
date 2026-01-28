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

type Finding = {
  id: number;
  scanId: string;
  scanner: string;
  severity: string;
  category: string | null;
  title: string;
  description: string | null;
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  codeSnippet: string | null;
  cwe: string | null;
  cve: string | null;
  remediation: string | null;
  confidence: string | null;
  metadata: Record<string, unknown> | null | string;
};

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
  const [summary, setSummary] = useState<any>(null);
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
    // #region agent log
    console.log('[DEBUG] fetchFindings START', {scanId, filters});
    fetch('http://127.0.0.1:7250/ingest/c11ddcde-3020-4ad3-907a-65bf86ca8a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'findings-list.tsx:60',message:'fetchFindings START',data:{scanId,filters},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    try {
      const params = new URLSearchParams();
      if (filters.severity) params.append("severity", filters.severity);
      if (filters.category) params.append("category", filters.category);
      if (filters.scanner) params.append("scanner", filters.scanner);

      const url = `/api/scans/${scanId}/findings?${params.toString()}`;
      // #region agent log
      console.log('[DEBUG] fetchFindings BEFORE fetch', {url, scanId});
      fetch('http://127.0.0.1:7250/ingest/c11ddcde-3020-4ad3-907a-65bf86ca8a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'findings-list.tsx:69',message:'fetchFindings BEFORE fetch',data:{url,scanId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const response = await fetch(url);
      // #region agent log
      console.log('[DEBUG] fetchFindings AFTER fetch', {status: response.status, statusText: response.statusText, ok: response.ok});
      fetch('http://127.0.0.1:7250/ingest/c11ddcde-3020-4ad3-907a-65bf86ca8a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'findings-list.tsx:72',message:'fetchFindings AFTER fetch',data:{status:response.status,statusText:response.statusText,ok:response.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      if (!response.ok) {
        // #region agent log
        console.error('[DEBUG] fetchFindings ERROR response', {status: response.status, statusText: response.statusText});
        fetch('http://127.0.0.1:7250/ingest/c11ddcde-3020-4ad3-907a-65bf86ca8a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'findings-list.tsx:74',message:'fetchFindings ERROR response',data:{status:response.status,statusText:response.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        throw new Error("Failed to fetch findings");
      }
      const data = await response.json();
      // #region agent log
      console.log('[DEBUG] fetchFindings DATA received', {hasFindings: !!data.findings, findingsLength: data.findings?.length || 0, hasSummary: !!data.summary, dataKeys: Object.keys(data), data});
      fetch('http://127.0.0.1:7250/ingest/c11ddcde-3020-4ad3-907a-65bf86ca8a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'findings-list.tsx:79',message:'fetchFindings DATA received',data:{hasFindings:!!data.findings,findingsLength:data.findings?.length||0,hasSummary:!!data.summary,dataKeys:Object.keys(data)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      const currentFindings: Finding[] = data.findings || [];
      const currentSeverities = Array.from(
        new Set(currentFindings.map((f) => f.severity))
      );
      const currentCategories = Array.from(
        new Set(
          currentFindings
            .map((f) => f.category)
            .filter((c): c is string => !!c)
        )
      );
      const currentScanners = Array.from(
        new Set(currentFindings.map((f) => f.scanner))
      );

      // Preserve full filter options even when a filter is active.
      // We update the "availableFilters" list only when there is no
      // active filter (initial load), so that selecting a category
      // like "crypto" doesn't hide other categories from the dropdown.
      const hasActiveFilters =
        !!filters.severity || !!filters.category || !!filters.scanner;

      if (!hasActiveFilters) {
        setAvailableFilters({
          severities: currentSeverities,
          categories: currentCategories,
          scanners: currentScanners,
        });
      } else if (
        availableFilters.severities.length === 0 &&
        availableFilters.categories.length === 0 &&
        availableFilters.scanners.length === 0
      ) {
        // Fallback: if for some reason we didn't capture the unfiltered set,
        // initialize from the current response so the dropdowns still work.
        setAvailableFilters({
          severities: currentSeverities,
          categories: currentCategories,
          scanners: currentScanners,
        });
      }

      setFindings(currentFindings);
      setSummary(data.summary || null);
      // #region agent log
      console.log('[DEBUG] fetchFindings SUCCESS', {findingsSet: data.findings?.length || 0, summarySet: !!data.summary});
      fetch('http://127.0.0.1:7250/ingest/c11ddcde-3020-4ad3-907a-65bf86ca8a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'findings-list.tsx:82',message:'fetchFindings SUCCESS',data:{findingsSet:data.findings?.length||0,summarySet:!!data.summary},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    } catch (err) {
      // #region agent log
      console.error('[DEBUG] fetchFindings CATCH', {error: err instanceof Error ? err.message : String(err), err});
      fetch('http://127.0.0.1:7250/ingest/c11ddcde-3020-4ad3-907a-65bf86ca8a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'findings-list.tsx:84',message:'fetchFindings CATCH',data:{error:err instanceof Error?err.message:String(err)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      setError(err instanceof Error ? err.message : "Failed to load findings");
    } finally {
      setLoading(false);
      // #region agent log
      console.log('[DEBUG] fetchFindings FINALLY', {loading: false});
      fetch('http://127.0.0.1:7250/ingest/c11ddcde-3020-4ad3-907a-65bf86ca8a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'findings-list.tsx:88',message:'fetchFindings FINALLY',data:{loading:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    }
  };

  // #region agent log
  useEffect(() => {
    console.log('[DEBUG] RENDER STATE', {loading, error, findingsLength: findings.length, hasSummary: !!summary, findings});
    fetch('http://127.0.0.1:7250/ingest/c11ddcde-3020-4ad3-907a-65bf86ca8a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'findings-list.tsx:85',message:'RENDER STATE',data:{loading,error,findingsLength:findings.length,hasSummary:!!summary},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  }, [loading, error, findings.length, summary]);
  // #endregion

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

  if (findings.length === 0) {
    return (
      <div className="rounded-2xl border bg-background p-8 text-center">
        <AlertTriangle className="mx-auto size-12 text-muted-foreground/50" />
        <p className="mt-4 text-sm font-medium">No findings</p>
        <p className="mt-1 text-sm text-muted-foreground">
          This scan did not detect any security issues.
        </p>
      </div>
    );
  }

  // Get unique values for filters
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
      {/* Filters */}
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

      {/* Findings List */}
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
    </div>
  );
}
