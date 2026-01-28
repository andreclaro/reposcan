"use client";

import { useState, useEffect } from "react";
import { FileText, AlertTriangle, Brain, BarChart3 } from "lucide-react";

import { cn } from "@/lib/utils";
import FindingsList from "./findings-list";
import AIAnalysisView from "./ai-analysis-view";
import ScanSummary from "./scan-summary";

type ScanData = {
  id: number;
  scanId: string;
  repoUrl: string;
  branch: string | null;
  commitHash: string | null;
  status: string;
  progress: number | null;
  findingsCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  aiAnalysisId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type ScanResultsProps = {
  scanId: string;
  scan: ScanData;
};

type Tab = "summary" | "findings" | "ai-analysis";

export default function ScanResults({ scanId, scan }: ScanResultsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [hasAIAnalysis, setHasAIAnalysis] = useState<boolean>(false);

  useEffect(() => {
    // Check if AI analysis is available
    if (scan.aiAnalysisId) {
      setHasAIAnalysis(true);
    } else {
      // Try to fetch to see if it exists
      fetch(`/api/scans/${scanId}/ai-analysis`)
        .then((res) => {
          if (res.ok) {
            setHasAIAnalysis(true);
          }
        })
        .catch(() => {
          // Ignore errors
        });
    }
  }, [scanId, scan.aiAnalysisId]);

  const tabs: Array<{ id: Tab; label: string; icon: typeof FileText }> = [
    { id: "summary", label: "Summary", icon: BarChart3 },
    { id: "findings", label: "Findings", icon: AlertTriangle },
    ...(hasAIAnalysis
      ? [{ id: "ai-analysis" as Tab, label: "AI Analysis", icon: Brain }]
      : []),
  ];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="border-b border-border/70">
        <nav className="-mb-px flex flex-wrap gap-4" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border/70 hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                {tab.label}
                {tab.id === "findings" && scan.findingsCount > 0 && (
                  <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                    {scan.findingsCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === "summary" && <ScanSummary scan={scan} />}
        {activeTab === "findings" && <FindingsList scanId={scanId} />}
        {activeTab === "ai-analysis" && hasAIAnalysis && (
          <AIAnalysisView scanId={scanId} />
        )}
      </div>
    </div>
  );
}
