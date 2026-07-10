package pvp

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"sort"
	"sync"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/provablyfair"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/flipo/flipo/apps/api/internal/usecase/betfunding"
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type Service struct {
	pvp       domain.PvPRepository
	games     domain.GameRepository
	users     domain.UserRepository
	balance   *balance.Service
	funding   *betfunding.Service
	inventory domain.InventoryRepository
	feeBps    int
	notifier  TickNotifier
	roomMu    sync.Map
}

func NewService(
	pvp domain.PvPRepository,
	games domain.GameRepository,
	users domain.UserRepository,
	balance *balance.Service,
	funding *betfunding.Service,
	inventory domain.InventoryRepository,
	feeBps int,
) *Service {
	return &Service{pvp: pvp, games: games, users: users, balance: balance, funding: funding, inventory: inventory, feeBps: feeBps}
}

func (s *Service) SetTickNotifier(notifier TickNotifier) {
	s.notifier = notifier
}

func (s *Service) roomLock(roomID uuid.UUID) *sync.Mutex {
	mu, _ := s.roomMu.LoadOrStore(roomID.String(), &sync.Mutex{})
	return mu.(*sync.Mutex)
}

func (s *Service) CreateRoom(ctx context.Context, creatorID uuid.UUID, stake betfunding.StakeInput, maxPlayers int) (*RoomView, error) {
	if maxPlayers != 2 {
		return nil, domain.ErrInvalidAmount
	}

	holdID := uuid.New()
	resolved, err := s.funding.ResolveAndLock(ctx, creatorID, holdID, stake, "pvp_hold")
	if err != nil {
		return nil, err
	}
	if resolved.AmountNanoton <= 0 {
		s.funding.Rollback(ctx, creatorID, holdID, resolved, "pvp_hold")
		return nil, domain.ErrInvalidAmount
	}

	room := &domain.PvPRoom{
		ID:               uuid.New(),
		CreatorID:        creatorID,
		BetAmountNanoton: resolved.AmountNanoton,
		MaxPlayers:       maxPlayers,
		Status:           "open",
		PlatformFeeBps:   s.feeBps,
		CreatedAt:        time.Now().UTC(),
	}
	if err := s.pvp.CreateRoom(ctx, room); err != nil {
		s.funding.Rollback(ctx, creatorID, holdID, resolved, "pvp_hold")
		return nil, err
	}

	player := &domain.PvPRoomPlayer{
		RoomID:          room.ID,
		UserID:          creatorID,
		FundingType:     resolved.FundingType,
		InventoryItemID: resolved.InventoryItemID,
		JoinedAt:        time.Now().UTC(),
	}
	if err := s.pvp.AddPlayer(ctx, player); err != nil {
		s.funding.Rollback(ctx, creatorID, holdID, resolved, "pvp_hold")
		return nil, err
	}

	view, err := s.roomView(ctx, room)
	if err != nil {
		return nil, err
	}
	s.broadcast(ctx)
	return view, nil
}

func (s *Service) JoinRoom(ctx context.Context, userID, roomID uuid.UUID, stake betfunding.StakeInput) (*RoomView, error) {
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
	if stake.FundingType == domain.BetFundingBalance {
		stake.AmountNanoton = room.BetAmountNanoton
	}
	resolved, err := s.funding.ResolveAndLock(ctx, userID, holdID, stake, "pvp_hold")
	if err != nil {
		return nil, err
	}
	if resolved.AmountNanoton != room.BetAmountNanoton {
		s.funding.Rollback(ctx, userID, holdID, resolved, "pvp_hold")
		return nil, domain.ErrGiftValueMismatch
	}

	player := &domain.PvPRoomPlayer{
		RoomID:          roomID,
		UserID:          userID,
		FundingType:     resolved.FundingType,
		InventoryItemID: resolved.InventoryItemID,
		JoinedAt:        time.Now().UTC(),
	}
	if err := s.pvp.AddPlayer(ctx, player); err != nil {
		s.funding.Rollback(ctx, userID, holdID, resolved, "pvp_hold")
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

	playerIDs := make([]uuid.UUID, len(players))
	for i, p := range players {
		playerIDs[i] = p.UserID
	}
	sort.Slice(playerIDs, func(i, j int) bool {
		return playerIDs[i].String() < playerIDs[j].String()
	})

	seedBytes := make([]byte, 32)
	if _, err := rand.Read(seedBytes); err != nil {
		return err
	}
	serverSeed := hex.EncodeToString(seedBytes)
	serverSeedHash := provablyfair.HashSHA256(serverSeed)
	clientSeed := room.ID.String()

	roundNumber, err := s.games.GetNextRoundNumber(ctx, domain.GamePvP)
	if err != nil {
		return err
	}

	now := time.Now().UTC()
	gameRound := &domain.GameRound{
		ID:             uuid.New(),
		GameType:       domain.GamePvP,
		RoundNumber:    roundNumber,
		Status:         "active",
		StartedAt:      now,
		ServerSeedHash: serverSeedHash,
		ServerSeed:     serverSeed,
		ClientSeed:     clientSeed,
		Nonce:          roundNumber,
		CreatedAt:      now,
	}
	if err := s.games.CreateRound(ctx, gameRound); err != nil {
		return err
	}

	winnerIdx := provablyfair.PvPWinnerIndex(serverSeed, roundNumber, playerIDs)
	winner := players[winnerIdx]

	spinAt := now.Add(CountdownSeconds * time.Second)
	spinEndsAt := spinAt.Add(SpinSeconds * time.Second)

	room.Status = "countdown"
	room.WinnerID = &winner.UserID
	room.GameRoundID = &gameRound.ID
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

	pot := int64(0)
	for _, p := range players {
		if p.FundingType == domain.BetFundingBalance {
			pot += latest.BetAmountNanoton
		}
	}
	fee := pot * int64(latest.PlatformFeeBps) / 10000
	payout := pot - fee

	now := time.Now().UTC()
	latest.Status = "finished"
	latest.PayoutNanoton = &payout
	latest.FinishedAt = &now
	if err := s.pvp.UpdateRoom(ctx, latest); err != nil {
		return err
	}

	if latest.GameRoundID != nil && latest.WinnerID != nil {
		players, _ := s.pvp.ListPlayers(ctx, latest.ID)
		playerIDs := make([]string, 0, len(players))
		for _, p := range players {
			playerIDs = append(playerIDs, p.UserID.String())
		}
		sort.Strings(playerIDs)
		resultJSON, _ := json.Marshal(map[string]interface{}{
			"winner_id":  latest.WinnerID.String(),
			"player_ids": playerIDs,
		})
		if round, err := s.games.GetRoundByID(ctx, *latest.GameRoundID); err == nil && round != nil {
			round.Status = "finished"
			round.EndedAt = &now
			round.ResultPayload = datatypes.JSON(resultJSON)
			_ = s.games.UpdateRound(ctx, round)
		}
	}

	winnerID := *latest.WinnerID
	for _, p := range players {
		if p.UserID == winnerID {
			if p.FundingType == domain.BetFundingGift && p.InventoryItemID != nil {
				_ = s.inventory.ReleaseFromBet(ctx, *p.InventoryItemID)
			}
			continue
		}
		if p.FundingType == domain.BetFundingGift && p.InventoryItemID != nil {
			bet := domain.GameBet{FundingType: p.FundingType, InventoryItemID: p.InventoryItemID}
			_ = s.funding.TransferLossToWinner(ctx, bet, winnerID)
		}
	}

	if payout > 0 {
		if _, err := s.balance.Credit(ctx, winnerID, payout, domain.LedgerWin, "pvp_room", latest.ID); err != nil {
			return err
		}
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
		view := PlayerView{
			UserID:      user.ID,
			FirstName:   user.FirstName,
			Username:    user.Username,
			PhotoURL:    user.PhotoURL,
			FundingType: string(player.FundingType),
			IsWinner:    player.IsWinner || (room.WinnerID != nil && *room.WinnerID == user.ID && room.Status == "finished"),
		}
		if player.InventoryItemID != nil && s.inventory != nil {
			if item, err := s.inventory.FindByID(ctx, *player.InventoryItemID); err == nil {
				view.Gift = &GiftView{
					ID:       item.ID.String(),
					Name:     item.Name,
					ImageURL: item.ImageURL,
				}
			}
		}
		playerViews = append(playerViews, view)
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
		GameRoundID:      room.GameRoundID,
	}

	if room.GameRoundID != nil {
		if round, err := s.games.GetRoundByID(ctx, *room.GameRoundID); err == nil && round != nil {
			view.ServerSeedHash = round.ServerSeedHash
			if room.Status == "finished" {
				view.ServerSeed = round.ServerSeed
			}
		}
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

