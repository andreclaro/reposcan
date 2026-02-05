"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Github, Plus, ArrowRight, AlertCircle, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface HeroScanFormProps {
  isAuthed: boolean;
}

export default function HeroScanForm({ isAuthed }: HeroScanFormProps) {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!repoUrl.trim()) {
      setError("Please enter a GitHub repository URL");
      return;
    }

    // If not authenticated, redirect to login with the repo URL
    if (!isAuthed) {
      const params = new URLSearchParams({
        callbackUrl: "/app",
        repoUrl: repoUrl.trim(),
      });
      router.push(`/login?${params.toString()}`);
      return;
    }

    // Authenticated - start scan directly
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: repoUrl.trim(), isPrivate }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error ?? "Failed to start scan.");
        return;
      }

      const payload = await response.json();

      // Redirect to "Your scans" page
      if (payload.scan?.scanId) {
        // Add repo URL as query param to highlight the new scan
        router.push(`/app?repoUrl=${encodeURIComponent(repoUrl.trim())}`);
      } else {
        router.push("/app");
      }
    } catch {
      setError("Failed to start scan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl space-y-3">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Github className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <Input
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            type="text"
            placeholder="https://github.com/org/repo or org/repo"
            required
            className="h-14 pl-12 text-base bg-white border-slate-200 shadow-sm rounded-lg"
          />
        </div>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-14 px-8 gap-2 bg-slate-900 hover:bg-slate-800 text-base rounded-lg"
        >
          {isSubmitting ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Starting…
            </>
          ) : (
            <>
              <Plus className="h-5 w-5" />
              Start scan
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </form>
  );
}
