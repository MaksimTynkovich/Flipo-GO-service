package postgres

import (
	"context"
	"sort"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type CampaignRepo struct {
	db                      *gorm.DB
	excludeAdminTelegramIDs []int64
}

func NewCampaignRepo(db *gorm.DB) *CampaignRepo {
	return &CampaignRepo{db: db}
}

func (r *CampaignRepo) SetExcludeAdminTelegramIDs(ids []int64) {
	r.excludeAdminTelegramIDs = append([]int64(nil), ids...)
}

func (r *CampaignRepo) Create(ctx context.Context, campaign *domain.Campaign) error {
	return r.db.WithContext(ctx).Create(campaign).Error
}

func (r *CampaignRepo) Update(ctx context.Context, campaign *domain.Campaign) error {
	campaign.UpdatedAt = time.Now().UTC()
	return r.db.WithContext(ctx).Model(&domain.Campaign{}).
		Where("id = ?", campaign.ID).
		Updates(map[string]any{
			"name":       campaign.Name,
			"source":     campaign.Source,
			"content":    campaign.Content,
			"landing":    campaign.Landing,
			"status":     campaign.Status,
			"updated_at": campaign.UpdatedAt,
		}).Error
}

func (r *CampaignRepo) FindByID(ctx context.Context, id uuid.UUID) (*domain.Campaign, error) {
	var row domain.Campaign
	if err := r.db.WithContext(ctx).First(&row, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *CampaignRepo) FindByCode(ctx context.Context, code string) (*domain.Campaign, error) {
	code = strings.ToLower(strings.TrimSpace(code))
	if code == "" {
		return nil, gorm.ErrRecordNotFound
	}
	var row domain.Campaign
	if err := r.db.WithContext(ctx).Where("code = ?", code).First(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *CampaignRepo) List(ctx context.Context) ([]domain.Campaign, error) {
	var rows []domain.Campaign
	err := r.db.WithContext(ctx).Order("created_at DESC").Find(&rows).Error
	return rows, err
}

func (r *CampaignRepo) Stats(ctx context.Context, filter domain.CampaignStatsFilter) ([]domain.CampaignStats, error) {
	q := r.db.WithContext(ctx).Model(&domain.Campaign{})
	if src := strings.TrimSpace(filter.Source); src != "" {
		q = q.Where("source = ?", src)
	}
	var campaigns []domain.Campaign
	if err := q.Order("created_at DESC").Find(&campaigns).Error; err != nil {
		return nil, err
	}
	if len(campaigns) == 0 {
		return []domain.CampaignStats{}, nil
	}

	ids := make([]uuid.UUID, 0, len(campaigns))
	params := make([]string, 0, len(campaigns))
	paramByID := make(map[uuid.UUID]string, len(campaigns))
	for _, c := range campaigns {
		ids = append(ids, c.ID)
		payload := "c_" + c.Code
		params = append(params, payload)
		paramByID[c.ID] = payload
	}

	from, to := filter.From, filter.To
	if to.IsZero() {
		to = time.Now().UTC()
	}
	if from.IsZero() {
		from = to.AddDate(0, 0, -30)
	}

	adminFilterEvents := ""
	adminFilterUsers := ""
	argsEvents := []any{params, from, to}
	argsUsers := []any{ids, from, to}
	if len(r.excludeAdminTelegramIDs) > 0 {
		adminFilterEvents = " AND (telegram_id IS NULL OR telegram_id NOT IN ?)"
		adminFilterUsers = " AND telegram_id NOT IN ?"
		argsEvents = append(argsEvents, r.excludeAdminTelegramIDs)
		argsUsers = append(argsUsers, r.excludeAdminTelegramIDs)
	}

	clickMap := map[string]int64{}
	var clickRows []struct {
		StartParam string `gorm:"column:start_param"`
		Clicks     int64  `gorm:"column:clicks"`
	}
	_ = r.db.WithContext(ctx).Raw(`
		SELECT start_param, COUNT(DISTINCT telegram_id) AS clicks
		FROM analytics_events
		WHERE event_name = 'bot_start'
		  AND start_param IN ?
		  AND occurred_at >= ? AND occurred_at < ?`+adminFilterEvents+`
		GROUP BY start_param
	`, argsEvents...).Scan(&clickRows)
	for _, row := range clickRows {
		clickMap[row.StartParam] = row.Clicks
	}

	openMap := map[string]int64{}
	var openRows []struct {
		StartParam string `gorm:"column:start_param"`
		Opens      int64  `gorm:"column:opens"`
	}
	_ = r.db.WithContext(ctx).Raw(`
		SELECT start_param, COUNT(DISTINCT telegram_id) AS opens
		FROM analytics_events
		WHERE event_name IN ('auth_succeeded', 'session_started')
		  AND start_param IN ?
		  AND occurred_at >= ? AND occurred_at < ?`+adminFilterEvents+`
		GROUP BY start_param
	`, argsEvents...).Scan(&openRows)
	for _, row := range openRows {
		openMap[row.StartParam] = row.Opens
	}

	userMap := map[uuid.UUID]int64{}
	var userRows []struct {
		CampaignID uuid.UUID `gorm:"column:campaign_id"`
		Count      int64     `gorm:"column:cnt"`
	}
	_ = r.db.WithContext(ctx).Raw(`
		SELECT campaign_id, COUNT(*) AS cnt
		FROM users
		WHERE deleted_at IS NULL
		  AND campaign_id IN ?
		  AND created_at >= ? AND created_at < ?`+adminFilterUsers+`
		GROUP BY campaign_id
	`, argsUsers...).Scan(&userRows)
	for _, row := range userRows {
		userMap[row.CampaignID] = row.Count
	}

	depositArgs := []any{ids, from, to, from, to, ids, from, to, from, to}
	if len(r.excludeAdminTelegramIDs) > 0 {
		depositArgs = append(depositArgs, r.excludeAdminTelegramIDs)
	}
	depositMap := map[uuid.UUID]struct{ Depositors, Deposits int64 }{}
	var depositRows []struct {
		CampaignID uuid.UUID `gorm:"column:campaign_id"`
		Depositors int64     `gorm:"column:depositors"`
		Deposits   int64     `gorm:"column:deposits"`
	}
	_ = r.db.WithContext(ctx).Raw(`
		SELECT u.campaign_id AS campaign_id,
		       COUNT(DISTINCT d.user_id) AS depositors,
		       COALESCE(SUM(d.amount), 0) AS deposits
		FROM (
			SELECT t.user_id, t.amount_nanoton AS amount
			FROM ton_transfers t
			JOIN users u ON u.id = t.user_id AND u.deleted_at IS NULL
			WHERE t.direction = 'deposit' AND t.status = 'completed'
			  AND u.campaign_id IN ?
			  AND u.created_at >= ? AND u.created_at < ?
			  AND t.updated_at >= ? AND t.updated_at < ?
			UNION ALL
			SELECT p.user_id, p.amount_nanoton AS amount
			FROM payment_intents p
			JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL
			WHERE p.status = 'paid'
			  AND u.campaign_id IN ?
			  AND u.created_at >= ? AND u.created_at < ?
			  AND p.paid_at >= ? AND p.paid_at < ?
		) d
		JOIN users u ON u.id = d.user_id AND u.deleted_at IS NULL
		WHERE TRUE`+adminFilterUsers+`
		GROUP BY u.campaign_id
	`, depositArgs...).Scan(&depositRows)
	for _, row := range depositRows {
		depositMap[row.CampaignID] = struct{ Depositors, Deposits int64 }{row.Depositors, row.Deposits}
	}

	betArgs := []any{ids, from, to, from, to}
	if len(r.excludeAdminTelegramIDs) > 0 {
		betArgs = append(betArgs, r.excludeAdminTelegramIDs)
	}
	betMap := map[uuid.UUID]struct{ Bettors, Volume, GGR int64 }{}
	var betRows []struct {
		CampaignID uuid.UUID `gorm:"column:campaign_id"`
		Bettors    int64     `gorm:"column:bettors"`
		Volume     int64     `gorm:"column:volume"`
		GGR        int64     `gorm:"column:ggr"`
	}
	_ = r.db.WithContext(ctx).Raw(`
		SELECT u.campaign_id AS campaign_id,
		       COUNT(DISTINCT b.user_id) AS bettors,
		       COALESCE(SUM(b.amount_nanoton), 0) AS volume,
		       COALESCE(SUM(b.amount_nanoton), 0) - COALESCE(SUM(b.payout_nanoton), 0) AS ggr
		FROM game_bets b
		JOIN users u ON u.id = b.user_id AND u.deleted_at IS NULL
		WHERE u.campaign_id IN ?
		  AND u.created_at >= ? AND u.created_at < ?
		  AND b.created_at >= ? AND b.created_at < ?`+adminFilterUsers+`
		GROUP BY u.campaign_id
	`, betArgs...).Scan(&betRows)
	for _, row := range betRows {
		betMap[row.CampaignID] = struct{ Bettors, Volume, GGR int64 }{row.Bettors, row.Volume, row.GGR}
	}

	out := make([]domain.CampaignStats, 0, len(campaigns))
	for _, c := range campaigns {
		payload := paramByID[c.ID]
		row := domain.CampaignStats{Campaign: c, StartParam: payload}
		row.Clicks = clickMap[payload]
		row.AppOpens = openMap[payload]
		row.NewUsers = userMap[c.ID]
		if d, ok := depositMap[c.ID]; ok {
			row.Depositors = d.Depositors
			row.DepositsNanoton = d.Deposits
		}
		if b, ok := betMap[c.ID]; ok {
			row.Bettors = b.Bettors
			row.BetVolumeNanoton = b.Volume
			row.GGRNanoton = b.GGR
		}
		out = append(out, row)
	}
	return out, nil
}

func (r *CampaignRepo) Daily(ctx context.Context, campaignID uuid.UUID, from, to time.Time) ([]domain.CampaignDailyPoint, error) {
	campaign, err := r.FindByID(ctx, campaignID)
	if err != nil {
		return nil, err
	}
	payload := "c_" + campaign.Code
	if to.IsZero() {
		to = time.Now().UTC()
	}
	if from.IsZero() {
		from = to.AddDate(0, 0, -30)
	}

	adminFilterEvents := ""
	adminFilterUsers := ""
	eventArgs := []any{payload, from, to}
	userArgs := []any{campaignID, from, to}
	if len(r.excludeAdminTelegramIDs) > 0 {
		adminFilterEvents = " AND (telegram_id IS NULL OR telegram_id NOT IN ?)"
		adminFilterUsers = " AND telegram_id NOT IN ?"
		eventArgs = append(eventArgs, r.excludeAdminTelegramIDs)
		userArgs = append(userArgs, r.excludeAdminTelegramIDs)
	}

	type dayCount struct {
		Day   time.Time `gorm:"column:day"`
		Count int64     `gorm:"column:cnt"`
	}
	merge := map[string]*domain.CampaignDailyPoint{}
	ensure := func(day time.Time) *domain.CampaignDailyPoint {
		key := day.UTC().Format("2006-01-02")
		if p, ok := merge[key]; ok {
			return p
		}
		p := &domain.CampaignDailyPoint{Date: key}
		merge[key] = p
		return p
	}

	var clicks []dayCount
	_ = r.db.WithContext(ctx).Raw(`
		SELECT date_trunc('day', occurred_at) AS day, COUNT(DISTINCT telegram_id) AS cnt
		FROM analytics_events
		WHERE event_name = 'bot_start' AND start_param = ?
		  AND occurred_at >= ? AND occurred_at < ?`+adminFilterEvents+`
		GROUP BY 1
	`, eventArgs...).Scan(&clicks)
	for _, row := range clicks {
		ensure(row.Day).Clicks = row.Count
	}

	var opens []dayCount
	_ = r.db.WithContext(ctx).Raw(`
		SELECT date_trunc('day', occurred_at) AS day, COUNT(DISTINCT telegram_id) AS cnt
		FROM analytics_events
		WHERE event_name IN ('auth_succeeded', 'session_started') AND start_param = ?
		  AND occurred_at >= ? AND occurred_at < ?`+adminFilterEvents+`
		GROUP BY 1
	`, eventArgs...).Scan(&opens)
	for _, row := range opens {
		ensure(row.Day).AppOpens = row.Count
	}

	var users []dayCount
	_ = r.db.WithContext(ctx).Raw(`
		SELECT date_trunc('day', created_at) AS day, COUNT(*) AS cnt
		FROM users
		WHERE deleted_at IS NULL AND campaign_id = ?
		  AND created_at >= ? AND created_at < ?`+adminFilterUsers+`
		GROUP BY 1
	`, userArgs...).Scan(&users)
	for _, row := range users {
		ensure(row.Day).NewUsers = row.Count
	}

	depositArgs := []any{campaignID, from, to, from, to, campaignID, from, to, from, to}
	if len(r.excludeAdminTelegramIDs) > 0 {
		depositArgs = append(depositArgs, r.excludeAdminTelegramIDs)
	}
	var deposits []struct {
		Day    time.Time `gorm:"column:day"`
		Amount int64     `gorm:"column:amount"`
	}
	_ = r.db.WithContext(ctx).Raw(`
		SELECT date_trunc('day', d.at) AS day, COALESCE(SUM(d.amount), 0) AS amount
		FROM (
			SELECT t.updated_at AS at, t.amount_nanoton AS amount, t.user_id
			FROM ton_transfers t
			JOIN users u ON u.id = t.user_id AND u.deleted_at IS NULL
			WHERE t.direction = 'deposit' AND t.status = 'completed'
			  AND u.campaign_id = ?
			  AND u.created_at >= ? AND u.created_at < ?
			  AND t.updated_at >= ? AND t.updated_at < ?
			UNION ALL
			SELECT p.paid_at AS at, p.amount_nanoton AS amount, p.user_id
			FROM payment_intents p
			JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL
			WHERE p.status = 'paid' AND p.paid_at IS NOT NULL
			  AND u.campaign_id = ?
			  AND u.created_at >= ? AND u.created_at < ?
			  AND p.paid_at >= ? AND p.paid_at < ?
		) d
		JOIN users u ON u.id = d.user_id AND u.deleted_at IS NULL
		WHERE TRUE`+adminFilterUsers+`
		GROUP BY 1
	`, depositArgs...).Scan(&deposits)
	for _, row := range deposits {
		ensure(row.Day).DepositsNanoton = row.Amount
	}

	fromDay := time.Date(from.UTC().Year(), from.UTC().Month(), from.UTC().Day(), 0, 0, 0, 0, time.UTC)
	out := make([]domain.CampaignDailyPoint, 0, len(merge))
	if to.Sub(fromDay) > 92*24*time.Hour {
		days := make([]string, 0, len(merge))
		for key := range merge {
			days = append(days, key)
		}
		sort.Strings(days)
		for _, key := range days {
			out = append(out, *merge[key])
		}
		return out, nil
	}
	for d := fromDay; d.Before(to); d = d.AddDate(0, 0, 1) {
		key := d.Format("2006-01-02")
		if p, ok := merge[key]; ok {
			out = append(out, *p)
			continue
		}
		out = append(out, domain.CampaignDailyPoint{Date: key})
	}
	return out, nil
}
