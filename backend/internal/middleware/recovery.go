package middleware

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
)

func Recovery(logger *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if recovered := recover(); recovered != nil {
				logger.Error(
					"panic recovered",
					"panic", recovered,
					"path", c.Request.URL.Path,
					"method", c.Request.Method,
				)

				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
					"error": gin.H{
						"code":    "INTERNAL_ERROR",
						"message": "Internal server error",
					},
				})
			}
		}()

		c.Next()
	}
}
