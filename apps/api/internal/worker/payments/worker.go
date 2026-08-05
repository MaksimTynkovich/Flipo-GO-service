package payments

import (
	"context"
	"log/slog"

	paymentsuc "github.com/flipo/flipo/apps/api/internal/usecase/payments"
	"github.com/robfig/cron/v3"
)

type Worker struct {
	svc  *paymentsuc.Service
	cron *cron.Cron
}

func NewWorker(svc *paymentsuc.Service) *Worker {
	return &Worker{
		svc:  svc,
		cron: cron.New(cron.WithSeconds()),
	}
}

func (w *Worker) Start(ctx context.Context) {
	if w.svc == nil || !w.svc.CryptoBotEnabled() {
		return
	}
	run := func() {
		if err := w.svc.SyncPendingCryptoBotIntents(ctx); err != nil {
			slog.Error("cryptobot deposit sync failed", "error", err)
		}
	}
	run()

	_, _ = w.cron.AddFunc("*/20 * * * * *", run)
	w.cron.Start()
	slog.Info("payments worker started")
}

func (w *Worker) Stop() {
	w.cron.Stop()
}
