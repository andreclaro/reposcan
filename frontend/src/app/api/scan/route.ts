import { NextResponse } from "next/server";
import { and, desc, eq, like, or } from "drizzle-orm";

import { db } from "@/db";
import { scans } from "@/db/schema";
import {
  getCommitShaForBranch,
  normalizeRepoUrl
} from "@/lib/github";
import { parseGitHubRepo } from "@/lib/github-url";
import { canUserStartScan, getUsageForCurrentPeriod } from "@/lib/usage";
import { DEFAULT_AUDIT_TYPES, scanRequestSchema } from "@/lib/validators";
import { getServerAuth } from "@/lib/server-auth";
import { getUserGitHubToken, verifyRepoAccess } from "@/lib/github-token";
import { encryptTokenForWorker } from "@/lib/token-ephemeral";

export async function POST(request: Request) {
  const session = await getServerAuth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = scanRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const {
    repoUrl: rawRepoUrl,
    branch,
    auditTypes,
    forceRescan = false,
    commitHash: requestCommitHash,
    isPrivate = false
  } = parsed.data;

  // Normalize full URL or org/repo to canonical GitHub URL for backend and DB
  const repoUrl = normalizeRepoUrl(rawRepoUrl);
  if (!repoUrl) {
    return NextResponse.json(
      { error: "Invalid repository: enter a valid GitHub URL or owner/repo" },
      { status: 400 }
    );
  }

  // Handle private repository authentication
  let encryptedToken: string | undefined;

  if (isPrivate) {
    // Get user's GitHub token from their OAuth session
    const token = await getUserGitHubToken(session.user.id);
    
    if (!token) {
      return NextResponse.json(
        { 
          error: "GitHub authentication required for private repositories",
          code: "GITHUB_AUTH_REQUIRED"
        },
        { status: 403 }
      );
    }

    // Verify the user actually has access to this repository
    const hasAccess = await verifyRepoAccess(token, repoUrl);
    
    if (!hasAccess) {
      return NextResponse.json(
        { 
          error: "You do not have access to this private repository",
          code: "REPO_ACCESS_DENIED"
        },
        { status: 403 }
      );
    }

    // Encrypt the token for the worker (ephemeral - never stored in DB)
    try {
      encryptedToken = encryptTokenForWorker(token);
    } catch (error) {
      console.error("Failed to encrypt token:", error);
      return NextResponse.json(
        { error: "Failed to prepare authentication token" },
        { status: 500 }
      );
    }
  }

  const payload: Record<string, unknown> = {
    repo_url: repoUrl,
    branch,
    audit_types: auditTypes ?? Array.from(DEFAULT_AUDIT_TYPES),
    force_rescan: forceRescan,
    is_private: isPrivate
  };

  // Add encrypted token for private repos (ephemeral, travels through queue only)
  if (encryptedToken) {
    payload.encrypted_token = encryptedToken;
  }

  // Before queuing: check for existing completed scan (same repo + commit)
  if (!forceRescan) {
    const normalizedUrl = repoUrl;
    if (normalizedUrl) {
      const commitHash =
        requestCommitHash &&
        /^[0-9a-fA-F]{7,40}$/.test(requestCommitHash.trim())
          ? requestCommitHash.trim()
          : null;

      const resolvedCommit =
        commitHash ??
        (await (async () => {
          const repo = parseGitHubRepo(repoUrl);
          if (!repo) return null;
          return getCommitShaForBranch(repo.owner, repo.repo, branch ?? undefined);
        })());

      if (resolvedCommit) {
        const repoUrlVariants = [
          normalizedUrl,
          `${normalizedUrl}.git`
        ] as const;
        // Match exact commit or short SHA prefix (worker stores full 40-char SHA)
        const commitMatch =
          resolvedCommit.length >= 40
            ? eq(scans.commitHash, resolvedCommit)
            : or(
                eq(scans.commitHash, resolvedCommit),
                like(scans.commitHash, `${resolvedCommit}%`)
              );
        const [existingScan] = await db
          .select()
          .from(scans)
          .where(
            and(
              eq(scans.status, "completed"),
              commitMatch,
              eq(scans.userId, session.user.id),
              or(
                eq(scans.repoUrl, repoUrlVariants[0]),
                eq(scans.repoUrl, repoUrlVariants[1])
              )
            )
          )
          .orderBy(desc(scans.createdAt))
          .limit(1);

        if (existingScan) {
          return NextResponse.json(
            { scan: existingScan, cached: true },
            { status: 200 }
          );
        }
      }
    }
  }

  // Enforce monthly scan limit (only new scan creations count)
  const allowed = await canUserStartScan(session.user.id);
  if (!allowed) {
    const usage = await getUsageForCurrentPeriod(session.user.id);
    const appUrl =
      process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
    const upgradeUrl = appUrl ? `${appUrl}/plans` : "/plans";
    return NextResponse.json(
      {
        error:
          "Monthly scan limit reached. Upgrade your plan to run more scans.",
        code: "SCAN_LIMIT_REACHED",
        upgradeUrl,
        limit: usage.scansLimit,
        used: usage.scansUsed,
        periodEnd: usage.periodEnd?.toISOString()
      },
      { status: 403 }
    );
  }

  const fastApiBase = process.env.FASTAPI_BASE_URL ?? "http://localhost:8000";

  let scanResponse: Response;

  try {
    scanResponse = await fetch(`${fastApiBase}/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to reach scan service" },
      { status: 502 }
    );
  }

  if (!scanResponse.ok) {
    const errorText = await scanResponse.text();
    return NextResponse.json(
      { error: "Scan service error", details: errorText },
      { status: 502 }
    );
  }

  const scanData = (await scanResponse.json()) as {
    scan_id?: string;
    scanId?: string;
    status?: string;
    cached?: boolean;
    cached_scan_id?: string;
  };

  // If we got a cached result, return the existing scan
  if (scanData.cached && scanData.cached_scan_id) {
    const [cachedScan] = await db
      .select()
      .from(scans)
      .where(eq(scans.scanId, scanData.cached_scan_id))
      .limit(1);

    if (cachedScan) {
      return NextResponse.json({
        scan: cachedScan,
        cached: true,
        service: scanData
      }, { status: 200 });
    }
  }

  const scanId = scanData.scan_id ?? scanData.scanId;

  if (!scanId) {
    return NextResponse.json(
      { error: "Scan service response missing scan_id" },
      { status: 502 }
    );
  }

  const [scan] = await db
    .insert(scans)
    .values({
      scanId,
      userId: session.user.id,
      repoUrl,
      branch,
      auditTypes: auditTypes ?? Array.from(DEFAULT_AUDIT_TYPES),
      status: scanData.status ?? "queued",
      progress: 0,
      updatedAt: new Date()
    })
    .returning();

  return NextResponse.json({ scan, service: scanData }, { status: 201 });
}
