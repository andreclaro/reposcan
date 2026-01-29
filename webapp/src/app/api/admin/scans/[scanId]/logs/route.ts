import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";

import { db } from "@/db";
import { scans } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";

type RouteParams = { params: Promise<{ scanId: string }> };

const RESULTS_DIR = process.env.RESULTS_DIR ?? "./results";

// Files to look for in the scan results directory
const LOG_FILES = [
  "worker.log",
  "semgrep.txt",
  "semgrep.json",
  "trivy_dockerfile_scan.txt",
  "trivy_fs_scan.txt",
  "node_audit.txt",
  "go_vulncheck.txt",
  "rust_audit.txt",
  "tfsec.txt",
  "checkov.txt",
  "tflint.txt",
  "languages.csv",
  "results.json"
];

// Maximum file size to read (1MB)
const MAX_FILE_SIZE = 1024 * 1024;

export async function GET(request: Request, { params }: RouteParams) {
  const session = await getServerAuth();

  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { scanId } = await params;

  // Get scan record to find results path
  const [scan] = await db
    .select({ resultsPath: scans.resultsPath })
    .from(scans)
    .where(eq(scans.scanId, scanId))
    .limit(1);

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  // Determine the results directory
  const resultsDir = scan.resultsPath ?? path.join(RESULTS_DIR, scanId);

  const logs: { filename: string; content: string; size: number }[] = [];

  // Try to read each log file
  for (const filename of LOG_FILES) {
    const filePath = path.join(resultsDir, filename);
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        let content: string;
        if (stat.size > MAX_FILE_SIZE) {
          // Read only first 1MB for large files
          const buffer = Buffer.alloc(MAX_FILE_SIZE);
          const fd = await fs.open(filePath, "r");
          await fd.read(buffer, 0, MAX_FILE_SIZE, 0);
          await fd.close();
          content = buffer.toString("utf-8") + "\n\n... (file truncated, showing first 1MB)";
        } else {
          content = await fs.readFile(filePath, "utf-8");
        }

        logs.push({
          filename,
          content,
          size: stat.size
        });
      }
    } catch {
      // File doesn't exist or can't be read, skip it
    }
  }

  return NextResponse.json({ logs, resultsDir });
}
