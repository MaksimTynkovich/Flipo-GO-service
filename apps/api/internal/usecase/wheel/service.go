package wheel

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ChannelChecker interface {
	IsChannelMember(ctx context.Context, channel string, telegramUserID int64) (bool, error)
}

type WheelUserNotifier interface {
	SendWheelBonusSpins(ctx context.Context, telegramUserID int64, count int) error
}

type AdminWheelNotifier interface {
	NotifyWheelSpin(ctx context.Context, actor telegram.AdminActor, prizeNanoton int64, segmentLabel, spinSource string)
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
	notifier        WheelUserNotifier
	admin           AdminWheelNotifier
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

func (s *Service) SetUserNotifier(notifier WheelUserNotifier) {
	s.notifier = notifier
}

func (s *Service) SetAdminNotifier(notifier AdminWheelNotifier) {
	s.admin = notifier
}

func (s *Service) RequiredChannel() string {
	return s.requiredChannel
}

func (s *Service) AddReferralBonusSpin(ctx context.Context, referrerID uuid.UUID) error {
	if s.wheel == nil {
		return nil
	}
	_, err := s.wheel.TryAddReferralBonusSpin(
		ctx,
		referrerID,
		mskCalendarDate(time.Now()),
		domain.MaxReferralBonusSpinsPerDay,
	)
	return err
}

// mskCalendarDate returns the calendar date (00:00 UTC-encoded date components) in MSK.
func mskCalendarDate(now time.Time) time.Time {
	msk := time.FixedZone("MSK", 3*60*60)
	local := now.In(msk)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
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
	PhotoURL      string    `json:"photo_url,omitempty"`
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
	Today                AdminPeriodView         `json:"today"`
	Last7Days            AdminPeriodView         `json:"last_7_days"`
	AllTime              AdminPeriodView         `json:"all_time"`
	SourcesToday         AdminSourceBreakdown    `json:"sources_today"`
	SourcesAllTime       AdminSourceBreakdown    `json:"sources_all_time"`
	PrizeBreakdown       []AdminPrizeBreakdown   `json:"prize_breakdown"`
	SpinsByDay           []AdminDailyPoint       `json:"spins_by_day"`
	PendingBonusSpins    int64                   `json:"pending_bonus_spins"`
	// Legacy flat fields kept for older admin clients.
	SpinsToday           int64                   `json:"spins_today"`
	PrizesTodayNanoton   int64                   `json:"prizes_today_nanoton"`
	SpinsAllTime         int64                   `json:"spins_all_time"`
	PrizesAllTimeNanoton int64                   `json:"prizes_all_time_nanoton"`
}

type AdminPeriodView struct {
	Spins         int64 `json:"spins"`
	UniqueUsers   int64 `json:"unique_users"`
	PrizesNanoton int64 `json:"prizes_nanoton"`
}

type AdminSourceBreakdown struct {
	Daily AdminSourceView `json:"daily"`
	Bonus AdminSourceView `json:"bonus"`
}

type AdminSourceView struct {
	Spins         int64 `json:"spins"`
	PrizesNanoton int64 `json:"prizes_nanoton"`
}

type AdminPrizeBreakdown struct {
	SegmentID          string  `json:"segment_id"`
	Label              string  `json:"label"`
	AmountNanoton      int64   `json:"amount_nanoton"`
	Hits               int64   `json:"hits"`
	TotalPrizesNanoton int64   `json:"total_prizes_nanoton"`
	SharePercent       float64 `json:"share_percent"`
}

type AdminDailyPoint struct {
	Date          string `json:"date"`
	Spins         int64  `json:"spins"`
	UniqueUsers   int64  `json:"unique_users"`
	PrizesNanoton int64  `json:"prizes_nanoton"`
}

type AdminSegmentView struct {
	ID             string  `json:"id"`
	Label          string  `json:"label"`
	AmountNanoton  int64   `json:"amount_nanoton"`
	Weight         int     `json:"weight"`
	ChancePercent  float64 `json:"chance_percent"`
	SortOrder      int     `json:"sort_order"`
	Active         bool    `json:"active"`
}

type AdminSegmentUpdate struct {
	Label         string   `json:"label"`
	AmountNanoton int64    `json:"amount_nanoton"`
	Weight        int      `json:"weight"`
	ChancePercent *float64 `json:"chance_percent"`
	SortOrder     int      `json:"sort_order"`
	Active        bool     `json:"active"`
}

func (s *Service) Status(ctx context.Context, userID uuid.UUID, telegramID int64) (*StatusView, error) {
	// All segments for the reel / prizes UI (including inactive jackpots).
	// Spin still samples only active segments via ListActiveSegments.
	segments, err := s.wheel.ListAllSegments(ctx)
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
	dailyAvailable := !sameDate(state.LastDailySpinDate, today)
	hasSpinStock := dailyAvailable || state.BonusSpins > 0
	// Admins keep unlimited spins, but still must be subscribed to the channel.
	canSpin := subscribed && (hasSpinStock || admin)

	wins, err := s.wheel.ListTopWinsSince(ctx, time.Now().UTC().Add(-24*time.Hour), 5)
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
	// Channel gate applies to everyone, including admins with unlimited spins.
	if err := s.ensureChannelSubscribed(ctx, userID); err != nil {
		return nil, err
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

	segment, roll, err := s.resolveSpinSegment(ctx, userID, segments)
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

	if s.admin != nil {
		actor := telegram.AdminActor{TelegramID: telegramID}
		if user, err := s.users.FindByID(ctx, userID); err == nil && user != nil {
			actor.TelegramID = user.TelegramID
			actor.Username = user.Username
			actor.FirstName = user.FirstName
			actor.LastName = user.LastName
		}
		s.admin.NotifyWheelSpin(ctx, actor, segment.AmountNanoton, segment.Label, spinSource)
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
	now := time.Now().UTC()
	today := utcDate(now)
	since7d := today.AddDate(0, 0, -6)
	since14d := today.AddDate(0, 0, -13)

	todayStats, err := s.wheel.AdminPeriodStats(ctx, today)
	if err != nil {
		return nil, err
	}
	weekStats, err := s.wheel.AdminPeriodStats(ctx, since7d)
	if err != nil {
		return nil, err
	}
	allStats, err := s.wheel.AdminPeriodStats(ctx, time.Time{})
	if err != nil {
		return nil, err
	}

	sourcesTodayRows, err := s.wheel.AdminSourceStats(ctx, today)
	if err != nil {
		return nil, err
	}
	sourcesAllRows, err := s.wheel.AdminSourceStats(ctx, time.Time{})
	if err != nil {
		return nil, err
	}

	segmentHits, err := s.wheel.AdminSegmentHits(ctx)
	if err != nil {
		return nil, err
	}
	dailyRows, err := s.wheel.AdminSpinsByDay(ctx, since14d)
	if err != nil {
		return nil, err
	}
	pendingBonus, err := s.wheel.SumPendingBonusSpins(ctx)
	if err != nil {
		return nil, err
	}

	var totalHits int64
	for _, hit := range segmentHits {
		totalHits += hit.Hits
	}
	prizeBreakdown := make([]AdminPrizeBreakdown, 0, len(segmentHits))
	for _, hit := range segmentHits {
		share := 0.0
		if totalHits > 0 {
			share = float64(hit.Hits) * 100 / float64(totalHits)
		}
		prizeBreakdown = append(prizeBreakdown, AdminPrizeBreakdown{
			SegmentID:          hit.SegmentID.String(),
			Label:              hit.Label,
			AmountNanoton:      hit.AmountNanoton,
			Hits:               hit.Hits,
			TotalPrizesNanoton: hit.TotalPrizesNanoton,
			SharePercent:       share,
		})
	}

	byDay := make(map[string]domain.WheelDailyStats, len(dailyRows))
	for _, row := range dailyRows {
		key := row.Date.UTC().Format("2006-01-02")
		byDay[key] = row
	}
	spinsByDay := make([]AdminDailyPoint, 0, 14)
	for i := 0; i < 14; i++ {
		day := since14d.AddDate(0, 0, i)
		key := day.Format("2006-01-02")
		point := AdminDailyPoint{Date: key}
		if row, ok := byDay[key]; ok {
			point.Spins = row.Spins
			point.UniqueUsers = row.UniqueUsers
			point.PrizesNanoton = row.PrizesNanoton
		}
		spinsByDay = append(spinsByDay, point)
	}

	return &AdminStatsView{
		Today: AdminPeriodView{
			Spins:         todayStats.Spins,
			UniqueUsers:   todayStats.UniqueUsers,
			PrizesNanoton: todayStats.PrizesNanoton,
		},
		Last7Days: AdminPeriodView{
			Spins:         weekStats.Spins,
			UniqueUsers:   weekStats.UniqueUsers,
			PrizesNanoton: weekStats.PrizesNanoton,
		},
		AllTime: AdminPeriodView{
			Spins:         allStats.Spins,
			UniqueUsers:   allStats.UniqueUsers,
			PrizesNanoton: allStats.PrizesNanoton,
		},
		SourcesToday:         mapSourceBreakdown(sourcesTodayRows),
		SourcesAllTime:       mapSourceBreakdown(sourcesAllRows),
		PrizeBreakdown:       prizeBreakdown,
		SpinsByDay:           spinsByDay,
		PendingBonusSpins:    pendingBonus,
		SpinsToday:           todayStats.Spins,
		PrizesTodayNanoton:   todayStats.PrizesNanoton,
		SpinsAllTime:         allStats.Spins,
		PrizesAllTimeNanoton: allStats.PrizesNanoton,
	}, nil
}

func mapSourceBreakdown(rows []domain.WheelSourceStats) AdminSourceBreakdown {
	out := AdminSourceBreakdown{}
	for _, row := range rows {
		view := AdminSourceView{Spins: row.Spins, PrizesNanoton: row.PrizesNanoton}
		switch row.Source {
		case domain.WheelSpinSourceDaily:
			out.Daily = view
		case domain.WheelSpinSourceBonus:
			out.Bonus = view
		}
	}
	return out
}

func (s *Service) AdminListSegments(ctx context.Context) ([]AdminSegmentView, error) {
	rows, err := s.wheel.ListAllSegments(ctx)
	if err != nil {
		return nil, err
	}
	return mapAdminSegments(rows), nil
}

func (s *Service) AdminUpdateSegment(ctx context.Context, id uuid.UUID, in AdminSegmentUpdate) (*AdminSegmentView, error) {
	label := strings.TrimSpace(in.Label)
	if label == "" {
		return nil, fmt.Errorf("укажите название приза")
	}
	if in.AmountNanoton <= 0 {
		return nil, domain.ErrInvalidAmount
	}
	weight := in.Weight
	if in.ChancePercent != nil {
		p := *in.ChancePercent
		if p <= 0 || p > 100 {
			return nil, fmt.Errorf("шанс должен быть от 0 до 100%%")
		}
		// 2 decimal places: 50% → 5000, 0.1% → 10
		weight = int(math.Round(p * 100))
	}
	if weight <= 0 {
		return nil, fmt.Errorf("вес/шанс должен быть больше 0")
	}

	seg := &domain.WheelSegment{
		ID:            id,
		Label:         label,
		AmountNanoton: in.AmountNanoton,
		Weight:        weight,
		SortOrder:     in.SortOrder,
		Active:        in.Active,
	}
	if err := s.wheel.UpdateSegment(ctx, seg); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}

	rows, err := s.wheel.ListAllSegments(ctx)
	if err != nil {
		return nil, err
	}
	for _, view := range mapAdminSegments(rows) {
		if view.ID == id.String() {
			return &view, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (s *Service) resolveSpinSegment(ctx context.Context, userID uuid.UUID, segments []domain.WheelSegment) (domain.WheelSegment, int, error) {
	forced, err := s.wheel.ConsumePendingOverride(ctx, userID)
	if err == nil && forced != nil {
		seg, serr := s.wheel.GetSegmentByID(ctx, forced.SegmentID)
		if serr == nil && seg != nil {
			return *seg, -1, nil
		}
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return domain.WheelSegment{}, 0, err
	}
	return pickSegment(segments)
}

func (s *Service) AdminSetSpinOverride(ctx context.Context, adminID uuid.UUID, telegramID int64, segmentID uuid.UUID, note string) (*domain.WheelSpinOverrideView, error) {
	user, err := s.users.FindByTelegramID(ctx, telegramID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	seg, err := s.wheel.GetSegmentByID(ctx, segmentID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	if !seg.Active {
		return nil, fmt.Errorf("сегмент неактивен")
	}
	note = strings.TrimSpace(note)
	if len(note) > 256 {
		note = note[:256]
	}
	if _, err := s.wheel.UpsertPendingOverride(ctx, user.ID, segmentID, adminID, note); err != nil {
		return nil, err
	}
	items, err := s.wheel.ListPendingOverrides(ctx)
	if err != nil {
		return nil, err
	}
	for i := range items {
		if items[i].UserID == user.ID {
			return &items[i], nil
		}
	}
	return nil, domain.ErrNotFound
}

func (s *Service) AdminListSpinOverrides(ctx context.Context) ([]domain.WheelSpinOverrideView, error) {
	return s.wheel.ListPendingOverrides(ctx)
}

func (s *Service) AdminDeleteSpinOverride(ctx context.Context, id uuid.UUID) error {
	if err := s.wheel.DeletePendingOverride(ctx, id); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domain.ErrNotFound
		}
		return err
	}
	return nil
}

type AdminGrantSpinsResult struct {
	TelegramID int64  `json:"telegram_id"`
	Username   string `json:"username"`
	FirstName  string `json:"first_name"`
	Granted    int    `json:"granted"`
	BonusSpins int    `json:"bonus_spins"`
}

func (s *Service) AdminGrantBonusSpins(ctx context.Context, telegramID int64, count int) (*AdminGrantSpinsResult, error) {
	if count < 1 || count > 10 {
		return nil, fmt.Errorf("можно начислить от 1 до 10 вращений")
	}
	user, err := s.users.FindByTelegramID(ctx, telegramID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	if err := s.wheel.AddBonusSpins(ctx, user.ID, count); err != nil {
		return nil, err
	}
	state, err := s.wheel.GetOrCreateState(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	if s.notifier != nil {
		_ = s.notifier.SendWheelBonusSpins(ctx, user.TelegramID, count)
	}
	return &AdminGrantSpinsResult{
		TelegramID: user.TelegramID,
		Username:   user.Username,
		FirstName:  user.FirstName,
		Granted:    count,
		BonusSpins: state.BonusSpins,
	}, nil
}

func mapAdminSegments(segments []domain.WheelSegment) []AdminSegmentView {
	total := 0
	for _, seg := range segments {
		if seg.Active && seg.Weight > 0 {
			total += seg.Weight
		}
	}
	out := make([]AdminSegmentView, 0, len(segments))
	for _, seg := range segments {
		chance := 0.0
		if seg.Active && seg.Weight > 0 && total > 0 {
			chance = float64(seg.Weight) * 100 / float64(total)
		}
		out = append(out, AdminSegmentView{
			ID:            seg.ID.String(),
			Label:         seg.Label,
			AmountNanoton: seg.AmountNanoton,
			Weight:        seg.Weight,
			ChancePercent: math.Round(chance*100) / 100,
			SortOrder:     seg.SortOrder,
			Active:        seg.Active,
		})
	}
	return out
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
			PhotoURL:     strings.TrimSpace(w.PhotoURL),
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
