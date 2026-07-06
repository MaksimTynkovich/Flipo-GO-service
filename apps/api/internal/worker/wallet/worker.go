package wallet

import (
	"context"
	"log/slog"

	walletuc "github.com/flipo/flipo/apps/api/internal/usecase/wallet"
	"github.com/robfig/cron/v3"
)

type Worker struct {
	svc  *walletuc.Service
	cron *cron.Cron
}

func NewWorker(svc *walletuc.Service) *Worker {
	return &Worker{
		svc:  svc,
		cron: cron.New(cron.WithSeconds()),
	}
}

func (w *Worker) Start(ctx context.Context) {
	runDeposits := func() {
		if err := w.svc.ProcessPendingDeposits(ctx); err != nil {
			slog.Error("wallet deposit sync failed", "error", err)
		}
	}
	runDeposits()

	_, _ = w.cron.AddFunc("*/15 * * * * *", runDeposits)
	_, _ = w.cron.AddFunc("*/20 * * * * *", func() {
		if err := w.svc.ProcessPendingWithdrawals(ctx); err != nil {
			slog.Error("wallet withdrawal sync failed", "error", err)
		}
	})
	w.cron.Start()
	slog.Info("wallet worker started")
}

func (w *Worker) Stop() {
	w.cron.Stop()
}
