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
	users     domain.UserRepository
	inventory domain.InventoryRepository
	balance   *balance.Service
	admin     AdminQuestNotifier
}

func NewService(
	quests domain.DailyQuestRepository,
	cases domain.CaseRepository,
	users domain.UserRepository,
	inventory domain.InventoryRepository,
	balanceSvc *balance.Service,
) *Service {
	return &Service{quests: quests, cases: cases, users: users, inventory: inventory, balance: balanceSvc}
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
	Target             int        `json:"target"`
	Progress           int        `json:"progress"`
	Status             string     `json:"status"` // active | ready | claimed
	Action             string     `json:"action"` // cases | referrals | claim | none
	ObjectiveCaseID    *uuid.UUID `json:"objective_case_id,omitempty"`
	ObjectiveCaseSlug  string     `json:"objective_case_slug,omitempty"`
	ObjectiveCaseTitle string     `json:"objective_case_title,omitempty"`
	Reward             RewardView `json:"reward"`
}

type BonusView struct {
	Title          string     `json:"title"`
	Description    string     `json:"description"`
	CompletedCount int        `json:"completed_count"`
	TotalCount     int        `json:"total_count"`
	Status         string     `json:"status"` // disabled | locked | ready | claimed
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
	for _, q := range tasks {
		progress, err := s.progress(ctx, userID, q, dayStart)
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
			status = "ready"
			action = "claim"
			completed++
		}
		reward, err := s.rewardView(ctx, rewardSpecFromQuest(q))
		if err != nil {
			return nil, err
		}
		view := TaskView{
			ID:          q.ID,
			Title:       q.Title,
			Description: q.Description,
			Objective:   q.ObjectiveType,
			Target:      q.ObjectiveTarget,
			Progress:    minInt(progress, q.ObjectiveTarget),
			Status:      status,
			Action:      action,
			Reward:      reward,
		}
		if q.ObjectiveType == domain.DailyQuestObjectiveOpenCases && q.ObjectiveCaseID != nil {
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
	s.notifyClaim(ctx, userID, false, q.Title, result.Reward)
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
	for _, q := range tasks {
		progress, err := s.progress(ctx, userID, q, dayStart)
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

func (s *Service) progress(ctx context.Context, userID uuid.UUID, q domain.DailyQuest, dayStartUTC time.Time) (int, error) {
	switch q.ObjectiveType {
	case domain.DailyQuestObjectiveOpenCases:
		n, err := s.cases.CountPaidOpensSince(ctx, userID, dayStartUTC, q.ObjectiveCaseID)
		return int(n), err
	case domain.DailyQuestObjectiveInviteReferrals:
		n, err := s.users.CountReferralsSince(ctx, userID, dayStartUTC)
		return int(n), err
	default:
		return 0, nil
	}
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
	case domain.DailyQuestObjectiveOpenCases:
		return "cases"
	case domain.DailyQuestObjectiveInviteReferrals:
		return "referrals"
	default:
		return "none"
	}
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
	case domain.DailyQuestObjectiveOpenCases:
		// ObjectiveCaseID optional: nil = any paid case open.
	case domain.DailyQuestObjectiveInviteReferrals:
		q.ObjectiveCaseID = nil
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
	}
}

func normalizeBoardRewardFields(settings *domain.DailyQuestBoardSettings) {
	settings.BonusRewardCollectionSlug = strings.TrimSpace(settings.BonusRewardCollectionSlug)
	settings.BonusRewardModelName = strings.TrimSpace(settings.BonusRewardModelName)
	settings.BonusRewardGiftName = strings.TrimSpace(settings.BonusRewardGiftName)
	settings.BonusRewardGiftImageURL = strings.TrimSpace(settings.BonusRewardGiftImageURL)
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

func minInt(a, b int) int {
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
	ObjectiveTarget      int        `json:"objective_target"`
	ObjectiveCaseID      *uuid.UUID `json:"objective_case_id"`
	RewardType           string     `json:"reward_type"`
	RewardNanoton        int64      `json:"reward_nanoton"`
	RewardCaseID         *uuid.UUID `json:"reward_case_id"`
	RewardCollectionSlug string     `json:"reward_collection_slug"`
	RewardModelName      string     `json:"reward_model_name"`
	RewardGiftName       string     `json:"reward_gift_name"`
	RewardGiftImageURL   string     `json:"reward_gift_image_url"`
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
		ObjectiveCaseID:      req.ObjectiveCaseID,
		RewardType:           req.RewardType,
		RewardNanoton:        req.RewardNanoton,
		RewardCaseID:         req.RewardCaseID,
		RewardCollectionSlug: req.RewardCollectionSlug,
		RewardModelName:      req.RewardModelName,
		RewardGiftName:       req.RewardGiftName,
		RewardGiftImageURL:   req.RewardGiftImageURL,
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
	return s.quests.GetBoardSettings(ctx)
}

func (s *Service) AdminUpdateBoard(ctx context.Context, settings *domain.DailyQuestBoardSettings) error {
	settings.BonusTitle = strings.TrimSpace(settings.BonusTitle)
	settings.BonusDescription = strings.TrimSpace(settings.BonusDescription)
	if settings.BonusTitle == "" {
		settings.BonusTitle = "Бонус дня"
	}
	normalizeBoardRewardFields(settings)
	if settings.BonusActive {
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
	return &AdminResetClaimsResult{
		DayMSK:        dayDate.Format("2006-01-02"),
		UserID:        userID,
		DeletedClaims: deleted,
	}, nil
}
