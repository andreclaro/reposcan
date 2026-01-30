import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { plans, usageRecords, users } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";
import { getUsageForCurrentPeriod } from "@/lib/usage";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getServerAuth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      planId: users.planId,
      stripeCustomerId: users.stripeCustomerId,
      stripeSubscriptionId: users.stripeSubscriptionId,
      trialEndsAt: users.trialEndsAt,
      createdAt: users.createdAt
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [plan] = user.planId
    ? await db
        .select()
        .from(plans)
        .where(eq(plans.id, user.planId))
        .limit(1)
    : [null];

  const usage = await getUsageForCurrentPeriod(id);

  return NextResponse.json({
    ...user,
    createdAt: user.createdAt?.toISOString() ?? null,
    trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
    plan: plan ?? null,
    usage: {
      scansUsed: usage.scansUsed,
      scansLimit: usage.unlimited ? -1 : usage.scansLimit,
      periodEnd: usage.periodEnd?.toISOString() ?? null
    }
  });
}
