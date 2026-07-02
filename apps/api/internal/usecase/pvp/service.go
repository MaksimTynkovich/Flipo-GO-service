package pvp

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"sync"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/google/uuid"
)

type Service struct {
	pvp      domain.PvPRepository
	balance  *balance.Service
	feeBps   int
	roomMu   sync.Map
}

func NewService(pvp domain.PvPRepository, balance *balance.Service, feeBps int) *Service {
	return &Service{pvp: pvp, balance: balance, feeBps: feeBps}
}

func (s *Service) roomLock(roomID uuid.UUID) *sync.Mutex {
	mu, _ := s.roomMu.LoadOrStore(roomID.String(), &sync.Mutex{})
	return mu.(*sync.Mutex)
}

func (s *Service) CreateRoom(ctx context.Context, creatorID uuid.UUID, betAmount int64, maxPlayers int) (*domain.PvPRoom, error) {
	if betAmount <= 0 || maxPlayers < 2 {
		return nil, domain.ErrInvalidAmount
	}

	holdID := uuid.New()
	if _, err := s.balance.Debit(ctx, creatorID, betAmount, domain.LedgerBet, "pvp_hold", holdID); err != nil {
		return nil, err
	}

	room := &domain.PvPRoom{
		ID:               uuid.New(),
		CreatorID:        creatorID,
		BetAmountNanoton: betAmount,
		MaxPlayers:       maxPlayers,
		Status:           "open",
		PlatformFeeBps:   s.feeBps,
		CreatedAt:        time.Now().UTC(),
	}
	if err := s.pvp.CreateRoom(ctx, room); err != nil {
		_, _ = s.balance.Credit(ctx, creatorID, betAmount, domain.LedgerRefund, "pvp_hold", holdID)
		return nil, err
	}

	player := &domain.PvPRoomPlayer{
		RoomID:   room.ID,
		UserID:   creatorID,
		JoinedAt: time.Now().UTC(),
	}
	if err := s.pvp.AddPlayer(ctx, player); err != nil {
		return nil, err
	}
	return room, nil
}

func (s *Service) JoinRoom(ctx context.Context, userID, roomID uuid.UUID) (*domain.PvPRoom, error) {
	mu := s.roomLock(roomID)
	mu.Lock()
	defer mu.Unlock()

	room, err := s.pvp.GetRoom(ctx, roomID)
	if err != nil {
		return nil, err
	}
	if room.Status != "open" {
		return nil, domain.ErrRoomFull
	}

	count, err := s.pvp.CountPlayers(ctx, roomID)
	if err != nil {
		return nil, err
	}
	if count >= room.MaxPlayers {
		return nil, domain.ErrRoomFull
	}

	holdID := uuid.New()
	if _, err := s.balance.Debit(ctx, userID, room.BetAmountNanoton, domain.LedgerBet, "pvp_hold", holdID); err != nil {
		return nil, err
	}

	player := &domain.PvPRoomPlayer{
		RoomID:   roomID,
		UserID:   userID,
		JoinedAt: time.Now().UTC(),
	}
	if err := s.pvp.AddPlayer(ctx, player); err != nil {
		_, _ = s.balance.Credit(ctx, userID, room.BetAmountNanoton, domain.LedgerRefund, "pvp_hold", holdID)
		return nil, err
	}

	count++
	if count >= room.MaxPlayers {
		if err := s.startGame(ctx, room); err != nil {
			return nil, err
		}
	}
	return room, nil
}

func (s *Service) ListOpenRooms(ctx context.Context) ([]domain.PvPRoom, error) {
	return s.pvp.ListOpenRooms(ctx)
}

func (s *Service) startGame(ctx context.Context, room *domain.PvPRoom) error {
	players, err := s.pvp.ListPlayers(ctx, room.ID)
	if err != nil {
		return err
	}

	winnerIdx := randomInt(len(players))
	winner := players[winnerIdx]

	pot := room.BetAmountNanoton * int64(len(players))
	fee := pot * int64(room.PlatformFeeBps) / 10000
	payout := pot - fee

	now := time.Now().UTC()
	room.Status = "finished"
	room.WinnerID = &winner.UserID
	room.FinishedAt = &now
	if err := s.pvp.UpdateRoom(ctx, room); err != nil {
		return err
	}

	_, err = s.balance.Credit(ctx, winner.UserID, payout, domain.LedgerWin, "pvp_room", room.ID)
	return err
}

func randomInt(max int) int {
	if max <= 0 {
		return 0
	}
	var b [8]byte
	_, _ = rand.Read(b[:])
	return int(binary.BigEndian.Uint64(b[:]) % uint64(max))
}
