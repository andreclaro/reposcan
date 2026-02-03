import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { plans } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";
import { Button } from "@/components/ui/button";
import PlanForm from "@/components/admin/plan-form";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function AdminPlansEditPage({ params }: PageProps) {
  const session = await getServerAuth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    redirect("/app");
  }

  const { id } = await params;
  const [plan] = await db
    .select()
    .from(plans)
    .where(eq(plans.id, id))
    .limit(1);

  if (!plan) {
    redirect("/app/admin/plans");
  }

  const initial = {
    id: plan.id,
    name: plan.name,
    codename: plan.codename,
    default: plan.default ?? false,
    monthlyPrice: plan.monthlyPrice ?? 0,
    yearlyPrice: plan.yearlyPrice ?? 0,
    monthlyStripePriceId: plan.monthlyStripePriceId ?? "",
    yearlyStripePriceId: plan.yearlyStripePriceId ?? "",
    trialDays: plan.trialDays ?? null,
    quotas: plan.quotas ?? { scans_per_month: 5 }
  };

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/app/admin/plans">← Back to plans</Link>
        </Button>
        <h1 className="text-2xl font-bold mt-2">Edit plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update plan details and Stripe price IDs.
        </p>
      </div>
      <PlanForm action="edit" initial={initial} />
    </div>
  );
}
