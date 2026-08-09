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
	RoundID    uuid.UUID
	Phase      string
	Multiplier float64
	EndsAt     *time.Time
	CrashPoint float64
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


type PresencePublisher func(ctx context.Context, snap domain.PresenceSnapshot)

type RepublishFn func(ctx context.Context, roundID uuid.UUID)

type ConfigStore interface {
	GetSocialSimSettings(ctx context.Context) (*domain.SocialSimSettings, error)
}

type GameLimits interface {
	GetGameConfig(ctx context.Context, gameType domain.GameType) (*domain.GameConfig, error)
}

type Simulator struct {
	store             ConfigStore
	limits            GameLimits
	publish           PresencePublisher
	republishCrash    RepublishFn
	republishRoulette RepublishFn
	personas          []Persona
	rng               *rand.Rand

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

	recentPersonas map[uuid.UUID]time.Time

	// When false, stop placing new ghost bets (cashouts of in-flight continue).
	acceptBets bool
}


func NewSimulator(store ConfigStore, limits GameLimits, publish PresencePublisher, opts ...SimulatorOption) *Simulator {
	s := &Simulator{
		store:          store,
		limits:         limits,
		publish:        publish,
		personas:       buildPersonas(120),
		rng:            rand.New(rand.NewSource(time.Now().UnixNano())),
		byGame:         map[string]float64{"crash": 0, "roulette": 0},
		minBet:         map[domain.GameType]int64{},
		maxBet:         map[domain.GameType]int64{},
		recentPersonas: make(map[uuid.UUID]time.Time),
		cfg:            DefaultSettings(),
		acceptBets:     true,
	}
	s.presence = domain.PresenceSnapshot{
		Online:    0,
		ByGame:    map[string]int{"crash": 0, "roulette": 0},
		UpdatedAt: time.Now().UTC(),
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

func (s *Simulator) SetCrashRepublish(fn RepublishFn) {
	s.republishCrash = fn
}

func (s *Simulator) SetRouletteRepublish(fn RepublishFn) {
	s.republishRoulette = fn
}

func (s *Simulator) SetAcceptBets(accept bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.acceptBets = accept
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
	}
	maxBet := map[domain.GameType]int64{
		domain.GameCrash:    10_000_000_000,
		domain.GameRoulette: 10_000_000_000,
	}
	if s.limits != nil {
		for _, gt := range []domain.GameType{domain.GameCrash, domain.GameRoulette} {
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
	s.online = 0
	s.byGame = map[string]float64{"crash": 0, "roulette": 0}
	s.presence = domain.PresenceSnapshot{
		Online:    0,
		ByGame:    map[string]int{"crash": 0, "roulette": 0},
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

	shareCrash := 0.52 + (s.rng.Float64()-0.5)*0.08
	shareRoulette := 1 - shareCrash
	total := s.online
	s.byGame["crash"] += (total*shareCrash - s.byGame["crash"]) * alpha
	s.byGame["roulette"] += (total*shareRoulette - s.byGame["roulette"]) * alpha

	snap := domain.PresenceSnapshot{
		Online: int(math.Round(s.online)),
		ByGame: map[string]int{
			"crash":    int(math.Round(s.byGame["crash"])),
			"roulette": int(math.Round(s.byGame["roulette"])),
		},
		UpdatedAt: time.Now().UTC(),
	}
	if !cfg.CrashEnabled {
		snap.ByGame["crash"] = 0
	}
	if !cfg.RouletteEnabled {
		snap.ByGame["roulette"] = 0
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
		s.crashTarget = s.computeBetTargetLocked(domain.GameCrash)
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
		s.rouletteTarget = s.computeBetTargetLocked(domain.GameRoulette)
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

func (s *Simulator) tickBets(ctx context.Context) {
	s.mu.Lock()
	if !s.cfg.Enabled {
		s.mu.Unlock()
		return
	}
	now := time.Now()
	crashRound := s.crashRound
	rouletteRound := s.rouletteRound
	acceptBets := s.acceptBets
	if acceptBets && s.cfg.CrashEnabled && s.crashPhase == "betting" && s.crashRound != uuid.Nil {
		s.maybePlaceCrashBetLocked(ctx, now)
	}
	if s.cfg.CrashEnabled && s.crashPhase == "running" {
		s.applyCrashCashoutsLocked(s.crashMult)
	}
	if acceptBets && s.cfg.RouletteEnabled && s.roulettePhase == "betting" && s.rouletteRound != uuid.Nil {
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

func (s *Simulator) computeBetTargetLocked(gameType domain.GameType) int {
	base := s.cfg.BetIntensity
	tod := TODMultiplier(s.cfg, time.Now().Hour())
	// Per-round + per-mode spread. Each mode gets its own stable offset bucket
	// so simultaneous modes (Crash vs Roulette) diverge instead of mirroring
	// the same count. BetSpread is the relative half-width of the swing.
	spread := clamp(s.cfg.BetSpread, 0, 1)
	modeOffset := 0.0
	switch gameType {
	case domain.GameCrash:
		modeOffset = -0.5 * spread
	case domain.GameRoulette:
		modeOffset = 0.5 * spread
	default:
		modeOffset = 0
	}
	swing := (s.rng.Float64()*2-1)*spread + modeOffset
	n := int(math.Round(base * tod * (1 + swing)))
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
	// Match x50 wheel segment frequencies: 20 blue / 20 red / 9 green / 1 yellow.
	r := s.rng.Float64() * 50
	switch {
	case r < 20:
		return "blue"
	case r < 40:
		return "red"
	case r < 49:
		return "green"
	default:
		return "yellow"
	}
}

func (s *Simulator) sampleStakeLocked(_ context.Context, gameType domain.GameType) int64 {
	minBet := s.minBet[gameType]
	maxBet := s.maxBet[gameType]
	return sampleHumanStake(s.rng, minBet, maxBet, s.cfg.StakeP50, s.cfg.StakeP90, s.cfg.Chaos)
}


// sampleHumanStake draws a realistic-looking bet: skewed toward smaller stakes,
// with mixed decimal precision so amounts are rarely identical round numbers.
func sampleHumanStake(rng *rand.Rand, minBet, maxBet int64, p50, p90, chaos float64) int64 {
	if minBet <= 0 {
		minBet = 100_000_000 // 0.1 TON
	}
	if maxBet <= minBet {
		maxBet = minBet * 50
	}
	p50 = clamp(p50, 0.02, 0.95)
	p90 = clamp(p90, p50, 1)
	chaos = clamp(chaos, 0, 1)

	// Soft cap: most bets stay below p90 of the allowed range; rare spikes go higher.
	u := rng.Float64()
	var targetFrac float64
	switch {
	case u < 0.62:
		// Dense cluster around/below median (log-ish within low band).
		targetFrac = p50 * math.Pow(rng.Float64(), 0.55+chaos*0.25)
	case u < 0.90:
		// Mid band between p50 and p90.
		targetFrac = p50 + (p90-p50)*math.Pow(rng.Float64(), 0.85)
	default:
		// Occasional larger bets.
		targetFrac = p90 + (1-p90)*math.Pow(rng.Float64(), 1.4-chaos*0.4)
	}
	targetFrac = clamp(targetFrac, 0.01, 1)

	lo := float64(minBet)
	hi := float64(minBet) + float64(maxBet-minBet)*targetFrac
	if hi <= lo {
		hi = lo * 1.15
	}
	// Log-uniform inside the band → many distinct values, not one bucket.
	amount := int64(math.Exp(math.Log(lo) + rng.Float64()*(math.Log(hi)-math.Log(lo))))

	amount = humanizeStakeNanoton(amount, minBet, maxBet, rng, chaos)
	return amount
}

func humanizeStakeNanoton(amount, minBet, maxBet int64, rng *rand.Rand, chaos float64) int64 {
	ton := float64(amount) / 1e9
	if ton <= 0 {
		ton = float64(minBet) / 1e9
	}

	roll := rng.Float64()
	// Bias toward "messy" decimals; whole TON only sometimes.
	switch {
	case roll < 0.42-chaos*0.08:
		// 0.01 TON precision (e.g. 0.37, 1.28)
		ton = math.Round(ton*100) / 100
	case roll < 0.62:
		// 0.05 TON (e.g. 0.15, 0.45)
		ton = math.Round(ton*20) / 20
	case roll < 0.78:
		// 0.1 TON
		ton = math.Round(ton*10) / 10
	case roll < 0.90:
		// 0.25 TON
		ton = math.Round(ton*4) / 4
	default:
		// Half / whole TON (rarer — looks less bot-like if overused)
		if rng.Float64() < 0.55 {
			ton = math.Round(ton*2) / 2
		} else {
			ton = math.Round(ton)
		}
	}

	// Tiny extra jitter so two "0.01-rounded" draws rarely collide exactly.
	if rng.Float64() < 0.28+chaos*0.2 {
		ton += float64(rng.Intn(7)-3) * 0.01
		ton = math.Round(ton*100) / 100
	}

	out := int64(math.Round(ton * 1e9))
	if out < minBet {
		out = minBet
	}
	if out > maxBet {
		out = maxBet
	}
	// Keep at least 0.01 TON granularity when above min.
	const cent = int64(10_000_000)
	if out > minBet {
		out = (out / cent) * cent
		if out < minBet {
			out = minBet
		}
	}
	return out
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
