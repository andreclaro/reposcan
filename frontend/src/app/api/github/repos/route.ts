import { NextResponse } from "next/server";

import { getServerAuth } from "@/lib/server-auth";
import { getUserGitHubToken } from "@/lib/github-token";

/**
 * GET /api/github/repos?owner=username
 * Fetches all public repositories for a GitHub user or organization.
 * Uses the authenticated user's GitHub OAuth token for higher rate limits.
 */
export async function GET(request: Request) {
  const session = await getServerAuth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");

  if (!owner) {
    return NextResponse.json(
      { error: "Missing 'owner' query parameter" },
      { status: 400 }
    );
  }

  // Validate owner format
  if (!/^[a-zA-Z0-9._-]+$/.test(owner)) {
    return NextResponse.json(
      { error: "Invalid owner format" },
      { status: 400 }
    );
  }

  try {
    // Try to get user's GitHub token first (5000 requests/hour per user)
    // Fall back to server token if available (5000 requests/hour shared)
    // Otherwise unauthenticated (60 requests/hour)
    let token = await getUserGitHubToken(session.user.id);
    if (!token) {
      token = process.env.GITHUB_TOKEN || null;
    }

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "reposcan-frontend"
    };
    
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const repositories: Array<{
      url: string;
      name: string;
      stars: number;
    }> = [];
    let page = 1;
    const perPage = 100;
    let hasMore = true;

    // Fetch all pages of public repositories
    // Use longer cache for unauthenticated requests, shorter for authenticated
    const cacheTime = token ? 300 : 600; // 5 min with token, 10 min without
    
    // Retry helper function
    const fetchWithRetry = async (url: string, retries = 3): Promise<Response> => {
      for (let i = 0; i < retries; i++) {
        const response = await fetch(url, {
          headers,
          next: { revalidate: cacheTime }
        });

        // Retry on 429 (rate limit) or 502/503 (server errors) with exponential backoff
        if (response.status === 429 || response.status === 502 || response.status === 503) {
          if (i < retries - 1) {
            const delay = Math.min(1000 * Math.pow(2, i), 10000); // Max 10 seconds
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        return response;
      }
      throw new Error("Max retries exceeded");
    };
    
    while (hasMore) {
      const url = `https://api.github.com/users/${encodeURIComponent(owner)}/repos?type=all&sort=updated&direction=desc&page=${page}&per_page=${perPage}`;
      
      const response = await fetchWithRetry(url);

      if (!response.ok) {
        if (response.status === 404) {
          return NextResponse.json(
            { error: `User or organization '${owner}' not found` },
            { status: 404 }
          );
        }
        
        if (response.status === 403) {
          const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
          const rateLimitReset = response.headers.get("x-ratelimit-reset");
          
          if (rateLimitRemaining === "0") {
            // Calculate reset time
            let resetMessage = "Please try again later.";
            if (rateLimitReset) {
              const resetTime = new Date(parseInt(rateLimitReset) * 1000);
              const now = new Date();
              const minutesUntilReset = Math.ceil((resetTime.getTime() - now.getTime()) / 60000);
              resetMessage = `Rate limit resets in approximately ${minutesUntilReset} minute${minutesUntilReset !== 1 ? "s" : ""}.`;
            }
            
            // Check if user has GitHub OAuth token
            const userHasToken = await getUserGitHubToken(session.user.id);
            const hasServerToken = !!process.env.GITHUB_TOKEN;
            
            let suggestion = "";
            if (!userHasToken && !hasServerToken) {
              suggestion = " Sign in with GitHub to get higher rate limits (5000 requests/hour).";
            } else if (!userHasToken) {
              suggestion = " Your GitHub OAuth token may have expired. Please sign out and sign in again.";
            }
            
            return NextResponse.json(
              { 
                error: `GitHub API rate limit exceeded. ${resetMessage}${suggestion}`,
                rateLimitReset: rateLimitReset ? parseInt(rateLimitReset) : null
              },
              { status: 429 }
            );
          }
        }
        
        const errorText = await response.text();
        return NextResponse.json(
          { error: `GitHub API error: ${response.status} ${errorText}` },
          { status: response.status }
        );
      }

      const data = await response.json();
      
      // Filter to only public repositories
      const publicRepos = data
        .filter((repo: any) => !repo.private)
        .map((repo: any) => ({
          url: repo.html_url,
          name: repo.full_name,
          stars: repo.stargazers_count || 0
        }));

      repositories.push(...publicRepos);

      // Check if there are more pages
      const linkHeader = response.headers.get("link");
      hasMore = linkHeader?.includes('rel="next"') ?? false;
      page++;

      // Safety limit: don't fetch more than 1000 repos
      if (repositories.length >= 1000) {
        hasMore = false;
      }
    }

    return NextResponse.json({
      repositories,
      count: repositories.length,
      owner
    });
  } catch (error) {
    console.error("Error fetching GitHub repositories:", error);
    return NextResponse.json(
      { error: "Failed to fetch repositories" },
      { status: 500 }
    );
  }
}
