package repository

import (
	"context"
	"fmt"

	"livepoll/internal/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const usersCollection = "users"

type UserRepository struct {
	collection *mongo.Collection
}

func NewUserRepository(db *mongo.Database) *UserRepository {
	return &UserRepository{
		collection: db.Collection(usersCollection),
	}
}

func (r *UserRepository) Create(ctx context.Context, user *models.User) error {
	_, err := r.collection.InsertOne(ctx, user)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return ErrEmailTaken
		}
		return fmt.Errorf("insert user: %w", err)
	}

	return nil
}

func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	var user models.User

	err := r.collection.FindOne(
		ctx,
		bson.M{"email": email},
	).Decode(&user)

	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, ErrNotFound
		}

		return nil, fmt.Errorf("find user by email: %w", err)
	}

	return &user, nil
}

func (r *UserRepository) FindByID(ctx context.Context, id bson.ObjectID) (*models.User, error) {
	var user models.User

	err := r.collection.FindOne(
		ctx,
		bson.M{"_id": id},
	).Decode(&user)

	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, ErrNotFound
		}

		return nil, fmt.Errorf("find user by id: %w", err)
	}

	return &user, nil
}