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

type PlanKey = "free" | "pro" | "custom";

type ScannerSetting = {
  id: string;
  enabled: boolean;
  freeEnabled: boolean;
  proEnabled: boolean;
  customEnabled: boolean;
  updatedAt: Date | null;
};

type ScannerState = {
  enabled: boolean;
  freeEnabled: boolean;
  proEnabled: boolean;
  customEnabled: boolean;
};

type Props = {
  initialSettings: ScannerSetting[];
};

export default function AdminScanners({ initialSettings }: Props) {
  const [settings, setSettings] = useState<Record<string, ScannerState>>(() => {
    const map: Record<string, ScannerState> = {};
    for (const [key, meta] of Object.entries(SCANNER_META)) {
      map[key] = {
        enabled: meta.defaultEnabled,
        freeEnabled: true,
        proEnabled: true,
        customEnabled: true,
      };
    }
    for (const row of initialSettings) {
      if (map[row.id]) {
        map[row.id] = {
          enabled: row.enabled,
          freeEnabled: row.freeEnabled,
          proEnabled: row.proEnabled,
          customEnabled: row.customEnabled,
        };
      }
    }
    return map;
  });
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleGlobalToggle = async (key: string) => {
    const newValue = !settings[key]?.enabled;

    setSettings((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: newValue },
    }));
    setLoading((prev) => ({ ...prev, [key]: true }));
    setErrors((prev) => ({ ...prev, [key]: "" }));

    try {
      const res = await fetch("/api/admin/scanners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanners: { [key]: newValue } }),
      });
      if (!res.ok) throw new Error("Failed to update");
    } catch {
      setSettings((prev) => ({
        ...prev,
        [key]: { ...prev[key], enabled: !newValue },
      }));
      setErrors((prev) => ({ ...prev, [key]: "Failed to save" }));
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handlePlanToggle = async (scannerKey: string, plan: PlanKey) => {
    const fieldKey = `${plan}Enabled` as const;
    const newValue = !settings[scannerKey]?.[fieldKey];

    setSettings((prev) => ({
      ...prev,
      [scannerKey]: { ...prev[scannerKey], [fieldKey]: newValue },
    }));
    const loadingKey = `${scannerKey}_${plan}`;
    setLoading((prev) => ({ ...prev, [loadingKey]: true }));
    setErrors((prev) => ({ ...prev, [scannerKey]: "" }));

    try {
      const res = await fetch("/api/admin/scanners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planAccess: { [scannerKey]: { [plan]: newValue } },
        }),
      });
      if (!res.ok) throw new Error("Failed to update");
    } catch {
      setSettings((prev) => ({
        ...prev,
        [scannerKey]: { ...prev[scannerKey], [fieldKey]: !newValue },
      }));
      setErrors((prev) => ({ ...prev, [scannerKey]: "Failed to save" }));
    } finally {
      setLoading((prev) => ({ ...prev, [loadingKey]: false }));
    }
  };

  const enabledCount = Object.values(settings).filter((s) => s.enabled).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {enabledCount} of {Object.keys(SCANNER_META).length} scanners enabled
        globally
      </p>

      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Scanner</th>
              <th className="px-3 py-3 text-center font-medium w-20">Global</th>
              <th className="px-3 py-3 text-center font-medium w-20">Free</th>
              <th className="px-3 py-3 text-center font-medium w-20">Pro</th>
              <th className="px-3 py-3 text-center font-medium w-20">Custom</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {SCANNER_ORDER.map((key) => {
              const meta = SCANNER_META[key];
              if (!meta) return null;
              const state = settings[key];
              if (!state) return null;
              const globalDisabled = !state.enabled;
              const error = errors[key];

              return (
                <tr key={key} className={globalDisabled ? "opacity-60" : ""}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{meta.name}</span>
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
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Switch
                      checked={state.enabled}
                      onCheckedChange={() => handleGlobalToggle(key)}
                      disabled={!!loading[key]}
                      aria-label={`${state.enabled ? "Disable" : "Enable"} ${meta.name} globally`}
                    />
                  </td>
                  {(["free", "pro", "custom"] as const).map((plan) => {
                    const fieldKey = `${plan}Enabled` as const;
                    const loadingKey = `${key}_${plan}`;
                    return (
                      <td key={plan} className="px-3 py-3 text-center">
                        <Switch
                          checked={state[fieldKey]}
                          onCheckedChange={() => handlePlanToggle(key, plan)}
                          disabled={globalDisabled || !!loading[loadingKey]}
                          aria-label={`${state[fieldKey] ? "Disable" : "Enable"} ${meta.name} for ${plan} plan`}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
