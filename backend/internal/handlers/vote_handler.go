package handlers

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"livepoll/internal/models"
	"livepoll/internal/platform"
	"livepoll/internal/repository"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
)

type VoteHandler struct {
	polls *repository.PollRepository
	votes *repository.VoteRepository
	redis *platform.Redis
}

func NewVoteHandler(
	polls *repository.PollRepository,
	votes *repository.VoteRepository,
	redis *platform.Redis,
) *VoteHandler {
	return &VoteHandler{
		polls: polls,
		votes: votes,
		redis: redis,
	}
}

type createVoteRequest struct {
	OptionID string `json:"option_id"`
}

func (h *VoteHandler) Create(c *gin.Context) {
	var req createVoteRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "INVALID_REQUEST",
				"message": "Invalid request body",
			},
		})
		return
	}

	req.OptionID = strings.TrimSpace(req.OptionID)

	if req.OptionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "VALIDATION_ERROR",
				"message": "Option ID is required",
			},
		})
		return
	}

	pollID, err := bson.ObjectIDFromHex(c.Param("pollID"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "INVALID_POLL_ID",
				"message": "Invalid poll ID",
			},
		})
		return
	}

	userID, err := bson.ObjectIDFromHex(c.GetString("user_id"))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": gin.H{
				"code":    "INVALID_USER",
				"message": "Invalid user",
			},
		})
		return
	}

	poll, err := h.polls.FindByID(
		c.Request.Context(),
		pollID,
	)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{
				"error": gin.H{
					"code":    "POLL_NOT_FOUND",
					"message": "Poll not found",
				},
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "POLL_FETCH_FAILED",
				"message": "Failed to fetch poll",
			},
		})
		return
	}

	if !poll.IsActive {
		c.JSON(http.StatusConflict, gin.H{
			"error": gin.H{
				"code":    "POLL_INACTIVE",
				"message": "This poll is no longer active",
			},
		})
		return
	}

	optionExists := false

	for _, option := range poll.Options {
		if option.ID == req.OptionID {
			optionExists = true
			break
		}
	}

	if !optionExists {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "INVALID_OPTION",
				"message": "Selected option does not exist",
			},
		})
		return
	}

	vote := &models.Vote{
		ID:        bson.NewObjectID(),
		PollID:    pollID,
		OptionID:  req.OptionID,
		UserID:    userID,
		CreatedAt: time.Now(),
	}

	if err := h.votes.Create(
		c.Request.Context(),
		vote,
	); err != nil {
		if errors.Is(err, repository.ErrAlreadyVoted) {
			c.JSON(http.StatusConflict, gin.H{
				"error": gin.H{
					"code":    "ALREADY_VOTED",
					"message": "You have already voted in this poll",
				},
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "VOTE_CREATE_FAILED",
				"message": "Failed to record vote",
			},
		})
		return
	}

	if err := h.polls.IncrementVote(
		c.Request.Context(),
		pollID,
		req.OptionID,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "VOTE_COUNT_FAILED",
				"message": "Vote recorded but failed to update poll count",
			},
		})
		return
	}

	// MongoDB is the source of truth. If Redis publish fails,
	// the vote is still successful; log the realtime failure.
	if h.redis != nil {
		if receivers, err := h.redis.PublishPollVote(
			c.Request.Context(),
			pollID.Hex(),
		); err != nil {
			slog.Error(
				"failed to publish poll vote to Redis",
				"poll_id",
				pollID.Hex(),
				"error",
				err,
			)
		} else {
			slog.Info(
				"poll vote published to Redis",
				"poll_id",
				pollID.Hex(),
				"receivers",
				receivers,
			)
		}
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Vote recorded successfully",
		"vote":    vote,
	})
}
