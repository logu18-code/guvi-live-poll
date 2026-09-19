package platform

import (
	"context"
	"fmt"
	"time"

	"livepoll/internal/config"

	"github.com/redis/go-redis/v9"
)

type Redis struct {
	Client *redis.Client
}

func NewRedis(ctx context.Context, cfg config.Config) (*Redis, error) {
	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, fmt.Errorf("parse Redis URL: %w", err)
	}

	client := redis.NewClient(opts)

	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if err := client.Ping(pingCtx).Err(); err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("ping Redis: %w", err)
	}

	return &Redis{
		Client: client,
	}, nil
}

func (r *Redis) Close() error {
	if r == nil || r.Client == nil {
		return nil
	}

	return r.Client.Close()
}
