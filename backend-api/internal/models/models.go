// Package models provides request/response models for the API.
package models

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

// Scanner defaults - this should match the Python SCANNER_DEFAULTS
var ScannerDefaults = map[string]bool{
	"sast":            true,
	"sca":             true,
	"secrets":         true,
	"secrets_deep":    false,
	"node":            true,
	"go":              true,
	"rust":            true,
	"python":          true,
	"dockerfile":      true,
	"dockerfile_lint": true,
	"misconfig":       true,
	"terraform":       true,
	"dast":            false,
}

// AllowedAuditTypes includes "all" plus all scanner keys
var AllowedAuditTypes = func() map[string]bool {
	m := make(map[string]bool, len(ScannerDefaults)+1)
	m["all"] = true
	for k := range ScannerDefaults {
		m[k] = true
	}
	return m
}()

// Validation constants
const (
	RepoURLLimit     = 2048
	BranchMaxLen     = 255
	AuditTypesMaxLen = 50
)

var (
	// Branch name: alphanumeric, dots, underscores, slashes, hyphens
	branchRe = regexp.MustCompile(`^[a-zA-Z0-9._/-]+$`)
)

// ScanRequest represents a request to create a new scan.
type ScanRequest struct {
	RepoURL        string   `json:"repo_url" binding:"required"`
	Branch         *string  `json:"branch,omitempty"`
	AuditTypes     []string `json:"audit_types" binding:"required"`
	SkipLFS        bool     `json:"skip_lfs"`
	ForceRescan    bool     `json:"force_rescan"`
	IsPrivate      bool     `json:"is_private"`
	EncryptedToken *string  `json:"encrypted_token,omitempty"`
}

// Validate performs validation on the scan request.
func (r *ScanRequest) Validate() error {
	// Validate repo_url
	if r.RepoURL == "" || !strings.Contains(strings.TrimSpace(r.RepoURL), ":") {
		return errors.New("repo_url is required")
	}
	trimmedURL := strings.TrimSpace(r.RepoURL)
	if len(trimmedURL) > RepoURLLimit {
		return errors.New("repo_url too long")
	}
	if !ValidateRepoURL(trimmedURL) {
		return errors.New("invalid repo_url: only http, https, git, ssh URLs are allowed")
	}
	r.RepoURL = trimmedURL

	// Validate branch
	if r.Branch != nil {
		branch, err := ValidateBranch(*r.Branch)
		if err != nil {
			return err
		}
		r.Branch = branch
	}

	// Validate audit_types
	if len(r.AuditTypes) == 0 {
		r.AuditTypes = []string{"all"}
	}
	if len(r.AuditTypes) > AuditTypesMaxLen {
		return fmt.Errorf("audit_types has at most %d entries", AuditTypesMaxLen)
	}
	normalized := make([]string, 0, len(r.AuditTypes))
	for _, entry := range r.AuditTypes {
		for _, item := range strings.Split(entry, ",") {
			item = strings.TrimSpace(strings.ToLower(item))
			if item != "" && AllowedAuditTypes[item] {
				normalized = append(normalized, item)
			}
		}
	}
	if len(normalized) == 0 {
		normalized = []string{"all"}
	}
	r.AuditTypes = normalized

	return nil
}

// ValidateRepoURL validates repository URL to prevent SSRF.
func ValidateRepoURL(repoURL string) bool {
	if repoURL == "" {
		return false
	}
	repoURL = strings.TrimSpace(repoURL)
	if len(repoURL) > RepoURLLimit {
		return false
	}

	// Allow SSH clone URLs (e.g. git@github.com:user/repo.git)
	if strings.HasPrefix(repoURL, "git@") {
		parts := strings.SplitN(repoURL, ":", 2)
		if len(parts) != 2 || parts[1] == "" || strings.HasPrefix(parts[1], "/") {
			return false
		}
		if strings.Contains(parts[1], "..") {
			return false
		}
		return true
	}

	parsed, err := url.Parse(repoURL)
	if err != nil {
		return false
	}

	allowedSchemes := map[string]bool{"http": true, "https": true, "git": true, "ssh": true}
	if parsed.Scheme == "" || !allowedSchemes[strings.ToLower(parsed.Scheme)] {
		return false
	}
	if strings.ToLower(parsed.Scheme) == "file" {
		return false
	}

	return true
}

// ValidateBranch validates branch name.
func ValidateBranch(branch string) (*string, error) {
	if branch == "" {
		return nil, nil
	}
	s := strings.TrimSpace(branch)
	if s == "" {
		return nil, nil
	}
	if len(s) > BranchMaxLen || !branchRe.MatchString(s) {
		return nil, fmt.Errorf("invalid branch name: allowed characters [a-zA-Z0-9._/-], max length %d", BranchMaxLen)
	}
	return &s, nil
}

// ScanResponse represents the response after creating a scan.
type ScanResponse struct {
	ScanID         string  `json:"scan_id"`
	Status         string  `json:"status"`
	Cached         bool    `json:"cached,omitempty"`
	CachedScanID   *string `json:"cached_scan_id,omitempty"`
}

// ScanStatusResponse represents the status of a scan.
type ScanStatusResponse struct {
	ScanID       string          `json:"scan_id"`
	Status       string          `json:"status"`
	Progress     *int            `json:"progress,omitempty"`
	ResultsPath  *string         `json:"results_path,omitempty"`
	CommitHash   *string         `json:"commit_hash,omitempty"`
	Error        *string         `json:"error,omitempty"`
	Result       json.RawMessage `json:"result,omitempty"`
}

// HealthResponse represents the health check response.
type HealthResponse struct {
	Status string `json:"status"`
}

// DetailedHealthResponse represents a detailed health check response.
type DetailedHealthResponse struct {
	API        string `json:"api"`
	PostgreSQL string `json:"postgresql"`
	Redis      string `json:"redis"`
	Timestamp  string `json:"timestamp"`
	Overall    string `json:"overall,omitempty"`
}

// ScannerDefinition represents a scanner definition.
type ScannerDefinition struct {
	Key             string `json:"key"`
	Name            string `json:"name"`
	Tool            string `json:"tool"`
	Description     string `json:"description"`
	DefaultEnabled  bool   `json:"defaultEnabled"`
	Order           int    `json:"order"`
	Enabled         bool   `json:"enabled"`
}

// ScannersResponse represents the scanners list response.
type ScannersResponse struct {
	Scanners []ScannerDefinition `json:"scanners"`
}

// AIAnalysisResponse represents the AI analysis queue response.
type AIAnalysisResponse struct {
	ScanID  string `json:"scan_id"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

// CeleryTaskInfo represents Celery task information.
type CeleryTaskInfo struct {
	State   string                 `json:"state"`
	Result  map[string]interface{} `json:"result,omitempty"`
	Traceback string               `json:"traceback,omitempty"`
	Children []interface{}         `json:"children,omitempty"`
}

// ErrorResponse represents an error response.
type ErrorResponse struct {
	Error   string `json:"error"`
	Detail  string `json:"detail,omitempty"`
}
