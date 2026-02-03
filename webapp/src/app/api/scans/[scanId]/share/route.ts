import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { scans, scanShares } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";

// Generate a random token for sharing
function generateShareToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

type RouteParams = { params: Promise<{ scanId: string }> };

// GET - List all shares for a scan
export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { scanId } = await params;

  // Verify scan ownership
  const scan = await db
    .select({ id: scans.id })
    .from(scans)
    .where(and(eq(scans.scanId, scanId), eq(scans.userId, session.user.id)))
    .limit(1);

  if (scan.length === 0) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const shares = await db
    .select({
      id: scanShares.id,
      token: scanShares.token,
      shareType: scanShares.shareType,
      expiresAt: scanShares.expiresAt,
      createdAt: scanShares.createdAt
    })
    .from(scanShares)
    .where(eq(scanShares.scanId, scanId))
    .orderBy(scanShares.createdAt);

  return NextResponse.json({
    shares: shares.map((s) => ({
      ...s,
      expiresAt: s.expiresAt?.toISOString() ?? null,
      createdAt: s.createdAt?.toISOString() ?? null
    }))
  });
}

// POST - Create a new share
export async function POST(request: Request, { params }: RouteParams) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { scanId } = await params;

  // Verify scan ownership
  const scan = await db
    .select({ id: scans.id, status: scans.status })
    .from(scans)
    .where(and(eq(scans.scanId, scanId), eq(scans.userId, session.user.id)))
    .limit(1);

  if (scan.length === 0) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  if (scan[0].status !== "completed") {
    return NextResponse.json(
      { error: "Can only share completed scans" },
      { status: 400 }
    );
  }

  let body: { shareType?: string; expiresInDays?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const shareType = body.shareType === "summary" ? "summary" : "full";
  const expiresInDays = body.expiresInDays ?? null;

  // Calculate expiration date if provided
  let expiresAt: Date | null = null;
  if (expiresInDays && expiresInDays > 0) {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  }

  // Generate unique token
  const token = generateShareToken();

  const [share] = await db
    .insert(scanShares)
    .values({
      scanId,
      token,
      shareType,
      expiresAt,
      createdBy: session.user.id
    })
    .returning({
      id: scanShares.id,
      token: scanShares.token,
      shareType: scanShares.shareType,
      expiresAt: scanShares.expiresAt,
      createdAt: scanShares.createdAt
    });

  return NextResponse.json({
    share: {
      ...share,
      expiresAt: share.expiresAt?.toISOString() ?? null,
      createdAt: share.createdAt?.toISOString() ?? null
    }
  });
}
