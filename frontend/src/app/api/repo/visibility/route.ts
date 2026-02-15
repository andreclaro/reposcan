import { NextResponse } from "next/server";
import { getUserGitHubToken, isRepoPrivate } from "@/lib/github-token";
import { getServerAuth } from "@/lib/server-auth";

export async function GET(request: Request) {
  const session = await getServerAuth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const repoUrl = searchParams.get("repoUrl");

  if (!repoUrl) {
    return NextResponse.json(
      { error: "Missing repoUrl parameter" },
      { status: 400 }
    );
  }

  try {
    // Get user's GitHub token (for private repos)
    // Public repos can be checked without authentication
    const token = await getUserGitHubToken(session.user.id);

    // Check repo visibility
    const isPrivate = await isRepoPrivate(token, repoUrl);

    if (isPrivate === null) {
      return NextResponse.json(
        { error: "Could not determine repository visibility" },
        { status: 404 }
      );
    }

    return NextResponse.json({ isPrivate });
  } catch (error) {
    console.error("Error checking repo visibility:", error);
    return NextResponse.json(
      { error: "Failed to check repository visibility" },
      { status: 500 }
    );
  }
}
