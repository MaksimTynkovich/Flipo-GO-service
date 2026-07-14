package giftprices

import (
	"context"
	"log/slog"

	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/robfig/cron/v3"
)

// Worker refreshes gift_trait_prices daily.
type Worker struct {
	sync *gifts.PriceSync
	cron *cron.Cron
}

func NewWorker(sync *gifts.PriceSync) *Worker {
	return &Worker{
		sync: sync,
		cron: cron.New(cron.WithSeconds()),
	}
}

func (w *Worker) Start(ctx context.Context) {
	// 04:15 UTC daily — off-peak relative to MSK staking jobs.
	_, _ = w.cron.AddFunc("0 15 4 * * *", func() {
		if err := w.sync.RefreshAll(ctx); err != nil {
			slog.Error("gift price refresh failed", "error", err)
		}
	})
	w.cron.Start()
	slog.Info("gift price worker started")
}

func (w *Worker) Stop() {
	w.cron.Stop()
}

// RunOnce triggers an immediate refresh (ops / make target).
func (w *Worker) RunOnce(ctx context.Context) error {
	return w.sync.RefreshAll(ctx)
}
