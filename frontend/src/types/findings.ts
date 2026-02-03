/**
 * Shared types for findings (API responses and UI).
 */

export type Finding = {
  id: number;
  scanId: string;
  scanner: string;
  severity: string;
  category: string | null;
  title: string;
  description: string | null;
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  codeSnippet: string | null;
  cwe: string | null;
  cve: string | null;
  remediation: string | null;
  confidence: string | null;
  metadata: Record<string, unknown> | null | string;
};

export type FindingsSummary = {
  total: number;
  by_severity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  by_category: Record<string, number>;
  by_scanner: Record<string, number>;
};

export type TopFinding = {
  id: number;
  title: string;
  severity: string;
  category?: string | null;
  scanner?: string;
};
