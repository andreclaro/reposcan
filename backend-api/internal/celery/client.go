// Package celery provides a client for interacting with Celery via Redis.
package celery

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
)

// Client represents a Celery client.
type Client struct {
	redis     *redis.Client
	brokerURL string
	queue     string
}

// TaskState represents Celery task states.
const (
	TaskStatePending  = "PENDING"
	TaskStateProgress = "PROGRESS"
	TaskStateSuccess  = "SUCCESS"
	TaskStateFailure  = "FAILURE"
	TaskStateRetry    = "RETRY"
	TaskStateStarted  = "STARTED"
	TaskStateRevoked  = "REVOKED"
)

// TaskInfo represents Celery task information from the result backend.
type TaskInfo struct {
	State     string                 `json:"status"`
	Result    map[string]interface{} `json:"result,omitempty"`
	Traceback string                 `json:"traceback,omitempty"`
	Children  []interface{}          `json:"children,omitempty"`
	TaskID    string                 `json:"task_id,omitempty"`
}

// TaskMessage represents a Celery task message body.
type TaskMessage struct {
	Task    string                 `json:"task"`
	ID      string                 `json:"id"`
	Args    []interface{}          `json:"args"`
	Kwargs  map[string]interface{} `json:"kwargs"`
	Retries int                    `json:"retries"`
	ETA     *string                `json:"eta,omitempty"`
}

// CeleryEnvelope represents the full Celery message format expected by Python Celery.
type CeleryEnvelope struct {
	Body            string                 `json:"body"`
	ContentEncoding string                 `json:"content-encoding"`
	ContentType     string                 `json:"content-type"`
	Headers         map[string]interface{} `json:"headers"`
	Properties      CeleryProperties       `json:"properties"`
}

// CeleryProperties represents the properties section of a Celery message.
type CeleryProperties struct {
	BodyEncoding    string                 `json:"body_encoding"`
	ContentType     string                 `json:"content_type"`
	ContentEncoding string                 `json:"content_encoding"`
	DeliveryInfo    DeliveryInfo           `json:"delivery_info"`
	DeliveryMode    int                    `json:"delivery_mode"`
	DeliveryTag     string                 `json:"delivery_tag"`
	Priority        int                    `json:"priority"`
	CorrelationID   string                 `json:"correlation_id"`
	ReplyTo         string                 `json:"reply_to"`
}

// DeliveryInfo represents the delivery information.
type DeliveryInfo struct {
	Exchange    string `json:"exchange"`
	RoutingKey  string `json:"routing_key"`
	Priority    int    `json:"priority"`
	Redelivered bool   `json:"redelivered"`
}

// ResultMessage represents a Celery result message.
type ResultMessage struct {
	Status    string        `json:"status"`
	Result    interface{}   `json:"result,omitempty"`
	Traceback string        `json:"traceback,omitempty"`
	Children  []interface{} `json:"children,omitempty"`
	TaskID    string        `json:"task_id,omitempty"`
}

// NewClient creates a new Celery client.
func NewClient(redisURL string) (*Client, error) {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Redis URL: %w", err)
	}

	client := redis.NewClient(opt)

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	return &Client{
		redis:     client,
		brokerURL: redisURL,
		queue:     "celery",
	}, nil
}

// Close closes the Redis connection.
func (c *Client) Close() error {
	return c.redis.Close()
}

// SendTask sends a task to Celery.
func (c *Client) SendTask(ctx context.Context, taskName string, args []interface{}, taskID string) (string, error) {
	if taskID == "" {
		taskID = uuid.New().String()
	}

	// Create the task message body
	taskBody := TaskMessage{
		Task:    taskName,
		ID:      taskID,
		Args:    args,
		Kwargs:  map[string]interface{}{},
		Retries: 0,
	}

	bodyJSON, err := json.Marshal(taskBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal task body: %w", err)
	}

	// Base64 encode the body (Celery's default for JSON serializer with Redis)
	encodedBody := base64.StdEncoding.EncodeToString(bodyJSON)

	// Create the full Celery envelope
	envelope := CeleryEnvelope{
		Body:            encodedBody,
		ContentEncoding: "utf-8",
		ContentType:     "application/json",
		Headers: map[string]interface{}{
			"task":       taskName,
			"id":         taskID,
			"retries":    0,
			"lang":       "py",
			"root_id":    taskID,
			"parent_id":  nil,
			"group":      nil,
			"timelimit":  []interface{}{nil, nil},
			"origin":     "gen-go-api@localhost",
			"ignore_result": false,
		},
		Properties: CeleryProperties{
			BodyEncoding:    "base64",
			ContentType:     "application/json",
			ContentEncoding: "utf-8",
			DeliveryInfo: DeliveryInfo{
				Exchange:    "celery",
				RoutingKey:  "celery",
				Priority:    0,
				Redelivered: false,
			},
			DeliveryMode:  2, // Persistent
			DeliveryTag:   uuid.New().String(),
			Priority:      0,
			CorrelationID: taskID,
			ReplyTo:       taskID,
		},
	}

	envelopeBody, err := json.Marshal(envelope)
	if err != nil {
		return "", fmt.Errorf("failed to marshal envelope: %w", err)
	}

	// Push to the Celery queue
	err = c.redis.LPush(ctx, c.queue, envelopeBody).Err()
	if err != nil {
		return "", fmt.Errorf("failed to push task to queue: %w", err)
	}

	return taskID, nil
}

// GetTaskResult retrieves the result of a task.
func (c *Client) GetTaskResult(ctx context.Context, taskID string) (*TaskInfo, error) {
	// Celery stores results in Redis with key pattern: celery-task-meta-<task_id>
	key := fmt.Sprintf("celery-task-meta-%s", taskID)

	data, err := c.redis.Get(ctx, key).Result()
	if err == redis.Nil {
		// Task not found, return pending state
		return &TaskInfo{State: TaskStatePending, TaskID: taskID}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get task result: %w", err)
	}

	var result ResultMessage
	if err := json.Unmarshal([]byte(data), &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal task result: %w", err)
	}

	info := &TaskInfo{
		State:     result.Status,
		Result:    make(map[string]interface{}),
		Traceback: result.Traceback,
		Children:  result.Children,
		TaskID:    taskID,
	}

	// Convert result to map if possible
	if result.Result != nil {
		switch v := result.Result.(type) {
		case map[string]interface{}:
			info.Result = v
		default:
			info.Result["data"] = result.Result
		}
	}

	return info, nil
}

// Ping checks if Redis is available.
func (c *Client) Ping(ctx context.Context) error {
	return c.redis.Ping(ctx).Err()
}
