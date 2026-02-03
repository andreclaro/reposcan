import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, users } from "@/db/schema";
import type { PlanQuotas } from "@/db/schema";

export type UserPlan = {
  id: string;
  name: string | null;
  codename: string | null;
  default: boolean | null;
  quotas: PlanQuotas | null;
};

/** Get the plan for a user; if no plan_id, return the default plan. */
export async function getUserPlan(userId: string): Promise<UserPlan | null> {
  const [userRow] = await db
    .select({ planId: users.planId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  let planId = userRow?.planId;
  if (!planId) {
    const [defaultPlan] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.default, true))
      .limit(1);
    planId = defaultPlan?.id ?? null;
  }

  if (!planId) return null;

  const [plan] = await db
    .select({
      id: plans.id,
      name: plans.name,
      codename: plans.codename,
      default: plans.default,
      quotas: plans.quotas
    })
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1);

  if (!plan) return null;
  return plan as UserPlan;
}
