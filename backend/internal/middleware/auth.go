package middleware

import (
	"net/http"
	"strings"

	"livepoll/internal/auth"

	"github.com/gin-gonic/gin"
)

func Auth(authService *auth.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := strings.TrimSpace(c.GetHeader("Authorization"))

		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{
					"code":    "UNAUTHORIZED",
					"message": "Authorization token is required",
				},
			})
			return
		}

		token := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))

		claims, err := authService.ValidateToken(token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{
					"code":    "INVALID_TOKEN",
					"message": "Invalid or expired token",
				},
			})
			return
		}

		c.Set("user_id", claims.UserID)
		c.Next()
	}
}
