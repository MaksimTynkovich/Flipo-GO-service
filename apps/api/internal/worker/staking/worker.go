package staking

import (
	"context"
	"log/slog"

	stakinguc "github.com/flipo/flipo/apps/api/internal/usecase/staking"
	"github.com/robfig/cron/v3"
)

type Worker struct {
	svc  *stakinguc.Service
	cron *cron.Cron
}

func NewWorker(svc *stakinguc.Service) *Worker {
	return &Worker{
		svc:  svc,
		cron: cron.New(cron.WithSeconds()),
	}
}

func (w *Worker) Start(ctx context.Context) {
	_, _ = w.cron.AddFunc("0 0 */6 * * *", func() {
		if err := w.svc.RecalculateTiers(ctx); err != nil {
			slog.Error("tier recalc failed", "error", err)
		}
	})
	_, _ = w.cron.AddFunc("0 5 0 * * *", func() {
		if err := w.svc.AccrueDailyYield(ctx); err != nil {
			slog.Error("yield accrual failed", "error", err)
		}
	})
	w.cron.Start()
	slog.Info("staking worker started")
}

func (w *Worker) Stop() {
	w.cron.Stop()
}
