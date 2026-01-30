import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { plans, scans, usageRecords, users } from "@/db/schema";
import type { PlanQuotas } from "@/db/schema";

const DEFAULT_SCANS_PER_MONTH = 5;

/** Start and end of current calendar month (UTC). */
export function getCurrentPeriod(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)
  );
  return { start, end };
}

/** Resolve scans_per_month for a user: their plan or default plan. -1 = unlimited. */
async function getScansLimitForUser(userId: string): Promise<number> {
  const [user] = await db
    .select({ planId: users.planId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  let planQuotas: PlanQuotas | null = null;
  if (user?.planId) {
    const [plan] = await db
      .select({ quotas: plans.quotas })
      .from(plans)
      .where(eq(plans.id, user.planId))
      .limit(1);
    planQuotas = plan?.quotas ?? null;
  }
  if (!planQuotas) {
    const [defaultPlan] = await db
      .select({ quotas: plans.quotas })
      .from(plans)
      .where(eq(plans.default, true))
      .limit(1);
    planQuotas = defaultPlan?.quotas ?? null;
  }

  const limit = planQuotas?.scans_per_month;
  if (limit === undefined || limit === null) return DEFAULT_SCANS_PER_MONTH;
  if (limit < 0) return -1; // unlimited
  return limit;
}

/** Count scans created in the period (only new scan creations count; cached reuse does not). */
export async function getScansUsedInPeriod(
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scans)
    .where(
      and(
        eq(scans.userId, userId),
        gte(scans.createdAt, periodStart),
        lte(scans.createdAt, periodEnd)
      )
    );
  return row?.count ?? 0;
}

/** Get or create usage record for the period; scans_limit is set from user's plan. */
export async function getOrCreateUsageForPeriod(
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<{
  id: number;
  userId: string;
  periodStart: Date;
  periodEnd: Date;
  scansUsed: number;
  scansLimit: number;
}> {
  const [existing] = await db
    .select()
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.userId, userId),
        eq(usageRecords.periodStart, periodStart)
      )
    )
    .limit(1);

  if (existing) {
    const used = await getScansUsedInPeriod(userId, periodStart, periodEnd);
    if (existing.scansUsed !== used) {
      await db
        .update(usageRecords)
        .set({ scansUsed: used, updatedAt: new Date() })
        .where(eq(usageRecords.id, existing.id));
    }
    return {
      id: existing.id,
      userId: existing.userId,
      periodStart: existing.periodStart,
      periodEnd: existing.periodEnd,
      scansUsed: used,
      scansLimit: existing.scansLimit
    };
  }

  const scansLimit = await getScansLimitForUser(userId);
  const scansUsed = await getScansUsedInPeriod(userId, periodStart, periodEnd);
  const [inserted] = await db
    .insert(usageRecords)
    .values({
      userId,
      periodStart,
      periodEnd,
      scansUsed,
      scansLimit: scansLimit < 0 ? -1 : scansLimit,
      updatedAt: new Date()
    })
    .returning();

  if (!inserted) throw new Error("Failed to create usage record");
  return {
    id: inserted.id,
    userId: inserted.userId,
    periodStart: inserted.periodStart,
    periodEnd: inserted.periodEnd,
    scansUsed: inserted.scansUsed,
    scansLimit: inserted.scansLimit
  };
}

/** Whether the user can start a new scan this period (under limit). Unlimited (-1) = true. */
export async function canUserStartScan(userId: string): Promise<boolean> {
  const { start, end } = getCurrentPeriod();
  const usage = await getOrCreateUsageForPeriod(userId, start, end);
  if (usage.scansLimit < 0) return true; // unlimited (Custom)
  return usage.scansUsed < usage.scansLimit;
}

/** Get current period usage for display (used, limit, period end). */
export async function getUsageForCurrentPeriod(userId: string): Promise<{
  scansUsed: number;
  scansLimit: number;
  periodEnd: Date;
  unlimited: boolean;
}> {
  const { start, end } = getCurrentPeriod();
  const usage = await getOrCreateUsageForPeriod(userId, start, end);
  const unlimited = usage.scansLimit < 0;
  return {
    scansUsed: usage.scansUsed,
    scansLimit: usage.scansLimit,
    periodEnd: usage.periodEnd,
    unlimited
  };
}
