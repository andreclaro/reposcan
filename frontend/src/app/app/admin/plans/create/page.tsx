import Link from "next/link";
import { redirect } from "next/navigation";

import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PlanForm from "@/components/admin/plan-form";

export const dynamic = "force-dynamic";

export default async function AdminPlansCreatePage() {
  const session = await getServerAuth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    redirect("/app");
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/app/admin/plans">← Back to plans</Link>
        </Button>
        <h1 className="text-2xl font-bold mt-2">Create plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a new billing plan. Set Stripe price IDs after creating products in Stripe.
        </p>
      </div>
      <PlanForm action="create" />
    </div>
  );
}
