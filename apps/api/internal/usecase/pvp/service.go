package pvp

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"log/slog"
	"sync"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/google/uuid"
)

type Service struct {
	pvp      domain.PvPRepository
	users    domain.UserRepository
	balance  *balance.Service
	feeBps   int
	notifier TickNotifier
	roomMu   sync.Map
}

func NewService(pvp domain.PvPRepository, users domain.UserRepository, balance *balance.Service, feeBps int) *Service {
	return &Service{pvp: pvp, users: users, balance: balance, feeBps: feeBps}
}

func (s *Service) SetTickNotifier(notifier TickNotifier) {
	s.notifier = notifier
}

func (s *Service) roomLock(roomID uuid.UUID) *sync.Mutex {
	mu, _ := s.roomMu.LoadOrStore(roomID.String(), &sync.Mutex{})
	return mu.(*sync.Mutex)
}

func (s *Service) CreateRoom(ctx context.Context, creatorID uuid.UUID, betAmount int64, maxPlayers int) (*RoomView, error) {
	if betAmount <= 0 || maxPlayers != 2 {
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

	view, err := s.roomView(ctx, room)
	if err != nil {
		return nil, err
	}
	s.broadcast(ctx)
	return view, nil
}

func (s *Service) JoinRoom(ctx context.Context, userID, roomID uuid.UUID) (*RoomView, error) {
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

	joined, err := s.pvp.HasPlayer(ctx, roomID, userID)
	if err != nil {
		return nil, err
	}
	if joined {
		return nil, domain.ErrAlreadyJoined
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
		if err := s.scheduleSpin(ctx, room); err != nil {
			return nil, err
		}
		room, err = s.pvp.GetRoom(ctx, roomID)
		if err != nil {
			return nil, err
		}
	}

	view, err := s.roomView(ctx, room)
	if err != nil {
		return nil, err
	}
	s.broadcast(ctx)
	return view, nil
}

func (s *Service) CurrentState(ctx context.Context) (*LobbyState, error) {
	return s.buildLobbyState(ctx)
}

func (s *Service) ProcessDueRooms(ctx context.Context) error {
	now := time.Now().UTC()

	countdownRooms, err := s.pvp.ListCountdownDue(ctx, now)
	if err != nil {
		return err
	}
	for i := range countdownRooms {
		room := countdownRooms[i]
		mu := s.roomLock(room.ID)
		mu.Lock()
		if err := s.startSpinning(ctx, &room); err != nil {
			slog.Warn("pvp start spinning failed", "room", room.ID, "error", err)
		}
		mu.Unlock()
	}

	spinningRooms, err := s.pvp.ListSpinningDue(ctx, now)
	if err != nil {
		return err
	}
	for i := range spinningRooms {
		room := spinningRooms[i]
		mu := s.roomLock(room.ID)
		mu.Lock()
		if err := s.finishGame(ctx, &room); err != nil {
			slog.Warn("pvp finish game failed", "room", room.ID, "error", err)
		}
		mu.Unlock()
	}

	if len(countdownRooms) > 0 || len(spinningRooms) > 0 {
		s.broadcast(ctx)
	}
	return nil
}

func (s *Service) scheduleSpin(ctx context.Context, room *domain.PvPRoom) error {
	players, err := s.pvp.ListPlayers(ctx, room.ID)
	if err != nil {
		return err
	}
	if len(players) == 0 {
		return nil
	}

	winnerIdx := randomInt(len(players))
	winner := players[winnerIdx]

	now := time.Now().UTC()
	spinAt := now.Add(CountdownSeconds * time.Second)
	spinEndsAt := spinAt.Add(SpinSeconds * time.Second)

	room.Status = "countdown"
	room.WinnerID = &winner.UserID
	room.SpinAt = &spinAt
	room.SpinEndsAt = &spinEndsAt
	return s.pvp.UpdateRoom(ctx, room)
}

func (s *Service) startSpinning(ctx context.Context, room *domain.PvPRoom) error {
	latest, err := s.pvp.GetRoom(ctx, room.ID)
	if err != nil {
		return err
	}
	if latest.Status != "countdown" {
		return nil
	}
	latest.Status = "spinning"
	return s.pvp.UpdateRoom(ctx, latest)
}

func (s *Service) finishGame(ctx context.Context, room *domain.PvPRoom) error {
	latest, err := s.pvp.GetRoom(ctx, room.ID)
	if err != nil {
		return err
	}
	if latest.Status != "spinning" || latest.WinnerID == nil {
		return nil
	}

	players, err := s.pvp.ListPlayers(ctx, latest.ID)
	if err != nil {
		return err
	}

	pot := latest.BetAmountNanoton * int64(len(players))
	fee := pot * int64(latest.PlatformFeeBps) / 10000
	payout := pot - fee

	now := time.Now().UTC()
	latest.Status = "finished"
	latest.PayoutNanoton = &payout
	latest.FinishedAt = &now
	if err := s.pvp.UpdateRoom(ctx, latest); err != nil {
		return err
	}

	if _, err := s.balance.Credit(ctx, *latest.WinnerID, payout, domain.LedgerWin, "pvp_room", latest.ID); err != nil {
		return err
	}

	return nil
}

func (s *Service) buildLobbyState(ctx context.Context) (*LobbyState, error) {
	activeRooms, err := s.pvp.ListActiveRooms(ctx)
	if err != nil {
		return nil, err
	}
	historyRooms, err := s.pvp.ListRecentFinishedRooms(ctx, HistoryLimit)
	if err != nil {
		return nil, err
	}

	active := make([]RoomView, 0, len(activeRooms))
	for i := range activeRooms {
		view, err := s.roomView(ctx, &activeRooms[i])
		if err != nil {
			return nil, err
		}
		active = append(active, *view)
	}

	history := make([]RoomView, 0, len(historyRooms))
	for i := range historyRooms {
		view, err := s.roomView(ctx, &historyRooms[i])
		if err != nil {
			return nil, err
		}
		history = append(history, *view)
	}

	return &LobbyState{Active: active, History: history}, nil
}

func (s *Service) roomView(ctx context.Context, room *domain.PvPRoom) (*RoomView, error) {
	players, err := s.pvp.ListPlayers(ctx, room.ID)
	if err != nil {
		return nil, err
	}

	playerViews := make([]PlayerView, 0, len(players))
	for _, player := range players {
		user, err := s.users.FindByID(ctx, player.UserID)
		if err != nil {
			return nil, err
		}
		playerViews = append(playerViews, PlayerView{
			UserID:    user.ID,
			FirstName: user.FirstName,
			Username:  user.Username,
			PhotoURL:  user.PhotoURL,
			IsWinner:  player.IsWinner || (room.WinnerID != nil && *room.WinnerID == user.ID && room.Status == "finished"),
		})
	}

	view := &RoomView{
		ID:               room.ID,
		CreatorID:        room.CreatorID,
		BetAmountNanoton: room.BetAmountNanoton,
		MaxPlayers:       room.MaxPlayers,
		Status:           room.Status,
		PlayerCount:      len(players),
		Players:          playerViews,
		PayoutNanoton:    room.PayoutNanoton,
		SpinAt:           room.SpinAt,
		SpinEndsAt:       room.SpinEndsAt,
		FinishedAt:       room.FinishedAt,
		CreatedAt:        room.CreatedAt,
	}

	if room.Status == "spinning" || room.Status == "finished" {
		view.WinnerID = room.WinnerID
	}

	return view, nil
}

func (s *Service) broadcast(ctx context.Context) {
	if s.notifier == nil {
		return
	}
	state, err := s.buildLobbyState(ctx)
	if err != nil {
		slog.Warn("pvp broadcast state failed", "error", err)
		return
	}
	s.notifier.NotifyGameTick("pvp", state.Marshal())
}

func randomInt(max int) int {
	if max <= 0 {
		return 0
	}
	var b [8]byte
	_, _ = rand.Read(b[:])
	return int(binary.BigEndian.Uint64(b[:]) % uint64(max))
}
