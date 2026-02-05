import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";

import { db } from "@/db";
import { plans } from "@/db/schema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const list = await db
    .select({
      id: plans.id,
      name: plans.name,
      codename: plans.codename,
      default: plans.default,
      monthlyPrice: plans.monthlyPrice,
      yearlyPrice: plans.yearlyPrice,
      quotas: plans.quotas,
      trialDays: plans.trialDays
    })
    .from(plans)
    .orderBy(desc(plans.createdAt));

  return NextResponse.json(
    {
      plans: list.map((plan) => ({
        id: plan.id,
        name: plan.name,
        codename: plan.codename,
        default: plan.default,
        monthlyPrice:
          plan.monthlyPrice === null ? null : plan.monthlyPrice / 100,
        yearlyPrice: plan.yearlyPrice === null ? null : plan.yearlyPrice / 100,
        scansPerMonth: plan.quotas?.scans_per_month ?? null,
        trialDays: plan.trialDays ?? null
      }))
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
