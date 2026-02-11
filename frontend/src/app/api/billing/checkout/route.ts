import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { plans } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import stripe from "@/lib/stripe";

const checkoutSchema = z.object({
  planCodename: z.string().min(1),
  interval: z.enum(["monthly", "yearly"]),
  trialPeriodDays: z.number().int().min(0).max(14).optional()
});

export async function POST(request: Request) {
  const session = await getServerAuth();
  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { planCodename, interval, trialPeriodDays } = parsed.data;

  const [plan] = await db
    .select()
    .from(plans)
    .where(eq(plans.codename, planCodename))
    .limit(1);

  if (!plan) {
    return NextResponse.json(
      { error: "Plan not found" },
      { status: 404 }
    );
  }

  const priceId =
    interval === "monthly"
      ? plan.monthlyStripePriceId
      : plan.yearlyStripePriceId;

  if (!priceId) {
    return NextResponse.json(
      { error: "Plan has no Stripe price for this interval" },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3003";

  try {
    const sessionParams: {
      mode: "subscription";
      line_items: { price: string; quantity: number }[];
      success_url: string;
      cancel_url: string;
      customer_email?: string;
      subscription_data?: { trial_period_days?: number };
      metadata?: Record<string, string>;
    } = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/app?checkout=success`,
      cancel_url: `${appUrl}/plans`,
      customer_email: session.user.email,
      metadata: {
        userId: session.user.id,
        planId: plan.id
      }
    };

    if (trialPeriodDays && trialPeriodDays > 0) {
      sessionParams.subscription_data = {
        trial_period_days: trialPeriodDays
      };
    }

    const checkoutSession = await stripe.checkout.sessions.create(
      sessionParams as Parameters<typeof stripe.checkout.sessions.create>[0]
    );

    if (!checkoutSession.url) {
      return NextResponse.json(
        { error: "Failed to create checkout session" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
