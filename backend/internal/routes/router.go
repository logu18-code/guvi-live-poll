package routes

import (
	"log/slog"
	"net/http"

	"livepoll/internal/auth"
	"livepoll/internal/config"
	"livepoll/internal/handlers"
	"livepoll/internal/middleware"
	"livepoll/internal/platform"

	"github.com/gin-gonic/gin"
)

func SetupRouter(
	cfg config.Config,
	logger *slog.Logger,
	mongoDB *platform.Mongo,
	redisDB *platform.Redis,
	authService *auth.Service,
	authHandler *handlers.AuthHandler,
	pollHandler *handlers.PollHandler,
	voteHandler *handlers.VoteHandler,
	realtimeHandler *handlers.RealtimeHandler,
) *gin.Engine {
	router := gin.New()

	router.Use(
		middleware.Recovery(logger),
		middleware.Logger(logger),
		middleware.CORS(cfg.CORSOrigins),
		middleware.BodyLimit(cfg.MaxBodyBytes),
	)

	authRoutes := router.Group("/api/auth")
	{
		authRoutes.POST("/signup", authHandler.Signup)
		authRoutes.POST("/login", authHandler.Login)
	}

	pollRoutes := router.Group("/api/polls")
	{
		pollRoutes.GET("/active", pollHandler.GetActive)

		// Public realtime stream.
		// Anyone viewing a poll can receive live result updates.
		pollRoutes.GET(
			"/:pollID/events",
			realtimeHandler.Events,
		)

		pollRoutes.POST(
			"",
			middleware.Auth(authService),
			pollHandler.Create,
		)

		pollRoutes.POST(
			"/:pollID/vote",
			middleware.Auth(authService),
			voteHandler.Create,
		)
	}

	router.GET("/healthz", func(c *gin.Context) {
		health := platform.CheckHealth(
			c.Request.Context(),
			mongoDB,
			redisDB,
		)

		statusCode := http.StatusOK

		if health.Status != "ok" {
			statusCode = http.StatusServiceUnavailable
		}

		c.JSON(statusCode, health)
	})

	router.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{
			"error": gin.H{
				"code":    "NOT_FOUND",
				"message": "Route not found",
			},
		})
	})

	return router
}
