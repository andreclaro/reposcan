import { z } from "zod";

export const DEFAULT_AUDIT_TYPES = [
  "sast",
  "dockerfile",
  "terraform",
  "node",
  "go",
  "rust"
] as const;

const githubUrlSchema = z.string().url().refine((value) => {
  const url = new URL(value);
  if (!["github.com", "www.github.com"].includes(url.hostname)) {
    return false;
  }
  const parts = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
  return parts.length >= 2;
}, "Enter a valid GitHub repository URL");

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
  auditTypes: z.array(z.enum(DEFAULT_AUDIT_TYPES)).optional(),
  forceRescan: z.boolean().optional(),
});

export type ScanRequestInput = z.infer<typeof scanRequestSchema>;
