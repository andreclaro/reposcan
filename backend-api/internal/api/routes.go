// Package api provides HTTP handlers and routes for the security audit API.
package api

import (
	"os"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// getAllowedOrigins returns the list of allowed CORS origins.
// It reads from CORS_ALLOWED_ORIGINS env var (comma-separated) or defaults to allowing all origins.
func getAllowedOrigins() []string {
	if origins := os.Getenv("CORS_ALLOWED_ORIGINS"); origins != "" {
		// Split by comma and trim whitespace
		list := strings.Split(origins, ",")
		for i, o := range list {
			list[i] = strings.TrimSpace(o)
		}
		return list
	}
	// Default: allow all origins (development mode)
	return []string{"*"}
}

// SetupRoutes configures all API routes.
func SetupRoutes(handler *Handler) *gin.Engine {
	router := gin.Default()

	// Configure CORS
	allowedOrigins := getAllowedOrigins()
	allowAllOrigins := len(allowedOrigins) == 1 && allowedOrigins[0] == "*"
	
	config := cors.Config{
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: !allowAllOrigins, // Credentials only work with specific origins, not "*"
		MaxAge:           12 * time.Hour,
	}
	
	if allowAllOrigins {
		config.AllowAllOrigins = true
	} else {
		config.AllowOrigins = allowedOrigins
	}
	
	router.Use(cors.New(config))

	// Health endpoints
	router.GET("/health", handler.Health)
	router.GET("/health/detailed", handler.DetailedHealth)

	// Scan endpoints
	router.POST("/scan", handler.CreateScan)
	router.POST("/scan/:scan_id/retry", handler.RetryScan)
	router.GET("/scan/:scan_id/status", handler.GetScanStatus)
	router.POST("/scan/:scan_id/generate-ai", handler.GenerateAIAnalysis)

	// Scanners endpoint
	router.GET("/scanners", handler.ListScanners)

	return router
}
