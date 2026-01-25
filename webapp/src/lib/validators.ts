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
  branch: z.string().trim().min(1).max(120).optional().default("main"),
  auditTypes: z.array(z.enum(DEFAULT_AUDIT_TYPES)).optional()
});

export type ScanRequestInput = z.infer<typeof scanRequestSchema>;
