package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var ErrInvalidToken = errors.New("invalid token")

type Service struct {
	secret []byte
	ttl    time.Duration
}

func NewService(secret string, ttl time.Duration) *Service {
	return &Service{
		secret: []byte(secret),
		ttl:    ttl,
	}
}

func (s *Service) HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword(
		[]byte(password),
		bcrypt.DefaultCost,
	)
	if err != nil {
		return "", err
	}

	return string(hash), nil
}

func (s *Service) CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword(
		[]byte(hash),
		[]byte(password),
	) == nil
}

type Claims struct {
	UserID string `json:"user_id"`
	jwt.RegisteredClaims
}

func (s *Service) GenerateToken(userID string) (string, error) {
	now := time.Now()

	claims := Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(s.ttl)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	return token.SignedString(s.secret)
}

func (s *Service) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(
		tokenString,
		&Claims{},
		func(token *jwt.Token) (any, error) {
			if token.Method != jwt.SigningMethodHS256 {
				return nil, ErrInvalidToken
			}

			return s.secret, nil
		},
	)
	if err != nil {
		return nil, ErrInvalidToken
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid || claims.UserID == "" {
		return nil, ErrInvalidToken
	}

	return claims, nil
}
