/**
 * GitHub API helpers for resolving branch to commit and normalizing repo URLs.
 * Used by the scan API to check for existing scans before queuing a worker.
 */

import { parseGitHubRepo } from "./github-url";

/**
 * Normalize a GitHub repo URL to a canonical form for DB lookup.
 * Strips trailing .git, lowercases host; path preserves case for compatibility.
 * Returns null if the URL is not a valid GitHub repo.
 */
export function normalizeRepoUrl(repoUrl: string): string | null {
  const parsed = parseGitHubRepo(repoUrl);
  if (!parsed) {
    return null;
  }
  return `https://github.com/${parsed.owner}/${parsed.repo}`;
}

/**
 * Fetch the current commit SHA for a branch via GitHub API.
 * If branch is empty/undefined, fetches the repo's default branch first, then its commit.
 * Uses GITHUB_TOKEN from env for higher rate limits and private repos.
 * Returns null on any failure (missing token, network error, 404, etc.).
 */
export async function getCommitShaForBranch(
  owner: string,
  repo: string,
  branch: string | undefined
): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "sec-audit-repos-webapp"
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let branchToUse = branch?.trim() || undefined;
  if (!branchToUse) {
    const repoRes = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      { headers, next: { revalidate: 0 } }
    );
    if (!repoRes.ok) {
      return null;
    }
    const repoData = (await repoRes.json()) as { default_branch?: string };
    branchToUse = repoData.default_branch ?? "main";
  }

  const commitsRes = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(branchToUse)}`,
    { headers, next: { revalidate: 0 } }
  );
  if (!commitsRes.ok) {
    return null;
  }
  const commitData = (await commitsRes.json()) as { sha?: string };
  return commitData.sha ?? null;
}
