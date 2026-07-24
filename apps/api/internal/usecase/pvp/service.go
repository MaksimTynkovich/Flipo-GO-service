package pvp

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"sync"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/gifts"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/provablyfair"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/flipo/flipo/apps/api/internal/usecase/betfunding"
	outcomeuc "github.com/flipo/flipo/apps/api/internal/usecase/outcome"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type Service struct {
	pvp       domain.PvPRepository
	games     domain.GameRepository
	users     domain.UserRepository
	balance   *balance.Service
	funding   *betfunding.Service
	inventory domain.InventoryRepository
	valuator  *gifts.Valuator
	feeBps    int
	notifier  TickNotifier
	overlay   RoomOverlay
	ghosts    GhostClaimer
	bots      BotMatchmaker
	outcome   *outcomeuc.Service
	admin     AdminGameNotifier
	roomMu    sync.Map
	betHook   func(context.Context, uuid.UUID, int64)
}

type AdminGameNotifier interface {
	NotifyGameResult(ctx context.Context, actor telegram.AdminActor, game, outcome, selection string, stakeNanoton, payoutNanoton int64, multiplier, crashPoint *float64, resultLabel string)
}

func (s *Service) SetOutcome(svc *outcomeuc.Service) {
	s.outcome = svc
}

func (s *Service) SetAdminNotifier(notifier AdminGameNotifier) {
	s.admin = notifier
}

func (s *Service) SetQualifyingBetHook(hook func(context.Context, uuid.UUID, int64)) {
	s.betHook = hook
}

// GhostClaimer materializes joinable social-sim PvP rooms into real DB rooms.
type GhostClaimer interface {
	ClaimOpenGhostRoom(roomID uuid.UUID) (*GhostRoomClaim, bool)
}

// BotMatchmaker schedules house bots into open human-created rooms.
type BotMatchmaker interface {
	BotJoinsEnabled() bool
	PlanBotJoins(rooms []OpenHumanRoom) []PlannedBotJoin
}

type OpenHumanRoom struct {
	ID               uuid.UUID
	CreatorID        uuid.UUID
	BetAmountNanoton int64
	CreatedAt        time.Time
	PlayerIDs        []uuid.UUID
}

type PlannedBotJoin struct {
	RoomID        uuid.UUID
	BotUserID     uuid.UUID
	BotTelegramID int64
	BotUsername   string
	BotFirstName  string
	BotPhotoURL   string
	StakeNanoton  int64
}

type GhostRoomClaim struct {
	ID               uuid.UUID
	BetAmountNanoton int64
	BotUserID        uuid.UUID
	BotTelegramID    int64
	BotUsername      string
	BotFirstName     string
	BotPhotoURL      string
	CreatedAt        time.Time
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

func (s *Service) SetValuator(valuator *gifts.Valuator) {
	s.valuator = valuator
}

func (s *Service) SetTickNotifier(notifier TickNotifier) {
	s.notifier = notifier
}

func (s *Service) SetRoomOverlay(overlay RoomOverlay) {
	s.overlay = overlay
}

func (s *Service) SetGhostClaimer(claimer GhostClaimer) {
	s.ghosts = claimer
}

func (s *Service) SetBotMatchmaker(bots BotMatchmaker) {
	s.bots = bots
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
		StakeNanoton:    resolved.AmountNanoton,
		BalanceNanoton:  resolved.BalanceNanoton,
		FundingType:     resolved.FundingType,
		InventoryItemID: resolved.InventoryItemID,
		JoinedAt:        time.Now().UTC(),
	}
	if err := s.pvp.AddPlayer(ctx, player); err != nil {
		s.funding.Rollback(ctx, creatorID, holdID, resolved, "pvp_hold")
		return nil, err
	}
	if err := s.persistPlayerGifts(ctx, room.ID, creatorID, resolved); err != nil {
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
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		room, err = s.materializeGhostRoom(ctx, roomID)
		if err != nil {
			return nil, err
		}
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
	// TON-only join: debit exactly the room stake. Gift/combined stakes are validated by tolerance.
	if len(stake.GiftIDs()) == 0 {
		stake.AmountNanoton = room.BetAmountNanoton
		stake.FundingType = domain.BetFundingBalance
	}
	resolved, err := s.funding.ResolveAndLock(ctx, userID, holdID, stake, "pvp_hold")
	if err != nil {
		return nil, err
	}
	if resolved.AmountNanoton != room.BetAmountNanoton {
		if !StakeWithinTolerance(room.BetAmountNanoton, resolved.AmountNanoton) {
			s.funding.Rollback(ctx, userID, holdID, resolved, "pvp_hold")
			return nil, domain.ErrGiftValueMismatch
		}
	}

	player := &domain.PvPRoomPlayer{
		RoomID:          roomID,
		UserID:          userID,
		StakeNanoton:    resolved.AmountNanoton,
		BalanceNanoton:  resolved.BalanceNanoton,
		FundingType:     resolved.FundingType,
		InventoryItemID: resolved.InventoryItemID,
		JoinedAt:        time.Now().UTC(),
	}
	if err := s.pvp.AddPlayer(ctx, player); err != nil {
		s.funding.Rollback(ctx, userID, holdID, resolved, "pvp_hold")
		return nil, err
	}
	if err := s.persistPlayerGifts(ctx, roomID, userID, resolved); err != nil {
		s.funding.Rollback(ctx, userID, holdID, resolved, "pvp_hold")
		return nil, err
	}
	if s.betHook != nil {
		s.betHook(ctx, userID, resolved.AmountNanoton)
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

func (s *Service) materializeGhostRoom(ctx context.Context, roomID uuid.UUID) (*domain.PvPRoom, error) {
	if s.ghosts == nil {
		return nil, domain.ErrNotFound
	}
	claim, ok := s.ghosts.ClaimOpenGhostRoom(roomID)
	if !ok || claim == nil {
		return nil, domain.ErrNotFound
	}

	bot, err := s.users.EnsureSocialBotUser(
		ctx,
		claim.BotUserID,
		claim.BotTelegramID,
		claim.BotUsername,
		claim.BotFirstName,
		claim.BotPhotoURL,
	)
	if err != nil {
		return nil, err
	}

	bal, err := s.users.GetBalanceForUpdate(ctx, bot.ID)
	if err != nil {
		return nil, err
	}
	if bal < claim.BetAmountNanoton {
		need := claim.BetAmountNanoton - bal
		if _, err := s.balance.Credit(ctx, bot.ID, need, domain.LedgerDeposit, "social_sim_bot_fund", roomID); err != nil {
			return nil, err
		}
	}

	holdID := uuid.New()
	resolved, err := s.funding.ResolveAndLock(ctx, bot.ID, holdID, betfunding.StakeInput{
		FundingType:   domain.BetFundingBalance,
		AmountNanoton: claim.BetAmountNanoton,
	}, "pvp_hold")
	if err != nil {
		return nil, err
	}

	createdAt := claim.CreatedAt
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
	}
	room := &domain.PvPRoom{
		ID:               roomID,
		CreatorID:        bot.ID,
		BetAmountNanoton: claim.BetAmountNanoton,
		MaxPlayers:       2,
		Status:           "open",
		PlatformFeeBps:   s.feeBps,
		CreatedAt:        createdAt,
	}
	if err := s.pvp.CreateRoom(ctx, room); err != nil {
		s.funding.Rollback(ctx, bot.ID, holdID, resolved, "pvp_hold")
		return nil, err
	}

	player := &domain.PvPRoomPlayer{
		RoomID:         room.ID,
		UserID:         bot.ID,
		StakeNanoton:   resolved.AmountNanoton,
		BalanceNanoton: resolved.BalanceNanoton,
		FundingType:    resolved.FundingType,
		JoinedAt:       createdAt,
	}
	if err := s.pvp.AddPlayer(ctx, player); err != nil {
		s.funding.Rollback(ctx, bot.ID, holdID, resolved, "pvp_hold")
		return nil, err
	}
	return room, nil
}

func (s *Service) persistPlayerGifts(ctx context.Context, roomID, userID uuid.UUID, resolved *betfunding.ResolvedStake) error {
	if resolved == nil || len(resolved.InventoryItemIDs) == 0 {
		return nil
	}
	rows := make([]domain.PvPRoomPlayerGift, 0, len(resolved.InventoryItemIDs))
	for _, id := range resolved.InventoryItemIDs {
		value := int64(0)
		if resolved.GiftValues != nil {
			value = resolved.GiftValues[id]
		}
		rows = append(rows, domain.PvPRoomPlayerGift{
			RoomID:          roomID,
			UserID:          userID,
			InventoryItemID: id,
			ValueNanoton:    value,
		})
	}
	return s.pvp.ReplacePlayerGifts(ctx, roomID, userID, rows)
}

func (s *Service) CurrentState(ctx context.Context) (*LobbyState, error) {
	return s.buildLobbyState(ctx)
}

func (s *Service) ProcessDueRooms(ctx context.Context) error {
	now := time.Now().UTC()
	changed := false

	if joined, err := s.tryBotJoins(ctx); err != nil {
		slog.Warn("pvp bot joins failed", "error", err)
	} else if joined {
		changed = true
	}

	expiredRooms, err := s.pvp.ListOpenExpired(ctx, now.Add(-OpenRoomTTL))
	if err != nil {
		return err
	}
	for i := range expiredRooms {
		room := expiredRooms[i]
		mu := s.roomLock(room.ID)
		mu.Lock()
		ok, cancelErr := s.cancelExpiredOpenRoom(ctx, room.ID, now)
		mu.Unlock()
		if cancelErr != nil {
			slog.Warn("pvp cancel expired room failed", "room", room.ID, "error", cancelErr)
			continue
		}
		if ok {
			changed = true
		}
	}

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
		} else {
			changed = true
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
		} else {
			changed = true
		}
		mu.Unlock()
	}

	if changed || (s.overlay != nil && len(s.overlay.PvPGhostRooms()) > 0) {
		s.broadcast(ctx)
	}
	return nil
}

func (s *Service) tryBotJoins(ctx context.Context) (bool, error) {
	if s.bots == nil || !s.bots.BotJoinsEnabled() {
		return false, nil
	}
	open, err := s.pvp.ListOpenRooms(ctx)
	if err != nil {
		return false, err
	}
	candidates := make([]OpenHumanRoom, 0, len(open))
	for i := range open {
		room := open[i]
		count, err := s.pvp.CountPlayers(ctx, room.ID)
		if err != nil || count != 1 {
			continue
		}
		players, err := s.pvp.ListPlayers(ctx, room.ID)
		if err != nil || len(players) != 1 {
			continue
		}
		creator, err := s.users.FindByID(ctx, room.CreatorID)
		if err != nil {
			continue
		}
		// Skip house / social bots waiting alone (ghost materializations).
		if isHouseBotUser(creator) {
			continue
		}
		ids := make([]uuid.UUID, 0, len(players))
		for _, p := range players {
			ids = append(ids, p.UserID)
		}
		candidates = append(candidates, OpenHumanRoom{
			ID:               room.ID,
			CreatorID:        room.CreatorID,
			BetAmountNanoton: room.BetAmountNanoton,
			CreatedAt:        room.CreatedAt,
			PlayerIDs:        ids,
		})
	}
	if len(candidates) == 0 {
		return false, nil
	}

	planned := s.bots.PlanBotJoins(candidates)
	joinedAny := false
	for _, plan := range planned {
		if _, err := s.joinBotOpponent(ctx, plan); err != nil {
			slog.Warn("pvp bot join room failed", "room", plan.RoomID, "error", err)
			continue
		}
		joinedAny = true
	}
	return joinedAny, nil
}

func isHouseBotUser(user *domain.User) bool {
	if user == nil {
		return false
	}
	if user.TelegramID == domain.BotTelegramID {
		return true
	}
	// Social-sim personas use reserved negative telegram ids.
	return user.TelegramID < 0
}

func (s *Service) joinBotOpponent(ctx context.Context, plan PlannedBotJoin) (*RoomView, error) {
	bot, err := s.users.EnsureSocialBotUser(
		ctx,
		plan.BotUserID,
		plan.BotTelegramID,
		plan.BotUsername,
		plan.BotFirstName,
		plan.BotPhotoURL,
	)
	if err != nil {
		return nil, err
	}

	bal, err := s.users.GetBalanceForUpdate(ctx, bot.ID)
	if err != nil {
		return nil, err
	}
	if bal < plan.StakeNanoton {
		need := plan.StakeNanoton - bal
		if _, err := s.balance.Credit(ctx, bot.ID, need, domain.LedgerDeposit, "social_sim_bot_fund", plan.RoomID); err != nil {
			return nil, err
		}
	}

	return s.JoinRoom(ctx, bot.ID, plan.RoomID, betfunding.StakeInput{
		FundingType:   domain.BetFundingBalance,
		AmountNanoton: plan.StakeNanoton,
	})
}

// cancelExpiredOpenRoom cancels an open room with no opponent and refunds stakes.
// Caller must hold roomLock(roomID). Returns true if the room was cancelled.
func (s *Service) cancelExpiredOpenRoom(ctx context.Context, roomID uuid.UUID, now time.Time) (bool, error) {
	room, err := s.pvp.GetRoom(ctx, roomID)
	if err != nil {
		return false, err
	}
	if room.Status != "open" {
		return false, nil
	}
	if room.CreatedAt.After(now.Add(-OpenRoomTTL)) {
		return false, nil
	}

	playerCount, err := s.pvp.CountPlayers(ctx, roomID)
	if err != nil {
		return false, err
	}
	if playerCount >= room.MaxPlayers {
		return false, nil
	}

	players, err := s.pvp.ListPlayers(ctx, roomID)
	if err != nil {
		return false, err
	}
	giftsByUser, err := s.roomGiftsByUser(ctx, roomID)
	if err != nil {
		return false, err
	}

	finishedAt := now
	room.Status = "cancelled"
	room.FinishedAt = &finishedAt
	if err := s.pvp.UpdateRoom(ctx, room); err != nil {
		return false, err
	}

	for _, player := range players {
		giftIDs := giftsByUser[player.UserID]
		if len(giftIDs) == 0 && player.InventoryItemID != nil {
			giftIDs = []uuid.UUID{*player.InventoryItemID}
		}
		stake := &betfunding.ResolvedStake{
			AmountNanoton:    player.StakeNanoton,
			BalanceNanoton:   playerBalancePortion(player, room.BetAmountNanoton),
			FundingType:      player.FundingType,
			InventoryItemID:  player.InventoryItemID,
			InventoryItemIDs: giftIDs,
		}
		if stake.AmountNanoton <= 0 {
			stake.AmountNanoton = room.BetAmountNanoton
		}
		s.funding.Rollback(ctx, player.UserID, room.ID, stake, "pvp_cancel")
	}

	slog.Info("pvp open room cancelled after timeout", "room", room.ID, "players", len(players))
	return true, nil
}

func (s *Service) scheduleSpin(ctx context.Context, room *domain.PvPRoom) error {
	players, err := s.pvp.ListPlayers(ctx, room.ID)
	if err != nil {
		return err
	}
	if len(players) == 0 {
		return nil
	}

	type entry struct {
		userID uuid.UUID
		stake  int64
	}
	entries := make([]entry, len(players))
	for i, p := range players {
		stake := p.StakeNanoton
		if stake <= 0 {
			stake = room.BetAmountNanoton
		}
		entries[i] = entry{userID: p.UserID, stake: stake}
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].userID.String() < entries[j].userID.String()
	})

	playerIDs := make([]uuid.UUID, len(entries))
	weights := make([]int64, len(entries))
	for i, e := range entries {
		playerIDs[i] = e.userID
		weights[i] = e.stake
	}

	roundNumber, err := s.games.GetNextRoundNumber(ctx, domain.GamePvP)
	if err != nil {
		return err
	}

	serverSeed := ""
	adminInfluenced := false
	if s.outcome != nil {
		if override, ok, oerr := s.outcome.TakePending(ctx, domain.GamePvP); oerr == nil && ok {
			if t, terr := s.outcome.DecodePvPTarget(override); terr == nil {
				mode, weight := s.outcome.PvPMode(t)
				if outcomeuc.ShouldApply(mode, weight) {
					targetID, perr := uuid.Parse(t.WinnerID)
					if perr == nil {
						for idx, id := range playerIDs {
							if id == targetID {
								if found, foundOk := provablyfair.FindPvPSeed(idx, roundNumber, playerIDs, weights, 200000); foundOk {
									serverSeed = found
									adminInfluenced = true
								}
								break
							}
						}
					}
				}
			}
		}
	}
	if serverSeed == "" {
		seedBytes := make([]byte, 32)
		if _, err := rand.Read(seedBytes); err != nil {
			return err
		}
		serverSeed = hex.EncodeToString(seedBytes)
	}
	serverSeedHash := provablyfair.HashSHA256(serverSeed)
	clientSeed := room.ID.String()

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

	if adminInfluenced {
		gameRound.AdminInfluenced = true
		if uerr := s.games.UpdateRound(ctx, gameRound); uerr != nil {
			slog.Warn("mark pvp round admin-influenced", "error", uerr)
		}
	}

	winnerIdx := provablyfair.PvPWeightedWinnerIndex(serverSeed, roundNumber, playerIDs, weights)
	winnerID := playerIDs[winnerIdx]

	spinAt := now.Add(CountdownSeconds * time.Second)
	spinEndsAt := spinAt.Add(SpinSeconds * time.Second)

	room.Status = "countdown"
	room.WinnerID = &winnerID
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
	giftsByUser, err := s.roomGiftsByUser(ctx, latest.ID)
	if err != nil {
		return err
	}

	pot := int64(0)
	for _, p := range players {
		pot += playerBalancePortion(p, latest.BetAmountNanoton)
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
		stakeByID := make(map[string]int64, len(players))
		for _, p := range players {
			stake := p.StakeNanoton
			if stake <= 0 {
				stake = latest.BetAmountNanoton
			}
			stakeByID[p.UserID.String()] = stake
		}
		sortedStakes := make([]int64, len(playerIDs))
		for i, id := range playerIDs {
			sortedStakes[i] = stakeByID[id]
		}
		resultJSON, _ := json.Marshal(map[string]interface{}{
			"winner_id":             latest.WinnerID.String(),
			"player_ids":            playerIDs,
			"player_stakes_nanoton": sortedStakes,
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
		giftIDs := giftsByUser[p.UserID]
		if len(giftIDs) == 0 && p.InventoryItemID != nil {
			giftIDs = []uuid.UUID{*p.InventoryItemID}
		}
		if p.UserID == winnerID {
			for _, giftID := range giftIDs {
				_ = s.inventory.ReleaseFromBet(ctx, giftID)
			}
			continue
		}
		for _, giftID := range giftIDs {
			id := giftID
			bet := domain.GameBet{FundingType: domain.BetFundingGift, InventoryItemID: &id}
			_ = s.funding.TransferLossToWinner(ctx, bet, winnerID)
		}
	}

	if payout > 0 {
		if _, err := s.balance.Credit(ctx, winnerID, payout, domain.LedgerWin, "pvp_room", latest.ID); err != nil {
			return err
		}
	}

	if s.admin != nil {
		for _, p := range players {
			stake := p.StakeNanoton
			if stake <= 0 {
				stake = latest.BetAmountNanoton
			}
			actor := s.actorForUser(ctx, p.UserID)
			if p.UserID == winnerID {
				s.admin.NotifyGameResult(
					ctx, actor, "pvp", "win", "победа",
					stake, payout, nil, nil,
					fmt.Sprintf("банк %s TON", formatPvPTON(payout)),
				)
			} else {
				s.admin.NotifyGameResult(
					ctx, actor, "pvp", "lose", "поражение",
					stake, 0, nil, nil,
					"проигрыш комнаты",
				)
			}
		}
	}

	return nil
}

func formatPvPTON(nanoton int64) string {
	return fmt.Sprintf("%.2f", float64(nanoton)/1e9)
}

func (s *Service) actorForUser(ctx context.Context, userID uuid.UUID) telegram.AdminActor {
	user, err := s.users.FindByID(ctx, userID)
	if err != nil || user == nil {
		return telegram.AdminActor{}
	}
	return telegram.AdminActor{
		TelegramID: user.TelegramID,
		Username:   user.Username,
		FirstName:  user.FirstName,
		LastName:   user.LastName,
	}
}

func (s *Service) buildLobbyState(ctx context.Context) (*LobbyState, error) {
	activeRooms, err := s.pvp.ListActiveRooms(ctx)
	if err != nil {
		return nil, err
	}
	historyRooms, err := s.pvp.ListRecentFinishedRooms(
		ctx,
		time.Now().UTC().Add(-time.Duration(HistoryVisibleSeconds)*time.Second),
		HistoryLimit,
	)
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

	if s.overlay != nil {
		for _, ghost := range s.overlay.PvPGhostRooms() {
			switch ghost.Status {
			case "finished":
				history = append(history, ghost)
			default:
				active = append(active, ghost)
			}
		}
	}

	return &LobbyState{Active: active, History: history}, nil
}

func (s *Service) roomView(ctx context.Context, room *domain.PvPRoom) (*RoomView, error) {
	players, err := s.pvp.ListPlayers(ctx, room.ID)
	if err != nil {
		return nil, err
	}
	giftsByUser, err := s.roomGiftViewsByUser(ctx, room.ID)
	if err != nil {
		return nil, err
	}

	playerViews := make([]PlayerView, 0, len(players))
	var totalStake int64
	for _, player := range players {
		stake := player.StakeNanoton
		if stake <= 0 {
			stake = room.BetAmountNanoton
		}
		totalStake += stake
	}
	for _, player := range players {
		user, err := s.users.FindByID(ctx, player.UserID)
		if err != nil {
			return nil, err
		}
		stake := player.StakeNanoton
		if stake <= 0 {
			stake = room.BetAmountNanoton
		}
		giftViews := giftsByUser[player.UserID]
		view := PlayerView{
			UserID:         user.ID,
			FirstName:      user.FirstName,
			Username:       user.Username,
			PhotoURL:       user.PhotoURL,
			StakeNanoton:   stake,
			BalanceNanoton: playerBalancePortion(player, room.BetAmountNanoton),
			FundingType:    string(player.FundingType),
			Gifts:          giftViews,
			IsWinner:       player.IsWinner || (room.WinnerID != nil && *room.WinnerID == user.ID && room.Status == "finished"),
		}
		if totalStake > 0 && len(players) >= 2 {
			view.WinChanceBps = int(stake * 10000 / totalStake)
		}
		if len(giftViews) > 0 {
			first := giftViews[0]
			view.Gift = &first
		} else if player.InventoryItemID != nil && s.inventory != nil {
			if item, err := s.inventory.FindByID(ctx, *player.InventoryItemID); err == nil {
				value := s.inventoryGiftValue(ctx, *item)
				if value <= 0 {
					value = stake
				}
				view.Gift = &GiftView{
					ID:             item.ID.String(),
					Name:           item.Name,
					ImageURL:       item.ImageURL,
					CollectionSlug: item.CollectionSlug,
					ValueNanoton:   value,
				}
				view.Gifts = []GiftView{*view.Gift}
			}
		}
		playerViews = append(playerViews, view)
	}

	view := &RoomView{
		ID:                room.ID,
		CreatorID:         room.CreatorID,
		BetAmountNanoton:  room.BetAmountNanoton,
		StakeToleranceBps: StakeToleranceBps,
		MaxPlayers:        room.MaxPlayers,
		Status:            room.Status,
		PlayerCount:       len(players),
		Players:           playerViews,
		PayoutNanoton:     room.PayoutNanoton,
		SpinAt:            room.SpinAt,
		SpinEndsAt:        room.SpinEndsAt,
		FinishedAt:        room.FinishedAt,
		CreatedAt:         room.CreatedAt,
		GameRoundID:       room.GameRoundID,
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

func playerBalancePortion(player domain.PvPRoomPlayer, roomBet int64) int64 {
	if player.BalanceNanoton > 0 {
		return player.BalanceNanoton
	}
	if player.FundingType == domain.BetFundingBalance {
		if player.StakeNanoton > 0 {
			return player.StakeNanoton
		}
		return roomBet
	}
	return 0
}

func (s *Service) roomGiftsByUser(ctx context.Context, roomID uuid.UUID) (map[uuid.UUID][]uuid.UUID, error) {
	rows, err := s.pvp.ListRoomPlayerGifts(ctx, roomID)
	if err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID][]uuid.UUID)
	for _, row := range rows {
		out[row.UserID] = append(out[row.UserID], row.InventoryItemID)
	}
	return out, nil
}

func (s *Service) roomGiftViewsByUser(ctx context.Context, roomID uuid.UUID) (map[uuid.UUID][]GiftView, error) {
	rows, err := s.pvp.ListRoomPlayerGifts(ctx, roomID)
	if err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID][]GiftView)
	for _, row := range rows {
		view := GiftView{
			ID:           row.InventoryItemID.String(),
			ValueNanoton: row.ValueNanoton,
		}
		if s.inventory != nil {
			if item, err := s.inventory.FindByID(ctx, row.InventoryItemID); err == nil {
				view.Name = item.Name
				view.ImageURL = item.ImageURL
				view.CollectionSlug = item.CollectionSlug
				if view.ValueNanoton <= 0 {
					view.ValueNanoton = s.inventoryGiftValue(ctx, *item)
				}
			}
		}
		out[row.UserID] = append(out[row.UserID], view)
	}
	return out, nil
}

func (s *Service) inventoryGiftValue(ctx context.Context, item domain.InventoryItem) int64 {
	if s.valuator != nil {
		if price, _ := s.valuator.QuoteInventoryValuation(ctx, item); price > 0 {
			return price
		}
	}
	return item.FloorPriceNanoton
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

