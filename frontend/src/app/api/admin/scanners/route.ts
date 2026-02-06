import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { scannerSettings } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";

/** All known scanners with display metadata. */
const SCANNER_META: Record<
  string,
  { name: string; tool: string; description: string; defaultEnabled: boolean }
> = {
  sast: { name: "SAST", tool: "Semgrep", description: "Static application security testing", defaultEnabled: true },
  terraform: { name: "Terraform", tool: "tfsec/checkov/tflint", description: "Infrastructure-as-code scanning", defaultEnabled: true },
  dockerfile: { name: "Dockerfile", tool: "Trivy", description: "Container image vulnerability scanning", defaultEnabled: true },
  node: { name: "Node.js", tool: "npm/pnpm audit", description: "JavaScript dependency vulnerabilities", defaultEnabled: true },
  go: { name: "Go", tool: "govulncheck", description: "Go module vulnerability scanning", defaultEnabled: true },
  rust: { name: "Rust", tool: "cargo-audit", description: "Rust dependency vulnerability scanning", defaultEnabled: true },
  secrets: { name: "Secrets", tool: "Gitleaks", description: "Secret and credential detection", defaultEnabled: true },
  sca: { name: "SCA", tool: "OSV-Scanner", description: "Software composition analysis", defaultEnabled: true },
  python: { name: "Python", tool: "Bandit", description: "Python security linting", defaultEnabled: true },
  dockerfile_lint: { name: "Dockerfile Lint", tool: "Hadolint", description: "Dockerfile best practices", defaultEnabled: true },
  misconfig: { name: "Misconfiguration", tool: "Trivy Config", description: "K8s/Docker Compose config scanning", defaultEnabled: true },
  dast: { name: "DAST", tool: "OWASP ZAP", description: "Dynamic application security testing", defaultEnabled: false },
  secrets_deep: { name: "Deep Secrets", tool: "TruffleHog", description: "Deep secret scanning (thorough)", defaultEnabled: false },
};

export async function GET() {
  const session = await getServerAuth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const rows = await db.select().from(scannerSettings);

  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

  const scanners = Object.entries(SCANNER_META).map(([key, meta]) => ({
    id: key,
    enabled: byId[key]?.enabled ?? meta.defaultEnabled,
    updatedAt: byId[key]?.updatedAt?.toISOString() ?? null,
    ...meta,
  }));

  return NextResponse.json({ scanners });
}

export async function PATCH(request: Request) {
  const session = await getServerAuth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.scanners !== "object") {
    return NextResponse.json(
      { error: "Invalid request. Expected { scanners: { [key]: boolean } }" },
      { status: 400 }
    );
  }

  const updates = body.scanners as Record<string, boolean>;
  const now = new Date();

  for (const [key, enabled] of Object.entries(updates)) {
    if (!(key in SCANNER_META) || typeof enabled !== "boolean") continue;

    await db
      .insert(scannerSettings)
      .values({ id: key, enabled, updatedAt: now })
      .onConflictDoUpdate({
        target: scannerSettings.id,
        set: { enabled, updatedAt: now },
      });
  }

  return NextResponse.json({ ok: true });
}
