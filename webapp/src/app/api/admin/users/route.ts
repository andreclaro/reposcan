import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { plans, usageRecords, users } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";
import { getCurrentPeriod } from "@/lib/usage";

export async function GET() {
  const session = await getServerAuth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { start } = getCurrentPeriod();

  const list = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      planId: users.planId,
      stripeCustomerId: users.stripeCustomerId,
      stripeSubscriptionId: users.stripeSubscriptionId,
      trialEndsAt: users.trialEndsAt,
      createdAt: users.createdAt,
      planName: plans.name,
      planCodename: plans.codename
    })
    .from(users)
    .leftJoin(plans, eq(users.planId, plans.id))
    .orderBy(desc(users.createdAt));

  const userIds = list.map((u) => u.id);
  const usageList =
    userIds.length > 0
      ? await db
          .select({
            userId: usageRecords.userId,
            scansUsed: usageRecords.scansUsed,
            scansLimit: usageRecords.scansLimit
          })
          .from(usageRecords)
          .where(
            and(
              inArray(usageRecords.userId, userIds),
              eq(usageRecords.periodStart, start)
            )
          )
      : [];

  const usageByUser = Object.fromEntries(
    usageList.map((u) => [u.userId, { scansUsed: u.scansUsed, scansLimit: u.scansLimit }])
  );

  const result = list.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    planId: u.planId,
    planName: u.planName,
    planCodename: u.planCodename,
    stripeCustomerId: u.stripeCustomerId,
    stripeSubscriptionId: u.stripeSubscriptionId,
    trialEndsAt: u.trialEndsAt?.toISOString() ?? null,
    createdAt: u.createdAt?.toISOString() ?? null,
    usage: usageByUser[u.id] ?? { scansUsed: 0, scansLimit: 5 }
  }));

  return NextResponse.json({ users: result });
}
