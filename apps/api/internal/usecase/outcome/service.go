package outcome

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

// OutcomeMode — how strongly an override is applied.
//   - "force": every covered round is forced to the target outcome.
//   - "bias": each covered round is forced with probability Weight% (0-100),
//     otherwise it plays out fairly. This tilts RTP without full control.
const (
	ModeForce = "force"
	ModeBias  = "bias"
)

// RouletteTarget describes a desired roulette outcome.
type RouletteTarget struct {
	Color  string `json:"color"`
	Number *int   `json:"number,omitempty"`
	Mode   string `json:"mode"`
	Weight int    `json:"weight"`
}

// CrashTarget describes a desired crash outcome.
// If ExactPoint > 0 it is used verbatim; otherwise the range [MinPoint, MaxPoint] applies.
type CrashTarget struct {
	MinPoint   float64  `json:"min_point"`
	MaxPoint   float64  `json:"max_point"`
	ExactPoint *float64 `json:"exact_point,omitempty"`
	Mode       string   `json:"mode"`
	Weight     int      `json:"weight"`
}

// PvPTarget describes a desired PvP winner by user id.
type PvPTarget struct {
	WinnerID string `json:"winner_id"`
	Mode     string `json:"mode"`
	Weight   int    `json:"weight"`
}

type Service struct {
	repo domain.OutcomeOverrideRepository
}

func NewService(repo domain.OutcomeOverrideRepository) *Service {
	return &Service{repo: repo}
}

func (s *Service) SetOverride(ctx context.Context, gameType domain.GameType, target any, roundsRemaining int, createdBy uuid.UUID, note string, ttl time.Duration) (*domain.GameOutcomeOverride, error) {
	if roundsRemaining <= 0 {
		roundsRemaining = 1
	}
	raw, err := json.Marshal(target)
	if err != nil {
		return nil, err
	}
	override := &domain.GameOutcomeOverride{
		GameType:        gameType,
		Target:          raw,
		RoundsRemaining: roundsRemaining,
		CreatedBy:       createdBy,
		Note:            note,
		CreatedAt:       time.Now().UTC(),
	}
	if ttl > 0 {
		exp := time.Now().UTC().Add(ttl)
		override.ExpiresAt = &exp
	}
	if err := s.repo.CreateOutcomeOverride(ctx, override); err != nil {
		return nil, err
	}
	return override, nil
}

func (s *Service) ListOverrides(ctx context.Context) ([]domain.GameOutcomeOverride, error) {
	return s.repo.ListOutcomeOverrides(ctx)
}

func (s *Service) DeleteOverride(ctx context.Context, id uuid.UUID) error {
	return s.repo.DeleteOutcomeOverride(ctx, id)
}

// TakePending claims the next pending override for a game type (consuming one round).
func (s *Service) TakePending(ctx context.Context, gameType domain.GameType) (*domain.GameOutcomeOverride, bool, error) {
	return s.repo.TakePending(ctx, gameType)
}

func (s *Service) DecodeRouletteTarget(o *domain.GameOutcomeOverride) (RouletteTarget, error) {
	var t RouletteTarget
	err := json.Unmarshal(o.Target, &t)
	return t, err
}

func (s *Service) DecodeCrashTarget(o *domain.GameOutcomeOverride) (CrashTarget, error) {
	var t CrashTarget
	err := json.Unmarshal(o.Target, &t)
	return t, err
}

func (s *Service) DecodePvPTarget(o *domain.GameOutcomeOverride) (PvPTarget, error) {
	var t PvPTarget
	err := json.Unmarshal(o.Target, &t)
	return t, err
}

// ShouldApply decides, based on mode/weight, whether this covered round is
// actually forced. Force => always. Bias => with Weight% probability.
func ShouldApply(mode string, weight int) bool {
	if mode == ModeForce {
		return true
	}
	if weight <= 0 {
		return false
	}
	if weight >= 100 {
		return true
	}
	var b [1]byte
	_, _ = rand.Read(b[:])
	return int(b[0])%100 < weight
}

func resolveWeight(w int) int {
	if w <= 0 {
		return 100
	}
	if w > 100 {
		return 100
	}
	return w
}

func rouletteMode(t RouletteTarget) (string, int) {
	return orMode(t.Mode), resolveWeight(t.Weight)
}

func crashMode(t CrashTarget) (string, int) {
	return orMode(t.Mode), resolveWeight(t.Weight)
}

func pvpMode(t PvPTarget) (string, int) {
	return orMode(t.Mode), resolveWeight(t.Weight)
}

func (s *Service) RouletteMode(t RouletteTarget) (string, int) { return rouletteMode(t) }
func (s *Service) CrashMode(t CrashTarget) (string, int)       { return crashMode(t) }
func (s *Service) PvPMode(t PvPTarget) (string, int)           { return pvpMode(t) }

func orMode(m string) string {
	if m == ModeBias {
		return ModeBias
	}
	return ModeForce
}
