package redis

import (
	"context"
	"fmt"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/redis/go-redis/v9"
)

type Cache struct {
	client *redis.Client
}

func NewCache(redisURL string) (*Cache, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	client := redis.NewClient(opts)
	if err := client.Ping(context.Background()).Err(); err != nil {
		return nil, fmt.Errorf("ping redis: %w", err)
	}
	return &Cache{client: client}, nil
}

func (c *Cache) Set(ctx context.Context, key string, value []byte, ttl time.Duration) error {
	return c.client.Set(ctx, key, value, ttl).Err()
}

func (c *Cache) Get(ctx context.Context, key string) ([]byte, error) {
	val, err := c.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	return val, err
}

func (c *Cache) Publish(ctx context.Context, channel string, message []byte) error {
	return c.client.Publish(ctx, channel, message).Err()
}

func (c *Cache) Subscribe(ctx context.Context, channel string) (<-chan []byte, func(), error) {
	pubsub := c.client.Subscribe(ctx, channel)
	ch := make(chan []byte, 64)

	go func() {
		defer close(ch)
		for msg := range pubsub.Channel() {
			ch <- []byte(msg.Payload)
		}
	}()

	cleanup := func() {
		_ = pubsub.Close()
	}
	return ch, cleanup, nil
}

func (c *Cache) AcquireLock(ctx context.Context, key string, ttl time.Duration) (bool, error) {
	return c.client.SetNX(ctx, key, "1", ttl).Result()
}

func (c *Cache) ReleaseLock(ctx context.Context, key string) error {
	return c.client.Del(ctx, key).Err()
}

func (c *Cache) Client() *redis.Client {
	return c.client
}

var _ domain.GameStateCache = (*Cache)(nil)
