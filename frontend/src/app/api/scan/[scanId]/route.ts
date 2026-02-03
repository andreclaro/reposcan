import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { scans } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const { scanId } = await params;
  const session = await getServerAuth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [deleted] = await db
    .delete(scans)
    .where(and(eq(scans.scanId, scanId), eq(scans.userId, session.user.id)))
    .returning({ scanId: scans.scanId });

  if (!deleted) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  return NextResponse.json({ status: "deleted" }, { status: 200 });
}
