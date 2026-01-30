import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import stripe from "@/lib/stripe";

export async function POST() {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No billing account found" },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${appUrl}/app`
    });

    if (!portalSession.url) {
      return NextResponse.json(
        { error: "Failed to create portal session" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    console.error("Stripe portal error:", err);
    return NextResponse.json(
      { error: "Failed to open billing portal" },
      { status: 500 }
    );
  }
}
