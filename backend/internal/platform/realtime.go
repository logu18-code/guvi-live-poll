package platform

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// pollChannelPrefix keeps every poll's Pub/Sub channel under one predictable name:
// a poll with ID abc123 uses the channel "poll:abc123".
const pollChannelPrefix = "poll:"

// PollChannel returns the Redis Pub/Sub channel for one poll.
func PollChannel(pollID string) string {
	return pollChannelPrefix + pollID
}

// PublishPollVote tells everyone watching the poll that a vote was saved.
func (r *Redis) PublishPollVote(ctx context.Context, pollID string) (int64, error) {
	if r == nil || r.Client == nil {
		return 0, errors.New("redis client is not configured")
	}

	receivers, err := r.Client.Publish(
		ctx,
		PollChannel(pollID),
		"vote",
	).Result()

	if err != nil {
		return 0, fmt.Errorf(
			"publish to %s: %w",
			PollChannel(pollID),
			err,
		)
	}

	return receivers, nil
}

// SubscribePoll subscribes to one poll's Redis Pub/Sub channel.
func (r *Redis) SubscribePoll(
	ctx context.Context,
	pollID string,
) (*redis.PubSub, error) {
	if r == nil || r.Client == nil {
		return nil, errors.New("redis client is not configured")
	}

	sub := r.Client.Subscribe(
		ctx,
		PollChannel(pollID),
	)

	confirmCtx, cancel := context.WithTimeout(
		ctx,
		5*time.Second,
	)
	defer cancel()

	if _, err := sub.Receive(confirmCtx); err != nil {
		_ = sub.Close()
		return nil, fmt.Errorf(
			"subscribe to %s: %w",
			PollChannel(pollID),
			err,
		)
	}

	return sub, nil
}
