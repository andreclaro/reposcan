// Package api provides HTTP handlers for the security audit API.
package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/securefast/api/internal/celery"
	"github.com/securefast/api/internal/config"
	"github.com/securefast/api/internal/models"
)

// Handler holds dependencies for API handlers.
type Handler struct {
	celery      *celery.Client
	dbPool      *pgxpool.Pool
	resultsDir  string
	redisURL    string
}

// NewHandler creates a new API handler.
func NewHandler(celeryClient *celery.Client, dbPool *pgxpool.Pool) *Handler {
	resultsDir := os.Getenv("RESULTS_DIR")
	if resultsDir == "" {
		resultsDir = "./results"
	}
	
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379/0"
	}

	return &Handler{
		celery:     celeryClient,
		dbPool:     dbPool,
		resultsDir: resultsDir,
		redisURL:   redisURL,
	}
}

// CreateScan handles POST /scan - queues a new security scan job.
func (h *Handler) CreateScan(c *gin.Context) {
	var req models.ScanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:  "Invalid request",
			Detail: err.Error(),
		})
		return
	}

	// Validate request
	if err := req.Validate(); err != nil {
		c.JSON(http.StatusUnprocessableEntity, models.ErrorResponse{
			Error:  "Validation failed",
			Detail: err.Error(),
		})
		return
	}

	// Generate scan ID
	scanID := uuid.New().String()

	// Convert request to map for Celery
	requestData := map[string]interface{}{
		"repo_url":        req.RepoURL,
		"branch":          req.Branch,
		"audit_types":     req.AuditTypes,
		"skip_lfs":        req.SkipLFS,
		"force_rescan":    req.ForceRescan,
		"is_private":      req.IsPrivate,
		"encrypted_token": req.EncryptedToken,
	}

	// Send task to Celery
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	_, err := h.celery.SendTask(ctx, "tasks.scan_worker.run_scan", []interface{}{scanID, requestData}, scanID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:  "Failed to queue scan",
			Detail: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.ScanResponse{
		ScanID: scanID,
		Status: "queued",
	})
}

// RetryScan handles POST /scan/{scan_id}/retry - retries an existing scan.
func (h *Handler) RetryScan(c *gin.Context) {
	scanID := c.Param("scan_id")

	// Validate scan_id is a valid UUID
	if _, err := uuid.Parse(scanID); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:  "Invalid scan_id",
			Detail: err.Error(),
		})
		return
	}

	var req models.ScanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:  "Invalid request",
			Detail: err.Error(),
		})
		return
	}

	// Validate request
	if err := req.Validate(); err != nil {
		c.JSON(http.StatusUnprocessableEntity, models.ErrorResponse{
			Error:  "Validation failed",
			Detail: err.Error(),
		})
		return
	}

	// Convert request to map for Celery
	requestData := map[string]interface{}{
		"repo_url":        req.RepoURL,
		"branch":          req.Branch,
		"audit_types":     req.AuditTypes,
		"skip_lfs":        req.SkipLFS,
		"force_rescan":    req.ForceRescan,
		"is_private":      req.IsPrivate,
		"encrypted_token": req.EncryptedToken,
	}

	// Send task to Celery using the existing scan_id
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	_, err := h.celery.SendTask(ctx, "tasks.scan_worker.run_scan", []interface{}{scanID, requestData}, scanID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:  "Failed to queue retry",
			Detail: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.ScanResponse{
		ScanID: scanID,
		Status: "queued",
	})
}

// GetScanStatus handles GET /scan/{scan_id}/status - gets scan status.
func (h *Handler) GetScanStatus(c *gin.Context) {
	scanID := c.Param("scan_id")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	info, err := h.celery.GetTaskResult(ctx, scanID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:  "Failed to get scan status",
			Detail: err.Error(),
		})
		return
	}

	response := models.ScanStatusResponse{
		ScanID: scanID,
		Status: mapCeleryStateToStatus(info.State),
	}

	switch info.State {
	case celery.TaskStatePending:
		progress := 0
		response.Progress = &progress

	case celery.TaskStateStarted, celery.TaskStateProgress:
		progress := 0
		if info.Result != nil {
			if p, ok := info.Result["progress"].(float64); ok {
				progress = int(p)
			}
		}
		response.Progress = &progress
		if currentStep, ok := info.Result["current_step"].(string); ok {
			response.Error = &currentStep // Show current step as info
		}

	case celery.TaskStateSuccess:
		progress := 100
		response.Progress = &progress
		if info.Result != nil {
			if path, ok := info.Result["results_path"].(string); ok {
				response.ResultsPath = &path
			}
			if commit, ok := info.Result["commit_hash"].(string); ok {
				response.CommitHash = &commit
			}
			// Include full result
			if resultData, err := json.Marshal(info.Result); err == nil {
				response.Result = resultData
			}
		}

	case celery.TaskStateFailure:
		if info.Traceback != "" {
			response.Error = &info.Traceback
		} else if info.Result != nil {
			errMsg := fmt.Sprintf("%v", info.Result)
			response.Error = &errMsg
		} else {
			defaultErr := "Task failed"
			response.Error = &defaultErr
		}

	case celery.TaskStateRetry:
		errMsg := "Retrying after error"
		if info.Result != nil {
			errMsg = fmt.Sprintf("Retrying: %v", info.Result)
		}
		response.Error = &errMsg

	default:
		response.Status = info.State
		if info.Result != nil {
			msg := fmt.Sprintf("%v", info.Result)
			response.Error = &msg
		}
	}

	c.JSON(http.StatusOK, response)
}

// GenerateAIAnalysis handles POST /scan/{scan_id}/generate-ai - queues AI analysis.
func (h *Handler) GenerateAIAnalysis(c *gin.Context) {
	scanID := c.Param("scan_id")

	// Validate scan_id is a valid UUID
	if _, err := uuid.Parse(scanID); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:  "Invalid scan_id",
			Detail: err.Error(),
		})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	taskID := fmt.Sprintf("generate-ai-%s", scanID)
	_, err := h.celery.SendTask(ctx, "tasks.scan_worker.generate_ai_analysis", []interface{}{scanID}, taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:  "Failed to queue AI analysis",
			Detail: err.Error(),
		})
		return
	}

	c.JSON(http.StatusAccepted, models.AIAnalysisResponse{
		ScanID:  scanID,
		Status:  "queued",
		Message: "AI analysis generation queued",
	})
}

// ListScanners handles GET /scanners - returns scanner registry.
func (h *Handler) ListScanners(c *gin.Context) {
	scanners := config.GetScannerRegistry()
	c.JSON(http.StatusOK, gin.H{"scanners": scanners})
}

// Health handles GET /health - basic health check.
func (h *Handler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, models.HealthResponse{Status: "ok"})
}

// DetailedHealth handles GET /health/detailed - detailed health check.
func (h *Handler) DetailedHealth(c *gin.Context) {
	status := models.DetailedHealthResponse{
		API:       "up",
		PostgreSQL: "down",
		Redis:     "down",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	// Check PostgreSQL
	if h.dbPool != nil {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()
		if err := h.dbPool.Ping(ctx); err == nil {
			status.PostgreSQL = "up"
		}
	}

	// Check Redis
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()
	if err := h.celery.Ping(ctx); err == nil {
		status.Redis = "up"
	}

	// Determine overall status
	if status.API == "up" && status.PostgreSQL == "up" && status.Redis == "up" {
		status.Overall = "up"
	} else if status.API == "up" {
		status.Overall = "degraded"
	} else {
		status.Overall = "down"
	}

	c.JSON(http.StatusOK, status)
}

// mapCeleryStateToStatus maps Celery states to API status strings.
func mapCeleryStateToStatus(state string) string {
	switch state {
	case celery.TaskStatePending:
		return "queued"
	case celery.TaskStateStarted, celery.TaskStateProgress:
		return "running"
	case celery.TaskStateSuccess:
		return "completed"
	case celery.TaskStateFailure:
		return "failed"
	case celery.TaskStateRetry:
		return "retrying"
	case celery.TaskStateRevoked:
		return "revoked"
	default:
		return state
	}
}
