package platform

import (
	"context"
	"errors"
	"fmt"
	"time"

	"livepoll/internal/config"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type Mongo struct {
	Client *mongo.Client
	DB     *mongo.Database
}

func NewMongo(ctx context.Context, cfg config.Config) (*Mongo, error) {
	serverAPI := options.ServerAPI(options.ServerAPIVersion1)

	clientOpts := options.Client().
		ApplyURI(cfg.MongoURI).
		SetServerAPIOptions(serverAPI).
		SetServerSelectionTimeout(20 * time.Second)

	client, err := mongo.Connect(clientOpts)
	if err != nil {
		return nil, fmt.Errorf("connect to MongoDB: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	if err := client.Ping(pingCtx, nil); err != nil {
		_ = client.Disconnect(context.Background())
		return nil, fmt.Errorf("ping MongoDB: %w", err)
	}

	return &Mongo{
		Client: client,
		DB:     client.Database(cfg.MongoDB),
	}, nil
}

func (m *Mongo) Disconnect(ctx context.Context) error {
	if m == nil || m.Client == nil {
		return nil
	}

	return m.Client.Disconnect(ctx)
}

func (m *Mongo) RequireReplicaSet(ctx context.Context) error {
	var result bson.M

	err := m.Client.Database("admin").
		RunCommand(ctx, bson.D{{Key: "hello", Value: 1}}).
		Decode(&result)

	if err != nil {
		return fmt.Errorf("MongoDB hello command failed: %w", err)
	}

	setName, ok := result["setName"].(string)
	if !ok || setName == "" {
		return errors.New("MongoDB replica set is required for transactions")
	}

	return nil
}