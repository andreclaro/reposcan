// Package config provides scanner configuration management.
package config

import (
	"os"
	"strings"
)

// ScannerRegistryEntry represents a scanner in the registry.
type ScannerRegistryEntry struct {
	Key            string
	Name           string
	Tool           string
	Description    string
	DefaultEnabled bool
	Order          int
}

// ScannerRegistry is the authoritative scanner registry.
var ScannerRegistry = []ScannerRegistryEntry{
	{Key: "sast", Name: "SAST", Tool: "Semgrep", Description: "Static application security testing", DefaultEnabled: true, Order: 10},
	{Key: "sca", Name: "SCA", Tool: "OSV-Scanner", Description: "Software composition analysis", DefaultEnabled: true, Order: 20},
	{Key: "secrets", Name: "Secrets", Tool: "Gitleaks", Description: "Secret and credential detection", DefaultEnabled: true, Order: 30},
	{Key: "secrets_deep", Name: "Deep Secrets", Tool: "TruffleHog", Description: "Deep secret scanning (thorough)", DefaultEnabled: false, Order: 40},
	{Key: "node", Name: "Node.js", Tool: "npm/pnpm audit", Description: "JavaScript dependency vulnerabilities", DefaultEnabled: true, Order: 50},
	{Key: "go", Name: "Go", Tool: "govulncheck", Description: "Go module vulnerability scanning", DefaultEnabled: true, Order: 60},
	{Key: "rust", Name: "Rust", Tool: "cargo-audit", Description: "Rust dependency vulnerability scanning", DefaultEnabled: true, Order: 70},
	{Key: "python", Name: "Python", Tool: "Bandit", Description: "Python security linting", DefaultEnabled: true, Order: 80},
	{Key: "dockerfile", Name: "Dockerfile", Tool: "Trivy", Description: "Container image vulnerability scanning", DefaultEnabled: true, Order: 90},
	{Key: "dockerfile_lint", Name: "Dockerfile Lint", Tool: "Hadolint", Description: "Dockerfile best practices", DefaultEnabled: true, Order: 100},
	{Key: "misconfig", Name: "Misconfiguration", Tool: "Trivy Config", Description: "K8s/Docker Compose config scanning", DefaultEnabled: true, Order: 110},
	{Key: "terraform", Name: "Terraform", Tool: "tfsec/checkov/tflint", Description: "Infrastructure-as-code scanning", DefaultEnabled: true, Order: 120},
	{Key: "dast", Name: "DAST", Tool: "OWASP ZAP", Description: "Dynamic application security testing", DefaultEnabled: false, Order: 130},
}

// ScannerDefaults maps scanner keys to their default enabled state.
var ScannerDefaults = func() map[string]bool {
	m := make(map[string]bool, len(ScannerRegistry))
	for _, s := range ScannerRegistry {
		m[s.Key] = s.DefaultEnabled
	}
	return m
}()

// IsScannerEnabled checks if a scanner is enabled.
// Reads from environment variable first, falls back to default.
func IsScannerEnabled(auditType string) bool {
	// Build environment variable name
	envVar := "SCANNER_" + sanitizeEnvVar(auditType) + "_ENABLED"
	envValue := os.Getenv(envVar)
	if envValue != "" {
		return isTruthy(envValue)
	}
	return ScannerDefaults[auditType]
}

// GetScannerRegistry returns the full scanner registry with current enabled state.
func GetScannerRegistry() []map[string]interface{} {
	result := make([]map[string]interface{}, 0, len(ScannerRegistry))
	for _, scanner := range ScannerRegistry {
		entry := map[string]interface{}{
			"key":            scanner.Key,
			"name":           scanner.Name,
			"tool":           scanner.Tool,
			"description":    scanner.Description,
			"defaultEnabled": scanner.DefaultEnabled,
			"order":          scanner.Order,
			"enabled":        IsScannerEnabled(scanner.Key),
		}
		result = append(result, entry)
	}
	return result
}

// GetEnabledScanners returns the set of enabled scanners.
func GetEnabledScanners() map[string]bool {
	enabled := make(map[string]bool)
	for _, scanner := range ScannerRegistry {
		if IsScannerEnabled(scanner.Key) {
			enabled[scanner.Key] = true
		}
	}
	return enabled
}

// GetDisabledScanners returns the set of disabled scanners.
func GetDisabledScanners() map[string]bool {
	disabled := make(map[string]bool)
	for _, scanner := range ScannerRegistry {
		if !IsScannerEnabled(scanner.Key) {
			disabled[scanner.Key] = true
		}
	}
	return disabled
}

// ShouldRunScanner determines if a scanner should run based on configuration and selection.
func ShouldRunScanner(auditType string, selectedAudits []string) bool {
	if !IsScannerEnabled(auditType) {
		return false
	}
	return ShouldRunAudit(selectedAudits, auditType)
}

// ShouldRunAudit checks if an audit type is in selected audits or if "all" is selected.
func ShouldRunAudit(selectedAudits []string, auditType string) bool {
	for _, a := range selectedAudits {
		if a == "all" || a == auditType {
			return true
		}
	}
	return false
}

// ParseAuditSelection parses audit selection; returns ["all"] when empty.
func ParseAuditSelection(selection []string) []string {
	if len(selection) == 0 {
		return []string{"all"}
	}
	audits := make([]string, 0)
	for _, entry := range selection {
		for _, item := range strings.Split(entry, ",") {
			item = strings.TrimSpace(strings.ToLower(item))
			if item != "" {
				audits = append(audits, item)
			}
		}
	}
	if len(audits) == 0 {
		return []string{"all"}
	}
	return audits
}

// sanitizeEnvVar converts audit type to env var format.
func sanitizeEnvVar(auditType string) string {
	s := strings.ToUpper(auditType)
	s = strings.ReplaceAll(s, "-", "_")
	s = strings.ReplaceAll(s, " ", "_")
	return s
}

// isTruthy checks if a string represents a truthy value.
func isTruthy(value string) bool {
	v := strings.ToLower(value)
	return v == "true" || v == "1" || v == "yes" || v == "on"
}
