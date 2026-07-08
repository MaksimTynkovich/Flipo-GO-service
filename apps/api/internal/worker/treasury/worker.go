package treasury

import (
	"context"
	"log/slog"

	treasuryuc "github.com/flipo/flipo/apps/api/internal/usecase/treasury"
	telegramadmin "github.com/flipo/flipo/apps/api/internal/usecase/telegramadmin"
	"github.com/robfig/cron/v3"
)

type Worker struct {
	treasury  *treasuryuc.Service
	broadcast *telegramadmin.Service
	cron      *cron.Cron
}

func NewWorker(treasury *treasuryuc.Service, broadcast *telegramadmin.Service) *Worker {
	return &Worker{
		treasury:  treasury,
		broadcast: broadcast,
		cron:      cron.New(cron.WithSeconds()),
	}
}

func (w *Worker) Start(ctx context.Context) {
	runSweep := func() {
		if err := w.treasury.SweepIfNeeded(ctx); err != nil {
			slog.Warn("treasury sweep failed", "error", err)
		}
	}
	runBroadcast := func() {
		if err := w.broadcast.ProcessQueued(ctx); err != nil {
			slog.Warn("broadcast worker failed", "error", err)
		}
	}

	runSweep()
	runBroadcast()

	_, _ = w.cron.AddFunc("0 */5 * * * *", runSweep)
	_, _ = w.cron.AddFunc("*/10 * * * * *", runBroadcast)
	w.cron.Start()
	slog.Info("treasury worker started")
}

func (w *Worker) Stop() {
	w.cron.Stop()
}
