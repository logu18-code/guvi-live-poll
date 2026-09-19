package repository

import (
	"context"
	"fmt"

	"livepoll/internal/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const pollsCollection = "polls"

type PollRepository struct {
	collection *mongo.Collection
}

func NewPollRepository(db *mongo.Database) *PollRepository {
	return &PollRepository{
		collection: db.Collection(pollsCollection),
	}
}

func (r *PollRepository) Create(ctx context.Context, poll *models.Poll) error {
	_, err := r.collection.InsertOne(ctx, poll)
	if err != nil {
		return fmt.Errorf("insert poll: %w", err)
	}

	return nil
}

func (r *PollRepository) FindByID(ctx context.Context, id bson.ObjectID) (*models.Poll, error) {
	var poll models.Poll

	err := r.collection.FindOne(
		ctx,
		bson.M{"_id": id},
	).Decode(&poll)

	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, ErrNotFound
		}

		return nil, fmt.Errorf("find poll by id: %w", err)
	}

	return &poll, nil
}

func (r *PollRepository) FindActive(ctx context.Context) ([]*models.Poll, error) {
	opts := options.Find().SetSort(
		bson.D{{Key: "created_at", Value: -1}},
	)

	cursor, err := r.collection.Find(
		ctx,
		bson.M{"is_active": true},
		opts,
	)
	if err != nil {
		return nil, fmt.Errorf("find active polls: %w", err)
	}
	defer cursor.Close(ctx)

	var polls []*models.Poll

	if err := cursor.All(ctx, &polls); err != nil {
		return nil, fmt.Errorf("decode active polls: %w", err)
	}

	return polls, nil
}

func (r *PollRepository) FindByCreator(
	ctx context.Context,
	userID bson.ObjectID,
) ([]*models.Poll, error) {
	opts := options.Find().SetSort(
		bson.D{{Key: "created_at", Value: -1}},
	)

	cursor, err := r.collection.Find(
		ctx,
		bson.M{"created_by": userID},
		opts,
	)
	if err != nil {
		return nil, fmt.Errorf("find polls by creator: %w", err)
	}
	defer cursor.Close(ctx)

	var polls []*models.Poll

	if err := cursor.All(ctx, &polls); err != nil {
		return nil, fmt.Errorf("decode polls by creator: %w", err)
	}

	return polls, nil
}

func (r *PollRepository) IncrementVote(
	ctx context.Context,
	pollID bson.ObjectID,
	optionID string,
) error {
	filter := bson.M{
		"_id":        pollID,
		"options.id": optionID,
	}

	update := bson.M{
		"$inc": bson.M{
			"options.$.votes": 1,
		},
	}

	result, err := r.collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("increment vote: %w", err)
	}

	if result.MatchedCount == 0 {
		return ErrNotFound
	}

	return nil
}

func (r *PollRepository) SetActive(
	ctx context.Context,
	pollID bson.ObjectID,
	isActive bool,
) error {
	result, err := r.collection.UpdateOne(
		ctx,
		bson.M{"_id": pollID},
		bson.M{"$set": bson.M{"is_active": isActive}},
	)
	if err != nil {
		return fmt.Errorf("set poll active state: %w", err)
	}

	if result.MatchedCount == 0 {
		return ErrNotFound
	}

	return nil
}