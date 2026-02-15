/**
 * GitHub Token Retrieval for Private Repository Access
 * 
 * This module provides functions to retrieve a user's GitHub OAuth token
 * from their NextAuth session. The token is used for:
 * - Private repository scanning
 * - GitHub API calls that require authentication
 * 
 * The token is NEVER stored outside of the session and is only used
 * ephemerally (encrypted) when passed to workers.
 */

import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * GitHub provider IDs used for authentication
 */
const GITHUB_PROVIDERS = ["github", "github-private"];

/**
 * Get the GitHub OAuth access token for a user.
 * 
 * Retrieves the token from the NextAuth accounts table.
 * Checks all GitHub provider variants (github, github-public, github-private).
 * The token is used for private repository access and GitHub API calls.
 * 
 * @param userId - The user's ID from the session
 * @returns The GitHub access token or null if not found
 */
export async function getUserGitHubToken(userId: string): Promise<string | null> {
  try {
    // Check all GitHub provider variants
    for (const provider of GITHUB_PROVIDERS) {
      const account = await db.query.accounts.findFirst({
        where: and(
          eq(accounts.userId, userId),
          eq(accounts.provider, provider)
        ),
        columns: {
          access_token: true,
          scope: true
        }
      });

      if (account?.access_token) {
        // Debug: log the scopes we have
        if (account?.scope) {
          console.log("[github-token] Token scopes for user %s (%s): %s", userId, provider, String(account.scope));
        }
        return account.access_token;
      }
    }

    return null;
  } catch (error) {
    console.error("Error retrieving GitHub token:", error);
    return null;
  }
}

/**
 * Check if the user's GitHub token has the required scopes.
 * Checks all GitHub provider variants.
 */
export async function hasRequiredScopes(userId: string, requiredScopes: string[]): Promise<boolean> {
  try {
    // Check all GitHub provider variants
    for (const provider of GITHUB_PROVIDERS) {
      const account = await db.query.accounts.findFirst({
        where: and(
          eq(accounts.userId, userId),
          eq(accounts.provider, provider)
        ),
        columns: {
          scope: true
        }
      });

      if (account?.scope) {
        const grantedScopes = account.scope.split(/[,\s]+/).map(s => s.trim());
        // Check if this provider has all required scopes
        if (requiredScopes.every(req => grantedScopes.includes(req))) {
          return true;
        }
      }
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Verify that the user has access to a specific repository.
 * 
 * Makes a GitHub API call to check if the repository is accessible
 * with the user's token.
 * 
 * @param token - The GitHub access token
 * @param repoUrl - The repository URL (e.g., https://github.com/owner/repo)
 * @returns True if the user has access, false otherwise
 */
/**
 * Get the scopes granted to a GitHub token.
 * Useful for debugging permission issues.
 */
export async function getTokenScopes(token: string): Promise<string[]> {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json"
      }
    });
    
    const scopesHeader = response.headers.get("x-oauth-scopes") || "";
    return scopesHeader.split(",").map(s => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function verifyRepoAccess(
  token: string,
  repoUrl: string
): Promise<boolean> {
  try {
    // Parse owner/repo from URL
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/);
    if (!match) {
      return false;
    }

    const [, owner, repo] = match;
    const repoName = repo.replace(/\.git$/, "");

    // Call GitHub API to check access
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      }
    );

    if (response.status === 200) {
      return true;
    }

    // Log details for debugging
    const responseBody = await response.text().catch(() => "unknown");
    console.error(`GitHub API verifyRepoAccess failed:`, {
      status: response.status,
      owner,
      repo: repoName,
      response: responseBody.substring(0, 200)
    });

    if (response.status === 404) {
      // Repo not found or no access - could be private repo without proper token scope
      return false;
    }

    if (response.status === 401 || response.status === 403) {
      // Token invalid or expired
      return false;
    }

    return false;

  } catch (error) {
    console.error("Error verifying repo access:", error);
    return false;
  }
}

/**
 * Check if a repository URL is a private repository.
 * 
 * Note: This is a best-effort check based on the GitHub API.
 * The repository might be private even if this returns false
 * (e.g., if the token doesn't have access).
 * 
 * @param token - The GitHub access token
 * @param repoUrl - The repository URL
 * @returns True if the repo is private, false if public or unknown
 */
export async function isRepoPrivate(
  token: string,
  repoUrl: string
): Promise<boolean | null> {
  try {
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/);
    if (!match) {
      return null;
    }

    const [, owner, repo] = match;
    const repoName = repo.replace(/\.git$/, "");

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      }
    );

    if (response.status === 200) {
      const data = await response.json();
      return data.private === true;
    }

    return null;

  } catch (error) {
    console.error("Error checking repo visibility:", error);
    return null;
  }
}

/**
 * List repositories accessible to the user.
 * 
 * @param token - The GitHub access token
 * @param includePrivate - Whether to include private repositories
 * @returns Array of repository objects
 */
export async function listUserRepos(
  token: string,
  includePrivate: boolean = false
): Promise<Array<{
  name: string;
  full_name: string;
  url: string;
  private: boolean;
  stars: number;
}>> {
  try {
    const visibility = includePrivate ? "all" : "public";
    const response = await fetch(
      `https://api.github.com/user/repos?visibility=${visibility}&sort=updated&per_page=100`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const repos = await response.json();
    
    return repos.map((repo: any) => ({
      name: repo.name,
      full_name: repo.full_name,
      url: repo.html_url,
      private: repo.private,
      stars: repo.stargazers_count || 0
    }));

  } catch (error) {
    console.error("Error listing user repos:", error);
    return [];
  }
}
