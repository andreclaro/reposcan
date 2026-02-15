import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/server-auth";

/**
 * POST /api/github/install
 * Redirects user to GitHub App installation page
 */
export async function POST() {
  const session = await getServerAuth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appName = process.env.GITHUB_APP_NAME || "securitykit";
  
  // Build GitHub App installation URL
  // state parameter can be used to track the user session
  const state = Buffer.from(JSON.stringify({
    userId: session.user.id,
    timestamp: Date.now()
  })).toString("base64url");

  const installUrl = `https://github.com/apps/${appName}/installations/new?state=${state}`;

  return NextResponse.json({ url: installUrl });
}

/**
 * GET /api/github/install
 * Returns current GitHub App installation status for the user
 */
export async function GET() {
  const session = await getServerAuth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { getDb } = await import("@/db");
    const { githubAppInstallations } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    
    const db = getDb();
    
    const installations = await db
      .select({
        installationId: githubAppInstallations.installationId,
        accountLogin: githubAppInstallations.accountLogin,
        accountType: githubAppInstallations.accountType,
        repositories: githubAppInstallations.repositories,
        suspended: githubAppInstallations.suspended,
        createdAt: githubAppInstallations.createdAt
      })
      .from(githubAppInstallations)
      .where(eq(githubAppInstallations.userId, session.user.id));

    return NextResponse.json({
      connected: installations.length > 0,
      installations: installations.map(inst => ({
        ...inst,
        repositoryCount: inst.repositories?.length || 0
      }))
    });
  } catch (error) {
    console.error("Error fetching GitHub App installations:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Database error: ${errorMessage}. Please run: pnpm db:migrate` },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/github/install
 * Removes GitHub App installation from our database
 * Note: User must also uninstall the app on GitHub for complete removal
 */
export async function DELETE(request: Request) {
  const session = await getServerAuth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const installationId = searchParams.get("installationId");

  if (!installationId) {
    return NextResponse.json(
      { error: "Missing installationId" },
      { status: 400 }
    );
  }

  try {
    const { getDb } = await import("@/db");
    const { githubAppInstallations } = await import("@/db/schema");
    const { eq, and } = await import("drizzle-orm");
    
    const db = getDb();

    // Verify the installation belongs to the current user
    const result = await db
      .delete(githubAppInstallations)
      .where(
        and(
          eq(githubAppInstallations.userId, session.user.id),
          eq(githubAppInstallations.installationId, parseInt(installationId))
        )
      )
      .returning({ id: githubAppInstallations.id });

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Installation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting GitHub App installation:", error);
    return NextResponse.json(
      { error: "Failed to delete installation" },
      { status: 500 }
    );
  }
}
