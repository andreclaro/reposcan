import { redirect } from "next/navigation";

import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";
import { db } from "@/db";
import { scannerSettings } from "@/db/schema";
import AdminScanners from "@/components/admin/admin-scanners";

export const dynamic = "force-dynamic";

export default async function AdminScannersPage() {
  const session = await getServerAuth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    redirect("/app");
  }

  const rows = await db.select().from(scannerSettings);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Scanners</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enable or disable security scanners globally. Disabled scanners will
          be skipped for all new scans.
        </p>
      </div>
      <AdminScanners initialSettings={rows} />
    </div>
  );
}
