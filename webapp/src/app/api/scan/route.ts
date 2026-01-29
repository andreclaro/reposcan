import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { scans } from "@/db/schema";
import { DEFAULT_AUDIT_TYPES, scanRequestSchema } from "@/lib/validators";
import { getServerAuth } from "@/lib/server-auth";

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

  const { repoUrl, branch, auditTypes } = parsed.data;

  // Check for force_rescan flag (admin re-scan feature)
  const forceRescan = body?.forceRescan === true;

  const payload = {
    repo_url: repoUrl,
    branch,
    audit_types: auditTypes ?? Array.from(DEFAULT_AUDIT_TYPES),
    force_rescan: forceRescan
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
      auditTypes: payload.audit_types,
      status: scanData.status ?? "queued",
      progress: 0,
      updatedAt: new Date()
    })
    .returning();

  return NextResponse.json({ scan, service: scanData }, { status: 201 });
}
