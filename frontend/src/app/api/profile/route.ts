import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";

export async function GET() {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      createdAt: users.createdAt,
      planId: users.planId,
      stripeCustomerId: users.stripeCustomerId,
      stripeSubscriptionId: users.stripeSubscriptionId
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...user,
    createdAt: user.createdAt?.toISOString() ?? null
  });
}

export async function PATCH(request: Request) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate name
  if (body.name !== undefined) {
    const trimmedName = body.name.trim();
    if (trimmedName.length > 100) {
      return NextResponse.json(
        { error: "Name must be 100 characters or less" },
        { status: 400 }
      );
    }
  }

  const [updatedUser] = await db
    .update(users)
    .set({
      name: body.name?.trim() || null
    })
    .where(eq(users.id, session.user.id))
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image
    });

  if (!updatedUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ user: updatedUser });
}

export async function DELETE() {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Prevent admins from deleting their own account through this endpoint
  if (session.user.email && isAdmin(session.user.email)) {
    return NextResponse.json(
      { error: "Admins cannot delete their own account through this endpoint" },
      { status: 403 }
    );
  }

  // Check if user exists
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!existingUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Delete user (cascades to scans, findings, accounts, sessions via FK constraints)
  await db.delete(users).where(eq(users.id, session.user.id));

  return NextResponse.json({ success: true });
}
