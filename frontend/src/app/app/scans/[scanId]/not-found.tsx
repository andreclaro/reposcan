import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <h1 className="text-2xl font-semibold">Scan Not Found</h1>
      <p className="text-sm text-muted-foreground">
        The scan you're looking for doesn't exist or you don't have access to it.
      </p>
      <Button asChild variant="outline">
        <Link href="/app">
          <ArrowLeft className="size-4" />
          Back to Dashboard
        </Link>
      </Button>
    </div>
  );
}
