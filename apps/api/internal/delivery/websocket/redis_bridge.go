package websocket

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/flipo/flipo/apps/api/internal/domain"
)

type RedisBridge struct {
	cache domain.GameStateCache
	hub   *Hub
}

func NewRedisBridge(cache domain.GameStateCache, hub *Hub) *RedisBridge {
	return &RedisBridge{cache: cache, hub: hub}
}

func (b *RedisBridge) Start(ctx context.Context) {
	games := []struct {
		gameType string
		channel  string
	}{
		{"roulette", "pubsub:game:roulette"},
		{"crash", "pubsub:game:crash"},
	}

	for _, g := range games {
		go b.subscribe(ctx, g.gameType, g.channel)
	}
}

func (b *RedisBridge) subscribe(ctx context.Context, gameType, channel string) {
	ch, cleanup, err := b.cache.Subscribe(ctx, channel)
	if err != nil {
		slog.Error("redis subscribe failed", "channel", channel, "error", err)
		return
	}
	defer cleanup()

	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			var payload interface{}
			_ = json.Unmarshal(msg, &payload)
			b.hub.Broadcast(gameType, JSONMessage("tick", payload))
		}
	}
}
