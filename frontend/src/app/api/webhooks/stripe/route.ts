import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { eq, or } from "drizzle-orm";

import { db } from "@/db";
import { plans, stripeEvents, users } from "@/db/schema";
import { downgradeToDefaultPlan } from "@/lib/plans/downgradeToDefaultPlan";
import { updatePlan } from "@/lib/plans/updatePlan";
import stripe from "@/lib/stripe";

function getStripeEventId(event: Stripe.Event): string {
  return event.id;
}

async function isEventProcessed(eventId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: stripeEvents.id })
    .from(stripeEvents)
    .where(eq(stripeEvents.stripeEventId, eventId))
    .limit(1);
  return Boolean(row);
}

async function markEventProcessed(eventId: string): Promise<void> {
  await db.insert(stripeEvents).values({ stripeEventId: eventId });
}

async function getPlanFromStripePriceId(priceId: string) {
  const [plan] = await db
    .select()
    .from(plans)
    .where(
      or(
        eq(plans.monthlyStripePriceId, priceId),
        eq(plans.yearlyStripePriceId, priceId)
      )
    )
    .limit(1);
  return plan ?? null;
}

async function getUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return user ?? null;
}

async function getStripeCustomer(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer
): Promise<Stripe.Customer | null> {
  if (typeof customer === "string") {
    const response = await stripe.customers.retrieve(customer);
    if (response.deleted) return null;
    return response as Stripe.Customer;
  }
  if (customer.deleted) return null;
  return customer as Stripe.Customer;
}

class StripeWebhookHandler {
  private data: Stripe.Event["data"];
  private eventType: string;

  constructor(data: Stripe.Event["data"], eventType: string) {
    this.data = data;
    this.eventType = eventType;
  }

  async onCustomerCreated() {
    const object = this.data.object as Stripe.Customer;
    if (!object.email) return;
    const user = await getUserByEmail(object.email);
    if (!user) return;
    await db
      .update(users)
      .set({ stripeCustomerId: object.id })
      .where(eq(users.id, user.id));
  }

  async onCheckoutSessionCompleted() {
    const object = this.data.object as Stripe.Checkout.Session;
    if (object.payment_status !== "paid") return;
    if (object.mode === "subscription") return; // subscription events handle it

    const customer = await getStripeCustomer(object.customer as string);
    if (!customer?.email) return;
    const user = await getUserByEmail(customer.email);
    if (!user) return;

    await db
      .update(users)
      .set({ stripeCustomerId: customer.id })
      .where(eq(users.id, user.id));

    const lineItems = await stripe.checkout.sessions.listLineItems(object.id);
    const firstItem = lineItems.data[0];
    if (!firstItem?.price?.id) return;

    const plan = await getPlanFromStripePriceId(firstItem.price.id);
    if (!plan) return;
    await updatePlan({ userId: user.id, newPlanId: plan.id });
  }

  async onSubscriptionCreated() {
    const object = this.data.object as Stripe.Subscription;
    const price = object.items.data[0]?.price;
    if (!price?.id) return;

    const customer = await getStripeCustomer(object.customer);
    if (!customer?.email) return;
    const user = await getUserByEmail(customer.email);
    if (!user) return;

    const plan = await getPlanFromStripePriceId(price.id);
    if (!plan) return;

    const trialEnd = object.trial_end
      ? new Date(object.trial_end * 1000)
      : null;

    await db
      .update(users)
      .set({
        stripeCustomerId: customer.id,
        stripeSubscriptionId: object.id,
        trialEndsAt: trialEnd
      })
      .where(eq(users.id, user.id));
    await updatePlan({ userId: user.id, newPlanId: plan.id });
  }

  async onSubscriptionUpdated() {
    const object = this.data.object as Stripe.Subscription;
    const [userRow] = await db
      .select()
      .from(users)
      .where(eq(users.stripeSubscriptionId, object.id))
      .limit(1);
    if (!userRow) return;

    const price = object.items.data[0]?.price;
    if (!price?.id) return;

    const isActive =
      object.status === "active" || object.status === "trialing";
    if (!isActive) {
      await downgradeToDefaultPlan({ userId: userRow.id });
      return;
    }

    const plan = await getPlanFromStripePriceId(price.id);
    if (!plan) return;

    const trialEnd = object.trial_end
      ? new Date(object.trial_end * 1000)
      : null;

    await db
      .update(users)
      .set({ trialEndsAt: trialEnd })
      .where(eq(users.id, userRow.id));
    await updatePlan({ userId: userRow.id, newPlanId: plan.id });
  }

  async onSubscriptionDeleted() {
    const object = this.data.object as Stripe.Subscription;
    const [userRow] = await db
      .select()
      .from(users)
      .where(eq(users.stripeSubscriptionId, object.id))
      .limit(1);
    if (!userRow) return;
    await downgradeToDefaultPlan({ userId: userRow.id });
  }

  async onInvoicePaid() {
    const object = this.data.object as Stripe.Invoice & { subscription?: string | null };
    if (!object.customer_email) return;
    if (object.subscription) return; // subscription events handle it

    const line = object.lines?.data?.[0] as { price?: { id?: string } } | undefined;
    const priceId = line?.price?.id;
    if (!priceId) return;

    const plan = await getPlanFromStripePriceId(priceId);
    if (!plan) return;

    const user = await getUserByEmail(object.customer_email);
    if (!user) return;
    await updatePlan({ userId: user.id, newPlanId: plan.id });
  }
}

export async function POST(req: NextRequest) {
  if (req.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event: Stripe.Event;

  try {
    // Require webhook secret to be configured
    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET must be configured");
    }

    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");

    // Require signature header to be present
    if (!signature) {
      return NextResponse.json(
        { received: false, error: "Missing stripe-signature header" },
        { status: 400 }
      );
    }

    // Always verify the webhook signature
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed", err);
    return NextResponse.json(
      { received: false, error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }

  const eventId = getStripeEventId(event);
  if (await isEventProcessed(eventId)) {
    return NextResponse.json({ received: true });
  }

  const handler = new StripeWebhookHandler(event.data, event.type);

  try {
    switch (event.type) {
      case "customer.created":
        await handler.onCustomerCreated();
        break;
      case "checkout.session.completed":
        await handler.onCheckoutSessionCompleted();
        break;
      case "customer.subscription.created":
        await handler.onSubscriptionCreated();
        break;
      case "customer.subscription.updated":
        await handler.onSubscriptionUpdated();
        break;
      case "customer.subscription.deleted":
        await handler.onSubscriptionDeleted();
        break;
      case "invoice.paid":
        await handler.onInvoicePaid();
        break;
      default:
        break;
    }
    await markEventProcessed(eventId);
  } catch (err) {
    console.error("Stripe webhook handler error", event.type, err);
    return NextResponse.json(
      { received: true, error: "Handler failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}

export const maxDuration = 20;
