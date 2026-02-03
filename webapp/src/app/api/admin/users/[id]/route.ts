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
      createdAt: users.createdAt,
      isEnabled: users.isEnabled
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

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await getServerAuth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;

  // Parse request body
  let body: { isEnabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate input
  if (typeof body.isEnabled !== "boolean") {
    return NextResponse.json(
      { error: "isEnabled must be a boolean" },
      { status: 400 }
    );
  }

  // Check if user exists
  const [existingUser] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!existingUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Prevent disabling your own admin account
  if (existingUser.email === session.user.email && !body.isEnabled) {
    return NextResponse.json(
      { error: "Cannot disable your own account" },
      { status: 400 }
    );
  }

  // Update user
  const [updatedUser] = await db
    .update(users)
    .set({ isEnabled: body.isEnabled })
    .where(eq(users.id, id))
    .returning({
      id: users.id,
      email: users.email,
      isEnabled: users.isEnabled
    });

  return NextResponse.json({ user: updatedUser });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await getServerAuth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;

  // Check if user exists
  const [existingUser] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!existingUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Prevent admins from deleting their own account
  if (existingUser.email === session.user.email) {
    return NextResponse.json(
      { error: "Cannot delete your own account" },
      { status: 400 }
    );
  }

  // Delete user (cascades to scans, findings, accounts, sessions via FK constraints)
  await db.delete(users).where(eq(users.id, id));

  return NextResponse.json({ success: true });
}
