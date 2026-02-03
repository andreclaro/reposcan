import { getServerAuth } from "@/lib/server-auth";
import BatchScanForm from "@/components/batch-scan-form";

export default async function BatchScanPage() {
  const session = await getServerAuth();

  if (!session?.user?.id) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Batch scan</h1>
        <p className="text-sm text-muted-foreground">
          Submit multiple repository URLs at once. One URL per line.
        </p>
      </div>
      <BatchScanForm />
    </div>
  );
}
