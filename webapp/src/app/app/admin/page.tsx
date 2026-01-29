import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { scans, users, aiAnalysis } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";
import AdminDashboard from "@/components/admin/admin-dashboard";

export const dynamic = "force-dynamic";

type ScanWithUser = {
  id: number;
  scanId: string;
  userId: string;
  userEmail: string | null;
  repoUrl: string;
  branch: string | null;
  commitHash: string | null;
  auditTypes: string[] | null;
  status: string;
  progress: number | null;
  resultsPath: string | null;
  s3ResultsPath: string | null;
  findingsCount: number | null;
  criticalCount: number | null;
  highCount: number | null;
  mediumCount: number | null;
  lowCount: number | null;
  infoCount: number | null;
  aiAnalysisId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export default async function AdminPage() {
  const session = await getServerAuth();

  if (!session?.user?.email || !isAdmin(session.user.email)) {
    redirect("/app");
  }

  // Fetch all scans with user info
  const allScans = await db
    .select({
      id: scans.id,
      scanId: scans.scanId,
      userId: scans.userId,
      userEmail: users.email,
      repoUrl: scans.repoUrl,
      branch: scans.branch,
      commitHash: scans.commitHash,
      auditTypes: scans.auditTypes,
      status: scans.status,
      progress: scans.progress,
      resultsPath: scans.resultsPath,
      s3ResultsPath: scans.s3ResultsPath,
      findingsCount: scans.findingsCount,
      criticalCount: scans.criticalCount,
      highCount: scans.highCount,
      mediumCount: scans.mediumCount,
      lowCount: scans.lowCount,
      infoCount: scans.infoCount,
      aiAnalysisId: scans.aiAnalysisId,
      createdAt: scans.createdAt,
      updatedAt: scans.updatedAt
    })
    .from(scans)
    .leftJoin(users, eq(scans.userId, users.id))
    .orderBy(desc(scans.createdAt))
    .limit(500);

  // Get unique users for filter dropdown
  const uniqueUsers = await db
    .selectDistinct({ userId: scans.userId, email: users.email })
    .from(scans)
    .leftJoin(users, eq(scans.userId, users.id))
    .orderBy(users.email);

  // Get scan status counts
  const statusCounts = await db
    .select({
      status: scans.status,
      count: sql<number>`count(*)::int`
    })
    .from(scans)
    .groupBy(scans.status);

  const formattedScans: ScanWithUser[] = allScans.map((scan) => ({
    ...scan,
    createdAt: scan.createdAt?.toISOString() ?? null,
    updatedAt: scan.updatedAt?.toISOString() ?? null
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View and manage all scans across all users.
        </p>
      </div>

      <AdminDashboard
        initialScans={formattedScans}
        users={uniqueUsers.filter((u) => u.email !== null) as { userId: string; email: string }[]}
        statusCounts={statusCounts as { status: string; count: number }[]}
      />
    </div>
  );
}
