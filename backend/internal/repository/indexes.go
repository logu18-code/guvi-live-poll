package repository

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func EnsureIndexes(ctx context.Context, db *mongo.Database) error {
	if err := ensureUserIndexes(ctx, db); err != nil {
		return err
	}

	if err := ensurePollIndexes(ctx, db); err != nil {
		return err
	}

	if err := ensureVoteIndexes(ctx, db); err != nil {
		return err
	}

	return nil
}

func ensureUserIndexes(ctx context.Context, db *mongo.Database) error {
	_, err := db.Collection(usersCollection).Indexes().CreateOne(
		ctx,
		mongo.IndexModel{
			Keys: bson.D{
				{Key: "email", Value: 1},
			},
			Options: options.Index().SetUnique(true),
		},
	)

	if err != nil {
		return fmt.Errorf("create users indexes: %w", err)
	}

	return nil
}

func ensurePollIndexes(ctx context.Context, db *mongo.Database) error {
	indexes := []mongo.IndexModel{
		{
			Keys: bson.D{
				{Key: "is_active", Value: 1},
			},
		},
		{
			Keys: bson.D{
				{Key: "created_by", Value: 1},
			},
		},
	}

	_, err := db.Collection(pollsCollection).Indexes().CreateMany(
		ctx,
		indexes,
	)

	if err != nil {
		return fmt.Errorf("create polls indexes: %w", err)
	}

	return nil
}

func ensureVoteIndexes(ctx context.Context, db *mongo.Database) error {
	indexes := []mongo.IndexModel{
		{
			Keys: bson.D{
				{Key: "poll_id", Value: 1},
				{Key: "user_id", Value: 1},
			},
			Options: options.Index().SetUnique(true),
		},
		{
			Keys: bson.D{
				{Key: "poll_id", Value: 1},
			},
		},
	}

	_, err := db.Collection(votesCollection).Indexes().CreateMany(
		ctx,
		indexes,
	)

	if err != nil {
		return fmt.Errorf("create votes indexes: %w", err)
	}

	return nil
}