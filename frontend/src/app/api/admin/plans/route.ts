import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { plans } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";

const planBodySchema = z.object({
  name: z.string().min(1),
  codename: z.string().min(1),
  default: z.boolean().default(false),
  monthlyPrice: z.number().int().min(0).nullable(),
  yearlyPrice: z.number().int().min(0).nullable(),
  monthlyStripePriceId: z.string().nullable(),
  yearlyStripePriceId: z.string().nullable(),
  trialDays: z.number().int().min(0).nullable(),
  quotas: z.object({ scans_per_month: z.number().int().optional() }).nullable()
});

export async function GET() {
  const session = await getServerAuth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const list = await db
    .select()
    .from(plans)
    .orderBy(desc(plans.createdAt));

  return NextResponse.json({ plans: list });
}

export async function POST(request: Request) {
  const session = await getServerAuth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = planBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [inserted] = await db
    .insert(plans)
    .values({
      name: parsed.data.name,
      codename: parsed.data.codename,
      default: parsed.data.default,
      monthlyPrice: parsed.data.monthlyPrice ?? null,
      yearlyPrice: parsed.data.yearlyPrice ?? null,
      monthlyStripePriceId: parsed.data.monthlyStripePriceId ?? null,
      yearlyStripePriceId: parsed.data.yearlyStripePriceId ?? null,
      trialDays: parsed.data.trialDays ?? null,
      quotas: parsed.data.quotas ?? null
    })
    .returning();

  if (!inserted) {
    return NextResponse.json(
      { error: "Failed to create plan" },
      { status: 500 }
    );
  }
  return NextResponse.json(inserted);
}

export async function PATCH(request: Request) {
  const session = await getServerAuth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const withId = z.object({ id: z.string().uuid() }).merge(planBodySchema);
  const parsed = withId.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { id, ...data } = parsed.data;
  const [updated] = await db
    .update(plans)
    .set({
      name: data.name,
      codename: data.codename,
      default: data.default,
      monthlyPrice: data.monthlyPrice ?? null,
      yearlyPrice: data.yearlyPrice ?? null,
      monthlyStripePriceId: data.monthlyStripePriceId ?? null,
      yearlyStripePriceId: data.yearlyStripePriceId ?? null,
      trialDays: data.trialDays ?? null,
      quotas: data.quotas ?? null
    })
    .where(eq(plans.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json(
      { error: "Plan not found" },
      { status: 404 }
    );
  }
  return NextResponse.json(updated);
}
