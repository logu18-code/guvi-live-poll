package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Vote struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"id"`
	PollID    bson.ObjectID `bson:"poll_id" json:"poll_id"`
	OptionID  string        `bson:"option_id" json:"option_id"`
	UserID    bson.ObjectID `bson:"user_id" json:"user_id"`
	CreatedAt time.Time     `bson:"created_at" json:"created_at"`
}