package socialsim

import (
	"context"
	"encoding/json"
	"log/slog"
	"math"
	"math/rand"
	"sync"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

type CrashStateHook struct {
	RoundID     uuid.UUID
	Phase       string
	Multiplier  float64
	EndsAt      *time.Time
	CrashPoint  float64
}

type RouletteStateHook struct {
	RoundID uuid.UUID
	Phase   string
	EndsAt  *time.Time
	Result  string // color when result known
}

type GhostCrashBet struct {
	ID                    uuid.UUID
	UserID                uuid.UUID
	Username              string
	FirstName             string
	PhotoURL              string
	AmountNanoton         int64
	FundingType           string
	Status                string
	CashoutMultiplier     *float64
	AutoCashoutMultiplier *float64
	PayoutNanoton         int64
	Simulated             bool
}

type GhostRouletteBet struct {
	ID            uuid.UUID
	UserID        uuid.UUID
	Username      string
	FirstName     string
	PhotoURL      string
	Color         string
	AmountNanoton int64
	FundingType   string
	Status        string
	Simulated     bool
}

type GhostPvPPlayer struct {
	UserID       uuid.UUID
	FirstName    string
	Username     string
	PhotoURL     string
	StakeNanoton int64
	FundingType  string
	IsWinner     bool
}

type GhostPvPRoom struct {
	ID                uuid.UUID
	CreatorID         uuid.UUID
	BetAmountNanoton  int64
	StakeToleranceBps int
	MaxPlayers        int
	Status            string
	PlayerCount       int
	Players           []GhostPvPPlayer
	WinnerID          *uuid.UUID
	PayoutNanoton     *int64
	SpinAt            *time.Time
	SpinEndsAt        *time.Time
	FinishedAt        *time.Time
	CreatedAt         time.Time
	Simulated         bool
}

type PresencePublisher func(ctx context.Context, snap domain.PresenceSnapshot)

type RepublishFn func(ctx context.Context, roundID uuid.UUID)

type ConfigStore interface {
	GetSocialSimSettings(ctx context.Context) (*domain.SocialSimSettings, error)
}

type GameLimits interface {
	GetGameConfig(ctx context.Context, gameType domain.GameType) (*domain.GameConfig, error)
}

type Simulator struct {
	store     ConfigStore
	limits    GameLimits
	publish   PresencePublisher
	republishCrash    RepublishFn
	republishRoulette RepublishFn
	personas  []Persona
	rng       *rand.Rand

	mu       sync.RWMutex
	cfg      domain.SocialSimSettings
	online   float64
	byGame   map[string]float64
	presence domain.PresenceSnapshot

	minBet map[domain.GameType]int64
	maxBet map[domain.GameType]int64

	crashRound   uuid.UUID
	crashPhase   string
	crashMult    float64
	crashEndsAt  *time.Time
	crashBets    []GhostCrashBet
	crashNextBet time.Time
	crashTarget  int
	crashPlaced  int
	crashDirty   bool

	rouletteRound   uuid.UUID
	roulettePhase   string
	rouletteEndsAt  *time.Time
	rouletteBets    []GhostRouletteBet
	rouletteNextBet time.Time
	rouletteTarget  int
	roulettePlaced  int
	rouletteDirty   bool

	pvpRooms []ghostRoomInternal

	// Pending bot joins into real human-created open rooms.
	humanJoins map[uuid.UUID]pendingHumanJoin

	recentPersonas map[uuid.UUID]time.Time
}

type ghostRoomInternal struct {
	GhostPvPRoom
	expireAt   time.Time
	joinAt     time.Time
	winnerPick uuid.UUID
	botMatch   bool // second bot joined visually — not claimable by humans
}

type pendingHumanJoin struct {
	joinAt time.Time
	bot    Persona
}

func NewSimulator(store ConfigStore, limits GameLimits, publish PresencePublisher) *Simulator {
	s := &Simulator{
		store:          store,
		limits:         limits,
		publish:        publish,
		personas:       buildPersonas(120),
		rng:            rand.New(rand.NewSource(time.Now().UnixNano())),
		byGame:         map[string]float64{"crash": 0, "roulette": 0, "pvp": 0},
		minBet:         map[domain.GameType]int64{},
		maxBet:         map[domain.GameType]int64{},
		recentPersonas: make(map[uuid.UUID]time.Time),
		humanJoins:     make(map[uuid.UUID]pendingHumanJoin),
		cfg:            DefaultSettings(),
	}
	s.presence = domain.PresenceSnapshot{
		Online:    0,
		ByGame:    map[string]int{"crash": 0, "roulette": 0, "pvp": 0},
		UpdatedAt: time.Now().UTC(),
	}
	return s
}

func (s *Simulator) SetCrashRepublish(fn RepublishFn) {
	s.republishCrash = fn
}

func (s *Simulator) SetRouletteRepublish(fn RepublishFn) {
	s.republishRoulette = fn
}

func (s *Simulator) Start(ctx context.Context) {
	s.reloadConfig(ctx)
	go s.loop(ctx)
}

func (s *Simulator) loop(ctx context.Context) {
	presenceTick := time.NewTicker(4 * time.Second)
	simTick := time.NewTicker(250 * time.Millisecond)
	cfgTick := time.NewTicker(15 * time.Second)
	defer presenceTick.Stop()
	defer simTick.Stop()
	defer cfgTick.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-cfgTick.C:
			s.reloadConfig(ctx)
		case <-presenceTick.C:
			s.tickPresence(ctx)
		case <-simTick.C:
			s.tickBets(ctx)
			s.tickPvP(ctx)
		}
	}
}

func (s *Simulator) reloadConfig(ctx context.Context) {
	if s.store == nil {
		return
	}
	cfg, err := s.store.GetSocialSimSettings(ctx)
	if err != nil || cfg == nil {
		slog.Warn("socialsim config load failed", "error", err)
		return
	}
	Normalize(cfg)

	minBet := map[domain.GameType]int64{
		domain.GameCrash:    100_000_000,
		domain.GameRoulette: 100_000_000,
		domain.GamePvP:      100_000_000,
	}
	maxBet := map[domain.GameType]int64{
		domain.GameCrash:    10_000_000_000,
		domain.GameRoulette: 10_000_000_000,
		domain.GamePvP:      5_000_000_000,
	}
	if s.limits != nil {
		for _, gt := range []domain.GameType{domain.GameCrash, domain.GameRoulette, domain.GamePvP} {
			if gc, err := s.limits.GetGameConfig(ctx, gt); err == nil && gc != nil {
				minBet[gt] = gc.MinBetNanoton
				maxBet[gt] = gc.MaxBetNanoton
			}
		}
	}

	s.mu.Lock()
	wasEnabled := s.cfg.Enabled
	s.cfg = *cfg
	s.minBet = minBet
	s.maxBet = maxBet
	if !cfg.Enabled && wasEnabled {
		s.clearAllLocked()
	}
	s.mu.Unlock()
}

func (s *Simulator) clearAllLocked() {
	s.crashBets = nil
	s.rouletteBets = nil
	s.pvpRooms = nil
	s.humanJoins = make(map[uuid.UUID]pendingHumanJoin)
	s.online = 0
	s.byGame = map[string]float64{"crash": 0, "roulette": 0, "pvp": 0}
	s.presence = domain.PresenceSnapshot{
		Online:    0,
		ByGame:    map[string]int{"crash": 0, "roulette": 0, "pvp": 0},
		UpdatedAt: time.Now().UTC(),
	}
}

func (s *Simulator) GetPresence() domain.PresenceSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := s.presence
	out.ByGame = map[string]int{}
	for k, v := range s.presence.ByGame {
		out.ByGame[k] = v
	}
	return out
}

func (s *Simulator) Settings() domain.SocialSimSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cfg
}

func (s *Simulator) ApplySettings(cfg domain.SocialSimSettings) {
	Normalize(&cfg)
	s.mu.Lock()
	defer s.mu.Unlock()
	if !cfg.Enabled {
		s.clearAllLocked()
	}
	s.cfg = cfg
}

func (s *Simulator) tickPresence(ctx context.Context) {
	s.mu.Lock()
	cfg := s.cfg
	if !cfg.Enabled || !cfg.LobbyEnabled {
		if s.presence.Online != 0 {
			s.clearAllLocked()
			snap := s.presence
			s.mu.Unlock()
			if s.publish != nil {
				s.publish(ctx, snap)
			}
			return
		}
		s.mu.Unlock()
		return
	}

	now := time.Now()
	hour := now.Hour()
	tod := TODMultiplier(cfg, hour)
	span := float64(cfg.OnlineBaseMax - cfg.OnlineBaseMin)
	base := float64(cfg.OnlineBaseMin) + span*0.5
	noise := 1 + (s.rng.Float64()*2-1)*cfg.OnlineJitter
	target := base * tod * noise
	if target < float64(cfg.OnlineBaseMin)*tod*0.5 {
		target = float64(cfg.OnlineBaseMin) * tod * 0.5
	}

	// Smooth chase.
	alpha := 0.18 + cfg.Chaos*0.12
	s.online += (target - s.online) * alpha

	shareCrash := 0.38 + (s.rng.Float64()-0.5)*0.08
	shareRoulette := 0.34 + (s.rng.Float64()-0.5)*0.08
	sharePvP := 1 - shareCrash - shareRoulette
	if sharePvP < 0.15 {
		sharePvP = 0.15
		shareCrash = (1 - sharePvP) * 0.55
		shareRoulette = 1 - sharePvP - shareCrash
	}
	total := s.online
	s.byGame["crash"] += (total*shareCrash - s.byGame["crash"]) * alpha
	s.byGame["roulette"] += (total*shareRoulette - s.byGame["roulette"]) * alpha
	s.byGame["pvp"] += (total*sharePvP - s.byGame["pvp"]) * alpha

	snap := domain.PresenceSnapshot{
		Online: int(math.Round(s.online)),
		ByGame: map[string]int{
			"crash":    int(math.Round(s.byGame["crash"])),
			"roulette": int(math.Round(s.byGame["roulette"])),
			"pvp":      int(math.Round(s.byGame["pvp"])),
		},
		UpdatedAt: time.Now().UTC(),
	}
	if !cfg.CrashEnabled {
		snap.ByGame["crash"] = 0
	}
	if !cfg.RouletteEnabled {
		snap.ByGame["roulette"] = 0
	}
	if !cfg.PvPEnabled {
		snap.ByGame["pvp"] = 0
	}
	s.presence = snap
	s.mu.Unlock()

	if s.publish != nil {
		s.publish(ctx, snap)
	}
}

func (s *Simulator) OnCrashState(state CrashStateHook) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.cfg.Enabled || !s.cfg.CrashEnabled {
		s.crashBets = nil
		return
	}
	if state.RoundID != s.crashRound {
		s.crashRound = state.RoundID
		s.crashBets = nil
		s.crashPlaced = 0
		s.crashTarget = s.computeBetTargetLocked()
		s.crashNextBet = time.Now().Add(s.idleGapLocked())
	}
	s.crashPhase = state.Phase
	s.crashMult = state.Multiplier
	s.crashEndsAt = state.EndsAt

	if state.Phase == "running" {
		s.applyCrashCashoutsLocked(state.Multiplier)
	}
	if state.Phase == "crashed" || state.Phase == "ended" {
		for i := range s.crashBets {
			if s.crashBets[i].Status == "pending" {
				s.crashBets[i].Status = "lost"
				s.crashDirty = true
			}
		}
	}
}

func (s *Simulator) OnRouletteState(state RouletteStateHook) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.cfg.Enabled || !s.cfg.RouletteEnabled {
		s.rouletteBets = nil
		return
	}
	if state.RoundID != s.rouletteRound {
		s.rouletteRound = state.RoundID
		s.rouletteBets = nil
		s.roulettePlaced = 0
		s.rouletteTarget = s.computeBetTargetLocked()
		s.rouletteNextBet = time.Now().Add(s.idleGapLocked())
	}
	s.roulettePhase = state.Phase
	s.rouletteEndsAt = state.EndsAt

	if state.Phase == "result" || state.Phase == "ended" {
		result := state.Result
		for i := range s.rouletteBets {
			if s.rouletteBets[i].Color == result {
				s.rouletteBets[i].Status = "won"
			} else {
				s.rouletteBets[i].Status = "lost"
			}
		}
		s.rouletteDirty = true
	}
}

func (s *Simulator) CrashBets(roundID uuid.UUID) []GhostCrashBet {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if !s.cfg.Enabled || !s.cfg.CrashEnabled || roundID != s.crashRound {
		return nil
	}
	out := make([]GhostCrashBet, len(s.crashBets))
	copy(out, s.crashBets)
	return out
}

func (s *Simulator) RouletteBets(roundID uuid.UUID) []GhostRouletteBet {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if !s.cfg.Enabled || !s.cfg.RouletteEnabled || roundID != s.rouletteRound {
		return nil
	}
	out := make([]GhostRouletteBet, len(s.rouletteBets))
	copy(out, s.rouletteBets)
	return out
}

func (s *Simulator) PvPGhostRooms() []GhostPvPRoom {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if !s.cfg.Enabled || !s.cfg.PvPEnabled {
		return nil
	}
	out := make([]GhostPvPRoom, 0, len(s.pvpRooms))
	for _, r := range s.pvpRooms {
		out = append(out, r.GhostPvPRoom)
	}
	return out
}

// ClaimOpenGhostRoom removes an open 1-player ghost room so a real player can materialize it.
func (s *Simulator) ClaimOpenGhostRoom(roomID uuid.UUID) (*GhostPvPRoom, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.cfg.Enabled || !s.cfg.PvPEnabled {
		return nil, false
	}
	for i, room := range s.pvpRooms {
		if room.ID != roomID {
			continue
		}
		// Only human-joinable while still waiting alone (not a bot-vs-bot showmatch).
		if room.Status != "open" || room.PlayerCount != 1 || len(room.Players) == 0 || room.botMatch {
			return nil, false
		}
		claimed := room.GhostPvPRoom
		s.pvpRooms = append(s.pvpRooms[:i], s.pvpRooms[i+1:]...)
		return &claimed, true
	}
	return nil, false
}

// PersonaByID returns a static persona profile for house-bot materialization.
func (s *Simulator) PersonaByID(id uuid.UUID) (Persona, bool) {
	for _, p := range s.personas {
		if p.ID == id {
			return p, true
		}
	}
	return Persona{}, false
}

func (s *Simulator) BotJoinsEnabled() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cfg.Enabled && s.cfg.PvPEnabled
}

type HumanOpenRoom struct {
	ID               uuid.UUID
	CreatorID        uuid.UUID
	BetAmountNanoton int64
	CreatedAt        time.Time
	PlayerIDs        []uuid.UUID
}

type PlannedHumanJoin struct {
	RoomID        uuid.UUID
	Bot           Persona
	StakeNanoton  int64
}

// PlanBotJoins schedules / releases bot opponents for open human rooms.
func (s *Simulator) PlanBotJoins(rooms []HumanOpenRoom) []PlannedHumanJoin {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.cfg.Enabled || !s.cfg.PvPEnabled {
		s.humanJoins = make(map[uuid.UUID]pendingHumanJoin)
		return nil
	}

	now := time.Now().UTC()
	alive := make(map[uuid.UUID]HumanOpenRoom, len(rooms))
	for _, room := range rooms {
		alive[room.ID] = room
	}
	for id := range s.humanJoins {
		if _, ok := alive[id]; !ok {
			delete(s.humanJoins, id)
		}
	}

	out := make([]PlannedHumanJoin, 0)
	for _, room := range rooms {
		pending, ok := s.humanJoins[room.ID]
		if !ok {
			// ~80% of human rooms get a bot; rest wait for real opponents / TTL.
			if s.rng.Float64() > 0.82 {
				continue
			}
			delaySec := 3 + s.rng.Intn(12)
			if s.cfg.Chaos > 0 {
				delaySec += s.rng.Intn(1 + int(s.cfg.Chaos*8))
			}
			exclude := map[uuid.UUID]struct{}{room.CreatorID: {}}
			for _, id := range room.PlayerIDs {
				exclude[id] = struct{}{}
			}
			bot := s.pickPersonaExcludingLocked(now, exclude)
			s.humanJoins[room.ID] = pendingHumanJoin{
				joinAt: now.Add(time.Duration(delaySec) * time.Second),
				bot:    bot,
			}
			continue
		}
		if now.Before(pending.joinAt) {
			continue
		}
		stake := room.BetAmountNanoton
		// Small stake jitter within typical ±10% tolerance window.
		if s.rng.Float64() < 0.35 {
			delta := int64(float64(stake) * 0.04 * (s.rng.Float64()*2 - 1))
			stake += delta
			if stake < room.BetAmountNanoton*9/10 {
				stake = room.BetAmountNanoton
			}
		}
		out = append(out, PlannedHumanJoin{
			RoomID:       room.ID,
			Bot:          pending.bot,
			StakeNanoton: stake,
		})
		delete(s.humanJoins, room.ID)
	}
	return out
}

func (s *Simulator) pickPersonaExcludingLocked(now time.Time, exclude map[uuid.UUID]struct{}) Persona {
	for tries := 0; tries < 30; tries++ {
		p := s.pickPersonaLocked(now)
		if _, skip := exclude[p.ID]; skip {
			continue
		}
		return p
	}
	return s.pickPersonaLocked(now)
}

func (s *Simulator) tickBets(ctx context.Context) {
	s.mu.Lock()
	if !s.cfg.Enabled {
		s.mu.Unlock()
		return
	}
	now := time.Now()
	crashRound := s.crashRound
	rouletteRound := s.rouletteRound
	if s.cfg.CrashEnabled && s.crashPhase == "betting" && s.crashRound != uuid.Nil {
		s.maybePlaceCrashBetLocked(ctx, now)
	}
	if s.cfg.CrashEnabled && s.crashPhase == "running" {
		s.applyCrashCashoutsLocked(s.crashMult)
	}
	if s.cfg.RouletteEnabled && s.roulettePhase == "betting" && s.rouletteRound != uuid.Nil {
		s.maybePlaceRouletteBetLocked(ctx, now)
	}
	crashDirty := s.crashDirty
	rouletteDirty := s.rouletteDirty
	s.crashDirty = false
	s.rouletteDirty = false
	s.mu.Unlock()

	if crashDirty && s.republishCrash != nil && crashRound != uuid.Nil {
		_ = s.safeRepublish(ctx, s.republishCrash, crashRound)
	}
	if rouletteDirty && s.republishRoulette != nil && rouletteRound != uuid.Nil {
		_ = s.safeRepublish(ctx, s.republishRoulette, rouletteRound)
	}
}

func (s *Simulator) safeRepublish(ctx context.Context, fn RepublishFn, roundID uuid.UUID) error {
	defer func() { _ = recover() }()
	fn(ctx, roundID)
	return nil
}

func (s *Simulator) computeBetTargetLocked() int {
	base := s.cfg.BetIntensity
	tod := TODMultiplier(s.cfg, time.Now().Hour())
	n := int(math.Round(base * tod * (0.7 + s.rng.Float64()*0.6)))
	if n < 0 {
		n = 0
	}
	if n > 40 {
		n = 40
	}
	return n
}

func (s *Simulator) idleGapLocked() time.Duration {
	lo := s.cfg.IdleGapMsMin
	hi := s.cfg.IdleGapMsMax
	if hi <= lo {
		hi = lo + 1
	}
	ms := lo + s.rng.Intn(hi-lo+1)
	chaosExtra := int(float64(ms) * s.cfg.Chaos * s.rng.Float64())
	return time.Duration(ms+chaosExtra) * time.Millisecond
}

func (s *Simulator) maybePlaceCrashBetLocked(ctx context.Context, now time.Time) {
	if s.crashPlaced >= s.crashTarget {
		return
	}
	if now.Before(s.crashNextBet) {
		return
	}
	// Burst near start and near end of betting window.
	burst := s.rng.Float64() < s.cfg.BetBurstChance
	count := 1
	if burst {
		count = 1 + s.rng.Intn(3)
	}
	if s.crashEndsAt != nil {
		left := s.crashEndsAt.Sub(now)
		if left > 0 && left < 3*time.Second {
			count += s.rng.Intn(2)
		}
	}
	for i := 0; i < count && s.crashPlaced < s.crashTarget; i++ {
		p := s.pickPersonaLocked(now)
		amount := s.sampleStakeLocked(ctx, domain.GameCrash)
		bet := GhostCrashBet{
			ID:            uuid.New(),
			UserID:        p.ID,
			Username:      p.Username,
			FirstName:     p.FirstName,
			PhotoURL:      p.PhotoURL,
			AmountNanoton: amount,
			FundingType:   "balance",
			Status:        "pending",
			Simulated:     true,
		}
		if s.rng.Float64() < s.cfg.CrashAutoCashoutShare {
			mult := s.cfg.CrashCashoutMin + s.rng.Float64()*(s.cfg.CrashCashoutMax-s.cfg.CrashCashoutMin)
			mult = math.Floor(mult*100) / 100
			bet.AutoCashoutMultiplier = &mult
		}
		s.crashBets = append(s.crashBets, bet)
		s.crashPlaced++
		s.crashDirty = true
	}
	s.crashNextBet = now.Add(s.idleGapLocked())
}

func (s *Simulator) applyCrashCashoutsLocked(mult float64) {
	for i := range s.crashBets {
		b := &s.crashBets[i]
		if b.Status != "pending" {
			continue
		}
		if b.AutoCashoutMultiplier != nil && mult >= *b.AutoCashoutMultiplier {
			m := *b.AutoCashoutMultiplier
			b.CashoutMultiplier = &m
			b.Status = "cashed_out"
			b.PayoutNanoton = int64(float64(b.AmountNanoton) * m)
			s.crashDirty = true
			continue
		}
		// Manual-ish cashouts scattered in window.
		if b.AutoCashoutMultiplier == nil && mult > s.cfg.CrashCashoutMin {
			chance := 0.015 * (1 + s.cfg.Chaos)
			if s.rng.Float64() < chance {
				m := math.Floor(mult*100) / 100
				b.CashoutMultiplier = &m
				b.Status = "cashed_out"
				b.PayoutNanoton = int64(float64(b.AmountNanoton) * m)
				s.crashDirty = true
			}
		}
	}
}

func (s *Simulator) maybePlaceRouletteBetLocked(ctx context.Context, now time.Time) {
	if s.roulettePlaced >= s.rouletteTarget {
		return
	}
	if now.Before(s.rouletteNextBet) {
		return
	}
	burst := s.rng.Float64() < s.cfg.BetBurstChance
	count := 1
	if burst {
		count = 1 + s.rng.Intn(3)
	}
	if s.rouletteEndsAt != nil {
		left := s.rouletteEndsAt.Sub(now)
		if left > 0 && left < 3*time.Second {
			count += s.rng.Intn(2)
		}
	}
	for i := 0; i < count && s.roulettePlaced < s.rouletteTarget; i++ {
		p := s.pickPersonaLocked(now)
		amount := s.sampleStakeLocked(ctx, domain.GameRoulette)
		s.rouletteBets = append(s.rouletteBets, GhostRouletteBet{
			ID:            uuid.New(),
			UserID:        p.ID,
			Username:      p.Username,
			FirstName:     p.FirstName,
			PhotoURL:      p.PhotoURL,
			Color:         s.pickRouletteColorLocked(),
			AmountNanoton: amount,
			FundingType:   "balance",
			Status:        "pending",
			Simulated:     true,
		})
		s.roulettePlaced++
		s.rouletteDirty = true
	}
	s.rouletteNextBet = now.Add(s.idleGapLocked())
}

func (s *Simulator) pickRouletteColorLocked() string {
	r := s.rng.Float64()
	if r < s.cfg.RouletteRedWeight {
		return "red"
	}
	if r < s.cfg.RouletteRedWeight+s.cfg.RouletteBlackWeight {
		return "black"
	}
	return "green"
}

func (s *Simulator) sampleStakeLocked(_ context.Context, gameType domain.GameType) int64 {
	minBet := s.minBet[gameType]
	maxBet := s.maxBet[gameType]
	if minBet <= 0 {
		minBet = 100_000_000
	}
	if maxBet <= minBet {
		maxBet = minBet * 50
	}
	u := s.rng.Float64()
	frac := s.cfg.StakeP50
	if u > 0.5 {
		frac = s.cfg.StakeP50 + (s.cfg.StakeP90-s.cfg.StakeP50)*((u-0.5)/0.4)
	}
	if u > 0.9 {
		frac = s.cfg.StakeP90 + (1-s.cfg.StakeP90)*s.rng.Float64()
	}
	frac = clamp(frac, 0.01, 1)
	amount := minBet + int64(float64(maxBet-minBet)*frac)
	step := int64(100_000_000)
	amount = (amount / step) * step
	if amount < minBet {
		amount = minBet
	}
	return amount
}

func (s *Simulator) pickPersonaLocked(now time.Time) Persona {
	for tries := 0; tries < 20; tries++ {
		p := s.personas[s.rng.Intn(len(s.personas))]
		if last, ok := s.recentPersonas[p.ID]; ok && now.Sub(last) < 45*time.Second {
			continue
		}
		s.recentPersonas[p.ID] = now
		return p
	}
	p := s.personas[s.rng.Intn(len(s.personas))]
	s.recentPersonas[p.ID] = now
	return p
}

func (s *Simulator) tickPvP(ctx context.Context) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.cfg.Enabled || !s.cfg.PvPEnabled {
		s.pvpRooms = nil
		return
	}
	now := time.Now().UTC()
	alive := s.pvpRooms[:0]
	for i := range s.pvpRooms {
		room := s.pvpRooms[i]
		s.advanceGhostRoomLocked(&room, now)
		if room.Status == "finished" && room.FinishedAt != nil && now.Sub(*room.FinishedAt) > 12*time.Second {
			continue
		}
		if room.Status == "open" && now.After(room.expireAt) && !room.botMatch {
			continue
		}
		alive = append(alive, room)
	}
	s.pvpRooms = alive

	openCount := 0
	for _, r := range s.pvpRooms {
		if r.Status == "open" {
			openCount++
		}
	}
	for openCount < s.cfg.PvPMaxGhostRooms && s.rng.Float64() < 0.08*(1+s.cfg.Chaos) {
		room := s.spawnGhostRoomLocked(ctx, now)
		s.pvpRooms = append(s.pvpRooms, room)
		openCount++
	}
}

func (s *Simulator) spawnGhostRoomLocked(ctx context.Context, now time.Time) ghostRoomInternal {
	creator := s.pickPersonaLocked(now)
	stake := s.samplePvPStakeLocked(ctx)
	ttlMin := s.cfg.PvPRoomTTLSecMin
	ttlMax := s.cfg.PvPRoomTTLSecMax
	ttl := ttlMin + s.rng.Intn(ttlMax-ttlMin+1)
	joinWindow := max(1, ttl-6)
	joinDelay := 4 + s.rng.Intn(joinWindow)
	roomID := uuid.New()
	return ghostRoomInternal{
		GhostPvPRoom: GhostPvPRoom{
			ID:                roomID,
			CreatorID:         creator.ID,
			BetAmountNanoton:  stake,
			StakeToleranceBps: 500,
			MaxPlayers:        2,
			Status:            "open",
			PlayerCount:       1,
			Players: []GhostPvPPlayer{{
				UserID:       creator.ID,
				FirstName:    creator.FirstName,
				Username:     creator.Username,
				PhotoURL:     creator.PhotoURL,
				StakeNanoton: stake,
				FundingType:  "balance",
			}},
			CreatedAt: now,
			Simulated: true,
		},
		expireAt: now.Add(time.Duration(ttl) * time.Second),
		joinAt:   now.Add(time.Duration(joinDelay) * time.Second),
	}
}

func (s *Simulator) samplePvPStakeLocked(_ context.Context) int64 {
	minBet := s.minBet[domain.GamePvP]
	maxBet := s.maxBet[domain.GamePvP]
	if minBet <= 0 {
		minBet = 100_000_000
	}
	if maxBet <= minBet {
		maxBet = minBet * 50
	}
	lo := s.cfg.PvPStakeMinFrac
	hi := s.cfg.PvPStakeMaxFrac
	frac := lo + s.rng.Float64()*(hi-lo)
	amount := minBet + int64(float64(maxBet-minBet)*frac)
	step := int64(100_000_000)
	amount = (amount / step) * step
	if amount < minBet {
		amount = minBet
	}
	return amount
}

func (s *Simulator) advanceGhostRoomLocked(room *ghostRoomInternal, now time.Time) {
	switch room.Status {
	case "open":
		// ~70% of open rooms get a second bot; rest wait for a real player until TTL.
		if room.botMatch || now.Before(room.joinAt) {
			return
		}
		if s.rng.Float64() > 0.72 {
			// Skip this tick; maybe a human will claim. Retry shortly.
			room.joinAt = now.Add(time.Duration(2+s.rng.Intn(5)) * time.Second)
			return
		}
		opp := s.pickPersonaLocked(now)
		for tries := 0; tries < 8 && opp.ID == room.CreatorID; tries++ {
			opp = s.pickPersonaLocked(now)
		}
		stake := room.BetAmountNanoton
		if s.rng.Float64() < 0.4 {
			delta := int64(float64(stake) * 0.03 * (s.rng.Float64()*2 - 1))
			stake += delta
			if stake < room.BetAmountNanoton/2 {
				stake = room.BetAmountNanoton
			}
		}
		room.Players = append(room.Players, GhostPvPPlayer{
			UserID:       opp.ID,
			FirstName:    opp.FirstName,
			Username:     opp.Username,
			PhotoURL:     opp.PhotoURL,
			StakeNanoton: stake,
			FundingType:  "balance",
		})
		room.PlayerCount = 2
		room.botMatch = true
		spinAt := now.Add(3 * time.Second)
		spinEnds := spinAt.Add(8 * time.Second)
		room.Status = "countdown"
		room.SpinAt = &spinAt
		room.SpinEndsAt = &spinEnds
		if s.rng.Float64() < 0.5 {
			room.winnerPick = room.Players[0].UserID
		} else {
			room.winnerPick = room.Players[1].UserID
		}
		// Strip animation needs winner during countdown/spin (same as real scheduleSpin).
		wid := room.winnerPick
		room.WinnerID = &wid
	case "countdown":
		if room.SpinAt != nil && now.After(*room.SpinAt) {
			room.Status = "spinning"
		}
	case "spinning":
		if room.SpinEndsAt != nil && now.After(*room.SpinEndsAt) {
			room.Status = "finished"
			fin := now
			room.FinishedAt = &fin
			wid := room.winnerPick
			if room.WinnerID == nil {
				room.WinnerID = &wid
			}
			var pot int64
			for i := range room.Players {
				pot += room.Players[i].StakeNanoton
				room.Players[i].IsWinner = room.Players[i].UserID == wid
			}
			fee := pot / 20
			payout := pot - fee
			room.PayoutNanoton = &payout
		}
	}
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// PreviewOnline estimates current online for admin UI.
func PreviewOnline(cfg domain.SocialSimSettings) int {
	Normalize(&cfg)
	if !cfg.Enabled || !cfg.LobbyEnabled {
		return 0
	}
	tod := TODMultiplier(cfg, time.Now().Hour())
	mid := float64(cfg.OnlineBaseMin+cfg.OnlineBaseMax) / 2
	return int(math.Round(mid * tod))
}

func MarshalPresence(snap domain.PresenceSnapshot) []byte {
	data, _ := json.Marshal(snap)
	return data
}
