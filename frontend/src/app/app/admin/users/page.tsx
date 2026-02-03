import Link from "next/link";
import { redirect } from "next/navigation";

import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";
import { Button } from "@/components/ui/button";
import AdminUsersList from "@/components/admin/admin-users-list";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await getServerAuth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    redirect("/app");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View users with plan, subscription, and usage.
        </p>
      </div>
      <AdminUsersList />
    </div>
  );
}
