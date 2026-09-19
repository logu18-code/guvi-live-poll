package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"
)

func main() {
	uri := os.Getenv("MONGO_URI")

	if uri == "" {
		fmt.Println("MONGO_URI is missing")
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		fmt.Println("CONNECT ERROR:", err)
		return
	}

	defer client.Disconnect(context.Background())

	err = client.Ping(ctx, readpref.Primary())
	if err != nil {
		fmt.Println("PING ERROR:", err)
		return
	}

	fmt.Println("MONGODB CONNECTION SUCCESS")
}