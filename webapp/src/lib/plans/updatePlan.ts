import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function updatePlan({
  userId,
  newPlanId
}: {
  userId: string;
  newPlanId: string;
}): Promise<void> {
  await db.update(users).set({ planId: newPlanId }).where(eq(users.id, userId));
}
