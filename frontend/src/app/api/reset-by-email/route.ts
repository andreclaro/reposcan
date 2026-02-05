import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { accounts, users, scans, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const db = getDb();

    // Find user by email
    const user = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
      columns: { id: true }
    });

    if (!user) {
      // Don't reveal if email exists
      return NextResponse.json({ 
        message: "If an account exists with that email, it has been reset." 
      });
    }

    const userId = user.id;

    // Delete everything
    await db.delete(sessions).where(eq(sessions.userId, userId));
    await db.delete(accounts).where(eq(accounts.userId, userId));
    await db.delete(scans).where(eq(scans.userId, userId));
    await db.delete(users).where(eq(users.id, userId));

    return NextResponse.json({ 
      message: "Account reset successfully. You can now sign in with GitHub." 
    });

  } catch (error) {
    console.error("Reset failed:", error);
    return NextResponse.json({ 
      error: "Reset failed" 
    }, { status: 500 });
  }
}
