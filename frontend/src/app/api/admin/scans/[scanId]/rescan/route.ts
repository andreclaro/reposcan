import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { scans } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";

type RouteParams = { params: Promise<{ scanId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const session = await getServerAuth();

  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { scanId } = await params;

  // Get the original scan to copy its config
  const [originalScan] = await db
    .select({
      repoUrl: scans.repoUrl,
      branch: scans.branch,
      auditTypes: scans.auditTypes,
      userId: scans.userId
    })
    .from(scans)
    .where(eq(scans.scanId, scanId))
    .limit(1);

  if (!originalScan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  // Create a new scan request with force_rescan flag
  const payload = {
    repo_url: originalScan.repoUrl,
    branch: originalScan.branch,
    audit_types: originalScan.auditTypes ?? ["sast", "dockerfile", "terraform", "node", "go", "rust"],
    force_rescan: true
  };

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
  } catch {
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
  };

  const newScanId = scanData.scan_id ?? scanData.scanId;

  if (!newScanId) {
    return NextResponse.json(
      { error: "Scan service response missing scan_id" },
      { status: 502 }
    );
  }

  // Create new scan record (use original user's ID to preserve ownership)
  const [newScan] = await db
    .insert(scans)
    .values({
      scanId: newScanId,
      userId: originalScan.userId,
      repoUrl: originalScan.repoUrl,
      branch: originalScan.branch,
      auditTypes: payload.audit_types,
      status: scanData.status ?? "queued",
      progress: 0,
      updatedAt: new Date()
    })
    .returning();

  return NextResponse.json({
    scan: {
      ...newScan,
      userEmail: null, // Will be populated on refresh
      createdAt: newScan.createdAt?.toISOString() ?? null,
      updatedAt: newScan.updatedAt?.toISOString() ?? null
    },
    originalScanId: scanId,
    service: scanData
  }, { status: 201 });
}
