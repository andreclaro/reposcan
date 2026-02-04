"use client";

import { useState, useCallback } from "react";
import { ExternalLink, Github, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  lines.push("*This scan was performed using [SecurityKit](https://securitykit.dev), a free security scanning service for open-source projects.*");
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
  const [copied, setCopied] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const parsed = parseGitHubRepo(scan.repoUrl);
  const repoName = parsed ? `${parsed.owner}/${parsed.repo}` : scan.repoUrl;
  
  const shareUrl = shareToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${shareToken}`
    : null;

  const issueTitle = buildIssueTitle(repoName, scan.branch, scan.commitHash);
  const issueBody = buildIssueBody(scan, shareUrl, includeShareLink);

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

  const handleOpenGitHub = async () => {
    const url = githubIssueUrl();
    if (!url) return;

    // Record outreach activity
    if (onRecordOutreach) {
      setIsRecording(true);
      try {
        await onRecordOutreach(url);
      } finally {
        setIsRecording(false);
      }
    }

    // Open GitHub
    window.open(url, "_blank", "noopener,noreferrer");
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            Open GitHub Issue
          </DialogTitle>
          <DialogDescription>
            Preview and open a GitHub issue for{" "}
            <span className="font-medium">{repoName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
              className="min-h-[300px] font-mono text-sm bg-slate-50"
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

          {/* Target URL */}
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <div className="text-slate-500">Target URL:</div>
            <code className="text-xs break-all">{githubIssueUrl()}</code>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleOpenGitHub}
              disabled={isRecording}
              className="gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              {isRecording ? "Recording..." : "Open GitHub Issue"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
