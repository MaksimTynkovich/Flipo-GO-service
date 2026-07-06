package pvpworker

import (
	"context"
	"log/slog"
	"time"

	pvpsvc "github.com/flipo/flipo/apps/api/internal/usecase/pvp"
)

type Worker struct {
	svc      *pvpsvc.Service
	interval time.Duration
}

func NewWorker(svc *pvpsvc.Service, interval time.Duration) *Worker {
	return &Worker{svc: svc, interval: interval}
}

func (w *Worker) Run(ctx context.Context) {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := w.svc.ProcessDueRooms(ctx); err != nil {
				slog.Warn("pvp worker tick failed", "error", err)
			}
		}
	}
}
