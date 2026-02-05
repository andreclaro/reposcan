import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/server-auth";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET() {
  const session = await getServerAuth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const account = await db.query.accounts.findFirst({
    where: and(
      eq(accounts.userId, session.user.id),
      eq(accounts.provider, "github")
    ),
    columns: {
      scope: true,
      access_token: true,
      refresh_token: true,
      expires_at: true
    }
  });

  if (!account) {
    return NextResponse.json({ error: "No GitHub account found" }, { status: 404 });
  }

  // Check the token scopes via GitHub API
  const response = await fetch("https://api.github.com/user", {
    headers: {
      "Authorization": `Bearer ${account.access_token}`,
      "Accept": "application/vnd.github+json"
    }
  });

  const githubScopes = response.headers.get("x-oauth-scopes") || "none";
  const githubHeader = response.headers.get("x-accepted-oauth-scopes") || "none";
  
  return NextResponse.json({
    db_scope: account.scope,
    github_scopes: githubScopes,
    github_accepted_scopes: githubHeader,
    has_repo_scope: githubScopes.includes("repo"),
    token_exists: !!account.access_token,
    expires_at: account.expires_at ? new Date(account.expires_at * 1000).toISOString() : null,
    fix_instructions: "If has_repo_scope is false, go to https://github.com/settings/applications, revoke 'Security Kit Localhost', then sign out/in here."
  });
}

export async function DELETE() {
  const session = await getServerAuth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Delete the GitHub account record to force a fresh OAuth flow
  await db.delete(accounts).where(
    and(
      eq(accounts.userId, session.user.id),
      eq(accounts.provider, "github")
    )
  );

  return NextResponse.json({ 
    message: "GitHub account unlinked. Please sign out and sign back in to re-authorize with new scopes."
  });
}
