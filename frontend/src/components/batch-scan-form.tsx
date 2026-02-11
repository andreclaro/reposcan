"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Loader2,
  Upload,
  X,
  AlertCircle,
  ExternalLink
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { parseGitHubUrl } from "@/lib/github-url";
import { DEFAULT_AUDIT_TYPES } from "@/lib/validators";
import { cn } from "@/lib/utils";
import type { BatchScanResult } from "@/types/scans";

type BatchScanFormProps = {};

export default function BatchScanForm({}: BatchScanFormProps) {
  const [repoUrls, setRepoUrls] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<BatchScanResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const parseUrls = (text: string): string[] => {
    const lines = text.split("\n");
    const validUrls: string[] = [];
    const seen = new Set<string>();

    for (const line of lines) {
      const parsed = parseGitHubUrl(line);
      if (parsed.valid && parsed.normalized) {
        if (!seen.has(parsed.normalized)) {
          seen.add(parsed.normalized);
          validUrls.push(parsed.normalized);
        }
      }
    }

    return validUrls;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setResults([]);

    const urls = parseUrls(repoUrls);
    if (urls.length === 0) {
      setError("No valid GitHub repository URLs found. Enter one URL per line.");
      setIsSubmitting(false);
      return;
    }

    const newResults: BatchScanResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    // Submit scans sequentially to avoid overwhelming the API
    for (let i = 0; i < urls.length; i++) {
      const repoUrl = urls[i];
      try {
        const response = await fetch("/api/scan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            repoUrl
          })
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          const isRateLimit = response.status === 429;
          newResults.push({
            repoUrl,
            scanId: null,
            status: "error",
            error: isRateLimit 
              ? "Rate limit exceeded (10 scans/min). Please wait and try again."
              : (payload.error ?? "Failed to start scan")
          });
          errorCount++;
        } else {
          const payload = await response.json();
          const scanId = payload.scan?.scanId ?? null;
          newResults.push({
            repoUrl,
            scanId,
            status: "success"
          });
          successCount++;
        }
      } catch (err) {
        newResults.push({
          repoUrl,
          scanId: null,
          status: "error",
          error: err instanceof Error ? err.message : "Network error"
        });
        errorCount++;
      }

      // Update results progressively
      setResults([...newResults]);

      // Delay between requests to respect rate limit (10/min = 6sec per request)
      // Add extra buffer to account for processing time
      if (i < urls.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 6500));
      }
    }

    setIsSubmitting(false);

    if (errorCount > 0 && successCount === 0) {
      setError(`All ${errorCount} scans failed. Check the results below.`);
    } else if (errorCount > 0) {
      setError(`${errorCount} of ${urls.length} scans failed.`);
    }
  };

  const validUrlCount = parseUrls(repoUrls).length;
  const hasUrls = repoUrls.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-background p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Submit multiple scans</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste repository URLs, one per line. Uses default branch for each repository. Default audit types:{" "}
          {DEFAULT_AUDIT_TYPES.join(", ")}.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="repo-urls"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Repository URLs (one per line)
            </label>
            <textarea
              id="repo-urls"
              value={repoUrls}
              onChange={(e) => setRepoUrls(e.target.value)}
              placeholder="https://github.com/owner/repo&#10;owner/repo2&#10;https://github.com/org/project"
              rows={10}
              className={cn(
                "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow]",
                "placeholder:text-muted-foreground",
                "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
                "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
                "font-mono text-xs"
              )}
              disabled={isSubmitting}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {hasUrls
                  ? `${validUrlCount} valid ${validUrlCount === 1 ? "URL" : "URLs"} found`
                  : "Enter repository URLs"}
              </span>
              <span>{repoUrls.split("\n").length} lines</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isSubmitting || validUrlCount === 0}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Upload className="mr-2 size-4" />
                  Submit {validUrlCount > 0 ? `${validUrlCount} ` : ""}scan
                  {validUrlCount !== 1 ? "s" : ""}
                </>
              )}
            </Button>
            {results.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRepoUrls("");
                  setResults([]);
                  setError(null);
                }}
                disabled={isSubmitting}
              >
                Clear
              </Button>
            )}
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </form>
      </div>

      {results.length > 0 && (
        <div className="rounded-2xl border bg-background shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold">
              Results ({results.length} {results.length === 1 ? "scan" : "scans"})
            </h2>
          </div>
          <div className="divide-y">
            {results.map((result, index) => (
              <div key={index} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <a
                        href={result.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium hover:underline"
                      >
                        {result.repoUrl}
                      </a>
                      {result.status === "success" ? (
                        <CheckCircle2 className="size-4 text-emerald-600" />
                      ) : (
                        <X className="size-4 text-destructive" />
                      )}
                    </div>
                    {result.scanId ? (
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p>Scan ID: {result.scanId}</p>
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="mt-2"
                        >
                          <Link href={`/app/scans/${result.scanId}`}>
                            <ExternalLink className="mr-2 size-3" />
                            View scan
                          </Link>
                        </Button>
                      </div>
                    ) : null}
                    {result.error ? (
                      <p className="text-xs text-destructive">{result.error}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="rounded-2xl border bg-muted/50 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {results.filter((r) => r.status === "success").length} successful,{" "}
              {results.filter((r) => r.status === "error").length} failed
            </span>
            <Button asChild variant="outline" size="sm">
              <Link href="/app">View all scans</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
