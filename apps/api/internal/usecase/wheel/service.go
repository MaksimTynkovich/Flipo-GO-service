package wheel

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/google/uuid"
)

type ChannelChecker interface {
	IsChannelMember(ctx context.Context, channel string, telegramUserID int64) (bool, error)
}

type ChannelNotSubscribedError struct {
	Channel string
}

func (e *ChannelNotSubscribedError) Error() string {
	return domain.ErrChannelNotSubscribed.Error()
}

func (e *ChannelNotSubscribedError) Is(target error) bool {
	return target == domain.ErrChannelNotSubscribed
}

type Service struct {
	wheel           domain.WheelRepository
	users           domain.UserRepository
	balance         *balance.Service
	requiredChannel string
	channelChecker  ChannelChecker
	isAdmin         func(telegramID int64) bool
}

func NewService(wheelRepo domain.WheelRepository, users domain.UserRepository, balanceSvc *balance.Service) *Service {
	return &Service{wheel: wheelRepo, users: users, balance: balanceSvc}
}

func (s *Service) SetChannelRequirement(channel string, checker ChannelChecker) {
	s.requiredChannel = strings.TrimSpace(channel)
	s.channelChecker = checker
}

func (s *Service) SetAdminChecker(isAdmin func(telegramID int64) bool) {
	s.isAdmin = isAdmin
}

func (s *Service) RequiredChannel() string {
	return s.requiredChannel
}

func (s *Service) AddReferralBonusSpin(ctx context.Context, referrerID uuid.UUID) error {
	if s.wheel == nil {
		return nil
	}
	return s.wheel.AddBonusSpins(ctx, referrerID, 1)
}

type SegmentView struct {
	ID            string `json:"id"`
	Label         string `json:"label"`
	AmountNanoton int64  `json:"amount_nanoton"`
	Weight        int    `json:"weight"`
	SortOrder     int    `json:"sort_order"`
}

type RecentWinView struct {
	DisplayName   string    `json:"display_name"`
	PrizeNanoton  int64     `json:"prize_nanoton"`
	SegmentLabel  string    `json:"segment_label"`
	CreatedAt     time.Time `json:"created_at"`
}

type StatusView struct {
	ChannelSubscribed bool            `json:"channel_subscribed"`
	RequiredChannel   string          `json:"required_channel,omitempty"`
	DailyAvailable    bool            `json:"daily_available"`
	BonusSpins        int             `json:"bonus_spins"`
	SpinsToday        int             `json:"spins_today"`
	CanSpin           bool            `json:"can_spin"`
	UnlimitedSpins    bool            `json:"unlimited_spins"`
	NextDailyResetAt  time.Time       `json:"next_daily_reset_at"`
	Segments          []SegmentView   `json:"segments"`
	RecentWins        []RecentWinView `json:"recent_wins"`
}

type SpinResult struct {
	SpinID         string    `json:"spin_id"`
	SegmentID      string    `json:"segment_id"`
	SegmentLabel   string    `json:"segment_label"`
	PrizeNanoton   int64     `json:"prize_nanoton"`
	SpinSource     string    `json:"spin_source"`
	BonusSpins     int       `json:"bonus_spins"`
	DailyAvailable bool      `json:"daily_available"`
	SpinsToday     int       `json:"spins_today"`
	UnlimitedSpins bool      `json:"unlimited_spins"`
	CreatedAt      time.Time `json:"created_at"`
}

type AdminStatsView struct {
	SpinsToday       int64 `json:"spins_today"`
	PrizesTodayNanoton int64 `json:"prizes_today_nanoton"`
	SpinsAllTime     int64 `json:"spins_all_time"`
	PrizesAllTimeNanoton int64 `json:"prizes_all_time_nanoton"`
}

func (s *Service) Status(ctx context.Context, userID uuid.UUID, telegramID int64) (*StatusView, error) {
	segments, err := s.wheel.ListActiveSegments(ctx)
	if err != nil {
		return nil, err
	}
	state, err := s.wheel.GetOrCreateState(ctx, userID)
	if err != nil {
		return nil, err
	}
	today := utcDate(time.Now().UTC())
	dayStart := today
	spinsToday, err := s.wheel.CountSpinsSince(ctx, userID, dayStart)
	if err != nil {
		return nil, err
	}
	admin := s.telegramIsAdmin(telegramID)
	subscribed, err := s.isChannelSubscribed(ctx, userID)
	if err != nil {
		return nil, err
	}
	if admin {
		subscribed = true
	}
	dailyAvailable := !sameDate(state.LastDailySpinDate, today)
	hasSpinStock := dailyAvailable || state.BonusSpins > 0
	canSpin := subscribed && hasSpinStock
	if admin {
		canSpin = true
	}

	wins, err := s.wheel.ListRecentWins(ctx, 15)
	if err != nil {
		return nil, err
	}

	return &StatusView{
		ChannelSubscribed: subscribed,
		RequiredChannel:   s.requiredChannel,
		DailyAvailable:    dailyAvailable,
		BonusSpins:        state.BonusSpins,
		SpinsToday:        int(spinsToday),
		CanSpin:           canSpin,
		UnlimitedSpins:    admin,
		NextDailyResetAt:  today.Add(24 * time.Hour),
		Segments:          mapSegments(segments),
		RecentWins:        mapRecentWins(wins),
	}, nil
}

func (s *Service) Spin(ctx context.Context, userID uuid.UUID, telegramID int64) (*SpinResult, error) {
	admin := s.telegramIsAdmin(telegramID)
	if !admin {
		if err := s.ensureChannelSubscribed(ctx, userID); err != nil {
			return nil, err
		}
	}

	segments, err := s.wheel.ListActiveSegments(ctx)
	if err != nil {
		return nil, err
	}
	if len(segments) == 0 {
		return nil, domain.ErrWheelUnavailable
	}

	state, err := s.wheel.GetOrCreateState(ctx, userID)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	today := utcDate(now)
	spinsToday, err := s.wheel.CountSpinsSince(ctx, userID, today)
	if err != nil {
		return nil, err
	}

	spinSource := ""
	if admin {
		spinSource = domain.WheelSpinSourceAdmin
	} else {
		dailyAvailable := !sameDate(state.LastDailySpinDate, today)
		switch {
		case dailyAvailable:
			spinSource = domain.WheelSpinSourceDaily
		case state.BonusSpins > 0:
			spinSource = domain.WheelSpinSourceBonus
			state.BonusSpins--
		default:
			return nil, domain.ErrWheelNoSpins
		}
	}

	segment, roll, err := pickSegment(segments)
	if err != nil {
		return nil, err
	}

	spinID := uuid.New()
	if _, err := s.balance.Credit(ctx, userID, segment.AmountNanoton, domain.LedgerWheelPrize, "wheel_spin", spinID); err != nil {
		return nil, err
	}

	if spinSource == domain.WheelSpinSourceDaily {
		state.LastDailySpinDate = &today
	}

	spin := &domain.WheelSpin{
		ID:           spinID,
		UserID:       userID,
		SegmentID:    segment.ID,
		PrizeNanoton: segment.AmountNanoton,
		SpinSource:   spinSource,
		RngRoll:      roll,
		CreatedAt:    now,
	}
	if err := s.wheel.CreateSpin(ctx, spin); err != nil {
		return nil, err
	}
	if err := s.wheel.SaveState(ctx, state); err != nil {
		return nil, err
	}

	spinsToday++
	dailyStill := !sameDate(state.LastDailySpinDate, today)

	return &SpinResult{
		SpinID:         spinID.String(),
		SegmentID:      segment.ID.String(),
		SegmentLabel:   segment.Label,
		PrizeNanoton:   segment.AmountNanoton,
		SpinSource:     spinSource,
		BonusSpins:     state.BonusSpins,
		DailyAvailable: dailyStill,
		SpinsToday:     int(spinsToday),
		UnlimitedSpins: admin,
		CreatedAt:      now,
	}, nil
}

func (s *Service) AdminStats(ctx context.Context) (*AdminStatsView, error) {
	today := utcDate(time.Now().UTC())
	spinsToday, err := s.wheel.CountSpinsGlobalSince(ctx, today)
	if err != nil {
		return nil, err
	}
	prizesToday, err := s.wheel.SumPrizesSince(ctx, today)
	if err != nil {
		return nil, err
	}
	spinsAll, err := s.wheel.CountSpinsGlobalSince(ctx, time.Time{})
	if err != nil {
		return nil, err
	}
	prizesAll, err := s.wheel.SumPrizesSince(ctx, time.Time{})
	if err != nil {
		return nil, err
	}
	return &AdminStatsView{
		SpinsToday:           spinsToday,
		PrizesTodayNanoton:   prizesToday,
		SpinsAllTime:         spinsAll,
		PrizesAllTimeNanoton: prizesAll,
	}, nil
}

func pickSegment(segments []domain.WheelSegment) (domain.WheelSegment, int, error) {
	total := 0
	for _, seg := range segments {
		if seg.Weight > 0 {
			total += seg.Weight
		}
	}
	if total <= 0 {
		return domain.WheelSegment{}, 0, domain.ErrWheelUnavailable
	}
	roll, err := secureIntn(total)
	if err != nil {
		return domain.WheelSegment{}, 0, err
	}
	cursor := 0
	for _, seg := range segments {
		if seg.Weight <= 0 {
			continue
		}
		cursor += seg.Weight
		if roll < cursor {
			return seg, roll, nil
		}
	}
	return segments[len(segments)-1], roll, nil
}

func secureIntn(n int) (int, error) {
	if n <= 0 {
		return 0, fmt.Errorf("invalid rng bound")
	}
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return 0, err
	}
	v := binary.BigEndian.Uint64(buf[:])
	return int(v % uint64(n)), nil
}

func (s *Service) telegramIsAdmin(telegramID int64) bool {
	if s.isAdmin == nil || telegramID <= 0 {
		return false
	}
	return s.isAdmin(telegramID)
}

func (s *Service) ensureChannelSubscribed(ctx context.Context, userID uuid.UUID) error {
	if s.requiredChannel == "" || s.channelChecker == nil {
		return nil
	}
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return err
	}
	if user.TelegramID <= 0 {
		return &ChannelNotSubscribedError{Channel: s.requiredChannel}
	}
	member, err := s.channelChecker.IsChannelMember(ctx, s.requiredChannel, user.TelegramID)
	if err != nil {
		// Soft-fail: treat unverifiable membership as not subscribed so the wheel
		// UI/API never 500s on transient Telegram / bot-permission errors.
		return &ChannelNotSubscribedError{Channel: s.requiredChannel}
	}
	if !member {
		return &ChannelNotSubscribedError{Channel: s.requiredChannel}
	}
	return nil
}

func (s *Service) isChannelSubscribed(ctx context.Context, userID uuid.UUID) (bool, error) {
	if s.requiredChannel == "" || s.channelChecker == nil {
		return true, nil
	}
	err := s.ensureChannelSubscribed(ctx, userID)
	if err == nil {
		return true, nil
	}
	var channelErr *ChannelNotSubscribedError
	if errors.As(err, &channelErr) || errors.Is(err, domain.ErrChannelNotSubscribed) {
		return false, nil
	}
	// DB / unexpected errors still propagate; membership soft-fails above.
	return false, err
}

func mapSegments(segments []domain.WheelSegment) []SegmentView {
	out := make([]SegmentView, 0, len(segments))
	for _, seg := range segments {
		out = append(out, SegmentView{
			ID:            seg.ID.String(),
			Label:         seg.Label,
			AmountNanoton: seg.AmountNanoton,
			Weight:        seg.Weight,
			SortOrder:     seg.SortOrder,
		})
	}
	return out
}

func mapRecentWins(wins []domain.WheelRecentWin) []RecentWinView {
	out := make([]RecentWinView, 0, len(wins))
	for _, w := range wins {
		name := strings.TrimSpace(w.FirstName)
		if name == "" {
			name = strings.TrimSpace(w.Username)
		}
		if name == "" {
			name = "Игрок"
		}
		if len([]rune(name)) > 12 {
			runes := []rune(name)
			name = string(runes[:11]) + "…"
		}
		out = append(out, RecentWinView{
			DisplayName:  name,
			PrizeNanoton: w.PrizeNanoton,
			SegmentLabel: w.SegmentLabel,
			CreatedAt:    w.CreatedAt,
		})
	}
	return out
}

func utcDate(t time.Time) time.Time {
	y, m, d := t.UTC().Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

func sameDate(d *time.Time, day time.Time) bool {
	if d == nil {
		return false
	}
	y1, m1, day1 := d.UTC().Date()
	y2, m2, day2 := day.UTC().Date()
	return y1 == y2 && m1 == m2 && day1 == day2
}
