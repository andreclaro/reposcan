import { getServerAuth } from "@/lib/server-auth";
import BatchScanForm from "@/components/batch-scan-form";
import GitHubOrgScanner from "@/components/github-org-scanner";

export default async function ToolsPage() {
  const session = await getServerAuth();

  if (!session?.user?.id) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tools</h1>
        <p className="text-sm text-muted-foreground">
          Batch scanning tools for multiple repositories.
        </p>
      </div>
      <GitHubOrgScanner />
      <BatchScanForm />
    </div>
  );
}
