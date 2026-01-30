import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, users } from "@/db/schema";
import { updatePlan } from "./updatePlan";

/** Set user to default plan and clear Stripe subscription (e.g. after cancellation). */
export async function downgradeToDefaultPlan({
  userId
}: {
  userId: string;
}): Promise<void> {
  const [defaultPlan] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.default, true))
    .limit(1);

  if (!defaultPlan) {
    throw new Error("Default plan not found");
  }

  await updatePlan({ userId, newPlanId: defaultPlan.id });
  await db
    .update(users)
    .set({ stripeSubscriptionId: null, trialEndsAt: null })
    .where(eq(users.id, userId));
}
