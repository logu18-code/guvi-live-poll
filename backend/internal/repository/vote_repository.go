package repository

import (
	"context"
	"fmt"

	"livepoll/internal/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const votesCollection = "votes"

type VoteRepository struct {
	collection *mongo.Collection
}

func NewVoteRepository(db *mongo.Database) *VoteRepository {
	return &VoteRepository{
		collection: db.Collection(votesCollection),
	}
}

func (r *VoteRepository) Create(ctx context.Context, vote *models.Vote) error {
	_, err := r.collection.InsertOne(ctx, vote)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return ErrAlreadyVoted
		}

		return fmt.Errorf("insert vote: %w", err)
	}

	return nil
}

func (r *VoteRepository) FindByPollAndUser(
	ctx context.Context,
	pollID bson.ObjectID,
	userID bson.ObjectID,
) (*models.Vote, error) {
	var vote models.Vote

	err := r.collection.FindOne(
		ctx,
		bson.M{
			"poll_id": pollID,
			"user_id": userID,
		},
	).Decode(&vote)

	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, ErrNotFound
		}

		return nil, fmt.Errorf("find vote by poll and user: %w", err)
	}

	return &vote, nil
}

func (r *VoteRepository) CountByPoll(
	ctx context.Context,
	pollID bson.ObjectID,
) (int64, error) {
	count, err := r.collection.CountDocuments(
		ctx,
		bson.M{"poll_id": pollID},
	)
	if err != nil {
		return 0, fmt.Errorf("count votes for poll: %w", err)
	}

	return count, nil
}