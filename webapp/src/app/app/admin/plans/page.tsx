import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { plans, users } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AdminPlansPage() {
  const session = await getServerAuth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    redirect("/app");
  }

  const list = await db
    .select()
    .from(plans)
    .orderBy(desc(plans.createdAt));

  const planCounts = await db
    .select({
      planId: users.planId,
      planName: plans.name,
      count: sql<number>`count(*)::int`
    })
    .from(users)
    .leftJoin(plans, eq(users.planId, plans.id))
    .groupBy(users.planId, plans.name);

  const planStats = planCounts.map((row) => ({
    name: row.planName ?? "No Plan",
    count: row.count
  }));
  const totalUsers = planStats.reduce((acc, p) => acc + p.count, 0);

  const totalMonthlyRevenueCents = planStats.reduce((acc, p) => {
    const plan = list.find((pl) => pl.name === p.name);
    const monthlyCents = plan?.monthlyPrice ?? 0;
    return acc + p.count * monthlyCents;
  }, 0);
  const totalMonthlyRevenueEuros = totalMonthlyRevenueCents / 100;

  const formatPrice = (cents: number | null) =>
    cents === null ? "—" : `€${(cents / 100).toFixed(2)}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Plans</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage billing plans, Stripe price IDs, and view user distribution.
        </p>
      </div>

      {/* Total monthly revenue */}
      <div className="rounded-lg border bg-muted/30 px-4 py-3 max-w-xs">
        <div className="text-sm font-medium text-muted-foreground">
          Total monthly revenue
        </div>
        <div className="text-2xl font-bold mt-1">
          €{totalMonthlyRevenueEuros.toFixed(2)}
        </div>
      </div>

      {/* User distribution by plan */}
      <div>
        <h2 className="text-lg font-semibold mb-3">User distribution by plan</h2>
        <div className="flex flex-wrap gap-4">
          {planStats.map((p) => (
            <div
              key={p.name}
              className="rounded-lg border bg-background px-4 py-3 min-w-[140px]"
            >
              <div className="text-sm font-medium text-muted-foreground">
                {p.name}
              </div>
              <div className="text-2xl font-bold mt-1">{p.count}</div>
              {totalUsers > 0 && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {((p.count / totalUsers) * 100).toFixed(1)}% of users
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Plans</h2>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/app/admin/users">View users</Link>
          </Button>
          <Button asChild>
            <Link href="/app/admin/plans/create">Create plan</Link>
          </Button>
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Name</th>
              <th className="text-left p-3 font-medium">Codename</th>
              <th className="text-left p-3 font-medium">Monthly</th>
              <th className="text-left p-3 font-medium">Yearly</th>
              <th className="text-left p-3 font-medium">Default</th>
              <th className="text-left p-3 font-medium">Scans/mo</th>
              <th className="text-right p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((plan) => (
              <tr key={plan.id} className="border-t">
                <td className="p-3">{plan.name}</td>
                <td className="p-3">{plan.codename}</td>
                <td className="p-3">{formatPrice(plan.monthlyPrice)}</td>
                <td className="p-3">{formatPrice(plan.yearlyPrice)}</td>
                <td className="p-3">{plan.default ? "Yes" : ""}</td>
                <td className="p-3">
                  {plan.quotas?.scans_per_month ?? "—"}
                  {plan.quotas?.scans_per_month === -1 ? " (unl.)" : ""}
                </td>
                <td className="p-3 text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/app/admin/plans/${plan.id}/edit`}>Edit</Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {list.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No plans yet. Run the billing migration to seed Free, Pro, Custom.
        </p>
      )}
    </div>
  );
}
