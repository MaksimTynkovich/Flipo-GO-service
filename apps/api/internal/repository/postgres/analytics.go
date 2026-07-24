package postgres

import (
	"context"
	"encoding/json"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type AnalyticsRepo struct {
	db *gorm.DB
}

func NewAnalyticsRepo(db *gorm.DB) *AnalyticsRepo {
	return &AnalyticsRepo{db: db}
}

func (r *AnalyticsRepo) RecordEvents(ctx context.Context, events []domain.AnalyticsEventCreate) error {
	if len(events) == 0 {
		return nil
	}
	rows := make([]domain.AnalyticsEvent, 0, len(events))
	now := time.Now().UTC()
	for _, event := range events {
		occurredAt := event.OccurredAt
		if occurredAt.IsZero() {
			occurredAt = now
		}
		rows = append(rows, domain.AnalyticsEvent{
			ID:             uuid.New(),
			UserID:         event.UserID,
			ReferrerID:     event.ReferrerID,
			TelegramID:     event.TelegramID,
			AnonymousID:    event.AnonymousID,
			SessionID:      event.SessionID,
			RequestID:      event.RequestID,
			Source:         event.Source,
			EventName:      event.EventName,
			EventCategory:  event.EventCategory,
			Path:           event.Path,
			Screen:         event.Screen,
			PreviousScreen: event.PreviousScreen,
			Method:         event.Method,
			Status:         event.Status,
			ErrorCode:      event.ErrorCode,
			ErrorMessage:   event.ErrorMessage,
			StartParam:     event.StartParam,
			StakingTier:    event.StakingTier,
			UserAgent:      event.UserAgent,
			IPAddress:      event.IPAddress,
			Properties:     event.Properties,
			OccurredAt:     occurredAt,
			CreatedAt:      now,
		})
	}
	return r.db.WithContext(ctx).Create(&rows).Error
}

func (r *AnalyticsRepo) GetOverview(ctx context.Context, since time.Time, filter domain.AnalyticsOverviewFilter) (*domain.AnalyticsOverview, error) {
	now := time.Now().UTC()
	if since.IsZero() {
		since = now.Add(-24 * time.Hour)
	}
	overview := &domain.AnalyticsOverview{
		VisitsByHour:       []domain.AnalyticsHourPoint{},
		VisitsByWeekday:    []domain.AnalyticsBucket{},
		SessionsPerUserDay: []domain.AnalyticsBucket{},
		SessionsByDay:      []domain.AnalyticsDailyPoint{},
	}

	r.db.WithContext(ctx).Model(&domain.AnalyticsEvent{}).
		Where("occurred_at >= ? AND user_id IS NOT NULL", since).
		Distinct("user_id").
		Count(&overview.DAU)

	r.db.WithContext(ctx).Model(&domain.AnalyticsEvent{}).
		Where("occurred_at >= ? AND user_id IS NOT NULL", now.Add(-7*24*time.Hour)).
		Distinct("user_id").
		Count(&overview.WAU)

	r.db.WithContext(ctx).Model(&domain.User{}).
		Where("created_at >= ?", since).
		Count(&overview.NewUsers)

	r.db.WithContext(ctx).Model(&domain.AnalyticsEvent{}).
		Where("occurred_at >= ?", since).
		Count(&overview.TotalEvents24h)

	if err := r.fillVisitStats(ctx, overview, since); err != nil {
		return nil, err
	}

	var err error
	if overview.TopSources, err = r.topBuckets(ctx, `
		SELECT COALESCE(NULLIF(properties->>'source', ''), event_name, 'unknown') AS name, COUNT(*) AS count
		FROM analytics_events
		WHERE occurred_at >= ? AND event_name IN ('referral_assigned', 'auth_succeeded', 'auth_debug_succeeded')
		GROUP BY 1
		ORDER BY count DESC
		LIMIT 6
	`, since); err != nil {
		return nil, err
	}
	if overview.TopScreens, err = r.topBuckets(ctx, `
		SELECT COALESCE(NULLIF(screen, ''), 'unknown') AS name, COUNT(*) AS count
		FROM analytics_events
		WHERE occurred_at >= ? AND event_name = 'screen_view'
		GROUP BY 1
		ORDER BY count DESC
		LIMIT 8
	`, since); err != nil {
		return nil, err
	}
	if overview.TopActions, err = r.topBuckets(ctx, `
		SELECT event_name AS name, COUNT(*) AS count
		FROM analytics_events
		WHERE occurred_at >= ? AND status = 'success' AND event_category IN ('auth','wallet','gameplay','pvp','market','inventory','staking','promo')
		GROUP BY 1
		ORDER BY count DESC
		LIMIT 8
	`, since); err != nil {
		return nil, err
	}
	if overview.TopFailures, err = r.topBuckets(ctx, `
		SELECT COALESCE(NULLIF(TRIM(error_message), ''), NULLIF(error_code, ''), event_name) AS name, COUNT(*) AS count
		FROM analytics_events
		WHERE occurred_at >= ? AND status = 'error'
		GROUP BY 1
		ORDER BY count DESC
		LIMIT 8
	`, since); err != nil {
		return nil, err
	}
	if overview.ModePopularity, err = r.topBuckets(ctx, `
		SELECT COALESCE(NULLIF(properties->>'mode', ''), screen, path, 'unknown') AS name, COUNT(*) AS count
		FROM analytics_events
		WHERE occurred_at >= ? AND (
			event_name = 'screen_view'
			OR properties ? 'mode'
		)
		GROUP BY 1
		ORDER BY count DESC
		LIMIT 8
	`, since); err != nil {
		return nil, err
	}
	if overview.ScreenExitRates, err = r.screenExitRates(ctx, since); err != nil {
		return nil, err
	}
	if overview.ErrorsByScreen, err = r.topBuckets(ctx, `
		SELECT COALESCE(NULLIF(screen, ''), 'unknown') AS name, COUNT(*) AS count
		FROM analytics_events
		WHERE occurred_at >= ? AND status = 'error'
		GROUP BY 1
		ORDER BY count DESC
		LIMIT 8
	`, since); err != nil {
		return nil, err
	}
	if overview.AvgTimeOnScreen, err = r.avgTimeOnScreen(ctx, since); err != nil {
		return nil, err
	}
	if overview.ExitPaths, err = r.topBuckets(ctx, `
		SELECT properties->>'journey_path' AS name, COUNT(*) AS count
		FROM analytics_events
		WHERE occurred_at >= ?
			AND event_name = 'screen_abandon'
			AND COALESCE(properties->>'journey_path', '') != ''
		GROUP BY 1
		ORDER BY count DESC
		LIMIT 8
	`, since); err != nil {
		return nil, err
	}
	if overview.EventsByDay, err = r.eventsByDay(ctx, since); err != nil {
		return nil, err
	}
	if overview.SessionsEndedAfterError, err = r.countDistinctSessions(ctx, since, "session_end_after_error"); err != nil {
		return nil, err
	}
	if overview.ErrorsBeforeExit, err = r.topBuckets(ctx, `
		SELECT COALESCE(NULLIF(properties->>'last_error_code', ''), NULLIF(error_code, ''), 'unknown') AS name, COUNT(*) AS count
		FROM analytics_events
		WHERE occurred_at >= ? AND event_name = 'session_end_after_error'
		GROUP BY 1
		ORDER BY count DESC
		LIMIT 8
	`, since); err != nil {
		return nil, err
	}
	if overview.TopInputAbandons, err = r.topBuckets(ctx, `
		SELECT COALESCE(NULLIF(properties->>'input_id', ''), 'unknown') AS name, COUNT(*) AS count
		FROM analytics_events
		WHERE occurred_at >= ? AND event_name = 'input_abandon'
		GROUP BY 1
		ORDER BY count DESC
		LIMIT 8
	`, since); err != nil {
		return nil, err
	}
	if overview.TopHesitations, err = r.topBuckets(ctx, `
		SELECT COALESCE(NULLIF(properties->>'modal_id', ''), NULLIF(properties->>'action_id', ''), NULLIF(properties->>'input_id', ''), event_name) AS name, COUNT(*) AS count
		FROM analytics_events
		WHERE occurred_at >= ? AND event_name IN ('disabled_click', 'modal_abandon', 'input_abandon')
		GROUP BY 1
		ORDER BY count DESC
		LIMIT 8
	`, since); err != nil {
		return nil, err
	}

	overview.Funnels = []domain.AnalyticsFunnel{
		{
			Name: "acquisition",
			Steps: r.funnelCounts(ctx, since, []string{
				"bot_start",
				"session_started",
				"auth_succeeded",
				"screen_view",
			}),
		},
		{
			Name: "onboarding",
			Steps: r.funnelCounts(ctx, since, []string{
				"bot_start",
				"session_started",
				"auth_succeeded",
				"deposit_intent_created",
				"deposit_confirmed",
				"roulette_bet_placed",
			}),
		},
		{
			Name: "engagement",
			Steps: r.funnelCounts(ctx, since, []string{
				"screen_view",
				"roulette_bet_placed",
				"crash_bet_placed",
				"pvp_room_created",
				"staking_started",
			}),
		},
		{
			Name: "deposit",
			Steps: r.funnelMixedCounts(ctx, since, []funnelStepQuery{
				{Screen: "/deposit", EventName: "screen_enter"},
				{EventName: "deposit_flow_viewed"},
				{EventName: "deposit_intent_created"},
				{EventName: "deposit_confirmed"},
			}),
		},
		{
			Name: "market",
			Steps: r.funnelMixedCounts(ctx, since, []funnelStepQuery{
				{Screen: "/market", EventName: "screen_enter"},
				{EventName: "modal_open", PropertyKey: "modal_id", PropertyValue: "market_gift_detail"},
				{EventName: "market_purchase_completed"},
			}),
		},
		{
			Name: "staking",
			Steps: r.funnelMixedCounts(ctx, since, []funnelStepQuery{
				{EventName: "staking_flow_viewed"},
				{EventName: "staking_gifts_valued"},
				{EventName: "staking_started"},
				{EventName: "staking_yield_paid"},
			}),
		},
	}
	if overview.TopSources == nil {
		overview.TopSources = []domain.AnalyticsBucket{}
	}
	if overview.TopScreens == nil {
		overview.TopScreens = []domain.AnalyticsBucket{}
	}
	if overview.TopActions == nil {
		overview.TopActions = []domain.AnalyticsBucket{}
	}
	if overview.TopFailures == nil {
		overview.TopFailures = []domain.AnalyticsBucket{}
	}
	if overview.ModePopularity == nil {
		overview.ModePopularity = []domain.AnalyticsBucket{}
	}
	if overview.ScreenExitRates == nil {
		overview.ScreenExitRates = []domain.AnalyticsScreenMetric{}
	}
	if overview.ErrorsByScreen == nil {
		overview.ErrorsByScreen = []domain.AnalyticsBucket{}
	}
	if overview.AvgTimeOnScreen == nil {
		overview.AvgTimeOnScreen = []domain.AnalyticsScreenMetric{}
	}
	if overview.TopHesitations == nil {
		overview.TopHesitations = []domain.AnalyticsBucket{}
	}
	if overview.ExitPaths == nil {
		overview.ExitPaths = []domain.AnalyticsBucket{}
	}
	if overview.EventsByDay == nil {
		overview.EventsByDay = []domain.AnalyticsDailyPoint{}
	}
	if overview.ErrorsBeforeExit == nil {
		overview.ErrorsBeforeExit = []domain.AnalyticsBucket{}
	}
	if overview.TopInputAbandons == nil {
		overview.TopInputAbandons = []domain.AnalyticsBucket{}
	}
	if overview.Funnels == nil {
		overview.Funnels = []domain.AnalyticsFunnel{}
	}
	for i := range overview.Funnels {
		if overview.Funnels[i].Steps == nil {
			overview.Funnels[i].Steps = []domain.AnalyticsFunnelStep{}
		}
	}

	if filter.ErrorCode != "" || filter.InputID != "" {
		overview.ActiveErrorCode = filter.ErrorCode
		overview.ActiveInputID = filter.InputID
		events, count, err := r.filteredEvents(ctx, since, filter)
		if err != nil {
			return nil, err
		}
		overview.FilteredCount = count
		overview.FilteredEvents = events
	}
	if overview.FilteredEvents == nil {
		overview.FilteredEvents = []domain.AnalyticsTimelineEvent{}
	}

	return overview, nil
}

func (r *AnalyticsRepo) filteredEvents(ctx context.Context, since time.Time, filter domain.AnalyticsOverviewFilter) ([]domain.AnalyticsTimelineEvent, int64, error) {
	query := r.db.WithContext(ctx).Model(&domain.AnalyticsEvent{}).Where("occurred_at >= ?", since)
	if filter.ErrorCode != "" {
		query = query.Where(
			"(error_code = ? OR properties->>'last_error_code' = ? OR (status = 'error' AND event_name = ?))",
			filter.ErrorCode,
			filter.ErrorCode,
			filter.ErrorCode,
		)
	}
	if filter.InputID != "" {
		query = query.Where(
			"event_name IN ('input_abandon', 'input_started', 'input_completed') AND properties->>'input_id' = ?",
			filter.InputID,
		)
	}
	var count int64
	if err := query.Count(&count).Error; err != nil {
		return nil, 0, err
	}
	var events []domain.AnalyticsTimelineEvent
	err := query.
		Order("occurred_at DESC").
		Limit(40).
		Select("id, session_id, event_name, event_category, source, path, screen, status, error_code, error_message, occurred_at, properties").
		Find(&events).Error
	if events == nil {
		events = []domain.AnalyticsTimelineEvent{}
	}
	return events, count, err
}

func (r *AnalyticsRepo) GetUserDrilldown(ctx context.Context, userID uuid.UUID, limit int, sessionID string) (*domain.AnalyticsUserDrilldown, error) {
	if limit <= 0 {
		limit = 60
	}
	var user domain.User
	if err := r.db.WithContext(ctx).First(&user, "id = ?", userID).Error; err != nil {
		return nil, err
	}

	drilldown := &domain.AnalyticsUserDrilldown{
		UserID:            user.ID,
		TelegramID:        user.TelegramID,
		Username:          user.Username,
		FirstName:         user.FirstName,
		CreatedAt:         user.CreatedAt,
		ReferrerID:        user.ReferrerID,
		AcquisitionSource: "unknown",
		AcquisitionLabel:  "unknown",
	}

	var lastSeen time.Time
	if err := r.db.WithContext(ctx).Model(&domain.AnalyticsEvent{}).
		Where("user_id = ?", userID).
		Select("MAX(occurred_at)").
		Scan(&lastSeen).Error; err == nil && !lastSeen.IsZero() {
		drilldown.LastSeenAt = &lastSeen
	}

	type acquisitionRow struct {
		EventName  string
		Properties datatypes.JSON
	}
	var acq acquisitionRow
	if err := r.db.WithContext(ctx).Model(&domain.AnalyticsEvent{}).
		Where("user_id = ? AND event_name IN ?", userID, []string{"referral_assigned", "auth_succeeded", "auth_debug_succeeded"}).
		Order("occurred_at ASC").
		Limit(1).
		Select("event_name, properties").
		Take(&acq).Error; err == nil {
		if acq.EventName == "referral_assigned" {
			drilldown.AcquisitionSource = "referral"
			drilldown.AcquisitionLabel = "Referral"
		} else if acq.EventName == "auth_debug_succeeded" {
			drilldown.AcquisitionSource = "debug"
			drilldown.AcquisitionLabel = "Debug"
		} else {
			var props map[string]any
			_ = json.Unmarshal(acq.Properties, &props)
			if src, ok := props["source"].(string); ok && src != "" {
				drilldown.AcquisitionSource = src
				drilldown.AcquisitionLabel = src
			} else {
				drilldown.AcquisitionSource = "direct"
				drilldown.AcquisitionLabel = "Direct"
			}
		}
	}

	var err error
	if drilldown.TopActions, err = r.topBuckets(ctx, `
		SELECT event_name AS name, COUNT(*) AS count
		FROM analytics_events
		WHERE user_id = ? AND status = 'success'
		GROUP BY 1
		ORDER BY count DESC
		LIMIT 8
	`, userID); err != nil {
		return nil, err
	}
	if drilldown.FavoriteModes, err = r.topBuckets(ctx, `
		SELECT COALESCE(NULLIF(properties->>'mode', ''), screen, path, 'unknown') AS name, COUNT(*) AS count
		FROM analytics_events
		WHERE user_id = ? AND (event_name = 'screen_view' OR properties ? 'mode')
		GROUP BY 1
		ORDER BY count DESC
		LIMIT 8
	`, userID); err != nil {
		return nil, err
	}
	if drilldown.TopFailures, err = r.topBuckets(ctx, `
		SELECT COALESCE(NULLIF(TRIM(error_message), ''), NULLIF(error_code, ''), event_name) AS name, COUNT(*) AS count
		FROM analytics_events
		WHERE user_id = ? AND status = 'error'
		GROUP BY 1
		ORDER BY count DESC
		LIMIT 8
	`, userID); err != nil {
		return nil, err
	}

	if drilldown.Sessions, err = r.userSessions(ctx, userID, 15); err != nil {
		return nil, err
	}
	if err := r.fillUserVisitStats(ctx, drilldown); err != nil {
		return nil, err
	}

	timelineQuery := r.db.WithContext(ctx).Model(&domain.AnalyticsEvent{}).Where("user_id = ?", userID)
	if sessionID != "" {
		timelineQuery = timelineQuery.Where("session_id = ?", sessionID)
		drilldown.ActiveSessionID = sessionID
	}
	if err := timelineQuery.
		Order("occurred_at DESC").
		Limit(limit).
		Select("id, session_id, event_name, event_category, source, path, screen, status, error_code, error_message, occurred_at, properties").
		Find(&drilldown.Timeline).Error; err != nil {
		return nil, err
	}
	if drilldown.TopActions == nil {
		drilldown.TopActions = []domain.AnalyticsBucket{}
	}
	if drilldown.FavoriteModes == nil {
		drilldown.FavoriteModes = []domain.AnalyticsBucket{}
	}
	if drilldown.TopFailures == nil {
		drilldown.TopFailures = []domain.AnalyticsBucket{}
	}
	if drilldown.Sessions == nil {
		drilldown.Sessions = []domain.AnalyticsUserSession{}
	}
	if drilldown.VisitsByHour == nil {
		drilldown.VisitsByHour = []domain.AnalyticsHourPoint{}
	}
	if drilldown.Timeline == nil {
		drilldown.Timeline = []domain.AnalyticsTimelineEvent{}
	}
	return drilldown, nil
}

func (r *AnalyticsRepo) fillVisitStats(ctx context.Context, overview *domain.AnalyticsOverview, since time.Time) error {
	_ = r.db.WithContext(ctx).Model(&domain.AnalyticsEvent{}).
		Where("occurred_at >= ? AND event_name = ? AND user_id IS NOT NULL", since, "session_started").
		Count(&overview.SessionsTotal).Error

	var sessionUsers int64
	_ = r.db.WithContext(ctx).Model(&domain.AnalyticsEvent{}).
		Where("occurred_at >= ? AND event_name = ? AND user_id IS NOT NULL", since, "session_started").
		Distinct("user_id").
		Count(&sessionUsers).Error

	_ = r.db.WithContext(ctx).Raw(`
		SELECT COUNT(DISTINCT e.user_id)
		FROM analytics_events e
		JOIN users u ON u.id = e.user_id AND u.deleted_at IS NULL
		WHERE e.occurred_at >= ?
			AND e.event_name = 'session_started'
			AND e.user_id IS NOT NULL
			AND u.created_at < ?
	`, since, since).Scan(&overview.ReturningUsers).Error

	if sessionUsers > 0 && overview.SessionsTotal > 0 {
		overview.AvgSessionsPerUser = float64(overview.SessionsTotal) / float64(sessionUsers)
	}

	type hourRow struct {
		Hour  int   `gorm:"column:hour"`
		Count int64 `gorm:"column:count"`
	}
	var hours []hourRow
	if err := r.db.WithContext(ctx).Raw(`
		SELECT EXTRACT(HOUR FROM (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow'))::int AS hour,
		       COUNT(*) AS count
		FROM analytics_events
		WHERE occurred_at >= ?
			AND event_name = 'session_started'
			AND user_id IS NOT NULL
		GROUP BY 1
		ORDER BY 1
	`, since).Scan(&hours).Error; err != nil {
		return err
	}
	byHour := make(map[int]int64, 24)
	for _, row := range hours {
		byHour[row.Hour] = row.Count
	}
	overview.VisitsByHour = make([]domain.AnalyticsHourPoint, 24)
	for h := 0; h < 24; h++ {
		overview.VisitsByHour[h] = domain.AnalyticsHourPoint{Hour: h, Count: byHour[h]}
	}

	weekdayNames := []string{"Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"}
	type weekdayRow struct {
		Dow   int   `gorm:"column:dow"`
		Count int64 `gorm:"column:count"`
	}
	var weekdays []weekdayRow
	if err := r.db.WithContext(ctx).Raw(`
		SELECT EXTRACT(DOW FROM (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow'))::int AS dow,
		       COUNT(*) AS count
		FROM analytics_events
		WHERE occurred_at >= ?
			AND event_name = 'session_started'
			AND user_id IS NOT NULL
		GROUP BY 1
		ORDER BY 1
	`, since).Scan(&weekdays).Error; err != nil {
		return err
	}
	byDow := make(map[int]int64, 7)
	for _, row := range weekdays {
		byDow[row.Dow] = row.Count
	}
	// Order Mon→Sun for UI.
	order := []int{1, 2, 3, 4, 5, 6, 0}
	overview.VisitsByWeekday = make([]domain.AnalyticsBucket, 0, 7)
	for _, dow := range order {
		overview.VisitsByWeekday = append(overview.VisitsByWeekday, domain.AnalyticsBucket{
			Name:  weekdayNames[dow],
			Count: byDow[dow],
		})
	}

	if err := r.db.WithContext(ctx).Raw(`
		WITH daily AS (
			SELECT
				user_id,
				(occurred_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow')::date AS day,
				COUNT(*) AS sessions
			FROM analytics_events
			WHERE occurred_at >= ?
				AND event_name = 'session_started'
				AND user_id IS NOT NULL
			GROUP BY 1, 2
		)
		SELECT
			CASE
				WHEN sessions >= 4 THEN '4+'
				ELSE sessions::text
			END AS name,
			COUNT(*) AS count
		FROM daily
		GROUP BY 1
		ORDER BY MIN(sessions)
	`, since).Scan(&overview.SessionsPerUserDay).Error; err != nil {
		return err
	}
	if overview.SessionsPerUserDay == nil {
		overview.SessionsPerUserDay = []domain.AnalyticsBucket{}
	}

	type dayRow struct {
		Date  time.Time `gorm:"column:day"`
		Count int64     `gorm:"column:count"`
	}
	var days []dayRow
	if err := r.db.WithContext(ctx).Raw(`
		SELECT (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow')::date AS day,
		       COUNT(*) AS count
		FROM analytics_events
		WHERE occurred_at >= ?
			AND event_name = 'session_started'
			AND user_id IS NOT NULL
		GROUP BY 1
		ORDER BY 1
	`, since).Scan(&days).Error; err != nil {
		return err
	}
	overview.SessionsByDay = make([]domain.AnalyticsDailyPoint, 0, len(days))
	for _, row := range days {
		overview.SessionsByDay = append(overview.SessionsByDay, domain.AnalyticsDailyPoint{
			Date:  row.Date.Format("2006-01-02"),
			Count: row.Count,
		})
	}
	return nil
}

func (r *AnalyticsRepo) fillUserVisitStats(ctx context.Context, drilldown *domain.AnalyticsUserDrilldown) error {
	msk := time.FixedZone("MSK", 3*60*60)
	nowMSK := time.Now().In(msk)
	todayStart := time.Date(nowMSK.Year(), nowMSK.Month(), nowMSK.Day(), 0, 0, 0, 0, msk).UTC()
	weekAgo := time.Now().UTC().Add(-7 * 24 * time.Hour)

	_ = r.db.WithContext(ctx).Model(&domain.AnalyticsEvent{}).
		Where("user_id = ? AND event_name = ?", drilldown.UserID, "session_started").
		Count(&drilldown.SessionsTotal).Error
	_ = r.db.WithContext(ctx).Model(&domain.AnalyticsEvent{}).
		Where("user_id = ? AND event_name = ? AND occurred_at >= ?", drilldown.UserID, "session_started", todayStart).
		Count(&drilldown.SessionsToday).Error
	_ = r.db.WithContext(ctx).Model(&domain.AnalyticsEvent{}).
		Where("user_id = ? AND event_name = ? AND occurred_at >= ?", drilldown.UserID, "session_started", weekAgo).
		Count(&drilldown.Sessions7d).Error

	_ = r.db.WithContext(ctx).Raw(`
		SELECT COUNT(DISTINCT (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow')::date)
		FROM analytics_events
		WHERE user_id = ? AND event_name = 'session_started' AND occurred_at >= ?
	`, drilldown.UserID, weekAgo).Scan(&drilldown.ActiveDays7d).Error
	if drilldown.ActiveDays7d > 0 {
		drilldown.AvgSessionsPerActiveDay = float64(drilldown.Sessions7d) / float64(drilldown.ActiveDays7d)
	}

	type hourRow struct {
		Hour  int   `gorm:"column:hour"`
		Count int64 `gorm:"column:count"`
	}
	var hours []hourRow
	if err := r.db.WithContext(ctx).Raw(`
		SELECT EXTRACT(HOUR FROM (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow'))::int AS hour,
		       COUNT(*) AS count
		FROM analytics_events
		WHERE user_id = ? AND event_name = 'session_started'
		GROUP BY 1
		ORDER BY 1
	`, drilldown.UserID).Scan(&hours).Error; err != nil {
		return err
	}
	byHour := make(map[int]int64, 24)
	for _, row := range hours {
		byHour[row.Hour] = row.Count
	}
	drilldown.VisitsByHour = make([]domain.AnalyticsHourPoint, 24)
	for h := 0; h < 24; h++ {
		drilldown.VisitsByHour[h] = domain.AnalyticsHourPoint{Hour: h, Count: byHour[h]}
	}
	return nil
}

func (r *AnalyticsRepo) userSessions(ctx context.Context, userID uuid.UUID, limit int) ([]domain.AnalyticsUserSession, error) {
	if limit <= 0 {
		limit = 15
	}
	type sessionRow struct {
		SessionID  string
		StartedAt  time.Time
		EndedAt    time.Time
		EventCount int64
	}
	var rows []sessionRow
	err := r.db.WithContext(ctx).Raw(`
		SELECT
			session_id,
			MIN(occurred_at) AS started_at,
			MAX(occurred_at) AS ended_at,
			COUNT(*) AS event_count
		FROM analytics_events
		WHERE user_id = ? AND COALESCE(session_id, '') != ''
		GROUP BY session_id
		ORDER BY ended_at DESC
		LIMIT ?
	`, userID, limit).Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	sessions := make([]domain.AnalyticsUserSession, 0, len(rows))
	for _, row := range rows {
		session := domain.AnalyticsUserSession{
			SessionID:  row.SessionID,
			StartedAt:  row.StartedAt,
			EndedAt:    row.EndedAt,
			EventCount: row.EventCount,
			Screens:    []string{},
			InputAbandons: []string{},
		}

		var errEvent domain.AnalyticsEvent
		if err := r.db.WithContext(ctx).
			Where("user_id = ? AND session_id = ? AND status = 'error'", userID, row.SessionID).
			Order("occurred_at DESC").
			Limit(1).
			Take(&errEvent).Error; err == nil {
			session.LastErrorCode = errEvent.ErrorCode
			if session.LastErrorCode == "" {
				session.LastErrorCode = errEvent.EventName
			}
		}

		var endedAfterError int64
		_ = r.db.WithContext(ctx).Model(&domain.AnalyticsEvent{}).
			Where("user_id = ? AND session_id = ? AND event_name = 'session_end_after_error'", userID, row.SessionID).
			Count(&endedAfterError).Error
		session.EndedAfterError = endedAfterError > 0

		type journeyRow struct {
			JourneyPath string
		}
		var journey journeyRow
		_ = r.db.WithContext(ctx).Raw(`
			SELECT COALESCE(
				MAX(properties->>'journey_path') FILTER (WHERE event_name = 'session_end_after_error'),
				MAX(properties->>'journey_path') FILTER (WHERE event_name = 'screen_abandon'),
				''
			) AS journey_path
			FROM analytics_events
			WHERE user_id = ? AND session_id = ?
		`, userID, row.SessionID).Scan(&journey).Error
		session.JourneyPath = journey.JourneyPath

		_ = r.db.WithContext(ctx).Raw(`
			SELECT screen
			FROM analytics_events
			WHERE user_id = ? AND session_id = ? AND event_name = 'screen_enter' AND COALESCE(screen, '') != ''
			GROUP BY screen
			ORDER BY MIN(occurred_at)
		`, userID, row.SessionID).Scan(&session.Screens).Error

		_ = r.db.WithContext(ctx).Raw(`
			SELECT DISTINCT properties->>'input_id' AS input_id
			FROM analytics_events
			WHERE user_id = ? AND session_id = ? AND event_name = 'input_abandon' AND COALESCE(properties->>'input_id', '') != ''
		`, userID, row.SessionID).Scan(&session.InputAbandons).Error

		if session.Screens == nil {
			session.Screens = []string{}
		}
		if session.InputAbandons == nil {
			session.InputAbandons = []string{}
		}
		sessions = append(sessions, session)
	}
	return sessions, nil
}

func (r *AnalyticsRepo) topBuckets(ctx context.Context, query string, args ...any) ([]domain.AnalyticsBucket, error) {
	var items []domain.AnalyticsBucket
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&items).Error
	return items, err
}

func (r *AnalyticsRepo) funnelCounts(ctx context.Context, since time.Time, names []string) []domain.AnalyticsFunnelStep {
	steps := make([]domain.AnalyticsFunnelStep, 0, len(names))
	var previousCount int64
	for i, name := range names {
		var count int64
		r.db.WithContext(ctx).Model(&domain.AnalyticsEvent{}).
			Where("occurred_at >= ? AND event_name = ?", since, name).
			Distinct("COALESCE(user_id::text, telegram_id::text, NULLIF(anonymous_id, ''), NULLIF(session_id, ''))").
			Count(&count)
		step := domain.AnalyticsFunnelStep{Name: name, Count: count}
		if i > 0 && previousCount > 0 {
			step.DropOffPct = float64(previousCount-count) * 100 / float64(previousCount)
			if step.DropOffPct < 0 {
				step.DropOffPct = 0
			}
		}
		steps = append(steps, step)
		previousCount = count
	}
	return steps
}

type funnelStepQuery struct {
	EventName     string
	Screen        string
	PropertyKey   string
	PropertyValue string
}

func (r *AnalyticsRepo) funnelMixedCounts(ctx context.Context, since time.Time, steps []funnelStepQuery) []domain.AnalyticsFunnelStep {
	result := make([]domain.AnalyticsFunnelStep, 0, len(steps))
	var previousCount int64
	for i, step := range steps {
		query := r.db.WithContext(ctx).Model(&domain.AnalyticsEvent{}).Where("occurred_at >= ?", since)
		name := step.EventName
		if step.Screen != "" {
			query = query.Where("event_name = ? AND screen = ?", step.EventName, step.Screen)
			name = step.Screen + ":" + step.EventName
		} else if step.PropertyKey != "" && step.PropertyValue != "" {
			query = query.Where("event_name = ? AND properties->>? = ?", step.EventName, step.PropertyKey, step.PropertyValue)
			name = step.PropertyValue
		} else {
			query = query.Where("event_name = ?", step.EventName)
		}
		var count int64
		query.Distinct("COALESCE(user_id::text, telegram_id::text, NULLIF(anonymous_id, ''), NULLIF(session_id, ''))").Count(&count)
		funnelStep := domain.AnalyticsFunnelStep{Name: name, Count: count}
		if i > 0 && previousCount > 0 {
			funnelStep.DropOffPct = float64(previousCount-count) * 100 / float64(previousCount)
			if funnelStep.DropOffPct < 0 {
				funnelStep.DropOffPct = 0
			}
		}
		result = append(result, funnelStep)
		previousCount = count
	}
	return result
}

func (r *AnalyticsRepo) eventsByDay(ctx context.Context, since time.Time) ([]domain.AnalyticsDailyPoint, error) {
	var items []domain.AnalyticsDailyPoint
	err := r.db.WithContext(ctx).Raw(`
		SELECT to_char(date_trunc('day', occurred_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date, COUNT(*) AS count
		FROM analytics_events
		WHERE occurred_at >= ?
		GROUP BY 1
		ORDER BY date ASC
	`, since).Scan(&items).Error
	return items, err
}

func (r *AnalyticsRepo) countDistinctSessions(ctx context.Context, since time.Time, eventName string) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&domain.AnalyticsEvent{}).
		Where("occurred_at >= ? AND event_name = ?", since, eventName).
		Distinct("COALESCE(NULLIF(session_id, ''), anonymous_id)").
		Count(&count).Error
	return count, err
}

func (r *AnalyticsRepo) screenExitRates(ctx context.Context, since time.Time) ([]domain.AnalyticsScreenMetric, error) {
	var items []domain.AnalyticsScreenMetric
	err := r.db.WithContext(ctx).Raw(`
		WITH enters AS (
			SELECT COALESCE(NULLIF(screen, ''), 'unknown') AS screen, COUNT(*) AS enters
			FROM analytics_events
			WHERE occurred_at >= ? AND event_name = 'screen_enter'
			GROUP BY 1
		),
		exits AS (
			SELECT COALESCE(NULLIF(screen, ''), 'unknown') AS screen, COUNT(*) AS exits
			FROM analytics_events
			WHERE occurred_at >= ? AND event_name IN ('screen_abandon', 'screen_leave')
			GROUP BY 1
		)
		SELECT
			e.screen AS name,
			COALESCE(x.exits, 0) AS count,
			e.enters AS secondary_count,
			ROUND(100.0 * COALESCE(x.exits, 0) / NULLIF(e.enters, 0), 1) AS rate_percent
		FROM enters e
		LEFT JOIN exits x ON x.screen = e.screen
		WHERE e.enters > 0
		ORDER BY rate_percent DESC, count DESC
		LIMIT 8
	`, since, since).Scan(&items).Error
	return items, err
}

func (r *AnalyticsRepo) avgTimeOnScreen(ctx context.Context, since time.Time) ([]domain.AnalyticsScreenMetric, error) {
	var items []domain.AnalyticsScreenMetric
	err := r.db.WithContext(ctx).Raw(`
		SELECT
			COALESCE(NULLIF(screen, ''), 'unknown') AS name,
			ROUND(AVG(NULLIF((properties->>'time_on_screen_ms')::numeric, 0)))::bigint AS count,
			COUNT(*) AS secondary_count
		FROM analytics_events
		WHERE occurred_at >= ?
			AND event_name IN ('screen_leave', 'screen_abandon')
			AND properties ? 'time_on_screen_ms'
		GROUP BY 1
		HAVING COUNT(*) >= 3
		ORDER BY count DESC
		LIMIT 8
	`, since).Scan(&items).Error
	return items, err
}

var _ domain.AnalyticsRepository = (*AnalyticsRepo)(nil)
