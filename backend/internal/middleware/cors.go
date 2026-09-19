package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func CORS(allowedOrigins []string) gin.HandlerFunc {
	allowed := make(map[string]struct{}, len(allowedOrigins))

	for _, origin := range allowedOrigins {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			allowed[origin] = struct{}{}
		}
	}

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")

		if origin != "" {
			if _, ok := allowed[origin]; !ok {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
					"error": gin.H{
						"code":    "CORS_FORBIDDEN",
						"message": "Origin is not allowed",
					},
				})
				return
			}

			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
		}

		c.Header(
			"Access-Control-Allow-Methods",
			"GET, POST, PUT, PATCH, DELETE, OPTIONS",
		)

		c.Header(
			"Access-Control-Allow-Headers",
			"Authorization, Content-Type, X-Voter-Id",
		)

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
