"use client";

import { useCallback } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseGitHubRepo } from "@/lib/github-url";

export type OpenGitHubIssueButtonProps = {
  repoUrl: string | null;
  /** Optional: pre-fill issue title (URL-encoded by this component). */
  issueTitle?: string;
  /** Optional: pre-fill issue body (URL-encoded by this component). */
  issueBody?: string;
  /** Scan ID for linking back to this scan in the issue body. */
  scanId?: string;
  /** Finding counts for summary in body. */
  findingsCount?: number;
  criticalCount?: number;
  highCount?: number;
  mediumCount?: number;
  lowCount?: number;
  infoCount?: number;
  branch?: string | null;
  commitHash?: string | null;
  /** Scan date for title and context (e.g. "2026-02-03" or formatted string). */
  scanDate?: string | null;
  /** When true, button is disabled (e.g. scan not completed). */
  disabled?: boolean;
  className?: string;
};

/**
 * Build the default issue body for a security scan report.
 */
function buildDefaultIssueBody(props: {
  scanId?: string;
  findingsCount?: number;
  criticalCount?: number;
  highCount?: number;
  mediumCount?: number;
  lowCount?: number;
  infoCount?: number;
  branch?: string | null;
  commitHash?: string | null;
  scanDate?: string | null;
  origin?: string;
}): string {
  const lines: string[] = [
    "## Security scan report",
    "",
    "This issue was created from a security scan of this repository.",
    "",
  ];

  if (props.origin && props.scanId) {
    lines.push(`**Scan results:** ${props.origin}/app/scans/${props.scanId}`);
    lines.push("");
  }

  const total = props.findingsCount ?? 0;
  if (total > 0) {
    lines.push("### Findings summary");
    lines.push("");
    lines.push(`- **Total:** ${total}`);
    if (props.criticalCount) lines.push(`- Critical: ${props.criticalCount}`);
    if (props.highCount) lines.push(`- High: ${props.highCount}`);
    if (props.mediumCount) lines.push(`- Medium: ${props.mediumCount}`);
    if (props.lowCount) lines.push(`- Low: ${props.lowCount}`);
    if (props.infoCount) lines.push(`- Info: ${props.infoCount}`);
    lines.push("");
  }

  if (props.branch || props.commitHash || props.scanDate) {
    lines.push("### Scan context");
    lines.push("");
    if (props.branch) lines.push(`- Branch: \`${props.branch}\``);
    if (props.commitHash) lines.push(`- Commit: \`${props.commitHash}\``);
    if (props.scanDate) lines.push(`- Date: ${props.scanDate}`);
    lines.push("");
  }

  lines.push("---");
  lines.push("*Powered by [SecureFast](https://securefast.io)*");
  return lines.join("\n");
}

/**
 * Opens GitHub's "new issue" page in a new tab, with optional pre-filled title and body.
 * Renders nothing if repoUrl is not a GitHub repository.
 */
export default function OpenGitHubIssueButton({
  repoUrl,
  issueTitle,
  issueBody,
  scanId,
  findingsCount = 0,
  criticalCount = 0,
  highCount = 0,
  mediumCount = 0,
  lowCount = 0,
  infoCount = 0,
  branch = null,
  commitHash = null,
  scanDate = null,
  disabled = false,
  className,
}: OpenGitHubIssueButtonProps) {
  const parsed = repoUrl ? parseGitHubRepo(repoUrl) : null;

  const defaultTitle = (() => {
    const base = "Security scan findings";
    const shortHash = commitHash ? commitHash.slice(0, 7) : null;
    if (shortHash && scanDate) return `${base} (${shortHash} · ${scanDate})`;
    if (shortHash) return `${base} (${shortHash})`;
    if (scanDate) return `${base} (${scanDate})`;
    return base;
  })();

  const handleClick = useCallback(() => {
    if (!parsed) return;
    const title = issueTitle ?? defaultTitle;
    const body =
      issueBody ??
      buildDefaultIssueBody({
        scanId,
        findingsCount,
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
        infoCount,
        branch,
        commitHash,
        scanDate,
        origin: window.location.origin,
      });
    const url = new URL(
      `https://github.com/${parsed.owner}/${parsed.repo}/issues/new`
    );
    url.searchParams.set("title", title);
    url.searchParams.set("body", body);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }, [
    parsed,
    issueTitle,
    issueBody,
    defaultTitle,
    scanId,
    findingsCount,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    infoCount,
    branch,
    commitHash,
    scanDate,
  ]);

  if (!parsed) {
    return null;
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn("gap-2", className)}
      disabled={disabled}
      onClick={handleClick}
      type="button"
    >
      <ExternalLink className="h-4 w-4" />
      Open GitHub issue
    </Button>
  );
}
