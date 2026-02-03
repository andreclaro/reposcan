import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { scans, scanShares } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";

type RouteParams = {
  params: Promise<{ scanId: string; shareId: string }>;
};

// DELETE - Revoke a share
export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { scanId, shareId } = await params;

  // Verify scan ownership
  const scan = await db
    .select({ id: scans.id })
    .from(scans)
    .where(and(eq(scans.scanId, scanId), eq(scans.userId, session.user.id)))
    .limit(1);

  if (scan.length === 0) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  // Delete the share
  await db
    .delete(scanShares)
    .where(and(eq(scanShares.id, shareId), eq(scanShares.scanId, scanId)));

  return NextResponse.json({ success: true });
}
