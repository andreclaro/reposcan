import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { plans, users } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";
import { getUsageForCurrentPeriod } from "@/lib/usage";
import { Button } from "@/components/ui/button";
import AdminUserPlanChange from "@/components/admin/admin-user-plan-change";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function AdminUserDetailPage({ params }: PageProps) {
  const session = await getServerAuth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    redirect("/app");
  }

  const { id } = await params;

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      planId: users.planId,
      scansPerMonthOverride: users.scansPerMonthOverride,
      customPriceOverride: users.customPriceOverride,
      stripeCustomerId: users.stripeCustomerId,
      stripeSubscriptionId: users.stripeSubscriptionId,
      trialEndsAt: users.trialEndsAt,
      createdAt: users.createdAt
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) {
    redirect("/app/admin/users");
  }

  const [currentPlan] = user.planId
    ? await db
        .select()
        .from(plans)
        .where(eq(plans.id, user.planId))
        .limit(1)
    : [null];

  const allPlans = await db.select().from(plans).orderBy(plans.name);
  const usage = await getUsageForCurrentPeriod(id);

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/app/admin/users">← Back to users</Link>
        </Button>
        <h1 className="text-2xl font-bold mt-2">User: {user.email ?? user.id}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan, subscription, and usage. Change plan for support or Custom deals.
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-3 max-w-xl">
        <div>
          <span className="text-sm font-medium text-muted-foreground">Email</span>
          <p className="font-medium">{user.email}</p>
        </div>
        <div>
          <span className="text-sm font-medium text-muted-foreground">Current plan</span>
          <p className="font-medium">{currentPlan?.name ?? "No Plan"}</p>
        </div>
        {currentPlan?.codename === "custom" && user.customPriceOverride != null && (
          <div>
            <span className="text-sm font-medium text-muted-foreground">Custom price</span>
            <p className="font-medium">
              ${(user.customPriceOverride / 100).toFixed(2)}/mo
            </p>
          </div>
        )}
        <div>
          <span className="text-sm font-medium text-muted-foreground">Stripe subscription</span>
          <p className="font-mono text-sm break-all">
            {user.stripeSubscriptionId ?? "—"}
          </p>
        </div>
        <div>
          <span className="text-sm font-medium text-muted-foreground">Trial ends</span>
          <p>{user.trialEndsAt ? user.trialEndsAt.toISOString() : "—"}</p>
        </div>
        <div>
          <span className="text-sm font-medium text-muted-foreground">Usage this period</span>
          <p>
            {usage.scansUsed} / {usage.unlimited ? "∞" : usage.scansLimit} scans
            {usage.periodEnd && ` (resets ${usage.periodEnd.toISOString().slice(0, 10)})`}
          </p>
        </div>
        <div>
          <span className="text-sm font-medium text-muted-foreground">Change plan</span>
          <AdminUserPlanChange
            userId={id}
            currentPlanId={user.planId}
            currentPlanCodename={currentPlan?.codename ?? null}
            scansPerMonthOverride={user.scansPerMonthOverride}
            customPriceOverride={user.customPriceOverride}
            plans={allPlans}
          />
        </div>
      </div>
    </div>
  );
}
