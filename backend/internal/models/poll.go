package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Poll struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"id"`
	Question  string        `bson:"question" json:"question"`
	Options   []PollOption  `bson:"options" json:"options"`
	CreatedBy bson.ObjectID `bson:"created_by" json:"created_by"`
	CreatedAt time.Time     `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time     `bson:"updated_at" json:"updated_at"`
	IsActive  bool          `bson:"is_active" json:"is_active"`
}

type PollOption struct {
	ID    string `bson:"id" json:"id"`
	Text  string `bson:"text" json:"text"`
	Votes int64  `bson:"votes" json:"votes"`
}