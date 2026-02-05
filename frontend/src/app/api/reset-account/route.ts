import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/server-auth";
import { getDb } from "@/db";
import { accounts, users, scans, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST() {
  const session = await getServerAuth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = getDb();
  const userId = session.user.id;

  try {
    // Delete in order: sessions -> accounts -> scans -> user
    await db.delete(sessions).where(eq(sessions.userId, userId));
    await db.delete(accounts).where(eq(accounts.userId, userId));
    await db.delete(scans).where(eq(scans.userId, userId));
    await db.delete(users).where(eq(users.id, userId));

    return NextResponse.json({ 
      message: "Account completely reset. Please sign in again with GitHub."
    });
  } catch (error) {
    console.error("Failed to reset account:", error);
    return NextResponse.json({ 
      error: "Failed to reset account",
      details: String(error)
    }, { status: 500 });
  }
}
