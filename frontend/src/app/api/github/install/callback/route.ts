import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/server-auth";
import { generateAppJWT } from "@/lib/github-app";

/**
 * GET /api/github/install/callback
 * Handles GitHub App installation callback
 * 
 * Query parameters:
 * - installation_id: The installation ID
 * - setup_action: install, update, or uninstall
 * - state: Optional state parameter we sent
 */
export async function GET(request: NextRequest) {
  const session = await getServerAuth();

  if (!session?.user?.id) {
    // Redirect to login with error
    return NextResponse.redirect(
      new URL("/login?error=Authentication required", request.url)
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const installationId = searchParams.get("installation_id");
  const setupAction = searchParams.get("setup_action");

  // Handle different setup actions
  if (setupAction === "install" || setupAction === "update") {
    if (!installationId) {
      return NextResponse.redirect(
        new URL("/app/profile?error=Missing installation ID", request.url)
      );
    }

    try {
      // Verify the installation with GitHub API
      const installation = await verifyInstallation(parseInt(installationId));
      
      if (!installation) {
        return NextResponse.redirect(
          new URL("/app/profile?error=Invalid installation", request.url)
        );
      }

      // Store installation in database
      await storeInstallation({
        userId: session.user.id,
        installationId: parseInt(installationId),
        accountLogin: installation.account.login,
        accountType: installation.account.type,
        accountId: installation.account.id,
        repositories: installation.repositories || []
      });

      // Redirect to profile with success
      return NextResponse.redirect(
        new URL("/app/profile?github=connected", request.url)
      );
    } catch (error) {
      console.error("Error handling GitHub App installation:", error);
      return NextResponse.redirect(
        new URL("/app/profile?error=Installation failed", request.url)
      );
    }
  }

  // For uninstall or other actions, just redirect to profile
  return NextResponse.redirect(new URL("/app/profile", request.url));
}

/**
 * Verify installation with GitHub API
 */
async function verifyInstallation(installationId: number) {
  try {
    // Generate JWT for GitHub App authentication
    const jwt = await generateAppJWT();
    
    if (!jwt) {
      throw new Error("Failed to generate GitHub App JWT");
    }

    // Fetch installation details
    const response = await fetch(
      `https://api.github.com/app/installations/${installationId}`,
      {
        headers: {
          "Authorization": `Bearer ${jwt}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      }
    );

    if (!response.ok) {
      console.error("GitHub API error:", await response.text());
      return null;
    }

    const installation = await response.json();

    // Fetch repositories for this installation
    const reposResponse = await fetch(
      `https://api.github.com/installations/${installationId}/repositories`,
      {
        headers: {
          "Authorization": `Bearer ${jwt}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      }
    );

    let repositories: string[] = [];
    if (reposResponse.ok) {
      const reposData = await reposResponse.json();
      repositories = reposData.repositories.map((repo: any) => repo.full_name);
    }

    return {
      id: installation.id,
      account: {
        login: installation.account.login,
        type: installation.account.type,
        id: installation.account.id
      },
      repositories
    };
  } catch (error) {
    console.error("Error verifying installation:", error);
    return null;
  }
}

/**
 * Store installation in database
 */
async function storeInstallation(data: {
  userId: string;
  installationId: number;
  accountLogin: string;
  accountType: string;
  accountId: number;
  repositories: string[];
}) {
  const { getDb } = await import("@/db");
  const { githubAppInstallations } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  
  const db = getDb();

  // Check if installation already exists
  const existing = await db
    .select({ id: githubAppInstallations.id })
    .from(githubAppInstallations)
    .where(eq(githubAppInstallations.installationId, data.installationId))
    .limit(1);

  if (existing.length > 0) {
    // Update existing installation
    await db
      .update(githubAppInstallations)
      .set({
        repositories: data.repositories,
        suspended: false,
        updatedAt: new Date()
      })
      .where(eq(githubAppInstallations.installationId, data.installationId));
  } else {
    // Insert new installation
    await db.insert(githubAppInstallations).values({
      userId: data.userId,
      installationId: data.installationId,
      accountLogin: data.accountLogin,
      accountType: data.accountType,
      accountId: data.accountId,
      repositories: data.repositories,
      suspended: false
    });
  }
}
