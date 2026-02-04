import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { outreachActivity } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerAuth();
    
    if (!session?.user?.email || !isAdmin(session.user.email)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { scanId, type, metadata } = body;

    if (!scanId || !type) {
      return NextResponse.json(
        { error: "Missing required fields: scanId, type" },
        { status: 400 }
      );
    }

    // Record the outreach activity
    await db.insert(outreachActivity).values({
      scanId,
      type,
      metadata: metadata || {},
      createdBy: session.user.email
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error recording outreach:", error);
    return NextResponse.json(
      { error: "Failed to record outreach activity" },
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

    const { searchParams } = new URL(request.url);
    const scanId = searchParams.get("scanId");

    if (!scanId) {
      return NextResponse.json(
        { error: "Missing scanId parameter" },
        { status: 400 }
      );
    }

    // Get outreach activity for a scan
    const activities = await db.query.outreachActivity.findMany({
      where: (table, { eq }) => eq(table.scanId, scanId),
      orderBy: (table, { desc }) => [desc(table.createdAt)]
    });

    return NextResponse.json({ activities });
  } catch (error) {
    console.error("Error fetching outreach:", error);
    return NextResponse.json(
      { error: "Failed to fetch outreach activity" },
      { status: 500 }
    );
  }
}
