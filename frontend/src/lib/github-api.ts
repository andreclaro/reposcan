/**
 * GitHub API client for creating issues programmatically
 */

export interface CreateGitHubIssueInput {
  owner: string;
  repo: string;
  title: string;
  body: string;
  labels?: string[];
}

export interface CreateGitHubIssueResult {
  success: boolean;
  issueUrl?: string;
  issueNumber?: number;
  error?: string;
}

/**
 * Create a GitHub issue using the GitHub API
 * Requires GITHUB_TOKEN environment variable with 'repo' or 'public_repo' scope
 */
export async function createGitHubIssue(
  input: CreateGitHubIssueInput,
  token: string
): Promise<CreateGitHubIssueResult> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${input.owner}/${input.repo}/issues`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: input.title,
          body: input.body,
          labels: input.labels || []
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      // Handle specific error cases
      if (response.status === 401) {
        return {
          success: false,
          error: "Invalid GitHub token. Please check your GITHUB_TOKEN configuration."
        };
      }
      
      if (response.status === 403) {
        if (errorData.message?.includes("rate limit")) {
          return {
            success: false,
            error: "GitHub API rate limit exceeded. Please try again later."
          };
        }
        return {
          success: false,
          error: "Insufficient permissions. Token needs 'public_repo' or 'repo' scope."
        };
      }
      
      if (response.status === 404) {
        return {
          success: false,
          error: `Repository ${input.owner}/${input.repo} not found or not accessible.`
        };
      }
      
      if (response.status === 410) {
        return {
          success: false,
          error: "Issues are disabled for this repository."
        };
      }

      return {
        success: false,
        error: errorData.message || `GitHub API error: ${response.status}`
      };
    }

    const data = await response.json();
    
    return {
      success: true,
      issueUrl: data.html_url,
      issueNumber: data.number
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error calling GitHub API"
    };
  }
}

/**
 * Check if a GitHub token is valid and has the required scopes
 */
export async function validateGitHubToken(token: string): Promise<{
  valid: boolean;
  scopes?: string[];
  error?: string;
}> {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json"
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { valid: false, error: "Invalid token" };
      }
      return { valid: false, error: `GitHub API error: ${response.status}` };
    }

    // Parse scopes from header (format: X-OAuth-Scopes: repo, user)
    const scopesHeader = response.headers.get("X-OAuth-Scopes") || "";
    const scopes = scopesHeader.split(",").map(s => s.trim()).filter(Boolean);
    
    const hasRequiredScope = scopes.includes("repo") || scopes.includes("public_repo");
    
    if (!hasRequiredScope) {
      return {
        valid: false,
        scopes,
        error: "Token missing required scope. Needs 'public_repo' or 'repo'."
      };
    }

    return { valid: true, scopes };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Network error"
    };
  }
}

/**
 * Get rate limit status for the GitHub API
 */
export async function getGitHubRateLimit(token: string): Promise<{
  remaining: number;
  limit: number;
  resetAt: Date;
}> {
  const response = await fetch("https://api.github.com/rate_limit", {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get rate limit: ${response.status}`);
  }

  const data = await response.json();
  const core = data.resources?.core || {};
  
  return {
    remaining: core.remaining || 0,
    limit: core.limit || 0,
    resetAt: new Date((core.reset || 0) * 1000)
  };
}
