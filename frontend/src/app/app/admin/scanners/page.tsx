import { redirect } from "next/navigation";

import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";
import { db } from "@/db";
import { scannerSettings } from "@/db/schema";
import { getScannerRegistry } from "@/lib/scanner-registry";
import AdminScanners from "@/components/admin/admin-scanners";

export const dynamic = "force-dynamic";

export default async function AdminScannersPage() {
  const session = await getServerAuth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    redirect("/app");
  }

  try {
    // Fetch backend scanner registry and DB settings in parallel.
    const [scannerMeta, rows] = await Promise.all([
      getScannerRegistry(),
      db.select().from(scannerSettings),
    ]);

    console.log("[admin/scanners] scannerMeta:", scannerMeta.length, "rows:", rows.length);

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Scanners</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage scanner availability globally and per plan. Global toggle
            disables a scanner for everyone; plan toggles control access per tier.
          </p>
        </div>
        <AdminScanners initialSettings={rows} scannerMeta={scannerMeta} />
      </div>
    );
  } catch (error) {
    console.error("[admin/scanners] Error loading page:", error);
    throw error;
  }
}
