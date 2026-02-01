import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, users } from "@/db/schema";

export async function updatePlan({
  userId,
  newPlanId,
  scansPerMonthOverride
}: {
  userId: string;
  newPlanId?: string;
  /** Per-customer scan limit for Custom plan. -1 = unlimited. Cleared when switching to non-Custom. */
  scansPerMonthOverride?: number | null;
}): Promise<void> {
  const updates: Partial<typeof users.$inferInsert> = {};

  if (newPlanId !== undefined) {
    updates.planId = newPlanId;
    const [plan] = await db
      .select({ codename: plans.codename })
      .from(plans)
      .where(eq(plans.id, newPlanId))
      .limit(1);
    if (plan?.codename !== "custom") {
      updates.scansPerMonthOverride = null;
    }
  }

  if (scansPerMonthOverride !== undefined) {
    updates.scansPerMonthOverride = scansPerMonthOverride;
  }

  if (Object.keys(updates).length === 0) return;
  await db.update(users).set(updates).where(eq(users.id, userId));
}
