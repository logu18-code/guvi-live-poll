package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"livepoll/internal/platform"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
)

var ErrRealtimePollNotFound = errors.New("poll not found")

type PollLoader func(ctx context.Context, pollID string) (any, error)

const sseKeepAliveInterval = 25 * time.Second

type RealtimeHandler struct {
	rdb    *platform.Redis
	load   PollLoader
	logger *slog.Logger
}

func NewRealtimeHandler(
	rdb *platform.Redis,
	load PollLoader,
	logger *slog.Logger,
) *RealtimeHandler {
	if logger == nil {
		logger = slog.Default()
	}

	return &RealtimeHandler{
		rdb:    rdb,
		load:   load,
		logger: logger,
	}
}

func (h *RealtimeHandler) Events(c *gin.Context) {
	pollID := c.Param("pollID")

	if _, err := bson.ObjectIDFromHex(pollID); err != nil {
		writeRealtimeError(
			c,
			http.StatusBadRequest,
			"INVALID_POLL_ID",
			"Poll ID is not valid.",
		)
		return
	}

	ctx := c.Request.Context()

	sub, err := h.rdb.SubscribePoll(ctx, pollID)
	if err != nil {
		if ctx.Err() != nil {
			return
		}

		h.logger.Error(
			"realtime: redis subscribe failed",
			"poll_id",
			pollID,
			"error",
			err,
		)

		writeRealtimeError(
			c,
			http.StatusServiceUnavailable,
			"REALTIME_UNAVAILABLE",
			"Live updates are temporarily unavailable.",
		)
		return
	}

	defer func() {
		if err := sub.Close(); err != nil {
			h.logger.Warn(
				"realtime: closing redis subscription failed",
				"poll_id",
				pollID,
				"error",
				err,
			)
		}
	}()

	poll, err := h.load(ctx, pollID)
	if err != nil {
		switch {
		case errors.Is(err, ErrRealtimePollNotFound):
			writeRealtimeError(
				c,
				http.StatusNotFound,
				"POLL_NOT_FOUND",
				"Poll not found.",
			)

		case ctx.Err() != nil:

		default:
			h.logger.Error(
				"realtime: loading poll failed",
				"poll_id",
				pollID,
				"error",
				err,
			)

			writeRealtimeError(
				c,
				http.StatusInternalServerError,
				"POLL_LOAD_FAILED",
				"Could not load the poll.",
			)
		}

		return
	}

	header := c.Writer.Header()
	header.Set("Content-Type", "text/event-stream")
	header.Set("Cache-Control", "no-cache")
	header.Set("Connection", "keep-alive")
	header.Set("X-Accel-Buffering", "no")

	c.Status(http.StatusOK)
	c.Writer.WriteHeaderNow()

	if _, err := fmt.Fprint(
		c.Writer,
		"retry: 3000\n\n",
	); err != nil {
		return
	}

	if err := writeSSEEvent(
		c,
		"poll-update",
		poll,
	); err != nil {
		return
	}

	messages := sub.Channel()

	keepAlive := time.NewTicker(
		sseKeepAliveInterval,
	)
	defer keepAlive.Stop()

	for {
		select {
		case <-ctx.Done():
			return

		case _, open := <-messages:
			if !open {
				return
			}

			latest, err := h.load(ctx, pollID)
			if err != nil {
				if ctx.Err() != nil {
					return
				}

				h.logger.Error(
					"realtime: reloading poll failed",
					"poll_id",
					pollID,
					"error",
					err,
				)

				continue
			}

			if err := writeSSEEvent(
				c,
				"poll-update",
				latest,
			); err != nil {
				return
			}

		case <-keepAlive.C:
			if _, err := fmt.Fprint(
				c.Writer,
				": keep-alive\n\n",
			); err != nil {
				return
			}

			c.Writer.Flush()
		}
	}
}

func writeSSEEvent(
	c *gin.Context,
	event string,
	payload any,
) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	if _, err := fmt.Fprintf(
		c.Writer,
		"event: %s\ndata: %s\n\n",
		event,
		data,
	); err != nil {
		return err
	}

	c.Writer.Flush()

	return nil
}

func writeRealtimeError(
	c *gin.Context,
	status int,
	code string,
	message string,
) {
	c.AbortWithStatusJSON(
		status,
		gin.H{
			"error": gin.H{
				"code":    code,
				"message": message,
			},
		},
	)
}
