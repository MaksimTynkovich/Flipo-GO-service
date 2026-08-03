package cases

import (
	"context"
	"log/slog"

	casesuc "github.com/flipo/flipo/apps/api/internal/usecase/cases"
	"github.com/robfig/cron/v3"
)

type Worker struct {
	svc  *casesuc.Service
	cron *cron.Cron
}

func NewWorker(svc *casesuc.Service) *Worker {
	return &Worker{
		svc:  svc,
		cron: cron.New(cron.WithSeconds()),
	}
}

func (w *Worker) Start(ctx context.Context) {
	_, _ = w.cron.AddFunc("0 */5 * * * *", func() {
		n, err := w.svc.NotifyDailyCasesReady(ctx)
		if err != nil {
			slog.Error("case daily ready notify failed", "error", err)
			return
		}
		if n > 0 {
			slog.Info("case daily ready notifies sent", "count", n)
		}
	})
	w.cron.Start()
	slog.Info("cases worker started")
}

func (w *Worker) Stop() {
	w.cron.Stop()
}
