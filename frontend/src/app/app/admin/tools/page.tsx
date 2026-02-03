import ToolsTabs from "@/components/tools-tabs";

export default function AdminToolsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tools</h1>
        <p className="text-sm text-muted-foreground">
          Batch scanning tools for multiple repositories.
        </p>
      </div>
      <ToolsTabs />
    </div>
  );
}
