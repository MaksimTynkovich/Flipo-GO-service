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
		cron: cron.New(cron.WithSeconds(), cron.WithLocation(stakinguc.MoscowLocation())),
	}
}

func (w *Worker) Start(ctx context.Context) {
	_, _ = w.cron.AddFunc("0 0 */6 * * *", func() {
		if err := w.svc.RecalculateTiers(ctx); err != nil {
			slog.Error("tier recalc failed", "error", err)
		}
	})

	// Daily settle at 00:05 MSK: pay yield, unlock gifts, one Telegram message, open new epoch.
	_, _ = w.cron.AddFunc("0 5 0 * * *", func() {
		if err := w.svc.SettleEndedEpochs(ctx); err != nil {
			slog.Error("daily epoch settlement failed", "error", err)
		}
		if _, err := w.svc.EnsureCurrentEpoch(ctx); err != nil {
			slog.Error("ensure current epoch after settle failed", "error", err)
		}
	})

	w.cron.Start()
	slog.Info("staking worker started")
}

func (w *Worker) Stop() {
	w.cron.Stop()
}
