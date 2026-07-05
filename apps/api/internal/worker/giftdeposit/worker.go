package giftdeposit

import (
	"context"
	"log/slog"
	"time"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	inventoryuc "github.com/flipo/flipo/apps/api/internal/usecase/inventory"
)

const defaultPollInterval = 20 * time.Second

type Worker struct {
	cfg       telegram.MTProtoConfig
	processor *inventoryuc.AutoDepositService
	interval  time.Duration
}

func NewWorker(cfg telegram.MTProtoConfig, processor *inventoryuc.AutoDepositService) *Worker {
	return &Worker{
		cfg:       cfg,
		processor: processor,
		interval:  defaultPollInterval,
	}
}

func (w *Worker) Start(ctx context.Context) {
	if !w.cfg.Enabled() {
		slog.Warn("gift deposit worker disabled: MTProto not configured")
		return
	}

	slog.Info("gift deposit worker started", "interval", w.interval)
	go w.loop(ctx)
}

func (w *Worker) loop(ctx context.Context) {
	w.poll(ctx)

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.poll(ctx)
		}
	}
}

func (w *Worker) poll(ctx context.Context) {
	pollCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	incoming, err := telegram.ScanIncomingGiftsOnce(pollCtx, w.cfg)
	if err != nil {
		slog.Error("gift deposit poll failed", "error", err)
		return
	}
	if len(incoming) == 0 {
		return
	}

	credited, err := w.processor.ProcessIncoming(pollCtx, incoming)
	if err != nil {
		slog.Error("gift deposit processing failed", "error", err)
		return
	}
	if credited > 0 {
		slog.Info("gift deposits credited", "count", credited)
	}
}
