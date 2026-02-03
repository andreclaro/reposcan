"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function ScanDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Scan detail error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-6 rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
      <h2 className="text-lg font-semibold text-destructive">
        Failed to load scan
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        We couldn&apos;t load this scan. You can try again or go back to your
        scans.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset} variant="default">
          Try again
        </Button>
        <Button asChild variant="secondary">
          <Link href="/app">Back to scans</Link>
        </Button>
      </div>
    </div>
  );
}
