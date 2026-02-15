import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/server-auth";
import { getUserGitHubToken } from "@/lib/github-token";
import { parseGitHubRepo } from "@/lib/github-url";

const BASE_HEADERS = {
  "Accept": "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28"
};

async function fetchRepoData(owner: string, repo: string, token: string | null) {
  const headers: Record<string, string> = { ...BASE_HEADERS };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const [repoResponse, branchesResponse] = await Promise.all([
    fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, { headers }),
  ]);

  return { repoResponse, branchesResponse };
}

export async function GET(request: Request) {
  const session = await getServerAuth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const repoUrl = searchParams.get("repoUrl");

  if (!repoUrl) {
    return NextResponse.json({ error: "Missing repoUrl" }, { status: 400 });
  }

  const parsed = parseGitHubRepo(repoUrl);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid repo URL" }, { status: 400 });
  }

  const token = await getUserGitHubToken(session.user.id);

  try {
    // First attempt: with token (if available)
    let { repoResponse, branchesResponse } = await fetchRepoData(
      parsed.owner,
      parsed.repo,
      token
    );

    // If token auth failed, retry without token (for public repos)
    const authFailed = (repoResponse.status === 401 || repoResponse.status === 403) ||
                       (branchesResponse.status === 401 || branchesResponse.status === 403);
    
    if (authFailed && token) {
      console.log(`[branches] Token auth failed for ${parsed.owner}/${parsed.repo}, retrying without token`);
      const retry = await fetchRepoData(parsed.owner, parsed.repo, null);
      repoResponse = retry.repoResponse;
      branchesResponse = retry.branchesResponse;
    }

    let defaultBranch = "";
    if (repoResponse.ok) {
      const data = await repoResponse.json();
      defaultBranch = data.default_branch || "";
    }

    let branches: string[] = [];
    if (branchesResponse.ok) {
      const data = await branchesResponse.json();
      branches = data.map((b: { name?: string }) => b.name).filter(Boolean);
    }

    return NextResponse.json({
      defaultBranch,
      branches,
      hasAccess: repoResponse.ok || branchesResponse.ok
    });

  } catch (error) {
    console.error("Failed to fetch branches:", error);
    return NextResponse.json(
      { error: "Failed to fetch repository data" },
      { status: 500 }
    );
  }
}
