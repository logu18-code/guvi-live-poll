package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"livepoll/internal/auth"
	"livepoll/internal/models"
	"livepoll/internal/repository"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
)

type AuthHandler struct {
	authService *auth.Service
	users       *repository.UserRepository
}

func NewAuthHandler(
	authService *auth.Service,
	users *repository.UserRepository,
) *AuthHandler {
	return &AuthHandler{
		authService: authService,
		users:       users,
	}
}

type signupRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *AuthHandler) Signup(c *gin.Context) {
	var req signupRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "INVALID_REQUEST",
				"message": "invalid request body",
			},
		})
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	if req.Name == "" || req.Email == "" || len(req.Password) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "VALIDATION_ERROR",
				"message": "name, valid email and password of at least 8 characters are required",
			},
		})
		return
	}

	passwordHash, err := h.authService.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "PASSWORD_HASH_ERROR",
				"message": "failed to process password",
			},
		})
		return
	}

	now := time.Now()

	user := &models.User{
		ID:           bson.NewObjectID(),
		Name:         req.Name,
		Email:        req.Email,
		PasswordHash: passwordHash,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	if err := h.users.Create(c.Request.Context(), user); err != nil {
		if errors.Is(err, repository.ErrEmailTaken) {
			c.JSON(http.StatusConflict, gin.H{
				"error": gin.H{
					"code":    "EMAIL_TAKEN",
					"message": "email is already registered",
				},
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "USER_CREATE_ERROR",
				"message": "failed to create user",
			},
		})
		return
	}

	token, err := h.authService.GenerateToken(user.ID.Hex())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "TOKEN_ERROR",
				"message": "failed to generate token",
			},
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"user": gin.H{
			"id":    user.ID.Hex(),
			"name":  user.Name,
			"email": user.Email,
		},
		"token": token,
	})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "INVALID_REQUEST",
				"message": "invalid request body",
			},
		})
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	user, err := h.users.FindByEmail(c.Request.Context(), req.Email)
	if err != nil || !h.authService.CheckPassword(user.PasswordHash, req.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": gin.H{
				"code":    "INVALID_CREDENTIALS",
				"message": "invalid email or password",
			},
		})
		return
	}

	token, err := h.authService.GenerateToken(user.ID.Hex())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "TOKEN_ERROR",
				"message": "failed to generate token",
			},
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"user": gin.H{
			"id":    user.ID.Hex(),
			"name":  user.Name,
			"email": user.Email,
		},
		"token": token,
	})
}
