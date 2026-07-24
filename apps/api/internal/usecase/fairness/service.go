package fairness

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/provablyfair"
	"github.com/google/uuid"
)

type Service struct {
	platform domain.PlatformRepository
	games    domain.GameRepository
}

func NewService(platform domain.PlatformRepository, games domain.GameRepository) *Service {
	return &Service{platform: platform, games: games}
}

func (s *Service) EnsureActiveSeed(ctx context.Context, gameType domain.GameType) (*domain.ProvablyFairSeedSession, error) {
	active, err := s.platform.GetActiveSeed(ctx, gameType)
	if err != nil {
		return nil, err
	}
	if active != nil {
		return active, nil
	}
	return s.RotateSeed(ctx, gameType, "")
}

func (s *Service) RotateSeed(ctx context.Context, gameType domain.GameType, clientSeed string) (*domain.ProvablyFairSeedSession, error) {
	if err := s.platform.DeactivateSeeds(ctx, gameType); err != nil {
		return nil, err
	}

	seedBytes := make([]byte, 32)
	if _, err := rand.Read(seedBytes); err != nil {
		return nil, err
	}
	serverSeed := hex.EncodeToString(seedBytes)
	hash := provablyfair.HashSHA256(serverSeed)

	session := &domain.ProvablyFairSeedSession{
		ID:             uuid.New(),
		GameType:       gameType,
		ServerSeedHash: hash,
		ServerSeed:     serverSeed,
		ClientSeed:     clientSeed,
		Nonce:          0,
		Active:         true,
	}
	if err := s.platform.CreateSeedSession(ctx, session); err != nil {
		return nil, err
	}
	return session, nil
}

func (s *Service) RoundProof(ctx context.Context, roundID uuid.UUID) (*domain.RoundProof, error) {
	round, err := s.games.GetRoundByID(ctx, roundID)
	if err != nil {
		return nil, err
	}
	if round.Status != "finished" {
		return nil, domain.ErrNotFound
	}

	proof := &domain.RoundProof{
		RoundID:        round.ID,
		GameType:       round.GameType,
		RoundNumber:    round.RoundNumber,
		ServerSeedHash: round.ServerSeedHash,
		ServerSeed:     round.ServerSeed,
		ClientSeed:     round.ClientSeed,
		Nonce:          round.Nonce,
	}

	var payload map[string]any
	_ = json.Unmarshal(round.ResultPayload, &payload)
	if result, ok := payload["color"].(string); ok {
		proof.Result = result
	} else if crash, ok := payload["crash_point"].(float64); ok {
		proof.Result = fmt.Sprintf("%.2f", crash)
	}

	proof.Verified = provablyfair.VerifyRound(string(round.GameType), round.ServerSeedHash, round.ServerSeed, round.Nonce, round.ResultPayload)
	return proof, nil
}

func (s *Service) SeedHistory(ctx context.Context, gameType domain.GameType) ([]domain.ProvablyFairSeedSession, error) {
	return s.platform.ListSeedHistory(ctx, gameType, 10)
}
