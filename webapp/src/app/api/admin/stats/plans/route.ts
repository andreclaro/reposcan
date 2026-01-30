import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { plans, users } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";

export async function GET() {
  const session = await getServerAuth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const planCounts = await db
    .select({
      planId: users.planId,
      planName: plans.name,
      count: sql<number>`count(*)::int`
    })
    .from(users)
    .leftJoin(plans, sql`${users.planId} = ${plans.id}`)
    .groupBy(users.planId, plans.name);

  const data = planCounts.map((row) => ({
    name: row.planName ?? "No Plan",
    count: row.count
  }));

  return NextResponse.json({ data });
}
