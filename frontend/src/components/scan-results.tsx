"use client";

import { useState, useEffect } from "react";
import { FileText, AlertTriangle, Brain, BarChart3 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ScanData } from "@/types/scans";
import FindingsList from "./findings-list";
import AIAnalysisView from "./ai-analysis-view";
import ScanSummary from "./scan-summary";

type ScanResultsProps = {
  scanId: string;
  scan: ScanData;
  /** When false, AI Analysis tab and content are hidden. */
  aiAnalysisEnabled?: boolean;
};

type Tab = "summary" | "findings" | "ai-analysis";

export default function ScanResults({
  scanId,
  scan,
  aiAnalysisEnabled = false,
}: ScanResultsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [hasAIAnalysis, setHasAIAnalysis] = useState<boolean>(false);

  useEffect(() => {
    if (!aiAnalysisEnabled) return;
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
  }, [scanId, scan.aiAnalysisId, aiAnalysisEnabled]);

  const isCompleted = scan.status === "completed";
  const showAIAnalysis = aiAnalysisEnabled && hasAIAnalysis && isCompleted;

  const tabs: Array<{ id: Tab; label: string; icon: typeof FileText }> = [
    { id: "summary", label: "Summary", icon: BarChart3 },
    ...(isCompleted
      ? [{ id: "findings" as Tab, label: "Findings", icon: AlertTriangle }]
      : []),
    ...(showAIAnalysis
      ? [{ id: "ai-analysis" as Tab, label: "AI Analysis", icon: Brain }]
      : []),
  ];

  const tabId = (id: Tab) => `scan-tab-${id}`;
  const panelId = (id: Tab) => `scan-panel-${id}`;

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="border-b border-border/70">
        <nav
          className="-mb-px flex flex-wrap gap-4"
          aria-label="Scan result sections"
          role="tablist"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={tabId(tab.id)}
                role="tab"
                aria-selected={isSelected}
                aria-controls={panelId(tab.id)}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors",
                  isSelected
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border/70 hover:text-foreground"
                )}
              >
                <Icon className="size-4" aria-hidden />
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

      {/* Tab panels */}
      <div className="mt-6">
        {activeTab === "summary" && (
          <div
            id={panelId("summary")}
            role="tabpanel"
            aria-labelledby={tabId("summary")}
            tabIndex={0}
          >
            <ScanSummary scan={scan} />
          </div>
        )}
        {activeTab === "findings" && (
          <div
            id={panelId("findings")}
            role="tabpanel"
            aria-labelledby={tabId("findings")}
            tabIndex={0}
          >
            <FindingsList scanId={scanId} />
          </div>
        )}
        {activeTab === "ai-analysis" && showAIAnalysis && (
          <div
            id={panelId("ai-analysis")}
            role="tabpanel"
            aria-labelledby={tabId("ai-analysis")}
            tabIndex={0}
          >
            <AIAnalysisView scanId={scanId} />
          </div>
        )}
      </div>
    </div>
  );
}
