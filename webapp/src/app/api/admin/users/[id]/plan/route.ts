import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";
import { updatePlan } from "@/lib/plans/updatePlan";

const bodySchema = z.object({
  planId: z.string().uuid().optional(),
  scansPerMonthOverride: z.number().int().min(-1).optional(),
  customPriceOverride: z.number().int().min(0).nullable().optional()
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await getServerAuth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id: userId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { planId, scansPerMonthOverride, customPriceOverride } = parsed.data;
  if (
    planId === undefined &&
    scansPerMonthOverride === undefined &&
    customPriceOverride === undefined
  ) {
    return NextResponse.json(
      { error: "Provide planId, scansPerMonthOverride, and/or customPriceOverride" },
      { status: 400 }
    );
  }

  try {
    await updatePlan({
      userId,
      newPlanId: planId,
      scansPerMonthOverride,
      customPriceOverride
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to update user plan", err);
    return NextResponse.json(
      { error: "Failed to update plan" },
      { status: 500 }
    );
  }
}
