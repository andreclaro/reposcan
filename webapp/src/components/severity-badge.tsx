"use client";

import { AlertTriangle, Info, ShieldAlert, ShieldCheck, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type Severity = "critical" | "high" | "medium" | "low" | "info";

interface SeverityBadgeProps {
  severity: Severity | string;
  count?: number;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const severityConfig: Record<
  Severity,
  {
    label: string;
    variant: "critical" | "high" | "medium" | "low" | "info";
    icon: typeof AlertTriangle;
    color: string;
  }
> = {
  critical: {
    label: "Critical",
    variant: "critical",
    icon: ShieldAlert,
    color: "text-red-600",
  },
  high: {
    label: "High",
    variant: "high",
    icon: AlertTriangle,
    color: "text-orange-600",
  },
  medium: {
    label: "Medium",
    variant: "medium",
    icon: AlertCircle,
    color: "text-yellow-600",
  },
  low: {
    label: "Low",
    variant: "low",
    icon: Info,
    color: "text-blue-600",
  },
  info: {
    label: "Info",
    variant: "info",
    icon: ShieldCheck,
    color: "text-slate-500",
  },
};

export function SeverityBadge({
  severity,
  count,
  showIcon = true,
  size = "sm",
  className,
}: SeverityBadgeProps) {
  const config = severityConfig[severity.toLowerCase() as Severity] || severityConfig.info;
  const Icon = config.icon;

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-3.5 w-3.5",
    lg: "h-4 w-4",
  };

  return (
    <Badge
      variant={config.variant}
      className={cn(
        "inline-flex items-center gap-1 font-medium",
        sizeClasses[size],
        className
      )}
    >
      {showIcon && <Icon className={cn(iconSizes[size], config.color)} />}
      <span>{config.label}</span>
      {count !== undefined && (
        <span className="ml-0.5 font-semibold">{count}</span>
      )}
    </Badge>
  );
}

// Status badge for scan states
interface StatusBadgeProps {
  status: "queued" | "running" | "completed" | "failed" | "retrying" | string;
  className?: string;
}

const statusConfig: Record<
  string,
  {
    label: string;
    className: string;
  }
> = {
  queued: {
    label: "Queued",
    className: "bg-slate-100 text-slate-700 border-slate-200",
  },
  running: {
    label: "Scanning",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  completed: {
    label: "Complete",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  failed: {
    label: "Failed",
    className: "bg-red-50 text-red-700 border-red-200",
  },
  retrying: {
    label: "Retrying",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status.toLowerCase()] || {
    label: status,
    className: "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}

// Findings summary badge showing all severities with counts
interface FindingsSummaryProps {
  critical?: number;
  high?: number;
  medium?: number;
  low?: number;
  info?: number;
  className?: string;
}

export function FindingsSummary({
  critical = 0,
  high = 0,
  medium = 0,
  low = 0,
  info = 0,
  className,
}: FindingsSummaryProps) {
  const severities = [
    { key: "critical" as const, count: critical, color: "bg-red-500" },
    { key: "high" as const, count: high, color: "bg-orange-500" },
    { key: "medium" as const, count: medium, color: "bg-yellow-500" },
    { key: "low" as const, count: low, color: "bg-blue-500" },
    { key: "info" as const, count: info, color: "bg-slate-400" },
  ].filter((s) => s.count > 0);

  const total = critical + high + medium + low + info;

  if (total === 0) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
        <span className="text-sm font-medium text-emerald-600">No issues found</span>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {severities.map(({ key, count, color }) => (
        <div
          key={key}
          className="flex items-center gap-1.5 rounded-full bg-white border px-2 py-1 shadow-sm"
        >
          <span className={cn("h-2 w-2 rounded-full", color)} />
          <span className="text-xs font-medium capitalize text-slate-700">{key}</span>
          <span className="text-xs font-bold text-slate-900">{count}</span>
        </div>
      ))}
    </div>
  );
}
