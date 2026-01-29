"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Trash2,
  RefreshCcw,
  FileText,
  ExternalLink,
  Loader2,
  Brain
} from "lucide-react";

import { Button } from "@/components/ui/button";

type ScanWithUser = {
  id: number;
  scanId: string;
  userId: string;
  userEmail: string | null;
  repoUrl: string;
  branch: string | null;
  commitHash: string | null;
  auditTypes: string[] | null;
  status: string;
  progress: number | null;
  resultsPath: string | null;
  s3ResultsPath: string | null;
  findingsCount: number | null;
  criticalCount: number | null;
  highCount: number | null;
  mediumCount: number | null;
  lowCount: number | null;
  infoCount: number | null;
  aiAnalysisId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type AdminScanDetailProps = {
  scan: ScanWithUser;
  onRescan: () => void;
  onDelete: () => void;
};

type LogFile = {
  filename: string;
  content: string;
  size: number;
};

export default function AdminScanDetail({
  scan,
  onRescan,
  onDelete
}: AdminScanDetailProps) {
  const [logs, setLogs] = useState<LogFile[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRescanning, setIsRescanning] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const fetchLogs = async () => {
      setIsLoadingLogs(true);
      setLogsError(null);
      try {
        const response = await fetch(`/api/admin/scans/${scan.scanId}/logs`);
        if (response.ok) {
          const data = await response.json();
          setLogs(data.logs ?? []);
          if (data.logs?.length > 0) {
            setSelectedLog(data.logs[0].filename);
          }
        } else {
          const error = await response.json();
          setLogsError(error.error ?? "Failed to load logs");
        }
      } catch {
        setLogsError("Failed to load logs");
      } finally {
        setIsLoadingLogs(false);
      }
    };

    fetchLogs();
  }, [scan.scanId]);

  const handleRescan = async () => {
    setIsRescanning(true);
    try {
      await onRescan();
    } finally {
      setIsRescanning(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const selectedLogContent = logs.find((l) => l.filename === selectedLog);

  return (
    <div className="border-t bg-muted/10 px-6 py-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Scan Metadata */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Scan Details</h3>

          <div className="rounded-lg border bg-background p-4">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Scan ID</dt>
                <dd className="font-mono text-xs">{scan.scanId}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Repository</dt>
                <dd className="truncate max-w-[250px]">{scan.repoUrl}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Branch</dt>
                <dd>{scan.branch ?? "auto-detect"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Commit Hash</dt>
                <dd className="font-mono text-xs">
                  {scan.commitHash ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">User</dt>
                <dd>{scan.userEmail ?? scan.userId}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="capitalize">{scan.status}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Progress</dt>
                <dd>{scan.progress ?? 0}%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Audit Types</dt>
                <dd>{scan.auditTypes?.join(", ") ?? "default"}</dd>
              </div>
            </dl>
          </div>

          {/* Storage Paths */}
          <div className="rounded-lg border bg-background p-4">
            <h4 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
              Storage
            </h4>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Results Path</dt>
                <dd className="font-mono text-xs break-all">
                  {scan.resultsPath ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">S3 Path</dt>
                <dd className="font-mono text-xs break-all">
                  {scan.s3ResultsPath ?? "—"}
                </dd>
              </div>
            </dl>
          </div>

          {/* Findings Summary */}
          <div className="rounded-lg border bg-background p-4">
            <h4 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
              Findings Summary
            </h4>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-red-600">
                  {scan.criticalCount ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">Critical</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-600">
                  {scan.highCount ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">High</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-600">
                  {scan.mediumCount ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">Medium</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">
                  {scan.lowCount ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">Low</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-500">
                  {scan.infoCount ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">Info</p>
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {scan.findingsCount ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </div>

          {/* AI Analysis Link */}
          {scan.aiAnalysisId && (
            <div className="rounded-lg border bg-background p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="size-4 text-primary" />
                  <span className="text-sm font-medium">AI Analysis</span>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/scans/${scan.scanId}#ai-analysis`}>
                    <ExternalLink className="size-4" />
                    View
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleRescan}
              disabled={isRescanning}
            >
              {isRescanning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCcw className="size-4" />
              )}
              Re-scan (bypass cache)
            </Button>
            {scan.status === "completed" && (
              <Button asChild variant="outline">
                <Link href={`/app/scans/${scan.scanId}`}>
                  <ExternalLink className="size-4" />
                  View Results
                </Link>
              </Button>
            )}
            {!showDeleteConfirm ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-1.5">
                <span className="text-sm text-destructive">Confirm delete?</span>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? "Deleting..." : "Yes"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                >
                  No
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Logs Viewer */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Scanner Logs</h3>

          {isLoadingLogs ? (
            <div className="flex items-center justify-center rounded-lg border bg-background p-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : logsError ? (
            <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
              {logsError}
            </div>
          ) : logs.length === 0 ? (
            <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
              {scan.status === "failed"
                ? "No log files found for this scan yet. The scan may have failed before writing scanner output. Check the worker.log file or worker service logs for more details."
                : "No log files found for this scan."}
            </div>
          ) : (
            <>
              {/* Log file tabs */}
              <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/50 p-1">
                {logs.map((log) => (
                  <button
                    key={log.filename}
                    type="button"
                    onClick={() => setSelectedLog(log.filename)}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      selectedLog === log.filename
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <FileText className="size-3" />
                    {log.filename}
                  </button>
                ))}
              </div>

              {/* Log content */}
              {selectedLogContent && (
                <div className="relative rounded-lg border bg-background">
                  <div className="absolute right-2 top-2 text-xs text-muted-foreground">
                    {(selectedLogContent.size / 1024).toFixed(1)} KB
                  </div>
                  <pre className="max-h-[400px] overflow-auto p-4 text-xs">
                    {selectedLogContent.content}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
