"use client";

import { useState, useCallback, useEffect } from "react";
import { ExternalLink, Github, Loader2, Check, AlertCircle, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { parseGitHubRepo } from "@/lib/github-url";

interface ScanForBulk {
  scanId: string;
  repoUrl: string;
  repoName: string;
  branch: string | null;
  commitHash: string | null;
  findingsCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

interface BulkGitHubIssueDialogProps {
  scans: ScanForBulk[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

function buildIssueTitle(repoName: string, branch: string | null, commitHash: string | null): string {
  const base = "Security scan findings";
  const shortHash = commitHash ? commitHash.slice(0, 7) : null;
  if (shortHash && branch) return `${base} (${branch} · ${shortHash})`;
  if (shortHash) return `${base} (${shortHash})`;
  if (branch) return `${base} (${branch})`;
  return base;
}

function buildIssueBody(
  scan: ScanForBulk,
  shareUrl: string | null,
  includeShareLink: boolean
): string {
  const lines: string[] = [
    "## 🔒 Security Scan Report",
    "",
    `A security scan of this repository identified **${scan.findingsCount || 0} potential security vulnerabilities**:`
  ];

  lines.push("");
  if (scan.criticalCount) lines.push(`- 🔴 Critical: ${scan.criticalCount}`);
  if (scan.highCount) lines.push(`- 🟠 High: ${scan.highCount}`);
  if (scan.mediumCount) lines.push(`- 🟡 Medium: ${scan.mediumCount}`);
  if (scan.lowCount) lines.push(`- 🔵 Low: ${scan.lowCount}`);
  lines.push("");

  if (scan.branch || scan.commitHash) {
    lines.push("### Scan Details");
    lines.push("");
    if (scan.branch) lines.push(`- **Branch:** ${scan.branch}`);
    if (scan.commitHash) lines.push(`- **Commit:** ${scan.commitHash.slice(0, 7)}`);
    lines.push("");
  }

  if (includeShareLink && shareUrl) {
    lines.push("### 📊 Detailed Report");
    lines.push("");
    lines.push("View the complete security analysis with remediation guidance:");
    lines.push(`**${shareUrl}**`);
    lines.push("");
  }

  lines.push("---");
  lines.push("*This scan was performed using [RepoScan](https://reposcan.io), a free security scanning service for open-source projects.*");
  lines.push("");
  lines.push("*This issue was created to help improve the security posture of the project. Feedback is welcome!*");

  return lines.join("\n");
}

export default function BulkGitHubIssueDialog({
  scans,
  open,
  onOpenChange,
  onComplete
}: BulkGitHubIssueDialogProps) {
  const [shareType, setShareType] = useState<"summary" | "full">("summary");
  const [includeShareLink, setIncludeShareLink] = useState(true);
  const [useApi, setUseApi] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ 
    success: number; 
    failed: number; 
    errors: string[];
    created: Array<{ repoName: string; issueUrl: string; issueNumber?: number }>;
  } | null>(null);
  const [createdShares, setCreatedShares] = useState<Record<string, string>>({});
  const [githubStatus, setGitHubStatus] = useState<{ 
    configured: boolean; 
    rateLimit?: { remaining: number; limit: number };
  } | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const validScans = scans.filter(scan => {
    const parsed = parseGitHubRepo(scan.repoUrl);
    return parsed !== null;
  });

  const totalFindings = validScans.reduce((sum, s) => sum + s.findingsCount, 0);
  const totalCritical = validScans.reduce((sum, s) => sum + (s.criticalCount || 0), 0);
  const totalHigh = validScans.reduce((sum, s) => sum + (s.highCount || 0), 0);

  // Check GitHub API status when dialog opens
  useEffect(() => {
    if (open && useApi) {
      checkGitHubStatus();
    }
  }, [open, useApi]);

  const checkGitHubStatus = async () => {
    setCheckingStatus(true);
    try {
      const response = await fetch("/api/admin/marketing/github-issue");
      const data = await response.json();
      setGitHubStatus({
        configured: data.configured,
        rateLimit: data.rateLimit
      });
      // If not configured, switch to browser mode
      if (!data.configured) {
        setUseApi(false);
      }
    } catch {
      setGitHubStatus({ configured: false });
      setUseApi(false);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleCreateShare = async (scanId: string, shareType: "summary" | "full"): Promise<string | null> => {
    try {
      const response = await fetch(`/api/scans/${scanId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareType })
      });

      if (!response.ok) return null;
      const data = await response.json();
      return data.share?.token || null;
    } catch {
      return null;
    }
  };

  const handleProcess = async () => {
    setIsProcessing(true);
    setProgress(0);
    setResults(null);

    const results = { 
      success: 0, 
      failed: 0, 
      errors: [] as string[],
      created: [] as Array<{ repoName: string; issueUrl: string; issueNumber?: number }>
    };
    const shares: Record<string, string> = {};

    for (let i = 0; i < validScans.length; i++) {
      const scan = validScans[i];
      
      try {
        // Create share link if needed
        let shareToken: string | null = null;
        if (includeShareLink) {
          shareToken = await handleCreateShare(scan.scanId, shareType);
          if (shareToken) {
            shares[scan.scanId] = shareToken;
          }
        }

        const parsed = parseGitHubRepo(scan.repoUrl);
        if (!parsed) {
          results.failed++;
          results.errors.push(`${scan.repoName}: Not a valid GitHub repository`);
          continue;
        }

        const shareUrl = shareToken 
          ? `${window.location.origin}/share/${shareToken}`
          : null;

        const title = buildIssueTitle(scan.repoName, scan.branch, scan.commitHash);
        const body = buildIssueBody(scan, shareUrl, includeShareLink);

        if (useApi && githubStatus?.configured) {
          // Create issue via API
          const response = await fetch("/api/admin/marketing/github-issue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scanId: scan.scanId,
              title,
              body,
              shareToken
            })
          });

          const data = await response.json();

          if (!response.ok) {
            // If API fails, fall back to browser
            if (data.fallback === "browser") {
              const issueUrl = new URL(`https://github.com/${parsed.owner}/${parsed.repo}/issues/new`);
              issueUrl.searchParams.set("title", title);
              issueUrl.searchParams.set("body", body);
              window.open(issueUrl.toString(), `_blank_${i}`, "noopener,noreferrer");
              results.success++;
            } else {
              throw new Error(data.error || "Failed to create issue");
            }
          } else {
            results.success++;
            results.created.push({
              repoName: scan.repoName,
              issueUrl: data.issueUrl,
              issueNumber: data.issueNumber
            });
          }
        } else {
          // Browser fallback
          const issueUrl = new URL(`https://github.com/${parsed.owner}/${parsed.repo}/issues/new`);
          issueUrl.searchParams.set("title", title);
          issueUrl.searchParams.set("body", body);
          window.open(issueUrl.toString(), `_blank_${i}`, "noopener,noreferrer");

          // Record outreach
          await fetch("/api/admin/marketing/outreach", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scanId: scan.scanId,
              type: "github_issue_opened",
              metadata: { 
                issueUrl: issueUrl.toString(),
                shareToken,
                bulk: true,
                api: false
              }
            })
          });

          results.success++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`${scan.repoName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      setProgress(Math.round(((i + 1) / validScans.length) * 100));
    }

    setCreatedShares(shares);
    setResults(results);
    setIsProcessing(false);
  };

  const handleClose = () => {
    if (!isProcessing) {
      setResults(null);
      setProgress(0);
      setCreatedShares({});
      onOpenChange(false);
      if (results && results.success > 0) {
        onComplete?.();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            Bulk Create GitHub Issues
          </DialogTitle>
          <DialogDescription>
            Create GitHub issues for {validScans.length} selected scan{validScans.length !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-lg border bg-slate-50 p-3">
            <div className="text-sm font-medium mb-2">Selected Scans</div>
            <div className="space-y-1">
              {validScans.slice(0, 5).map(scan => (
                <div key={scan.scanId} className="text-xs text-slate-600 truncate">
                  {scan.repoName}
                  {scan.criticalCount > 0 && (
                    <Badge variant="destructive" className="ml-2 text-[10px] h-4">
                      {scan.criticalCount}C
                    </Badge>
                  )}
                  {scan.highCount > 0 && (
                    <Badge className="ml-1 bg-orange-500 text-[10px] h-4">
                      {scan.highCount}H
                    </Badge>
                  )}
                </div>
              ))}
              {validScans.length > 5 && (
                <div className="text-xs text-slate-500">
                  ... and {validScans.length - 5} more
                </div>
              )}
            </div>
            <div className="mt-3 pt-3 border-t flex flex-wrap gap-2">
              <Badge variant="secondary">{validScans.length} repos</Badge>
              <Badge variant="destructive">{totalCritical} Critical</Badge>
              <Badge className="bg-orange-500">{totalHigh} High</Badge>
              <Badge variant="outline">{totalFindings} Total findings</Badge>
            </div>
          </div>

          {/* Options */}
          {!results && (
            <>
              <div className="space-y-3">
                {/* API vs Browser toggle */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium flex items-center gap-2">
                      Use GitHub API
                      {checkingStatus && <Loader2 className="h-3 w-3 animate-spin" />}
                    </div>
                    <div className="text-xs text-slate-500">
                      {githubStatus?.configured 
                        ? `Rate limit: ${githubStatus.rateLimit?.remaining}/${githubStatus.rateLimit?.limit} remaining`
                        : "Requires GITHUB_TOKEN environment variable"
                      }
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {githubStatus?.configured ? (
                      <Switch
                        checked={useApi}
                        onCheckedChange={setUseApi}
                      />
                    ) : (
                      <Badge variant="outline" className="text-xs">Browser only</Badge>
                    )}
                  </div>
                </div>

                {/* Warning if using browser */}
                {!useApi && (
                  <Alert className="text-xs">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Browser mode opens tabs for each issue. You&apos;ll need to submit them manually.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">Include share link</div>
                    <div className="text-xs text-slate-500">
                      Creates public links for each scan
                    </div>
                  </div>
                  <Switch
                    checked={includeShareLink}
                    onCheckedChange={setIncludeShareLink}
                  />
                </div>

                {includeShareLink && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="text-sm font-medium">Share Type</div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShareType("summary")}
                        className={`flex-1 rounded-lg border p-2 text-left text-sm transition-colors ${
                          shareType === "summary"
                            ? "border-blue-500 bg-blue-50"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="font-medium">Summary Only</div>
                        <div className="text-xs text-slate-500">
                          Finding counts and risk score
                        </div>
                      </button>
                      <button
                        onClick={() => setShareType("full")}
                        className={`flex-1 rounded-lg border p-2 text-left text-sm transition-colors ${
                          shareType === "full"
                            ? "border-blue-500 bg-blue-50"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="font-medium">Full Report</div>
                        <div className="text-xs text-slate-500">
                          All findings with details
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Progress */}
              {isProcessing && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Processing...</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Results */}
          {results && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                <span className="font-medium">Complete!</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border bg-green-50 p-3 text-center">
                  <div className="text-2xl font-bold text-green-600">{results.success}</div>
                  <div className="text-xs text-green-700">Issues Created</div>
                </div>
                {results.failed > 0 && (
                  <div className="rounded-lg border bg-red-50 p-3 text-center">
                    <div className="text-2xl font-bold text-red-600">{results.failed}</div>
                    <div className="text-xs text-red-700">Failed</div>
                  </div>
                )}
              </div>

              {/* Created issues list */}
              {results.created.length > 0 && (
                <div className="rounded-lg border p-3 max-h-40 overflow-y-auto">
                  <div className="text-sm font-medium mb-2">Created Issues</div>
                  <div className="space-y-1">
                    {results.created.map((item, i) => (
                      <a
                        key={i}
                        href={item.issueUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between text-xs hover:bg-slate-50 p-1 rounded"
                      >
                        <span className="truncate">{item.repoName}</span>
                        <span className="text-blue-600 flex items-center gap-1">
                          #{item.issueNumber}
                          <ExternalLink className="h-3 w-3" />
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {includeShareLink && Object.keys(createdShares).length > 0 && (
                <Alert>
                  <Check className="h-4 w-4" />
                  <AlertDescription>
                    Created {Object.keys(createdShares).length} share link(s)
                  </AlertDescription>
                </Alert>
              )}

              {results.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="flex items-center gap-2 text-red-800 text-sm font-medium mb-2">
                    <AlertCircle className="h-4 w-4" />
                    Errors ({results.errors.length})
                  </div>
                  <div className="max-h-32 overflow-y-auto text-xs text-red-700 space-y-1">
                    {results.errors.slice(0, 5).map((error, i) => (
                      <div key={i} className="truncate">{error}</div>
                    ))}
                    {results.errors.length > 5 && (
                      <div>... and {results.errors.length - 5} more</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {!results ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isProcessing}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleProcess}
                  disabled={isProcessing || validScans.length === 0}
                  className="gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      {useApi && githubStatus?.configured ? (
                        <>
                          <Github className="h-4 w-4" />
                          Create {validScans.length} Issue{validScans.length !== 1 ? 's' : ''}
                        </>
                      ) : (
                        <>
                          <ExternalLink className="h-4 w-4" />
                          Open {validScans.length} Issue{validScans.length !== 1 ? 's' : ''}
                        </>
                      )}
                    </>
                  )}
                </Button>
              </>
            ) : (
              <Button onClick={handleClose} className="gap-2">
                <Check className="h-4 w-4" />
                Done
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
