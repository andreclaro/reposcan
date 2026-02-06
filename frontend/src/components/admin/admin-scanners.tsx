"use client";

import { useState } from "react";

import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

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

const SCANNER_ORDER = [
  "sast", "sca", "secrets", "secrets_deep",
  "node", "go", "rust", "python",
  "dockerfile", "dockerfile_lint", "misconfig", "terraform",
  "dast",
];

type ScannerSetting = { id: string; enabled: boolean; updatedAt: Date | null };

type Props = {
  initialSettings: ScannerSetting[];
};

export default function AdminScanners({ initialSettings }: Props) {
  const [settings, setSettings] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const [key, meta] of Object.entries(SCANNER_META)) {
      map[key] = meta.defaultEnabled;
    }
    for (const row of initialSettings) {
      map[row.id] = row.enabled;
    }
    return map;
  });
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleToggle = async (key: string) => {
    const newValue = !settings[key];

    // Optimistic update
    setSettings((prev) => ({ ...prev, [key]: newValue }));
    setLoading((prev) => ({ ...prev, [key]: true }));
    setErrors((prev) => ({ ...prev, [key]: "" }));

    try {
      const res = await fetch("/api/admin/scanners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanners: { [key]: newValue } }),
      });

      if (!res.ok) {
        throw new Error("Failed to update scanner setting");
      }
    } catch {
      // Revert on error
      setSettings((prev) => ({ ...prev, [key]: !newValue }));
      setErrors((prev) => ({ ...prev, [key]: "Failed to save" }));
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const enabledCount = Object.values(settings).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {enabledCount} of {Object.keys(SCANNER_META).length} scanners enabled
      </p>

      <div className="divide-y rounded-lg border bg-background">
        {SCANNER_ORDER.map((key) => {
          const meta = SCANNER_META[key];
          if (!meta) return null;
          const enabled = settings[key] ?? meta.defaultEnabled;
          const isLoading = loading[key] ?? false;
          const error = errors[key];

          return (
            <div
              key={key}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{meta.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {meta.tool}
                  </Badge>
                  {!meta.defaultEnabled && (
                    <Badge variant="warning" className="text-xs">
                      Off by default
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {meta.description}
                </p>
                {error && (
                  <p className="mt-0.5 text-xs text-destructive">{error}</p>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`text-xs font-medium ${
                    enabled ? "text-green-600" : "text-muted-foreground"
                  }`}
                >
                  {enabled ? "Enabled" : "Disabled"}
                </span>
                <Switch
                  checked={enabled}
                  onCheckedChange={() => handleToggle(key)}
                  disabled={isLoading}
                  aria-label={`${enabled ? "Disable" : "Enable"} ${meta.name}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
