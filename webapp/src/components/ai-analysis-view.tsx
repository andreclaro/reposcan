"use client";

import { useState, useEffect } from "react";
import { Brain, AlertTriangle, TrendingUp, ExternalLink, RefreshCw } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { TopFinding } from "@/types/findings";

type AIAnalysisViewProps = {
  scanId: string;
};

type Recommendation = {
  priority: "critical" | "high" | "medium" | "low";
  action: string;
  findingIds: number[];
  estimatedEffort: "low" | "medium" | "high";
};

type AIAnalysis = {
  summary: string;
  riskScore: number | null;
  recommendations: Recommendation[];
  topFindings: TopFinding[];
  model: string | null;
  modelVersion: string | null;
  tokensUsed: number | null;
  createdAt: string | Date | null;
};

const priorityColors: Record<string, string> = {
  critical: "bg-red-500/10 text-red-600 border-red-500/20",
  high: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  low: "bg-blue-500/10 text-blue-600 border-blue-500/20",
};

function RiskScoreGauge({ score }: { score: number }) {
  const getColor = (score: number) => {
    if (score >= 75) return "text-red-600";
    if (score >= 50) return "text-orange-600";
    if (score >= 25) return "text-yellow-600";
    return "text-green-600";
  };

  const getLabel = (score: number) => {
    if (score >= 75) return "Critical";
    if (score >= 50) return "High";
    if (score >= 25) return "Medium";
    return "Low";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Risk Score</span>
        <span className={cn("text-2xl font-bold", getColor(score))}>
          {score}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full transition-all", {
            "bg-red-600": score >= 75,
            "bg-orange-600": score >= 50 && score < 75,
            "bg-yellow-600": score >= 25 && score < 50,
            "bg-green-600": score < 25,
          })}
          style={{ width: `${score}%` }}
        />
      </div>
      <p className={cn("text-xs font-medium", getColor(score))}>
        {getLabel(score)} Risk
      </p>
    </div>
  );
}

export default function AIAnalysisView({ scanId }: AIAnalysisViewProps) {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateMessage, setRegenerateMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalysis();
  }, [scanId]);

  const fetchAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/scans/${scanId}/ai-analysis`);
      if (!response.ok) {
        if (response.status === 404) {
          setError("AI analysis not available for this scan");
        } else {
          throw new Error("Failed to fetch AI analysis");
        }
        return;
      }
      const data = await response.json();
      // Normalize createdAt if it's a Date object
      if (data.createdAt && typeof data.createdAt === 'string') {
        data.createdAt = new Date(data.createdAt).toISOString();
      }
      setAnalysis(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AI analysis");
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setRegenerateMessage(null);
    try {
      const response = await fetch(`/api/scans/${scanId}/generate-ai`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        setRegenerateMessage(data.error ?? "Failed to queue regeneration");
        return;
      }
      setRegenerateMessage(
        data.message ?? "Regeneration queued. Refresh in a minute to see the new analysis."
      );
      // Refetch after a short delay so user can refresh manually
      setTimeout(() => fetchAnalysis(), 2000);
    } catch {
      setRegenerateMessage("Failed to queue regeneration");
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border bg-background p-8 text-center">
        <Brain className="mx-auto size-12 text-muted-foreground/50 animate-pulse" />
        <p className="mt-4 text-sm text-muted-foreground">
          Loading AI analysis...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <AlertTriangle className="mx-auto size-12 text-destructive/50" />
        <p className="mt-4 text-sm font-medium text-destructive">{error}</p>
        <button
          onClick={fetchAnalysis}
          className="mt-4 text-sm text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!analysis) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Regenerate AI analysis */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-background p-4 shadow-sm">
        <p className="text-sm text-muted-foreground">
          Re-run AI analysis with the current findings (worker must have AI enabled).
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRegenerate}
          disabled={regenerating}
        >
          {regenerating ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Regenerate AI analysis
        </Button>
        {regenerateMessage && (
          <p className="w-full text-xs text-muted-foreground">{regenerateMessage}</p>
        )}
      </div>

      {/* Risk Score */}
      {analysis.riskScore !== null && (
        <div className="rounded-2xl border bg-background p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">Overall Risk Assessment</h2>
          </div>
          <RiskScoreGauge score={analysis.riskScore} />
        </div>
      )}

      {/* Executive Summary */}
      <div className="rounded-2xl border bg-background p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Executive Summary</h2>
        </div>
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {analysis.summary}
          </p>
        </div>
      </div>

      {/* Top Critical Findings */}
      {analysis.topFindings && analysis.topFindings.length > 0 && (
        <div className="rounded-2xl border bg-background p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Top Critical Findings</h2>
          <div className="space-y-2">
            {analysis.topFindings.map((finding) => (
              <Link
                key={finding.id}
                href={`/app/scans/${scanId}?highlight=${finding.id}`}
                className="block rounded-lg border bg-muted/40 p-3 hover:bg-muted/60 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{finding.title}</p>
                    <span
                      className={cn(
                        "mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                        finding.severity === "critical"
                          ? "bg-red-500/10 text-red-600 border-red-500/20"
                          : finding.severity === "high"
                            ? "bg-orange-500/10 text-orange-600 border-orange-500/20"
                            : "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
                      )}
                    >
                      {finding.severity}
                    </span>
                  </div>
                  <ExternalLink className="size-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {analysis.recommendations && analysis.recommendations.length > 0 && (
        <div className="rounded-2xl border bg-background p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">
            Prioritized Recommendations
          </h2>
          <div className="space-y-4">
            {analysis.recommendations.map((rec, index) => (
              <div
                key={index}
                className="rounded-lg border bg-muted/40 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                          priorityColors[rec.priority] || priorityColors.medium
                        )}
                      >
                        {rec.priority}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Effort: {rec.estimatedEffort}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{rec.action}</p>
                    {rec.findingIds.length > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Related to {rec.findingIds.length} finding
                        {rec.findingIds.length !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Model Info */}
      <div className="rounded-2xl border bg-background p-4 shadow-sm">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div>
            {analysis.model && (
              <span>
                Model: {analysis.model}
                {analysis.modelVersion && ` (${analysis.modelVersion})`}
              </span>
            )}
          </div>
          {analysis.tokensUsed !== null && (
            <span>Tokens used: {analysis.tokensUsed.toLocaleString()}</span>
          )}
        </div>
      </div>
    </div>
  );
}
