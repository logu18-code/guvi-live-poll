package platform

import (
	"context"
	"sync"
	"time"
)

type HealthStatus struct {
	Status string            `json:"status"`
	Checks map[string]string `json:"checks"`
}

func CheckHealth(
	ctx context.Context,
	mongoDB *Mongo,
	redisDB *Redis,
) HealthStatus {
	var wg sync.WaitGroup
	var mu sync.Mutex

	checks := map[string]string{
		"mongo": "down",
		"redis": "down",
	}

	wg.Add(2)

	go func() {
		defer wg.Done()

		checkCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()

		if err := mongoDB.Client.Ping(checkCtx, nil); err == nil {
			mu.Lock()
			checks["mongo"] = "up"
			mu.Unlock()
		}
	}()

	go func() {
		defer wg.Done()

		checkCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()

		if err := redisDB.Client.Ping(checkCtx).Err(); err == nil {
			mu.Lock()
			checks["redis"] = "up"
			mu.Unlock()
		}
	}()

	wg.Wait()

	status := "ok"

	if checks["mongo"] != "up" || checks["redis"] != "up" {
		status = "degraded"
	}

	return HealthStatus{
		Status: status,
		Checks: checks,
	}
}
