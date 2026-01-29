/**
 * Shared types for scans (API responses and UI).
 */

export type ScanRecord = {
  id: number;
  scanId: string;
  userId: string;
  repoUrl: string;
  branch: string | null;
  commitHash: string | null;
  auditTypes: string[] | null;
  status: string;
  progress: number | null;
  resultsPath: string | null;
  result: Record<string, unknown> | null;
  findingsCount?: number | null;
  criticalCount?: number | null;
  highCount?: number | null;
  mediumCount?: number | null;
  lowCount?: number | null;
  infoCount?: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/** Subset of ScanRecord used by scan results / summary views. */
export type ScanData = {
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

/** Result of a single batch scan submission. */
export type BatchScanResult = {
  repoUrl: string;
  scanId: string | null;
  status: "success" | "error";
  error?: string;
};
