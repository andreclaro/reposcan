import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/server-auth";
import { getUserGitHubToken } from "@/lib/github-token";
import { parseGitHubRepo } from "@/lib/github-url";

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
  
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const [repoResponse, branchesResponse] = await Promise.all([
      fetch(
        `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
        { headers }
      ),
      fetch(
        `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/branches?per_page=100`,
        { headers }
      ),
    ]);

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
