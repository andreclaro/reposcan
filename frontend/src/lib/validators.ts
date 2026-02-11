import { z } from "zod";

import { parseGitHubUrl } from "./github-url";

// DEPRECATED: Use getDefaultAuditTypesForUser() from API or getScannerRegistry() from lib/scanner-registry.
// This is only a fallback when backend/admin panel is unreachable.
// The admin panel (scannerSettings table) is the source of truth for enabled scanners.
export const DEFAULT_AUDIT_TYPES = [
  "sast",
  "sca",
  "secrets",
  "node",
  "go",
  "rust",
  "python",
  "dockerfile",
  "dockerfile_lint",
  "misconfig",
  "terraform"
] as const;

/** Accepts full GitHub URL or owner/repo (e.g. awesome-selfhosted/awesome-selfhosted). */
const githubUrlSchema = z
  .string()
  .min(1, "Repository URL or owner/repo is required")
  .refine(
    (value) => parseGitHubUrl(value.trim()).valid,
    "Enter a valid GitHub URL or owner/repo (e.g. org/repo)"
  );

export const scanRequestSchema = z.object({
  repoUrl: githubUrlSchema,
  // Branch is optional: when omitted or empty, the backend will
  // auto-detect the repository's default branch (e.g. master/main).
  branch: z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return value;
      }
      const trimmed = value.trim();
      return trimmed === "" ? undefined : trimmed;
    },
    z.string().max(120).optional()
  ),
  auditTypes: z.array(z.string().min(1).max(50)).optional(),
  forceRescan: z.boolean().optional(),
  // Optional commit hash (7–40 hex chars); when provided, used for existing-scan lookup and skips GitHub API.
  commitHash: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().regex(/^[0-9a-fA-F]{7,40}$/, "Must be 7–40 hex characters").optional()
  ),
  // Whether the repository is private and requires authentication
  // Note: No default here - frontend sends true when unknown to ensure private repos work
  isPrivate: z.boolean().optional(),
});

export type ScanRequestInput = z.infer<typeof scanRequestSchema>;
