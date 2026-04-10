"use client";

import { useState, useCallback, useEffect } from "react";
import { ExternalLink, Github, Copy, Check, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { parseGitHubRepo } from "@/lib/github-url";

interface GitHubIssueDialogProps {
  scan: {
    scanId: string;
    repoUrl: string;
    branch: string | null;
    commitHash: string | null;
    findingsCount: number | null;
    criticalCount: number | null;
    highCount: number | null;
    mediumCount: number | null;
    lowCount: number | null;
    infoCount: number | null;
  };
  shareToken?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecordOutreach?: (issueUrl: string) => Promise<void>;
}

interface GitHubStatus {
  configured: boolean;
  rateLimit?: { remaining: number; limit: number };
}

function buildIssueTitle(
  repoName: string,
  branch: string | null,
  commitHash: string | null
): string {
  const base = "Security scan findings";
  const shortHash = commitHash ? commitHash.slice(0, 7) : null;
  if (shortHash && branch) return `${base} (${branch} · ${shortHash})`;
  if (shortHash) return `${base} (${shortHash})`;
  if (branch) return `${base} (${branch})`;
  return base;
}

function buildIssueBody(
  scan: GitHubIssueDialogProps["scan"],
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
  if (scan.infoCount) lines.push(`- ℹ️ Info: ${scan.infoCount}`);
  lines.push("");

  // Scan context
  const contextLines: string[] = [];
  if (scan.branch) contextLines.push(`- **Branch:** ${scan.branch}`);
  if (scan.commitHash) contextLines.push(`- **Commit:** ${scan.commitHash.slice(0, 7)}`);
  
  if (contextLines.length > 0) {
    lines.push("### Scan Details");
    lines.push("");
    lines.push(...contextLines);
    lines.push("");
  }

  // Share link
  if (includeShareLink && shareUrl) {
    lines.push("### 📊 Detailed Report");
    lines.push("");
    lines.push("View the complete security analysis with remediation guidance:");
    lines.push(`**${shareUrl}**`);
    lines.push("");
  }

  lines.push("---");
  lines.push("*This scan was performed using [SecureFast](https://reposcan.io), a free security scanning service for open-source projects.*");
  lines.push("");
  lines.push("*This issue was created to help improve the security posture of the project. Feedback is welcome!*");

  return lines.join("\n");
}

export default function GitHubIssueDialog({
  scan,
  shareToken,
  open,
  onOpenChange,
  onRecordOutreach
}: GitHubIssueDialogProps) {
  const [includeShareLink, setIncludeShareLink] = useState(!!shareToken);
  const [useApi, setUseApi] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; issueUrl?: string; issueNumber?: number; error?: string } | null>(null);
  const [githubStatus, setGitHubStatus] = useState<GitHubStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const parsed = parseGitHubRepo(scan.repoUrl);
  const repoName = parsed ? `${parsed.owner}/${parsed.repo}` : scan.repoUrl;
  
  const shareUrl = shareToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${shareToken}`
    : null;

  const issueTitle = buildIssueTitle(repoName, scan.branch, scan.commitHash);
  const issueBody = buildIssueBody(scan, shareUrl, includeShareLink);

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

  const githubIssueUrl = useCallback(() => {
    if (!parsed) return null;
    const url = new URL(`https://github.com/${parsed.owner}/${parsed.repo}/issues/new`);
    url.searchParams.set("title", issueTitle);
    url.searchParams.set("body", issueBody);
    return url.toString();
  }, [parsed, issueTitle, issueBody]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(issueBody);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silent error
    }
  };

  const handleCreateIssue = async () => {
    setIsProcessing(true);
    setResult(null);

    try {
      if (useApi && githubStatus?.configured && parsed) {
        // Create via API
        const response = await fetch("/api/admin/marketing/github-issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scanId: scan.scanId,
            title: issueTitle,
            body: issueBody,
            shareToken
          })
        });

        const data = await response.json();

        if (response.ok && data.success) {
          setResult({
            success: true,
            issueUrl: data.issueUrl,
            issueNumber: data.issueNumber
          });
        } else if (data.fallback === "browser") {
          // Fall back to browser
          const url = githubIssueUrl();
          if (url) {
            if (onRecordOutreach) {
              await onRecordOutreach(url);
            }
            window.open(url, "_blank", "noopener,noreferrer");
            onOpenChange(false);
          }
        } else {
          setResult({
            success: false,
            error: data.error || "Failed to create issue"
          });
        }
      } else {
        // Browser mode
        const url = githubIssueUrl();
        if (url) {
          if (onRecordOutreach) {
            await onRecordOutreach(url);
          }
          window.open(url, "_blank", "noopener,noreferrer");
          onOpenChange(false);
        }
      }
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    setUseApi(true);
    onOpenChange(false);
  };

  if (!parsed) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open GitHub Issue</DialogTitle>
            <DialogDescription>
              This repository is not hosted on GitHub.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            {result?.success ? "Issue Created!" : "Create GitHub Issue"}
          </DialogTitle>
          <DialogDescription>
            {result?.success 
              ? "GitHub issue created successfully via API"
              : `Preview and create a GitHub issue for ${repoName}`
            }
          </DialogDescription>
        </DialogHeader>

        {result?.success ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-green-50 p-4 text-center">
              <Check className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <div className="text-sm text-green-700">
                Issue #{result.issueNumber} created successfully
              </div>
              <a 
                href={result.issueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm break-all"
              >
                {result.issueUrl}
              </a>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Close</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
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

            {!useApi && (
              <Alert className="text-xs">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Browser mode opens a new tab with pre-filled issue. You&apos;ll need to submit manually.
                </AlertDescription>
              </Alert>
            )}

            {/* Share link toggle */}
            {shareUrl && (
              <div className="flex items-center justify-between rounded-lg border bg-slate-50 p-3">
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">Include share link</div>
                  <div className="text-xs text-slate-500">
                    Add a link to the detailed scan report
                  </div>
                </div>
                <Switch
                  checked={includeShareLink}
                  onCheckedChange={setIncludeShareLink}
                />
              </div>
            )}

            {/* Issue title */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Issue Title</label>
              <Input value={issueTitle} readOnly className="bg-slate-50" />
            </div>

            {/* Issue body */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Issue Body</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="h-7 gap-1"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <Textarea
                value={issueBody}
                readOnly
                className="min-h-[200px] font-mono text-sm bg-slate-50"
              />
            </div>

            {/* Findings summary */}
            <div className="rounded-lg border p-3">
              <div className="text-sm font-medium mb-2">Findings Summary</div>
              <div className="flex flex-wrap gap-2">
                {scan.criticalCount ? (
                  <Badge variant="destructive">{scan.criticalCount} Critical</Badge>
                ) : null}
                {scan.highCount ? (
                  <Badge className="bg-orange-500">{scan.highCount} High</Badge>
                ) : null}
                {scan.mediumCount ? (
                  <Badge className="bg-yellow-500">{scan.mediumCount} Medium</Badge>
                ) : null}
                {scan.lowCount ? (
                  <Badge className="bg-blue-500">{scan.lowCount} Low</Badge>
                ) : null}
                {scan.infoCount ? (
                  <Badge variant="secondary">{scan.infoCount} Info</Badge>
                ) : null}
              </div>
            </div>

            {result?.error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {result.error}
              </div>
            )}

            {/* Actions */}
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateIssue}
                disabled={isProcessing}
                className="gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    {useApi && githubStatus?.configured ? (
                      <>
                        <Github className="h-4 w-4" />
                        Create Issue
                      </>
                    ) : (
                      <>
                        <ExternalLink className="h-4 w-4" />
                        Open in Browser
                      </>
                    )}
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
