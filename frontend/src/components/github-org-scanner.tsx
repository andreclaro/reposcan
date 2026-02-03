"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Loader2,
  Search,
  X,
  AlertCircle,
  ExternalLink,
  Github
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BatchScanResult } from "@/types/scans";

type GitHubOrgScannerProps = {};

export default function GitHubOrgScanner({}: GitHubOrgScannerProps) {
  const [orgUrl, setOrgUrl] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [repos, setRepos] = useState<Array<{ url: string; name: string; stars: number }>>([]);
  const [results, setResults] = useState<BatchScanResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const parseOrgUrl = (url: string): { owner: string; type: "user" | "org" } | null => {
    const trimmed = url.trim();
    if (!trimmed) {
      return null;
    }

    try {
      // Handle URLs without protocol
      let urlToParse = trimmed;
      if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
        urlToParse = `https://${trimmed}`;
      }

      const urlObj = new URL(urlToParse);
      if (
        !["github.com", "www.github.com"].includes(urlObj.hostname.toLowerCase())
      ) {
        return null;
      }

      const parts = urlObj.pathname.split("/").filter(Boolean);
      if (parts.length < 1) {
        return null;
      }

      const owner = parts[0];
      return { owner, type: "user" }; // We'll determine type from API response
    } catch {
      // Try as direct owner name
      if (/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
        return { owner: trimmed, type: "user" };
      }
      return null;
    }
  };

  const handleFetchRepos = async () => {
    setIsFetching(true);
    setError(null);
    setRepos([]);
    setResults([]);

    const parsed = parseOrgUrl(orgUrl);
    if (!parsed) {
      setError("Invalid GitHub URL. Enter a URL like https://github.com/username or https://github.com/orgname");
      setIsFetching(false);
      return;
    }

    try {
      const response = await fetch(`/api/github/repos?owner=${encodeURIComponent(parsed.owner)}`);
      
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        let errorMessage = payload.error ?? "Failed to fetch repositories";
        
        // Handle rate limit errors with better messaging
        if (response.status === 429 && payload.rateLimitReset) {
          const resetTime = new Date(payload.rateLimitReset * 1000);
          const now = new Date();
          const minutesUntilReset = Math.ceil((resetTime.getTime() - now.getTime()) / 60000);
          errorMessage = `${errorMessage} You can try again in ${minutesUntilReset} minute${minutesUntilReset !== 1 ? "s" : ""}.`;
        }
        
        setError(errorMessage);
        setIsFetching(false);
        return;
      }

      const data = await response.json();
      if (data.repositories && data.repositories.length > 0) {
        setRepos(data.repositories);
      } else {
        setError(`No public repositories found for ${parsed.owner}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsFetching(false);
    }
  };

  const handleSubmitScans = async () => {
    if (repos.length === 0) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setResults([]);

    const newResults: BatchScanResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    // Submit scans sequentially to avoid overwhelming the API
    for (let i = 0; i < repos.length; i++) {
      const repo = repos[i];
      try {
        const response = await fetch("/api/scan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            repoUrl: repo.url
          })
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          newResults.push({
            repoUrl: repo.url,
            scanId: null,
            status: "error",
            error: payload.error ?? "Failed to start scan"
          });
          errorCount++;
        } else {
          const payload = await response.json();
          const scanId = payload.scan?.scanId ?? null;
          newResults.push({
            repoUrl: repo.url,
            scanId,
            status: "success"
          });
          successCount++;
        }
      } catch (err) {
        newResults.push({
          repoUrl: repo.url,
          scanId: null,
          status: "error",
          error: err instanceof Error ? err.message : "Network error"
        });
        errorCount++;
      }

      // Update results progressively
      setResults([...newResults]);

      // Small delay between requests to avoid rate limiting
      if (i < repos.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    setIsSubmitting(false);

    if (errorCount > 0 && successCount === 0) {
      setError(`All ${errorCount} scans failed. Check the results below.`);
    } else if (errorCount > 0) {
      setError(`${errorCount} of ${repos.length} scans failed.`);
    }
  };

  const parsed = parseOrgUrl(orgUrl);
  const isValidUrl = parsed !== null;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-background p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Github className="size-5" />
          <h2 className="text-lg font-semibold">Scan GitHub Organization/User</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground mb-4">
          Enter a GitHub organization or user URL to scan all their public repositories. Example: https://github.com/andreclaro
        </p>
        <div className="mb-4 rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3 text-sm text-blue-900 dark:text-blue-100">
          <p className="font-medium mb-1">💡 Tip: Sign in with GitHub</p>
          <p>If you signed in with GitHub, you'll get 5000 API requests per hour instead of 60. This helps avoid rate limits when fetching large organizations.</p>
        </div>
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                type="text"
                value={orgUrl}
                onChange={(e) => setOrgUrl(e.target.value)}
                placeholder="https://github.com/username or https://github.com/orgname"
                className={cn(
                  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow]",
                  "placeholder:text-muted-foreground",
                  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
                  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                )}
                disabled={isFetching || isSubmitting}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && isValidUrl && !isFetching) {
                    handleFetchRepos();
                  }
                }}
              />
            </div>
            <Button
              type="button"
              onClick={handleFetchRepos}
              disabled={isFetching || isSubmitting || !isValidUrl}
            >
              {isFetching ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Fetching...
                </>
              ) : (
                <>
                  <Search className="mr-2 size-4" />
                  Fetch Repos
                </>
              )}
            </Button>
          </div>

          {error && !repos.length && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {repos.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Found {repos.length} public {repos.length === 1 ? "repository" : "repositories"}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setRepos([]);
                      setResults([]);
                      setError(null);
                    }}
                    disabled={isSubmitting}
                  >
                    Clear
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSubmitScans}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Search className="mr-2 size-4" />
                        Scan All ({repos.length})
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto rounded-md border">
                <div className="divide-y">
                  {repos.map((repo, index) => (
                    <div key={index} className="px-4 py-2 text-sm hover:bg-muted/50">
                      <div className="flex items-center justify-between">
                        <a
                          href={repo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:underline"
                        >
                          {repo.name}
                        </a>
                        <span className="text-xs text-muted-foreground">
                          ⭐ {repo.stars}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {results.length > 0 && (
        <div className="rounded-2xl border bg-background shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold">
              Scan Results ({results.length} {results.length === 1 ? "scan" : "scans"})
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
