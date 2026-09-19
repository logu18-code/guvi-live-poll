package handlers

import (
	"net/http"
	"strings"
	"time"

	"livepoll/internal/models"
	"livepoll/internal/repository"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
)

type PollHandler struct {
	polls *repository.PollRepository
}

func NewPollHandler(polls *repository.PollRepository) *PollHandler {
	return &PollHandler{polls: polls}
}

type createPollRequest struct {
	Question string   `json:"question"`
	Options  []string `json:"options"`
}

func (h *PollHandler) Create(c *gin.Context) {
	var req createPollRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "INVALID_REQUEST",
				"message": "Invalid request body",
			},
		})
		return
	}

	req.Question = strings.TrimSpace(req.Question)

	if req.Question == "" || len(req.Options) < 2 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "VALIDATION_ERROR",
				"message": "Question and at least two options are required",
			},
		})
		return
	}

	createdBy, err := bson.ObjectIDFromHex(c.GetString("user_id"))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": gin.H{
				"code":    "INVALID_USER",
				"message": "Invalid user",
			},
		})
		return
	}

	options := make([]models.PollOption, 0, len(req.Options))

	for i, option := range req.Options {
		text := strings.TrimSpace(option)

		if text == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": gin.H{
					"code":    "VALIDATION_ERROR",
					"message": "Option text cannot be empty",
				},
			})
			return
		}

		options = append(options, models.PollOption{
			ID:    string(rune('a' + i)),
			Text:  text,
			Votes: 0,
		})
	}

	now := time.Now()

	poll := &models.Poll{
		Question:  req.Question,
		Options:   options,
		CreatedBy: createdBy,
		CreatedAt: now,
		UpdatedAt: now,
		IsActive:  true,
	}

	if err := h.polls.Create(c.Request.Context(), poll); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "CREATE_FAILED",
				"message": "Failed to create poll",
			},
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"poll": poll,
	})
}

func (h *PollHandler) GetActive(c *gin.Context) {
	polls, err := h.polls.FindActive(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "FETCH_FAILED",
				"message": "Failed to fetch polls",
			},
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"polls": polls,
	})
}
