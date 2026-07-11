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
		event    string
	}{
		{"roulette", "pubsub:game:roulette", "tick"},
		{"roulette", "pubsub:game:roulette:bets", "bets"},
		{"crash", "pubsub:game:crash", "tick"},
		{"crash", "pubsub:game:crash:bets", "bets"},
	}

	for _, g := range games {
		go b.subscribe(ctx, g.gameType, g.channel, g.event)
	}
	go b.subscribePresence(ctx)
}

func (b *RedisBridge) subscribePresence(ctx context.Context) {
	ch, cleanup, err := b.cache.Subscribe(ctx, "pubsub:game:presence")
	if err != nil {
		slog.Error("redis subscribe failed", "channel", "pubsub:game:presence", "error", err)
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
			payload := JSONMessage("presence", json.RawMessage(msg))
			for _, game := range []string{"roulette", "crash", "pvp"} {
				b.hub.Broadcast(game, payload)
			}
		}
	}
}

func (b *RedisBridge) subscribe(ctx context.Context, gameType, channel, event string) {
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
			b.hub.Broadcast(gameType, JSONMessage(event, json.RawMessage(msg)))
		}
	}
}
