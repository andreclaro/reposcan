import { desc, eq } from "drizzle-orm";

import ScanDashboard from "@/components/scan-dashboard";
import { db } from "@/db";
import { scans } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";

type SearchParams = {
  repoUrl?: string;
};

export default async function AppPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const session = await getServerAuth();

  if (!session?.user?.id) {
    return null;
  }

  const records = await db
    .select()
    .from(scans)
    .where(eq(scans.userId, session.user.id))
    .orderBy(desc(scans.createdAt));

  const initialScans = records.map((scan) => ({
    ...scan,
    createdAt: scan.createdAt?.toISOString() ?? null,
    updatedAt: scan.updatedAt?.toISOString() ?? null
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Your scans</h1>
        <p className="text-sm text-muted-foreground">
          Track repository security scans and review their status.
        </p>
      </div>
      <ScanDashboard
        initialScans={initialScans}
        defaultRepoUrl={resolvedSearchParams.repoUrl}
      />
    </div>
  );
}
