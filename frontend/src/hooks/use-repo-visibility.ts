"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { parseGitHubRepo } from "@/lib/github-url";

interface UseRepoVisibilityResult {
  /** Whether the repo is private (null if not checked or invalid) */
  isPrivate: boolean | null;
  /** Whether we're currently checking */
  isLoading: boolean;
  /** Error message if check failed */
  error: string | null;
  /** Whether the user manually overrode the detection */
  manuallySet: boolean;
  /** Function to manually set the value */
  setManually: (value: boolean) => void;
}

/**
 * Hook to automatically detect if a GitHub repository is private.
 * 
 * When a valid GitHub URL is entered, it checks the repository visibility
 * via our API (which uses the user's GitHub token server-side).
 * 
 * The user can still manually override the detection by toggling the switch.
 */
export function useRepoVisibility(repoUrl: string): UseRepoVisibilityResult {
  const { status } = useSession();
  const [isPrivate, setIsPrivate] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manuallySet, setManuallySet] = useState(false);
  
  // Use a ref to track the latest URL for debounce handling
  const latestUrlRef = useRef(repoUrl);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const setManually = useCallback((value: boolean) => {
    setIsPrivate(value);
    setManuallySet(true);
  }, []);

  useEffect(() => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Reset state when URL changes (unless manually set)
    if (manuallySet) {
      // Keep the manual value but mark as not manually set for future changes
      return;
    }
    
    // Don't check if not authenticated
    if (status !== "authenticated") {
      setIsPrivate(null);
      setIsLoading(false);
      return;
    }

    // Only check GitHub URLs
    const parsed = parseGitHubRepo(repoUrl);
    if (!parsed) {
      setIsPrivate(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Debounce the check
    const timeoutId = setTimeout(async () => {
      latestUrlRef.current = repoUrl;
      setIsLoading(true);
      setError(null);

      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();

      try {
        // Check repo visibility via our API
        const response = await fetch(
          `/api/repo/visibility?repoUrl=${encodeURIComponent(repoUrl)}`,
          { signal: abortControllerRef.current.signal }
        );

        // Only update if this is still the latest URL
        if (latestUrlRef.current !== repoUrl) {
          return;
        }

        if (response.status === 401) {
          setIsPrivate(null);
          return;
        }

        if (!response.ok) {
          // For 404s (repo not found) or other errors, just don't auto-detect
          // The user can still manually toggle
          setIsPrivate(null);
          return;
        }

        const data = await response.json();
        setIsPrivate(data.isPrivate);
      } catch (err) {
        // Ignore abort errors (from debounce)
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        
        console.error("Failed to check repo visibility:", err);
        if (latestUrlRef.current === repoUrl) {
          setIsPrivate(null);
        }
      } finally {
        if (latestUrlRef.current === repoUrl) {
          setIsLoading(false);
        }
      }
    }, 500); // 500ms debounce

    return () => {
      clearTimeout(timeoutId);
      abortControllerRef.current?.abort();
    };
  }, [repoUrl, status, manuallySet]);

  return {
    isPrivate,
    isLoading,
    error,
    manuallySet,
    setManually
  };
}
