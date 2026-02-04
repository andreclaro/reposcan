import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { outreachActivity } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";
import { createGitHubIssue, getGitHubRateLimit } from "@/lib/github-api";
import { parseGitHubRepo } from "@/lib/github-url";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerAuth();
    
    if (!session?.user?.email || !isAdmin(session.user.email)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if GitHub token is configured
    if (!GITHUB_TOKEN) {
      return NextResponse.json(
        { 
          error: "GitHub token not configured",
          fallback: "browser",
          message: "Set GITHUB_TOKEN environment variable to create issues via API, or use browser fallback"
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { scanId, title, body: issueBody, shareToken } = body;

    if (!scanId || !title) {
      return NextResponse.json(
        { error: "Missing required fields: scanId, title" },
        { status: 400 }
      );
    }

    // Get scan details
    const scan = await db.query.scans.findFirst({
      where: (table, { eq }) => eq(table.scanId, scanId)
    });

    if (!scan) {
      return NextResponse.json(
        { error: "Scan not found" },
        { status: 404 }
      );
    }

    // Parse GitHub repo
    const parsed = parseGitHubRepo(scan.repoUrl);
    if (!parsed) {
      return NextResponse.json(
        { error: "Not a valid GitHub repository" },
        { status: 400 }
      );
    }

    // Check rate limit
    try {
      const rateLimit = await getGitHubRateLimit(GITHUB_TOKEN);
      if (rateLimit.remaining < 5) {
        return NextResponse.json(
          { 
            error: "GitHub API rate limit low",
            remaining: rateLimit.remaining,
            resetAt: rateLimit.resetAt.toISOString()
          },
          { status: 429 }
        );
      }
    } catch {
      // Continue even if rate limit check fails
    }

    // Create the issue
    const result = await createGitHubIssue(
      {
        owner: parsed.owner,
        repo: parsed.repo,
        title,
        body: issueBody,
        labels: [] // Could add labels like "security", "help wanted"
      },
      GITHUB_TOKEN
    );

    if (!result.success) {
      return NextResponse.json(
        { 
          error: result.error,
          fallback: "browser"
        },
        { status: 502 }
      );
    }

    // Record outreach activity
    await db.insert(outreachActivity).values({
      scanId,
      type: "github_issue_opened",
      metadata: { 
        issueUrl: result.issueUrl!,
        issueNumber: result.issueNumber!,
        shareToken,
        api: true
      },
      createdBy: session.user.email
    });

    return NextResponse.json({
      success: true,
      issueUrl: result.issueUrl,
      issueNumber: result.issueNumber
    });
  } catch (error) {
    console.error("Error creating GitHub issue:", error);
    return NextResponse.json(
      { error: "Failed to create GitHub issue" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerAuth();
    
    if (!session?.user?.email || !isAdmin(session.user.email)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check GitHub token status
    if (!GITHUB_TOKEN) {
      return NextResponse.json({
        configured: false,
        message: "GITHUB_TOKEN not set"
      });
    }

    try {
      const rateLimit = await getGitHubRateLimit(GITHUB_TOKEN);
      return NextResponse.json({
        configured: true,
        rateLimit
      });
    } catch {
      return NextResponse.json({
        configured: true,
        rateLimit: null,
        warning: "Could not fetch rate limit"
      });
    }
  } catch (error) {
    console.error("Error checking GitHub status:", error);
    return NextResponse.json(
      { error: "Failed to check GitHub status" },
      { status: 500 }
    );
  }
}
