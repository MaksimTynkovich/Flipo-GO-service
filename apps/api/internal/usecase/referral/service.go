package referral

import (
	"context"
	"fmt"
	"net/url"
	"strings"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/google/uuid"
)

type Service struct {
	users           domain.UserRepository
	platform        domain.PlatformRepository
	referrals       domain.ReferralRepository
	games          domain.GameRepository
	staking         domain.StakingRepository
	balance         *balance.Service
	notifier        balance.BalanceNotifier
	promoActivator  PromoActivator
	botAPI          *telegram.BotAPI
	botUsername     string
	webAppShortName string
	webAppURL       string
}

func NewService(users domain.UserRepository, platform domain.PlatformRepository) *Service {
	return &Service{users: users, platform: platform}
}

func (s *Service) SetReferralRepository(referrals domain.ReferralRepository) {
	s.referrals = referrals
}

func (s *Service) SetGameRepository(games domain.GameRepository) {
	s.games = games
}

func (s *Service) SetStakingRepository(staking domain.StakingRepository) {
	s.staking = staking
}

func (s *Service) SetBalanceService(balanceSvc *balance.Service) {
	s.balance = balanceSvc
}

func (s *Service) SetBalanceNotifier(notifier balance.BalanceNotifier) {
	s.notifier = notifier
}

func (s *Service) SetPreparedShareBot(api *telegram.BotAPI, botUsername, webAppShortName, webAppURL string) {
	s.botAPI = api
	s.botUsername = strings.TrimPrefix(strings.TrimSpace(botUsername), "@")
	s.webAppShortName = strings.Trim(strings.TrimSpace(webAppShortName), "/")
	s.webAppURL = strings.TrimRight(strings.TrimSpace(webAppURL), "/")
}

type Stats struct {
	ReferralCount         int64   `json:"referral_count"`
	ActiveReferralCount   int64   `json:"active_referral_count"`
	QualifiedReferralCount int64  `json:"qualified_referral_count"`
	TotalEarnedNanoton    int64   `json:"total_earned_nanoton"`
	StakingEarnedNanoton  int64   `json:"staking_earned_nanoton"`
	GGREarnedNanoton      int64   `json:"ggr_earned_nanoton"`
	MilestoneEarnedNanoton int64  `json:"milestone_earned_nanoton"`
	SharePercent          float64 `json:"share_percent"`
	GGRSharePercent       float64 `json:"ggr_share_percent"`
	SharePercentWeekly    float64 `json:"share_percent_weekly"`
	ExampleWeeklyTon      string  `json:"example_weekly_per_referral_ton"`
	MilestoneAmountNanoton int64  `json:"milestone_amount_nanoton"`
	InviteeBoostPercent   float64 `json:"invitee_boost_percent"`
	InviteeLimitBonusTon  string  `json:"invitee_limit_bonus_ton"`
}

func (s *Service) GetStats(ctx context.Context, userID uuid.UUID) (*Stats, error) {
	count, err := s.users.CountReferrals(ctx, userID)
	if err != nil {
		return nil, err
	}
	earned, err := s.users.SumReferralEarnings(ctx, userID)
	if err != nil {
		return nil, err
	}
	stakingEarned, _ := s.users.SumReferralEarningsByRefType(ctx, userID, refTypeDaily)
	ggrEarned, _ := s.users.SumReferralEarningsByRefType(ctx, userID, refTypeGGR)
	milestoneEarned, _ := s.users.SumReferralEarningsByRefType(ctx, userID, refTypeMilestone)

	settings := s.yieldSettings(ctx)
	sharePercent := settings.ReferralSharePercent
	ggrSharePercent := settings.ReferralGGRSharePercent
	milestoneAmount := settings.ReferralMilestoneNanoton
	if milestoneAmount <= 0 {
		milestoneAmount = domain.DefaultReferralMilestoneNanoton
	}

	var activeCount, qualifiedCount int64
	if s.referrals != nil {
		qualifiedCount, _ = s.referrals.CountQualifiedReferrals(
			ctx, userID, domain.DefaultReferralQualifyMinAge,
			domain.DefaultReferralQualifyMinDepositNano,
			domain.DefaultReferralQualifyMinStakeNano,
		)
	}
	if s.staking != nil {
		activeCount, _ = s.staking.CountActiveReferrals(ctx, userID)
	}

	exampleMonthlyYield := int64(30_000_000)
	exampleWeekly := WeeklyBonusFromMonthlyYield(exampleMonthlyYield, sharePercent)

	return &Stats{
		ReferralCount:          count,
		ActiveReferralCount:    activeCount,
		QualifiedReferralCount: qualifiedCount,
		TotalEarnedNanoton:     earned,
		StakingEarnedNanoton:   stakingEarned,
		GGREarnedNanoton:       ggrEarned,
		MilestoneEarnedNanoton: milestoneEarned,
		SharePercent:           sharePercent,
		GGRSharePercent:        ggrSharePercent,
		SharePercentWeekly:     sharePercent * float64(DaysPerWeek) / float64(DaysPerMonth),
		ExampleWeeklyTon:       fmt.Sprintf("%.6f", float64(exampleWeekly)/1_000_000_000),
		MilestoneAmountNanoton: milestoneAmount,
		InviteeBoostPercent:    domain.DefaultReferralPerkBoostPercent,
		InviteeLimitBonusTon:   fmt.Sprintf("%.0f", float64(domain.DefaultReferralPerkLimitBonusNano)/1_000_000_000),
	}, nil
}

func (s *Service) yieldSettings(ctx context.Context) domain.PlatformYieldSettings {
	settings := domain.PlatformYieldSettings{
		ReferralSharePercent:            DefaultSharePercent,
		ReferralGGRSharePercent:         domain.DefaultReferralGGRSharePercent,
		ReferralMilestoneNanoton:        domain.DefaultReferralMilestoneNanoton,
		ReferralMilestoneMonthlyCap:     domain.DefaultReferralMilestoneMonthlyCap,
		ReferralMonthlyPayoutCapNanoton: 0,
	}
	if s.platform == nil {
		return settings
	}
	row, err := s.platform.GetYieldSettings(ctx)
	if err != nil || row == nil {
		return settings
	}
	if row.ReferralSharePercent >= 0 {
		settings.ReferralSharePercent = row.ReferralSharePercent
	}
	if row.ReferralGGRSharePercent >= 0 {
		settings.ReferralGGRSharePercent = row.ReferralGGRSharePercent
	}
	if row.ReferralMilestoneNanoton > 0 {
		settings.ReferralMilestoneNanoton = row.ReferralMilestoneNanoton
	}
	if row.ReferralMilestoneMonthlyCap > 0 {
		settings.ReferralMilestoneMonthlyCap = row.ReferralMilestoneMonthlyCap
	}
	settings.ReferralMonthlyPayoutCapNanoton = row.ReferralMonthlyPayoutCapNanoton
	return settings
}

func (s *Service) TryAssignReferrer(ctx context.Context, userID uuid.UUID, code string) error {
	referrerID, ok := ParseReferrerID(code)
	if ok {
		if referrerID == userID {
			return nil
		}
		if _, err := s.users.FindByID(ctx, referrerID); err != nil {
			return nil
		}
		if _, err := s.users.SetReferrerIfEmpty(ctx, userID, referrerID); err != nil {
			return err
		}
		return nil
	}

	referrerTelegramID, ok := ParseReferrerTelegramID(code)
	if !ok {
		return nil
	}
	referrer, err := s.users.FindByTelegramID(ctx, referrerTelegramID)
	if err != nil || referrer == nil || referrer.ID == userID {
		return nil
	}
	_, err = s.users.SetReferrerIfEmpty(ctx, userID, referrer.ID)
	return err
}

// PrepareShareResult is returned to the Mini App for WebApp.shareMessage.
type PrepareShareResult struct {
	PreparedMessageID string `json:"prepared_message_id"`
	ResultID          string `json:"result_id"`
	ExpirationDate    int64  `json:"expiration_date,omitempty"`
}

// PrepareShare creates a Telegram prepared inline message for referral invite share.
func (s *Service) PrepareShare(ctx context.Context, userID uuid.UUID, telegramID int64) (*PrepareShareResult, error) {
	if userID == uuid.Nil || telegramID == 0 {
		return nil, domain.ErrForbidden
	}
	if s.botAPI == nil || !s.botAPI.Enabled() {
		return nil, domain.ErrNotFound
	}
	if s.botUsername == "" || s.webAppShortName == "" {
		return nil, domain.ErrNotFound
	}

	resultID := "rfs_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	shareURL := fmt.Sprintf(
		"https://t.me/%s/%s?startapp=%s",
		s.botUsername,
		s.webAppShortName,
		url.QueryEscape(StartPayloadForTelegramID(telegramID)),
	)
	title := "Flipo"
	description := "Заходи в Flipo по моей ссылке — получи бесплатный кейс и забирай подарки!"
	caption := strings.Join([]string{
		"🎁 Присоединяйся ко мне в Flipo!",
		"Открой бесплатный кейс и забирай Telegram-подарки — по моей ссылке вход ещё выгоднее.",
		"",
		shareURL,
	}, "\n")
	replyMarkup := map[string]any{
		"inline_keyboard": [][]map[string]any{{
			{"text": "🎁 Открыть бесплатный кейс", "url": shareURL},
		}},
	}

	var inlineResult map[string]any
	if photoURL := referralSharePromoURL(s.webAppURL); photoURL != "" {
		inlineResult = map[string]any{
			"type":          "photo",
			"id":            resultID,
			"photo_url":     photoURL,
			"thumbnail_url": photoURL,
			"photo_width":   1024,
			"photo_height":  1024,
			"title":         title,
			"description":   description,
			"caption":       caption,
			"reply_markup":  replyMarkup,
		}
	} else {
		inlineResult = map[string]any{
			"type":        "article",
			"id":          resultID,
			"title":       title,
			"description": description,
			"input_message_content": map[string]any{
				"message_text": caption,
				"link_preview_options": map[string]any{
					"is_disabled": false,
				},
			},
			"reply_markup": replyMarkup,
		}
	}

	prepared, err := s.botAPI.SavePreparedInlineMessage(ctx, telegram.SavePreparedInlineMessageRequest{
		UserID:            telegramID,
		Result:            inlineResult,
		AllowUserChats:    true,
		AllowBotChats:     false,
		AllowGroupChats:   true,
		AllowChannelChats: false,
	})
	if err != nil {
		return nil, fmt.Errorf("prepare referral share: %w", err)
	}
	return &PrepareShareResult{
		PreparedMessageID: prepared.ID,
		ResultID:          resultID,
		ExpirationDate:    prepared.ExpirationDate,
	}, nil
}

func referralSharePromoURL(webAppURL string) string {
	base := strings.TrimRight(strings.TrimSpace(webAppURL), "/")
	if base == "" {
		return ""
	}
	if !strings.HasPrefix(base, "https://") && !strings.HasPrefix(base, "http://") {
		return ""
	}
	// Cache-bust so Telegram re-fetches after art updates.
	return base + "/share/referral-promo.jpg?v=3"
}
