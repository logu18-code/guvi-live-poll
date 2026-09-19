package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv          string
	Port            string
	MongoURI        string
	MongoDB         string
	RedisURL        string
	JWTSecret       string
	VoterHMACSecret string
	JWTTTL          time.Duration
	CORSOrigins     []string
	MaxBodyBytes    int64
	TrustedProxies  []string
}

func Load() (Config, error) {
	_ = godotenv.Load()

	cfg := Config{
		AppEnv:          getEnv("APP_ENV", "development"),
		Port:            getEnv("PORT", "8080"),
		MongoURI:        os.Getenv("MONGO_URI"),
		MongoDB:         getEnv("MONGO_DB", "livepoll"),
		RedisURL:        os.Getenv("REDIS_URL"),
		JWTSecret:       os.Getenv("JWT_SECRET"),
		VoterHMACSecret: os.Getenv("VOTER_HMAC_SECRET"),
	}

	if cfg.MongoURI == "" {
		return Config{}, errors.New("MONGO_URI is required")
	}

	if cfg.RedisURL == "" {
		return Config{}, errors.New("REDIS_URL is required")
	}

	if len([]byte(cfg.JWTSecret)) < 32 {
		return Config{}, errors.New("JWT_SECRET must be at least 32 bytes")
	}

	if len([]byte(cfg.VoterHMACSecret)) < 32 {
		return Config{}, errors.New("VOTER_HMAC_SECRET must be at least 32 bytes")
	}

	jwtTTLText := getEnv("JWT_TTL", "24h")
	jwtTTL, err := time.ParseDuration(jwtTTLText)
	if err != nil || jwtTTL <= 0 {
		return Config{}, errors.New("JWT_TTL must be a valid positive duration")
	}
	cfg.JWTTTL = jwtTTL

	maxBodyText := getEnv("MAX_BODY_BYTES", "1048576")
	maxBodyBytes, err := strconv.ParseInt(maxBodyText, 10, 64)
	if err != nil || maxBodyBytes <= 0 {
		return Config{}, errors.New("MAX_BODY_BYTES must be a positive integer")
	}
	cfg.MaxBodyBytes = maxBodyBytes

	cfg.CORSOrigins = splitCSV(os.Getenv("CORS_ORIGINS"))
	if len(cfg.CORSOrigins) == 0 {
		return Config{}, errors.New("CORS_ORIGINS must contain at least one origin")
	}

	cfg.TrustedProxies = splitCSV(os.Getenv("TRUSTED_PROXIES"))

	if cfg.AppEnv != "development" &&
		cfg.AppEnv != "test" &&
		cfg.AppEnv != "production" {
		return Config{}, fmt.Errorf("invalid APP_ENV: %s", cfg.AppEnv)
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func splitCSV(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}

	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))

	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			result = append(result, part)
		}
	}

	return result
}
