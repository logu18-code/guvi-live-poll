package main

import (
	"context"
	"log/slog"
	"os"

	"livepoll/internal/auth"
	"livepoll/internal/config"
	"livepoll/internal/handlers"
	"livepoll/internal/platform"
	"livepoll/internal/repository"
	"livepoll/internal/routes"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load configuration", "error", err)
		os.Exit(1)
	}

	logger := slog.New(
		slog.NewJSONHandler(os.Stdout, nil),
	)

	ctx := context.Background()

	mongoDB, err := platform.NewMongo(ctx, cfg)
	if err != nil {
		logger.Error(
			"failed to connect to MongoDB",
			"error",
			err,
		)
		os.Exit(1)
	}

	defer func() {
		if err := mongoDB.Disconnect(context.Background()); err != nil {
			logger.Error(
				"failed to disconnect MongoDB",
				"error",
				err,
			)
		}
	}()

	if err := repository.EnsureIndexes(ctx, mongoDB.DB); err != nil {
		logger.Error(
			"failed to create MongoDB indexes",
			"error",
			err,
		)
		os.Exit(1)
	}

	redisDB, err := platform.NewRedis(ctx, cfg)
	if err != nil {
		logger.Error(
			"failed to connect to Redis",
			"error",
			err,
		)
		os.Exit(1)
	}

	defer func() {
		if err := redisDB.Close(); err != nil {
			logger.Error(
				"failed to close Redis",
				"error",
				err,
			)
		}
	}()

	authService := auth.NewService(
		cfg.JWTSecret,
		cfg.JWTTTL,
	)

	userRepo := repository.NewUserRepository(
		mongoDB.DB,
	)

	authHandler := handlers.NewAuthHandler(
		authService,
		userRepo,
	)

	pollRepo := repository.NewPollRepository(
		mongoDB.DB,
	)

	pollHandler := handlers.NewPollHandler(
		pollRepo,
	)

	voteRepo := repository.NewVoteRepository(
		mongoDB.DB,
	)

	voteHandler := handlers.NewVoteHandler(
		pollRepo,
		voteRepo,
		redisDB,
	)

	realtimeHandler := handlers.NewRealtimeHandler(
		redisDB,
		func(ctx context.Context, pollID string) (any, error) {
			objectID, err := bson.ObjectIDFromHex(pollID)
			if err != nil {
				return nil, handlers.ErrRealtimePollNotFound
			}

			poll, err := pollRepo.FindByID(
				ctx,
				objectID,
			)
			if err != nil {
				if err == repository.ErrNotFound {
					return nil, handlers.ErrRealtimePollNotFound
				}

				return nil, err
			}

			return poll, nil
		},
		logger,
	)

	router := routes.SetupRouter(
		cfg,
		logger,
		mongoDB,
		redisDB,
		authService,
		authHandler,
		pollHandler,
		voteHandler,
		realtimeHandler,
	)

	logger.Info(
		"server starting",
		"port",
		cfg.Port,
	)

	if err := router.Run(":" + cfg.Port); err != nil {
		logger.Error(
			"server stopped",
			"error",
			err,
		)
		os.Exit(1)
	}
}
