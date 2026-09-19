package repository

import "errors"

var (
	ErrNotFound     = errors.New("repository: document not found")
	ErrEmailTaken   = errors.New("repository: email already registered")
	ErrAlreadyVoted = errors.New("repository: user already voted in this poll")
)