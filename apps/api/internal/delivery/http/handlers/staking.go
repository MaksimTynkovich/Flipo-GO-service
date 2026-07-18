package handlers

import (
	"context"
	"errors"
	"net/http"

	"github.com/flipo/flipo/apps/api/internal/delivery/http/middleware"
	"github.com/flipo/flipo/apps/api/internal/domain"
	analyticsuc "github.com/flipo/flipo/apps/api/internal/usecase/analytics"
	"github.com/flipo/flipo/apps/api/internal/usecase/staking"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type StakingHandler struct {
	staking   *staking.Service
	analytics *analyticsuc.Service
}

func NewStakingHandler(svc *staking.Service, analyticsSvc *analyticsuc.Service) *StakingHandler {
	return &StakingHandler{staking: svc, analytics: analyticsSvc}
}

func (h *StakingHandler) ListProfileGifts(c *gin.Context) {
	userID := middleware.GetUserID(c)
	resp, err := h.staking.ListProfileGifts(c.Request.Context(), userID)
	if err != nil {
		respondInternal(c, err)
		return
	}
	trackStakingGiftsValued(h.analytics, c.Request.Context(), userID, resp)
	c.JSON(http.StatusOK, resp)
}

const maxStakingGiftSnapshot = 40

func trackStakingGiftsValued(analyticsSvc *analyticsuc.Service, ctx context.Context, userID uuid.UUID, resp *staking.ProfileGiftsResponse) {
	if resp == nil {
		return
	}
	profileGifts := make([]map[string]any, 0, len(resp.Gifts))
	var profileValuation, unstakedProfileValuation int64
	profileCount, unstakedProfileCount := 0, 0
	for _, g := range resp.Gifts {
		if g.Source != string(domain.StakingSourceProfile) {
			continue
		}
		profileCount++
		profileValuation += g.PriceNanoton
		if !g.IsStaked {
			unstakedProfileCount++
			unstakedProfileValuation += g.PriceNanoton
		}
		if len(profileGifts) >= maxStakingGiftSnapshot {
			continue
		}
		profileGifts = append(profileGifts, map[string]any{
			"slug":             g.Slug,
			"name":             g.Name,
			"collection_slug":  g.CollectionSlug,
			"price_nanoton":    g.PriceNanoton,
			"is_staked":        g.IsStaked,
			"daily_yield_nanoton": g.DailyYieldNanoton,
		})
	}
	trackUserEvent(analyticsSvc, ctx, userID, "staking", "staking_gifts_valued", "success", "", "", map[string]any{
		"total_count":                   resp.Stats.TotalCount,
		"staked_count":                  resp.Stats.StakedCount,
		"profile_gift_count":            profileCount,
		"unstaked_profile_count":        unstakedProfileCount,
		"profile_valuation_nanoton":     profileValuation,
		"unstaked_profile_valuation_nanoton": unstakedProfileValuation,
		"unlockable_monthly_nanoton":    resp.Stats.UnlockableMonthlyNanoton,
		"gifts":                         profileGifts,
		"gifts_truncated":               profileCount > len(profileGifts),
	})
}

func (h *StakingHandler) Stake(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		ItemID string `json:"item_id"`
		Slug   string `json:"slug"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var pos interface{}
	var err error

	switch {
	case req.Slug != "":
		pos, err = h.staking.StakeBySlug(c.Request.Context(), userID, req.Slug)
	case req.ItemID != "":
		itemID, parseErr := uuid.Parse(req.ItemID)
		if parseErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID предмета"})
			return
		}
		pos, err = h.staking.Stake(c.Request.Context(), userID, itemID)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Укажите slug или item_id"})
		return
	}

	if err != nil {
		code, msg := stakingErrorDetails(err)
		trackUserEvent(h.analytics, c.Request.Context(), userID, "staking", "staking_started", "error", code, msg, map[string]any{"slug": req.Slug, "item_id": req.ItemID})
		writeStakingError(c, err)
		return
	}
	trackUserEvent(h.analytics, c.Request.Context(), userID, "staking", "staking_started", "success", "", "", map[string]any{"slug": req.Slug, "item_id": req.ItemID})
	c.JSON(http.StatusCreated, pos)
}

func (h *StakingHandler) Unstake(c *gin.Context) {
	userID := middleware.GetUserID(c)
	posID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID"})
		return
	}
	if err := h.staking.Unstake(c.Request.Context(), userID, posID); err != nil {
		trackUserEvent(h.analytics, c.Request.Context(), userID, "staking", "staking_unstake_requested", "error", "unstake_failed", err.Error(), map[string]any{"position_id": posID.String()})
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	trackUserEvent(h.analytics, c.Request.Context(), userID, "staking", "staking_unstake_requested", "success", "", "", map[string]any{"position_id": posID.String()})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *StakingHandler) ListPositions(c *gin.Context) {
	userID := middleware.GetUserID(c)
	positions, err := h.staking.ListPositions(c.Request.Context(), userID)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, positions)
}

func writeStakingError(c *gin.Context, err error) {
	code, msg := stakingErrorDetails(err)
	respondBadRequest(c, err, msg, code)
}

func stakingErrorDetails(err error) (code, msg string) {
	switch {
	case errors.Is(err, domain.ErrStakingPoolFull):
		return "staking_pool_full", "Пул стейкинга заполнен. Попробуйте позже."
	case errors.Is(err, domain.ErrStakingPersonalLimit):
		return "staking_personal_limit", "Личный лимит исчерпан — выполните задания, чтобы увеличить его."
	case errors.Is(err, domain.ErrGiftAlreadyStakedEpoch):
		return "gift_already_staked", "Подарок уже в стейке на этой неделе."
	case errors.Is(err, domain.ErrInvalidAmount):
		return "invalid_stake", "Подарок недоступен для стейкинга."
	case errors.Is(err, domain.ErrNotFound):
		return "not_found", "Подарок не найден."
	default:
		msg := err.Error()
		if msg == "" {
			msg = "Не удалось застейкать подарок. Попробуйте ещё раз."
		}
		return "stake_failed", msg
	}
}

func (h *StakingHandler) ListQuests(c *gin.Context) {
	userID := middleware.GetUserID(c)
	resp, err := h.staking.ListQuests(c.Request.Context(), userID)
	if err != nil {
		respondInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}
