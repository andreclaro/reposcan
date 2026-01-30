import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { plans } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getServerAuth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const [plan] = await db
    .select()
    .from(plans)
    .where(eq(plans.id, id))
    .limit(1);

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }
  return NextResponse.json(plan);
}
