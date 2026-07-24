package cases

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"log/slog"
	"math"
	"strings"
	"sync"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

type LiveSim struct {
	svc *Service

	mu       sync.Mutex
	settings domain.CaseLiveFeedSettings
	pool     []domain.CaseLootEntry
	poolAt   time.Time
}

func NewLiveSim(svc *Service) *LiveSim {
	return &LiveSim{
		svc:      svc,
		settings: DefaultLiveFeedSettings(),
	}
}

func (s *LiveSim) ApplySettings(cfg domain.CaseLiveFeedSettings) {
	NormalizeLiveFeedSettings(&cfg)
	s.mu.Lock()
	s.settings = cfg
	s.mu.Unlock()
}

func (s *LiveSim) Start(ctx context.Context) {
	go s.loop(ctx)
}

func (s *LiveSim) loop(ctx context.Context) {
	reload := time.NewTicker(15 * time.Second)
	defer reload.Stop()

	s.reloadSettings(ctx)
	next := time.NewTimer(s.nextDelayLocked())
	defer next.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-reload.C:
			s.reloadSettings(ctx)
		case <-next.C:
			s.tick(ctx)
			delay := s.nextDelayLocked()
			next.Reset(delay)
		}
	}
}

func (s *LiveSim) reloadSettings(ctx context.Context) {
	cfg, err := s.svc.cases.GetLiveFeedSettings(ctx)
	if err != nil || cfg == nil {
		return
	}
	s.ApplySettings(*cfg)
}

func (s *LiveSim) nextDelayLocked() time.Duration {
	s.mu.Lock()
	intensity := s.settings.Intensity
	enabled := s.settings.Enabled
	s.mu.Unlock()
	if !enabled {
		return 5 * time.Second
	}
	// intensity 1 => ~4s mean; higher intensity => faster
	base := 4.0 / math.Max(intensity, 0.05)
	jitter := 0.65 + randFloat()*0.7
	sec := base * jitter
	if sec < 0.8 {
		sec = 0.8
	}
	if sec > 30 {
		sec = 30
	}
	return time.Duration(sec * float64(time.Second))
}

func (s *LiveSim) tick(ctx context.Context) {
	s.mu.Lock()
	cfg := s.settings
	s.mu.Unlock()
	if !cfg.Enabled {
		return
	}

	wantFake := true
	if cfg.FillWhenSparse {
		cutoff := time.Now().UTC().Add(-90 * time.Second)
		recent := 0
		if rows, err := s.svc.cases.ListRecentOpens(ctx, cfg.MinVisible*2); err == nil {
			for _, row := range rows {
				if row.CreatedAt.After(cutoff) {
					recent++
				}
			}
		}
		if s.svc.feedBuf != nil {
			for _, row := range s.svc.feedBuf.Snapshot() {
				if row.CreatedAt.After(cutoff) {
					recent++
				}
			}
		}
		if recent >= cfg.MinVisible {
			wantFake = false
		}
	}
	if !wantFake {
		return
	}

	entry, ok := s.sampleLoot(ctx, cfg)
	if !ok {
		return
	}
	drop := liveDropFromEntry(uuid.New(), entry, time.Now().UTC())
	if s.svc.live != nil {
		s.svc.live.PublishCaseLiveDrop(ctx, drop)
	} else if s.svc.feedBuf != nil {
		s.svc.feedBuf.Push(drop)
	}
}

func (s *LiveSim) sampleLoot(ctx context.Context, cfg domain.CaseLiveFeedSettings) (domain.CaseLootEntry, bool) {
	pool := s.lootPool(ctx)
	if len(pool) == 0 {
		return domain.CaseLootEntry{}, false
	}

	if cfg.FatChance > 0 && randFloat() < cfg.FatChance {
		fat := make([]domain.CaseLootEntry, 0)
		for _, e := range pool {
			if domain.CaseLootPrizeValueNanoton(e) >= cfg.FatMinFloorNanoton {
				fat = append(fat, e)
			}
		}
		if len(fat) > 0 {
			return fat[randIntn(len(fat))], true
		}
	}

	type weighted struct {
		entry  domain.CaseLootEntry
		weight float64
	}
	cands := make([]weighted, 0, len(pool))
	total := 0.0
	for _, e := range pool {
		rarity := strings.ToLower(strings.TrimSpace(e.RarityLabel))
		w := rarityWeight(cfg, rarity)
		if w <= 0 {
			continue
		}
		cands = append(cands, weighted{entry: e, weight: w})
		total += w
	}
	if total <= 0 || len(cands) == 0 {
		return pool[randIntn(len(pool))], true
	}
	roll := randFloat() * total
	cursor := 0.0
	for _, c := range cands {
		cursor += c.weight
		if roll <= cursor {
			return c.entry, true
		}
	}
	return cands[len(cands)-1].entry, true
}

func (s *LiveSim) lootPool(ctx context.Context) []domain.CaseLootEntry {
	s.mu.Lock()
	if time.Since(s.poolAt) < 45*time.Second && len(s.pool) > 0 {
		out := s.pool
		s.mu.Unlock()
		return out
	}
	s.mu.Unlock()

	cases, err := s.svc.cases.ListActive(ctx)
	if err != nil {
		slog.Warn("case live sim: list active failed", "error", err)
		return nil
	}
	pool := make([]domain.CaseLootEntry, 0, 64)
	for _, c := range cases {
		loot, err := s.svc.cases.ListLootByCase(ctx, c.ID)
		if err != nil {
			continue
		}
		pool = append(pool, loot...)
	}
	s.mu.Lock()
	s.pool = pool
	s.poolAt = time.Now()
	s.mu.Unlock()
	return pool
}

func (s *LiveSim) InvalidateLootPool() {
	s.mu.Lock()
	s.poolAt = time.Time{}
	s.mu.Unlock()
}

func randFloat() float64 {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return 0.5
	}
	u := binary.BigEndian.Uint64(b[:]) >> 11
	return float64(u) / (1 << 53)
}

func randIntn(n int) int {
	if n <= 1 {
		return 0
	}
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return 0
	}
	return int(binary.BigEndian.Uint64(b[:]) % uint64(n))
}
