package quests

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/giftimage"
	"github.com/flipo/flipo/apps/api/internal/infrastructure/telegram"
	"github.com/flipo/flipo/apps/api/internal/usecase/balance"
	"github.com/flipo/flipo/apps/api/internal/usecase/staking"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type AdminQuestNotifier interface {
	NotifyQuestClaimed(
		ctx context.Context,
		actor telegram.AdminActor,
		isBonus bool,
		questTitle, rewardLabel string,
		rewardNanoton int64,
	)
}

type Service struct {
	quests    domain.DailyQuestRepository
	cases     domain.CaseRepository
	games      domain.GameRepository
	users     domain.UserRepository
	inventory domain.InventoryRepository
	balance   *balance.Service
	admin     AdminQuestNotifier
}

func NewService(
	quests domain.DailyQuestRepository,
	cases domain.CaseRepository,
	games domain.GameRepository,
	users domain.UserRepository,
	inventory domain.InventoryRepository,
	balanceSvc *balance.Service,
) *Service {
	return &Service{
		quests:    quests,
		cases:     cases,
		games:      games,
		users:     users,
		inventory: inventory,
		balance:   balanceSvc,
	}
}

func (s *Service) SetAdminNotifier(notifier AdminQuestNotifier) {
	s.admin = notifier
}

type RewardView struct {
	Type           string     `json:"type"`
	Nanoton        int64      `json:"nanoton,omitempty"`
	CaseID         *uuid.UUID `json:"case_id,omitempty"`
	CaseTitle      string     `json:"case_title,omitempty"`
	CaseSlug       string     `json:"case_slug,omitempty"`
	CaseImage      string     `json:"case_image_url,omitempty"`
	CollectionSlug string     `json:"collection_slug,omitempty"`
	ModelName      string     `json:"model_name,omitempty"`
	GiftName       string     `json:"gift_name,omitempty"`
	GiftImageURL   string     `json:"gift_image_url,omitempty"`
}

type TaskView struct {
	ID                 uuid.UUID  `json:"id"`
	Title              string     `json:"title"`
	Description        string     `json:"description"`
	Objective          string     `json:"objective_type"`
	Target             int64      `json:"target"`
	Progress           int64      `json:"progress"`
	Status             string     `json:"status"` // active | ready | claimed
	Action             string     `json:"action"` // cases | referrals | roulette | crash | claim | none
	ObjectiveCaseID    *uuid.UUID `json:"objective_case_id,omitempty"`
	ObjectiveCaseSlug  string     `json:"objective_case_slug,omitempty"`
	ObjectiveCaseTitle string     `json:"objective_case_title,omitempty"`
	CardImageURL       string     `json:"card_image_url,omitempty"`
	Reward             RewardView `json:"reward"`
}

type BonusView struct {
	Title          string     `json:"title"`
	Description    string     `json:"description"`
	CompletedCount int        `json:"completed_count"`
	TotalCount     int        `json:"total_count"`
	Status         string     `json:"status"` // disabled | locked | ready | claimed
	CardImageURL   string     `json:"card_image_url,omitempty"`
	Reward         RewardView `json:"reward"`
}

type DailyBoardView struct {
	DayMSK string     `json:"day_msk"`
	Tasks  []TaskView `json:"tasks"`
	Bonus  BonusView  `json:"bonus"`
}

type ClaimResult struct {
	Reward          RewardView `json:"reward"`
	BalanceAfter    *int64     `json:"balance_after,omitempty"`
	EntitlementID   *uuid.UUID `json:"entitlement_id,omitempty"`
	CaseID          *uuid.UUID `json:"case_id,omitempty"`
	InventoryItemID *uuid.UUID `json:"inventory_item_id,omitempty"`
}

type rewardSpec struct {
	Type           string
	Nanoton        int64
	CaseID         *uuid.UUID
	CollectionSlug string
	ModelName      string
	GiftName       string
	GiftImageURL   string
}

func (s *Service) ListDaily(ctx context.Context, userID uuid.UUID) (*DailyBoardView, error) {
	dayStart, _ := staking.CurrentEpochBounds(time.Now())
	dayMSK := dayStart.In(staking.MoscowLocation())
	dayDate := time.Date(dayMSK.Year(), dayMSK.Month(), dayMSK.Day(), 0, 0, 0, 0, staking.MoscowLocation())

	tasks, err := s.quests.ListActiveQuestsForDay(ctx, dayDate)
	if err != nil {
		return nil, err
	}

	views := make([]TaskView, 0, len(tasks))
	completed := 0
	since, err := s.progressSince(ctx, userID, dayStart)
	if err != nil {
		return nil, err
	}
	for _, q := range tasks {
		progress, err := s.progressAt(ctx, userID, q, since)
		if err != nil {
			return nil, err
		}
		claimed, err := s.quests.FindTaskClaim(ctx, userID, q.ID, dayDate)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		status := "active"
		action := actionForObjective(q.ObjectiveType)
		if claimed != nil {
			status = "claimed"
			action = "none"
			completed++
		} else if progress >= q.ObjectiveTarget {
			// No-reward tasks complete automatically — they only unlock the board bonus.
			if q.RewardType == domain.DailyQuestRewardNone {
				status = "claimed"
				action = "none"
			} else {
				status = "ready"
				action = "claim"
			}
			completed++
		}
		reward, err := s.rewardView(ctx, rewardSpecFromQuest(q))
		if err != nil {
			return nil, err
		}
		view := TaskView{
			ID:           q.ID,
			Title:        q.Title,
			Description:  q.Description,
			Objective:    q.ObjectiveType,
			Target:       q.ObjectiveTarget,
			Progress:     minInt64(progress, q.ObjectiveTarget),
			Status:       status,
			Action:       action,
			CardImageURL: strings.TrimSpace(q.CardImageURL),
			Reward:       reward,
		}
		if isCaseObjective(q.ObjectiveType) && q.ObjectiveCaseID != nil {
			view.ObjectiveCaseID = q.ObjectiveCaseID
			if c, cErr := s.cases.FindByID(ctx, *q.ObjectiveCaseID); cErr == nil && c != nil {
				view.ObjectiveCaseSlug = c.Slug
				view.ObjectiveCaseTitle = c.Title
			}
		}
		views = append(views, view)
	}

	board, err := s.quests.GetBoardSettings(ctx)
	if err != nil {
		return nil, err
	}
	bonus := BonusView{
		Title:          board.BonusTitle,
		Description:    board.BonusDescription,
		CompletedCount: completed,
		TotalCount:     len(tasks),
		Status:         "disabled",
		CardImageURL:   strings.TrimSpace(board.BonusCardImageURL),
	}
	if board.BonusActive {
		bonus.Reward, err = s.rewardView(ctx, rewardSpecFromBoard(board))
		if err != nil {
			return nil, err
		}
		bonusClaim, bErr := s.quests.FindBonusClaim(ctx, userID, dayDate)
		if bErr != nil && !errors.Is(bErr, gorm.ErrRecordNotFound) {
			return nil, bErr
		}
		switch {
		case bonusClaim != nil:
			bonus.Status = "claimed"
		case len(tasks) == 0:
			bonus.Status = "locked"
		case completed >= len(tasks):
			bonus.Status = "ready"
		default:
			bonus.Status = "locked"
		}
	}

	return &DailyBoardView{
		DayMSK: dayDate.Format("2006-01-02"),
		Tasks:  views,
		Bonus:  bonus,
	}, nil
}

func (s *Service) ClaimTask(ctx context.Context, userID, questID uuid.UUID) (*ClaimResult, error) {
	dayStart, _ := staking.CurrentEpochBounds(time.Now())
	dayMSK := dayStart.In(staking.MoscowLocation())
	dayDate := time.Date(dayMSK.Year(), dayMSK.Month(), dayMSK.Day(), 0, 0, 0, 0, staking.MoscowLocation())

	q, err := s.quests.FindQuest(ctx, questID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrQuestUnavailable
		}
		return nil, err
	}
	if !q.Active || !questActiveOnDay(*q, dayDate) {
		return nil, domain.ErrQuestUnavailable
	}

	if existing, err := s.quests.FindTaskClaim(ctx, userID, questID, dayDate); err == nil && existing != nil {
		return nil, domain.ErrQuestAlreadyClaimed
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	progress, err := s.progress(ctx, userID, *q, dayStart)
	if err != nil {
		return nil, err
	}
	if progress < q.ObjectiveTarget {
		return nil, domain.ErrQuestNotReady
	}

	result, err := s.grantClaim(ctx, userID, dayDate, domain.DailyQuestClaimTask, &q.ID, rewardSpecFromQuest(*q))
	if err != nil {
		return nil, err
	}
	if q.RewardType != domain.DailyQuestRewardNone {
		s.notifyClaim(ctx, userID, false, q.Title, result.Reward)
	}
	return result, nil
}

func (s *Service) ClaimBonus(ctx context.Context, userID uuid.UUID) (*ClaimResult, error) {
	dayStart, _ := staking.CurrentEpochBounds(time.Now())
	dayMSK := dayStart.In(staking.MoscowLocation())
	dayDate := time.Date(dayMSK.Year(), dayMSK.Month(), dayMSK.Day(), 0, 0, 0, 0, staking.MoscowLocation())

	board, err := s.quests.GetBoardSettings(ctx)
	if err != nil {
		return nil, err
	}
	if !board.BonusActive {
		return nil, domain.ErrQuestUnavailable
	}

	if existing, err := s.quests.FindBonusClaim(ctx, userID, dayDate); err == nil && existing != nil {
		return nil, domain.ErrQuestAlreadyClaimed
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	tasks, err := s.quests.ListActiveQuestsForDay(ctx, dayDate)
	if err != nil {
		return nil, err
	}
	if len(tasks) == 0 {
		return nil, domain.ErrQuestBonusLocked
	}
	since, err := s.progressSince(ctx, userID, dayStart)
	if err != nil {
		return nil, err
	}
	for _, q := range tasks {
		progress, err := s.progressAt(ctx, userID, q, since)
		if err != nil {
			return nil, err
		}
		if progress < q.ObjectiveTarget {
			return nil, domain.ErrQuestBonusLocked
		}
	}

	result, err := s.grantClaim(ctx, userID, dayDate, domain.DailyQuestClaimBonus, nil, rewardSpecFromBoard(board))
	if err != nil {
		return nil, err
	}
	s.notifyClaim(ctx, userID, true, board.BonusTitle, result.Reward)
	return result, nil
}

func (s *Service) grantClaim(
	ctx context.Context,
	userID uuid.UUID,
	dayDate time.Time,
	kind string,
	questID *uuid.UUID,
	spec rewardSpec,
) (*ClaimResult, error) {
	if err := validateReward(spec); err != nil {
		return nil, err
	}
	if spec.Type == domain.DailyQuestRewardFreeCase && spec.CaseID != nil {
		c, err := s.cases.FindByID(ctx, *spec.CaseID)
		if err != nil || c == nil || !c.Active {
			return nil, domain.ErrCaseUnavailable
		}
	}

	claimID := uuid.New()
	claim := &domain.DailyQuestClaim{
		ID:            claimID,
		UserID:        userID,
		DayMSK:        dayDate,
		ClaimKind:     kind,
		QuestID:       questID,
		RewardType:    spec.Type,
		RewardNanoton: spec.Nanoton,
		RewardCaseID:  spec.CaseID,
		ClaimedAt:     time.Now().UTC(),
	}
	if err := s.quests.CreateClaim(ctx, claim); err != nil {
		if isUniqueViolation(err) {
			return nil, domain.ErrQuestAlreadyClaimed
		}
		return nil, err
	}

	result := &ClaimResult{}
	reward, err := s.rewardView(ctx, spec)
	if err != nil {
		_ = s.quests.DeleteClaim(ctx, claimID)
		return nil, err
	}
	result.Reward = reward

	switch spec.Type {
	case domain.DailyQuestRewardBalance:
		bal, err := s.balance.Credit(ctx, userID, spec.Nanoton, domain.LedgerQuestReward, "daily_quest", claimID)
		if err != nil {
			_ = s.quests.DeleteClaim(ctx, claimID)
			return nil, err
		}
		result.BalanceAfter = &bal
	case domain.DailyQuestRewardFreeCase:
		entID := uuid.New()
		ent := &domain.UserCaseEntitlement{
			ID:        entID,
			UserID:    userID,
			CaseID:    *spec.CaseID,
			Source:    domain.CaseEntitlementSourceDailyQuest,
			SourceRef: claimID,
			Status:    domain.CaseEntitlementAvailable,
			CreatedAt: time.Now().UTC(),
		}
		if err := s.quests.CreateEntitlement(ctx, ent); err != nil {
			_ = s.quests.DeleteClaim(ctx, claimID)
			return nil, err
		}
		_ = s.quests.UpdateClaimEntitlement(ctx, claimID, entID)
		result.EntitlementID = &entID
		result.CaseID = spec.CaseID
	case domain.DailyQuestRewardGift:
		item, err := s.grantGift(ctx, userID, claimID, spec)
		if err != nil {
			_ = s.quests.DeleteClaim(ctx, claimID)
			return nil, err
		}
		result.InventoryItemID = &item.ID
	case domain.DailyQuestRewardNone:
		// Claim marks progress toward the board bonus only — no payout.
	default:
		_ = s.quests.DeleteClaim(ctx, claimID)
		return nil, domain.ErrInvalidAmount
	}

	return result, nil
}

func (s *Service) grantGift(ctx context.Context, userID, claimID uuid.UUID, spec rewardSpec) (*domain.InventoryItem, error) {
	slug := strings.TrimSpace(spec.CollectionSlug)
	modelName := strings.TrimSpace(spec.ModelName)
	displayName := strings.TrimSpace(spec.GiftName)
	if displayName == "" {
		displayName = modelName
	}
	if displayName == "" {
		displayName = slug
	}
	imageURL := strings.TrimSpace(spec.GiftImageURL)
	if imageURL == "" {
		imageURL = giftimage.FragmentURL(slug)
	}

	metaMap := map[string]any{
		domain.CaseClaimMetaFulfillment:    domain.CaseFulfillmentUnbacked,
		domain.CaseClaimMetaCollection:     slug,
		domain.CaseClaimMetaCashoutNanoton: spec.Nanoton,
		domain.QuestClaimMetaClaimID:       claimID.String(),
		domain.QuestClaimMetaSource:        domain.QuestClaimSourceDaily,
	}
	if modelName != "" {
		metaMap[domain.CaseClaimMetaModel] = modelName
	}
	meta, _ := json.Marshal(metaMap)
	now := time.Now().UTC()
	item := &domain.InventoryItem{
		ID:                uuid.New(),
		UserID:            userID,
		Source:            domain.NFTSourceTelegramGift,
		TelegramGiftID:    "",
		CollectionSlug:    slug,
		Name:              displayName,
		ImageURL:          imageURL,
		Metadata:          datatypes.JSON(meta),
		FloorPriceNanoton: spec.Nanoton,
		Status:            domain.InvAvailable,
		DepositedAt:       now,
		TelegramTxRef:     domain.QuestClaimTxRefPrefix + claimID.String(),
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	if err := s.inventory.Create(ctx, item); err != nil {
		return nil, err
	}
	return item, nil
}

func (s *Service) notifyClaim(ctx context.Context, userID uuid.UUID, isBonus bool, title string, reward RewardView) {
	if s.admin == nil {
		return
	}
	actor := telegram.AdminActor{}
	if user, err := s.users.FindByID(ctx, userID); err == nil && user != nil {
		actor = telegram.AdminActor{
			TelegramID: user.TelegramID,
			Username:   user.Username,
			FirstName:  user.FirstName,
			LastName:   user.LastName,
		}
	}
	s.admin.NotifyQuestClaimed(ctx, actor, isBonus, title, rewardLabelForNotify(reward), reward.Nanoton)
}

func rewardLabelForNotify(reward RewardView) string {
	switch reward.Type {
	case domain.DailyQuestRewardBalance:
		if reward.Nanoton > 0 {
			return fmt.Sprintf("%s TON", formatQuestTON(reward.Nanoton))
		}
		return "TON на баланс"
	case domain.DailyQuestRewardFreeCase:
		title := strings.TrimSpace(reward.CaseTitle)
		if title != "" {
			return "кейс «" + title + "»"
		}
		return "бесплатный кейс"
	case domain.DailyQuestRewardGift:
		name := strings.TrimSpace(reward.GiftName)
		if name == "" {
			name = strings.TrimSpace(reward.ModelName)
		}
		if name == "" {
			name = strings.TrimSpace(reward.CollectionSlug)
		}
		if name == "" {
			name = "подарок"
		}
		if reward.Nanoton > 0 {
			return fmt.Sprintf("%s (%s TON)", name, formatQuestTON(reward.Nanoton))
		}
		return name
	case domain.DailyQuestRewardNone:
		return "без награды"
	default:
		return "награда"
	}
}

func formatQuestTON(nanoton int64) string {
	if nanoton%1_000_000_000 == 0 {
		return fmt.Sprintf("%d", nanoton/1_000_000_000)
	}
	v := float64(nanoton) / 1e9
	s := fmt.Sprintf("%.4f", v)
	s = strings.TrimRight(s, "0")
	s = strings.TrimRight(s, ".")
	return s
}

func (s *Service) progress(ctx context.Context, userID uuid.UUID, q domain.DailyQuest, dayStartUTC time.Time) (int64, error) {
	since, err := s.progressSince(ctx, userID, dayStartUTC)
	if err != nil {
		return 0, err
	}
	return s.progressAt(ctx, userID, q, since)
}

func (s *Service) progressAt(ctx context.Context, userID uuid.UUID, q domain.DailyQuest, since time.Time) (int64, error) {
	switch q.ObjectiveType {
	case domain.DailyQuestObjectiveOpenCases:
		return s.cases.CountPaidOpensSince(ctx, userID, since, q.ObjectiveCaseID)
	case domain.DailyQuestObjectiveOpenCasesSpend:
		return s.cases.SumPaidOpensSince(ctx, userID, since, q.ObjectiveCaseID)
	case domain.DailyQuestObjectiveInviteReferrals:
		return s.users.CountReferralsSince(ctx, userID, since)
	case domain.DailyQuestObjectiveWagerRoulette:
		if s.games == nil {
			return 0, nil
		}
		return s.games.SumWagerByGameSince(ctx, userID, domain.GameRoulette, since)
	case domain.DailyQuestObjectiveWagerCrash:
		if s.games == nil {
			return 0, nil
		}
		return s.games.SumWagerByGameSince(ctx, userID, domain.GameCrash, since)
	case domain.DailyQuestObjectiveRouletteWinMult:
		if s.games == nil {
			return 0, nil
		}
		return s.games.CountRouletteWinsWithMultSince(ctx, userID, since, multFromParam(q.ObjectiveParam))
	case domain.DailyQuestObjectiveCrashCashoutMult:
		if s.games == nil {
			return 0, nil
		}
		return s.games.CountCrashCashoutsSince(ctx, userID, since, floatMultFromParam(q.ObjectiveParam))
	case domain.DailyQuestObjectiveRouletteColorStreak:
		if s.games == nil {
			return 0, nil
		}
		return s.games.MaxRouletteColorStreakSince(ctx, userID, since)
	default:
		return 0, nil
	}
}

// multFromParam — ObjectiveParam stores multiplier ×100 (5000 = ×50). Fallback ×2.
func multFromParam(param int64) int64 {
	if param < 100 {
		return 2
	}
	return param / 100
}

func floatMultFromParam(param int64) float64 {
	if param < 100 {
		return 2
	}
	return float64(param) / 100
}

func (s *Service) progressSince(ctx context.Context, userID uuid.UUID, dayStartUTC time.Time) (time.Time, error) {
	since := dayStartUTC
	if board, err := s.quests.GetBoardSettings(ctx); err == nil && board != nil && board.ProgressEpoch != nil {
		if board.ProgressEpoch.After(since) {
			since = *board.ProgressEpoch
		}
	} else if err != nil {
		return time.Time{}, err
	}

	dayMSK := dayStartUTC.In(staking.MoscowLocation())
	dayDate := time.Date(dayMSK.Year(), dayMSK.Month(), dayMSK.Day(), 0, 0, 0, 0, staking.MoscowLocation())
	baseline, err := s.quests.GetProgressBaseline(ctx, userID, dayDate)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		// Missing migration / table must not break the quest board for players.
		if !isUndefinedTableErr(err) {
			return time.Time{}, err
		}
		baseline = nil
		err = nil
	}
	if baseline != nil && baseline.ProgressSince.After(since) {
		since = baseline.ProgressSince
	}
	return since, nil
}

func isUndefinedTableErr(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "does not exist") ||
		strings.Contains(msg, "undefined_table") ||
		strings.Contains(msg, "no such table")
}

func (s *Service) rewardView(ctx context.Context, spec rewardSpec) (RewardView, error) {
	v := RewardView{
		Type:           spec.Type,
		Nanoton:        spec.Nanoton,
		CaseID:         spec.CaseID,
		CollectionSlug: spec.CollectionSlug,
		ModelName:      spec.ModelName,
		GiftName:       spec.GiftName,
		GiftImageURL:   spec.GiftImageURL,
	}
	if spec.Type == domain.DailyQuestRewardFreeCase && spec.CaseID != nil {
		if c, err := s.cases.FindByID(ctx, *spec.CaseID); err == nil && c != nil {
			v.CaseTitle = c.Title
			v.CaseSlug = c.Slug
			v.CaseImage = c.ImageURL
		}
	}
	if spec.Type == domain.DailyQuestRewardGift {
		if v.GiftName == "" {
			v.GiftName = spec.ModelName
		}
		if v.GiftName == "" {
			v.GiftName = spec.CollectionSlug
		}
		if v.GiftImageURL == "" && spec.CollectionSlug != "" {
			v.GiftImageURL = giftimage.FragmentURL(spec.CollectionSlug)
		}
	}
	return v, nil
}

func rewardSpecFromQuest(q domain.DailyQuest) rewardSpec {
	return rewardSpec{
		Type:           q.RewardType,
		Nanoton:        q.RewardNanoton,
		CaseID:         q.RewardCaseID,
		CollectionSlug: strings.TrimSpace(q.RewardCollectionSlug),
		ModelName:      strings.TrimSpace(q.RewardModelName),
		GiftName:       strings.TrimSpace(q.RewardGiftName),
		GiftImageURL:   strings.TrimSpace(q.RewardGiftImageURL),
	}
}

func rewardSpecFromBoard(board *domain.DailyQuestBoardSettings) rewardSpec {
	return rewardSpec{
		Type:           board.BonusRewardType,
		Nanoton:        board.BonusRewardNanoton,
		CaseID:         board.BonusRewardCaseID,
		CollectionSlug: strings.TrimSpace(board.BonusRewardCollectionSlug),
		ModelName:      strings.TrimSpace(board.BonusRewardModelName),
		GiftName:       strings.TrimSpace(board.BonusRewardGiftName),
		GiftImageURL:   strings.TrimSpace(board.BonusRewardGiftImageURL),
	}
}

func actionForObjective(objective string) string {
	switch objective {
	case domain.DailyQuestObjectiveOpenCases, domain.DailyQuestObjectiveOpenCasesSpend:
		return "cases"
	case domain.DailyQuestObjectiveInviteReferrals:
		return "referrals"
	case domain.DailyQuestObjectiveWagerRoulette,
		domain.DailyQuestObjectiveRouletteWinMult,
		domain.DailyQuestObjectiveRouletteColorStreak:
		return "roulette"
	case domain.DailyQuestObjectiveWagerCrash, domain.DailyQuestObjectiveCrashCashoutMult:
		return "crash"
	default:
		return "none"
	}
}

func isCaseObjective(objective string) bool {
	return objective == domain.DailyQuestObjectiveOpenCases ||
		objective == domain.DailyQuestObjectiveOpenCasesSpend
}

func questActiveOnDay(q domain.DailyQuest, dayDate time.Time) bool {
	day := time.Date(dayDate.Year(), dayDate.Month(), dayDate.Day(), 0, 0, 0, 0, time.UTC)
	if q.ActiveFrom != nil {
		from := time.Date(q.ActiveFrom.Year(), q.ActiveFrom.Month(), q.ActiveFrom.Day(), 0, 0, 0, 0, time.UTC)
		if day.Before(from) {
			return false
		}
	}
	if q.ActiveTo != nil {
		to := time.Date(q.ActiveTo.Year(), q.ActiveTo.Month(), q.ActiveTo.Day(), 0, 0, 0, 0, time.UTC)
		if day.After(to) {
			return false
		}
	}
	return true
}

func validateReward(spec rewardSpec) error {
	switch spec.Type {
	case domain.DailyQuestRewardBalance:
		if spec.Nanoton <= 0 {
			return domain.ErrInvalidAmount
		}
		return nil
	case domain.DailyQuestRewardFreeCase:
		if spec.CaseID == nil || *spec.CaseID == uuid.Nil {
			return domain.ErrInvalidAmount
		}
		return nil
	case domain.DailyQuestRewardGift:
		if strings.TrimSpace(spec.CollectionSlug) == "" {
			return domain.ErrInvalidAmount
		}
		if spec.Nanoton <= 0 {
			return domain.ErrInvalidAmount
		}
		return nil
	case domain.DailyQuestRewardNone:
		return nil
	default:
		return domain.ErrInvalidAmount
	}
}

func validateQuest(q *domain.DailyQuest) error {
	q.Title = strings.TrimSpace(q.Title)
	q.Description = strings.TrimSpace(q.Description)
	q.RewardCollectionSlug = strings.TrimSpace(q.RewardCollectionSlug)
	q.RewardModelName = strings.TrimSpace(q.RewardModelName)
	q.RewardGiftName = strings.TrimSpace(q.RewardGiftName)
	q.RewardGiftImageURL = strings.TrimSpace(q.RewardGiftImageURL)
	if q.Title == "" {
		return domain.ErrInvalidAmount
	}
	if q.ObjectiveTarget < 1 {
		return domain.ErrInvalidAmount
	}
	switch q.ObjectiveType {
	case domain.DailyQuestObjectiveOpenCases, domain.DailyQuestObjectiveOpenCasesSpend:
		// ObjectiveCaseID optional: nil = any paid case open / spend.
		q.ObjectiveParam = 0
	case domain.DailyQuestObjectiveInviteReferrals:
		q.ObjectiveCaseID = nil
		q.ObjectiveParam = 0
	case domain.DailyQuestObjectiveWagerRoulette, domain.DailyQuestObjectiveWagerCrash:
		q.ObjectiveCaseID = nil
		q.ObjectiveParam = 0
	case domain.DailyQuestObjectiveRouletteWinMult, domain.DailyQuestObjectiveCrashCashoutMult:
		q.ObjectiveCaseID = nil
		if q.ObjectiveParam < 100 {
			return domain.ErrInvalidAmount
		}
	case domain.DailyQuestObjectiveRouletteColorStreak:
		q.ObjectiveCaseID = nil
		q.ObjectiveParam = 0
	default:
		return domain.ErrInvalidAmount
	}
	normalizeQuestRewardFields(q)
	return validateReward(rewardSpecFromQuest(*q))
}

func normalizeQuestRewardFields(q *domain.DailyQuest) {
	switch q.RewardType {
	case domain.DailyQuestRewardBalance:
		q.RewardCaseID = nil
		q.RewardCollectionSlug = ""
		q.RewardModelName = ""
		q.RewardGiftName = ""
		q.RewardGiftImageURL = ""
	case domain.DailyQuestRewardFreeCase:
		q.RewardNanoton = 0
		q.RewardCollectionSlug = ""
		q.RewardModelName = ""
		q.RewardGiftName = ""
		q.RewardGiftImageURL = ""
	case domain.DailyQuestRewardGift:
		q.RewardCaseID = nil
	case domain.DailyQuestRewardNone:
		q.RewardNanoton = 0
		q.RewardCaseID = nil
		q.RewardCollectionSlug = ""
		q.RewardModelName = ""
		q.RewardGiftName = ""
		q.RewardGiftImageURL = ""
	}
}

func normalizeBoardRewardFields(settings *domain.DailyQuestBoardSettings) {
	settings.BonusRewardCollectionSlug = strings.TrimSpace(settings.BonusRewardCollectionSlug)
	settings.BonusRewardModelName = strings.TrimSpace(settings.BonusRewardModelName)
	settings.BonusRewardGiftName = strings.TrimSpace(settings.BonusRewardGiftName)
	settings.BonusRewardGiftImageURL = strings.TrimSpace(settings.BonusRewardGiftImageURL)
	settings.BonusCardImageURL = strings.TrimSpace(settings.BonusCardImageURL)
	switch settings.BonusRewardType {
	case domain.DailyQuestRewardBalance:
		settings.BonusRewardCaseID = nil
		settings.BonusRewardCollectionSlug = ""
		settings.BonusRewardModelName = ""
		settings.BonusRewardGiftName = ""
		settings.BonusRewardGiftImageURL = ""
	case domain.DailyQuestRewardFreeCase:
		settings.BonusRewardNanoton = 0
		settings.BonusRewardCollectionSlug = ""
		settings.BonusRewardModelName = ""
		settings.BonusRewardGiftName = ""
		settings.BonusRewardGiftImageURL = ""
	case domain.DailyQuestRewardGift:
		settings.BonusRewardCaseID = nil
	}
}

func minInt64(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "duplicate") || strings.Contains(msg, "unique")
}

// --- Admin ---

func (s *Service) AdminListQuests(ctx context.Context) ([]domain.DailyQuest, error) {
	return s.quests.ListQuests(ctx)
}

type AdminQuestUpsert struct {
	ID                   uuid.UUID  `json:"id"`
	Title                string     `json:"title"`
	Description          string     `json:"description"`
	SortOrder            int        `json:"sort_order"`
	Active               bool       `json:"active"`
	ActiveFrom           *string    `json:"active_from"`
	ActiveTo             *string    `json:"active_to"`
	ObjectiveType        string     `json:"objective_type"`
	ObjectiveTarget      int64      `json:"objective_target"`
	ObjectiveParam       int64      `json:"objective_param"`
	ObjectiveCaseID      *uuid.UUID `json:"objective_case_id"`
	RewardType           string     `json:"reward_type"`
	RewardNanoton        int64      `json:"reward_nanoton"`
	RewardCaseID         *uuid.UUID `json:"reward_case_id"`
	RewardCollectionSlug string     `json:"reward_collection_slug"`
	RewardModelName      string     `json:"reward_model_name"`
	RewardGiftName       string     `json:"reward_gift_name"`
	RewardGiftImageURL   string     `json:"reward_gift_image_url"`
	CardImageURL         string     `json:"card_image_url"`
}

func (s *Service) AdminUpsertQuest(ctx context.Context, req AdminQuestUpsert) (*domain.DailyQuest, error) {
	q := &domain.DailyQuest{
		ID:                   req.ID,
		Title:                req.Title,
		Description:          req.Description,
		SortOrder:            req.SortOrder,
		Active:               req.Active,
		ObjectiveType:        req.ObjectiveType,
		ObjectiveTarget:      req.ObjectiveTarget,
		ObjectiveParam:       req.ObjectiveParam,
		ObjectiveCaseID:      req.ObjectiveCaseID,
		RewardType:           req.RewardType,
		RewardNanoton:        req.RewardNanoton,
		RewardCaseID:         req.RewardCaseID,
		RewardCollectionSlug: req.RewardCollectionSlug,
		RewardModelName:      req.RewardModelName,
		RewardGiftName:       req.RewardGiftName,
		RewardGiftImageURL:   req.RewardGiftImageURL,
		CardImageURL:         strings.TrimSpace(req.CardImageURL),
	}
	from, err := parseDatePtr(req.ActiveFrom)
	if err != nil {
		return nil, domain.ErrInvalidAmount
	}
	to, err := parseDatePtr(req.ActiveTo)
	if err != nil {
		return nil, domain.ErrInvalidAmount
	}
	q.ActiveFrom = from
	q.ActiveTo = to
	if err := validateQuest(q); err != nil {
		return nil, err
	}
	if q.ObjectiveType == domain.DailyQuestObjectiveOpenCases && q.ObjectiveCaseID != nil {
		c, err := s.cases.FindByID(ctx, *q.ObjectiveCaseID)
		if err != nil || c == nil {
			return nil, domain.ErrCaseUnavailable
		}
	}
	if q.RewardType == domain.DailyQuestRewardFreeCase && q.RewardCaseID != nil {
		c, err := s.cases.FindByID(ctx, *q.RewardCaseID)
		if err != nil || c == nil {
			return nil, domain.ErrCaseUnavailable
		}
	}
	if err := s.quests.UpsertQuest(ctx, q); err != nil {
		return nil, err
	}
	return q, nil
}

func parseDatePtr(raw *string) (*time.Time, error) {
	if raw == nil {
		return nil, nil
	}
	s := strings.TrimSpace(*raw)
	if s == "" {
		return nil, nil
	}
	t, err := time.ParseInLocation("2006-01-02", s, staking.MoscowLocation())
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *Service) AdminDeleteQuest(ctx context.Context, id uuid.UUID) error {
	return s.quests.DeleteQuest(ctx, id)
}

func (s *Service) AdminGetBoard(ctx context.Context) (*domain.DailyQuestBoardSettings, error) {
	board, err := s.quests.GetBoardSettings(ctx)
	if err != nil {
		return nil, err
	}
	if len(board.PromoSlides) == 0 {
		board.PromoSlides = domain.DefaultDailyQuestPromoSlides()
	}
	return board, nil
}

func (s *Service) ListPromoSlides(ctx context.Context) ([]domain.DailyQuestPromoSlide, error) {
	board, err := s.quests.GetBoardSettings(ctx)
	if err != nil {
		return nil, err
	}
	slides := board.PromoSlides
	if len(slides) == 0 {
		slides = domain.DefaultDailyQuestPromoSlides()
	}
	out := make([]domain.DailyQuestPromoSlide, 0, len(slides))
	for _, slide := range slides {
		if !slide.Active {
			continue
		}
		normalized := normalizePromoSlide(slide)
		if normalized.Title == "" && normalized.Eyebrow == "" {
			continue
		}
		out = append(out, normalized)
	}
	return out, nil
}

func (s *Service) AdminUpdateBoard(ctx context.Context, settings *domain.DailyQuestBoardSettings) error {
	settings.BonusTitle = strings.TrimSpace(settings.BonusTitle)
	settings.BonusDescription = strings.TrimSpace(settings.BonusDescription)
	if settings.BonusTitle == "" {
		settings.BonusTitle = "Бонус дня"
	}
	normalizeBoardRewardFields(settings)
	if existing, err := s.quests.GetBoardSettings(ctx); err == nil && existing != nil {
		settings.ProgressEpoch = existing.ProgressEpoch
		if settings.PromoSlides == nil {
			settings.PromoSlides = existing.PromoSlides
		}
	}
	if settings.PromoSlides == nil {
		settings.PromoSlides = []domain.DailyQuestPromoSlide{}
	} else {
		settings.PromoSlides = normalizePromoSlides(settings.PromoSlides)
	}
	if settings.BonusActive {
		if settings.BonusRewardType == domain.DailyQuestRewardNone {
			return domain.ErrInvalidAmount
		}
		if err := validateReward(rewardSpecFromBoard(settings)); err != nil {
			return err
		}
		if settings.BonusRewardType == domain.DailyQuestRewardFreeCase && settings.BonusRewardCaseID != nil {
			c, err := s.cases.FindByID(ctx, *settings.BonusRewardCaseID)
			if err != nil || c == nil {
				return domain.ErrCaseUnavailable
			}
		}
	}
	return s.quests.UpdateBoardSettings(ctx, settings)
}

func normalizePromoSlides(slides []domain.DailyQuestPromoSlide) []domain.DailyQuestPromoSlide {
	if len(slides) == 0 {
		return []domain.DailyQuestPromoSlide{}
	}
	out := make([]domain.DailyQuestPromoSlide, 0, len(slides))
	for i, slide := range slides {
		n := normalizePromoSlide(slide)
		if n.ID == "" {
			n.ID = fmt.Sprintf("slide-%d", i+1)
		}
		if n.Title == "" && n.Eyebrow == "" && n.Subtitle == "" && n.CoverURL == "" {
			continue
		}
		out = append(out, n)
	}
	return out
}

func normalizePromoSlide(slide domain.DailyQuestPromoSlide) domain.DailyQuestPromoSlide {
	slide.ID = strings.TrimSpace(slide.ID)
	slide.Tone = strings.TrimSpace(slide.Tone)
	if slide.Tone != "duo" && slide.Tone != "open" {
		slide.Tone = "open"
	}
	slide.Eyebrow = strings.TrimSpace(slide.Eyebrow)
	slide.Title = strings.TrimSpace(slide.Title)
	slide.Subtitle = strings.TrimSpace(slide.Subtitle)
	slide.CTA = strings.TrimSpace(slide.CTA)
	if slide.CTA == "" {
		slide.CTA = "К заданиям"
	}
	slide.CTAColor = normalizePromoCTAColor(slide.CTAColor)
	slide.EyebrowColor = normalizePromoCTAColor(slide.EyebrowColor)
	slide.TitleColor = normalizePromoCTAColor(slide.TitleColor)
	slide.SubtitleColor = normalizePromoCTAColor(slide.SubtitleColor)
	slide.AccentColor = normalizePromoCTAColor(slide.AccentColor)
	slide.TitleSize = strings.ToLower(strings.TrimSpace(slide.TitleSize))
	switch slide.TitleSize {
	case "", "sm", "md", "lg":
	default:
		slide.TitleSize = "md"
	}
	slide.CoverURL = strings.TrimSpace(slide.CoverURL)
	return slide
}

func normalizePromoCTAColor(raw string) string {
	v := strings.TrimSpace(raw)
	if v == "" {
		return ""
	}
	if !strings.HasPrefix(v, "#") {
		v = "#" + v
	}
	if len(v) != 7 {
		return ""
	}
	for i := 1; i < 7; i++ {
		c := v[i]
		switch {
		case c >= '0' && c <= '9', c >= 'a' && c <= 'f', c >= 'A' && c <= 'F':
		default:
			return ""
		}
	}
	return strings.ToLower(v)
}

type AdminResetClaimsRequest struct {
	UserID     *uuid.UUID `json:"user_id"`
	TelegramID *int64     `json:"telegram_id"`
	DayMSK     *string    `json:"day_msk"`
}

type AdminResetClaimsResult struct {
	DayMSK        string     `json:"day_msk"`
	UserID        *uuid.UUID `json:"user_id,omitempty"`
	DeletedClaims int64      `json:"deleted_claims"`
}

func (s *Service) AdminResetClaims(ctx context.Context, req AdminResetClaimsRequest) (*AdminResetClaimsResult, error) {
	dayStart, _ := staking.CurrentEpochBounds(time.Now())
	dayMSK := dayStart.In(staking.MoscowLocation())
	dayDate := time.Date(dayMSK.Year(), dayMSK.Month(), dayMSK.Day(), 0, 0, 0, 0, staking.MoscowLocation())
	if req.DayMSK != nil {
		parsed, err := parseDatePtr(req.DayMSK)
		if err != nil || parsed == nil {
			return nil, domain.ErrInvalidAmount
		}
		dayDate = *parsed
	}

	var userID *uuid.UUID
	switch {
	case req.UserID != nil && *req.UserID != uuid.Nil:
		u, err := s.users.FindByID(ctx, *req.UserID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, domain.ErrNotFound
			}
			return nil, err
		}
		id := u.ID
		userID = &id
	case req.TelegramID != nil && *req.TelegramID > 0:
		u, err := s.users.FindByTelegramID(ctx, *req.TelegramID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, domain.ErrNotFound
			}
			return nil, err
		}
		id := u.ID
		userID = &id
	}

	deleted, err := s.quests.ResetClaimsForDay(ctx, dayDate, userID)
	if err != nil {
		return nil, err
	}

	// Progress is derived from case opens / referrals since day start — shift the watermark
	// so admin reset also zeroes counters, not only claim eligibility.
	now := time.Now().UTC()
	if userID != nil {
		if err := s.quests.UpsertProgressBaseline(ctx, *userID, dayDate, now); err != nil {
			return nil, err
		}
	} else if err := s.quests.SetBoardProgressEpoch(ctx, now); err != nil {
		return nil, err
	}

	return &AdminResetClaimsResult{
		DayMSK:        dayDate.Format("2006-01-02"),
		UserID:        userID,
		DeletedClaims: deleted,
	}, nil
}

type AdminQuestPeriodView struct {
	TaskClaims             int64   `json:"task_claims"`
	BonusClaims            int64   `json:"bonus_claims"`
	UniqueClaimers         int64   `json:"unique_claimers"`
	TaskClaimers           int64   `json:"task_claimers"`
	BonusClaimers          int64   `json:"bonus_claimers"`
	BonusCompletionBPS     int     `json:"bonus_completion_bps"`
	RewardNanotonTotal     int64   `json:"reward_nanoton_total"`
	BalanceRewardNanoton   int64   `json:"balance_reward_nanoton"`
	GiftRewardNanoton      int64   `json:"gift_reward_nanoton"`
	FreeCaseClaims         int64   `json:"free_case_claims"`
	EntitlementsGranted    int64   `json:"entitlements_granted"`
	EntitlementsUsed       int64   `json:"entitlements_used"`
	EntitlementsAvailable  int64   `json:"entitlements_available"`
	EntitlementRedeemBPS   int     `json:"entitlement_redeem_bps"`
	QuestOpens             int64   `json:"quest_opens"`
	QuestOpenUsers         int64   `json:"quest_open_users"`
	QuestPrizeTotalNanoton int64   `json:"quest_prize_total_nanoton"`
	PlatformCostNanoton    int64   `json:"platform_cost_nanoton"`
}

type AdminQuestByQuestView struct {
	QuestID            uuid.UUID `json:"quest_id"`
	Title              string    `json:"title"`
	Active             bool      `json:"active"`
	SortOrder          int       `json:"sort_order"`
	TaskClaims         int64     `json:"task_claims"`
	UniqueUsers        int64     `json:"unique_users"`
	RewardNanotonTotal int64     `json:"reward_nanoton_total"`
	RewardType         string    `json:"reward_type"`
}

type AdminQuestByRewardView struct {
	RewardType         string `json:"reward_type"`
	Claims             int64  `json:"claims"`
	UniqueUsers        int64  `json:"unique_users"`
	RewardNanotonTotal int64  `json:"reward_nanoton_total"`
}

type AdminQuestDailyView struct {
	DayMSK             string `json:"day_msk"`
	TaskClaims         int64  `json:"task_claims"`
	BonusClaims        int64  `json:"bonus_claims"`
	UniqueClaimers     int64  `json:"unique_claimers"`
	RewardNanotonTotal int64  `json:"reward_nanoton_total"`
}

type AdminQuestStatsView struct {
	Timezone       string                   `json:"timezone"`
	Today          AdminQuestPeriodView     `json:"today"`
	Last7Days      AdminQuestPeriodView     `json:"last_7_days"`
	Last30Days     AdminQuestPeriodView     `json:"last_30_days"`
	AllTime        AdminQuestPeriodView     `json:"all_time"`
	ByQuestToday   []AdminQuestByQuestView  `json:"by_quest_today"`
	ByQuest7d      []AdminQuestByQuestView  `json:"by_quest_7d"`
	ByQuest30d     []AdminQuestByQuestView  `json:"by_quest_30d"`
	ByQuestAllTime []AdminQuestByQuestView  `json:"by_quest_all_time"`
	ByReward7d     []AdminQuestByRewardView `json:"by_reward_7d"`
	ByRewardAllTime []AdminQuestByRewardView `json:"by_reward_all_time"`
	ClaimsByDay    []AdminQuestDailyView    `json:"claims_by_day"`
}

func (s *Service) AdminQuestStats(ctx context.Context) (*AdminQuestStatsView, error) {
	msk := staking.MoscowLocation()
	now := time.Now().In(msk)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, msk)
	since7d := today.AddDate(0, 0, -6)
	since30d := today.AddDate(0, 0, -29)
	since14d := today.AddDate(0, 0, -13)

	todayUTC := today.UTC()
	since7dUTC := since7d.UTC()
	since30dUTC := since30d.UTC()

	todayPeriod, err := s.buildQuestPeriod(ctx, today, todayUTC)
	if err != nil {
		return nil, err
	}
	weekPeriod, err := s.buildQuestPeriod(ctx, since7d, since7dUTC)
	if err != nil {
		return nil, err
	}
	monthPeriod, err := s.buildQuestPeriod(ctx, since30d, since30dUTC)
	if err != nil {
		return nil, err
	}
	allPeriod, err := s.buildQuestPeriod(ctx, time.Time{}, time.Time{})
	if err != nil {
		return nil, err
	}

	byToday, err := s.quests.ClaimsByQuest(ctx, today)
	if err != nil {
		return nil, err
	}
	by7d, err := s.quests.ClaimsByQuest(ctx, since7d)
	if err != nil {
		return nil, err
	}
	by30d, err := s.quests.ClaimsByQuest(ctx, since30d)
	if err != nil {
		return nil, err
	}
	byAll, err := s.quests.ClaimsByQuest(ctx, time.Time{})
	if err != nil {
		return nil, err
	}

	reward7d, err := s.quests.ClaimsByRewardType(ctx, since7d)
	if err != nil {
		return nil, err
	}
	rewardAll, err := s.quests.ClaimsByRewardType(ctx, time.Time{})
	if err != nil {
		return nil, err
	}

	dailyRows, err := s.quests.ClaimsByDayMSK(ctx, since14d)
	if err != nil {
		return nil, err
	}
	byDayMap := make(map[string]domain.DailyQuestClaimsDailyStats, len(dailyRows))
	for _, row := range dailyRows {
		byDayMap[row.DayMSK] = row
	}
	claimsByDay := make([]AdminQuestDailyView, 0, 14)
	for i := 0; i < 14; i++ {
		d := since14d.AddDate(0, 0, i)
		key := d.Format("2006-01-02")
		row := byDayMap[key]
		claimsByDay = append(claimsByDay, AdminQuestDailyView{
			DayMSK:             key,
			TaskClaims:         row.TaskClaims,
			BonusClaims:        row.BonusClaims,
			UniqueClaimers:     row.UniqueClaimers,
			RewardNanotonTotal: row.RewardNanotonTotal,
		})
	}

	return &AdminQuestStatsView{
		Timezone:        "Europe/Moscow",
		Today:           todayPeriod,
		Last7Days:       weekPeriod,
		Last30Days:      monthPeriod,
		AllTime:         allPeriod,
		ByQuestToday:    mapQuestByQuest(byToday),
		ByQuest7d:       mapQuestByQuest(by7d),
		ByQuest30d:      mapQuestByQuest(by30d),
		ByQuestAllTime:  mapQuestByQuest(byAll),
		ByReward7d:      mapQuestByReward(reward7d),
		ByRewardAllTime: mapQuestByReward(rewardAll),
		ClaimsByDay:     claimsByDay,
	}, nil
}

func (s *Service) buildQuestPeriod(ctx context.Context, sinceDayMSK, sinceUTC time.Time) (AdminQuestPeriodView, error) {
	claims, err := s.quests.ClaimPeriodStats(ctx, sinceDayMSK)
	if err != nil {
		return AdminQuestPeriodView{}, err
	}
	ents, err := s.quests.EntitlementStats(ctx, sinceUTC)
	if err != nil {
		return AdminQuestPeriodView{}, err
	}
	opens, err := s.quests.QuestCaseOpenStats(ctx, sinceUTC)
	if err != nil {
		return AdminQuestPeriodView{}, err
	}

	bonusBPS := 0
	if claims.TaskClaimers > 0 {
		bonusBPS = int((claims.BonusClaimers * 10000) / claims.TaskClaimers)
	}
	redeemBPS := 0
	if ents.Granted > 0 {
		redeemBPS = int((ents.Used * 10000) / ents.Granted)
	}

	// Liability: TON/gift valuations on claims + prize value of quest case opens.
	// Free-case claim rows usually have reward_nanoton=0; cost appears when opened.
	platformCost := claims.BalanceRewardNanoton + claims.GiftRewardNanoton + opens.PrizeTotalNanoton

	return AdminQuestPeriodView{
		TaskClaims:             claims.TaskClaims,
		BonusClaims:            claims.BonusClaims,
		UniqueClaimers:         claims.UniqueClaimers,
		TaskClaimers:           claims.TaskClaimers,
		BonusClaimers:          claims.BonusClaimers,
		BonusCompletionBPS:     bonusBPS,
		RewardNanotonTotal:     claims.RewardNanotonTotal,
		BalanceRewardNanoton:   claims.BalanceRewardNanoton,
		GiftRewardNanoton:      claims.GiftRewardNanoton,
		FreeCaseClaims:         claims.FreeCaseClaims,
		EntitlementsGranted:    ents.Granted,
		EntitlementsUsed:       ents.Used,
		EntitlementsAvailable:  ents.Available,
		EntitlementRedeemBPS:   redeemBPS,
		QuestOpens:             opens.Opens,
		QuestOpenUsers:         opens.UniqueUsers,
		QuestPrizeTotalNanoton: opens.PrizeTotalNanoton,
		PlatformCostNanoton:    platformCost,
	}, nil
}

func mapQuestByQuest(rows []domain.DailyQuestClaimByQuestStats) []AdminQuestByQuestView {
	out := make([]AdminQuestByQuestView, 0, len(rows))
	for _, row := range rows {
		out = append(out, AdminQuestByQuestView{
			QuestID:            row.QuestID,
			Title:              row.Title,
			Active:             row.Active,
			SortOrder:          row.SortOrder,
			TaskClaims:         row.TaskClaims,
			UniqueUsers:        row.UniqueUsers,
			RewardNanotonTotal: row.RewardNanotonTotal,
			RewardType:         row.RewardType,
		})
	}
	return out
}

func mapQuestByReward(rows []domain.DailyQuestClaimByRewardStats) []AdminQuestByRewardView {
	out := make([]AdminQuestByRewardView, 0, len(rows))
	for _, row := range rows {
		out = append(out, AdminQuestByRewardView{
			RewardType:         row.RewardType,
			Claims:             row.Claims,
			UniqueUsers:        row.UniqueUsers,
			RewardNanotonTotal: row.RewardNanotonTotal,
		})
	}
	return out
}
