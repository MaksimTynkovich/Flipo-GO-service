package domain

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type AnalyticsEvent struct {
	ID             uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID         *uuid.UUID     `gorm:"type:uuid;index" json:"user_id,omitempty"`
	ReferrerID     *uuid.UUID     `gorm:"type:uuid;index" json:"referrer_id,omitempty"`
	TelegramID     *int64         `gorm:"index" json:"telegram_id,omitempty"`
	AnonymousID    string         `gorm:"size:64;index" json:"anonymous_id,omitempty"`
	SessionID      string         `gorm:"size:64;index" json:"session_id,omitempty"`
	RequestID      string         `gorm:"size:64;index" json:"request_id,omitempty"`
	Source         string         `gorm:"size:16;index;not null" json:"source"`
	EventName      string         `gorm:"size:64;index;not null" json:"event_name"`
	EventCategory  string         `gorm:"size:32;index;not null" json:"event_category"`
	Path           string         `gorm:"size:256;index" json:"path,omitempty"`
	Screen         string         `gorm:"size:128;index" json:"screen,omitempty"`
	PreviousScreen string         `gorm:"size:128" json:"previous_screen,omitempty"`
	Method         string         `gorm:"size:16" json:"method,omitempty"`
	Status         string         `gorm:"size:32;index" json:"status,omitempty"`
	ErrorCode      string         `gorm:"size:64;index" json:"error_code,omitempty"`
	ErrorMessage   string         `gorm:"size:256" json:"error_message,omitempty"`
	StartParam     string         `gorm:"size:128;index" json:"start_param,omitempty"`
	StakingTier    string         `gorm:"size:16;index" json:"staking_tier,omitempty"`
	UserAgent      string         `gorm:"size:512" json:"user_agent,omitempty"`
	IPAddress      string         `gorm:"size:64" json:"ip_address,omitempty"`
	Properties     datatypes.JSON `gorm:"type:jsonb" json:"properties,omitempty"`
	OccurredAt     time.Time      `gorm:"index;not null" json:"occurred_at"`
	CreatedAt      time.Time      `gorm:"index" json:"created_at"`
}

func (AnalyticsEvent) TableName() string { return "analytics_events" }

type AnalyticsBucket struct {
	Name  string `json:"name"`
	Count int64  `json:"count"`
}

type AnalyticsFunnelStep struct {
	Name       string  `json:"name"`
	Count      int64   `json:"count"`
	DropOffPct float64 `json:"drop_off_pct,omitempty"`
}

type AnalyticsFunnel struct {
	Name  string                `json:"name"`
	Steps []AnalyticsFunnelStep `json:"steps"`
}

type AnalyticsScreenMetric struct {
	Name           string  `json:"name"`
	Count          int64   `json:"count"`
	SecondaryCount int64   `json:"secondary_count,omitempty"`
	RatePercent    float64 `json:"rate_percent,omitempty"`
}

type AnalyticsDailyPoint struct {
	Date  string `json:"date"`
	Count int64  `json:"count"`
}

// AnalyticsHourPoint — visit count for an hour of day (0–23, usually MSK).
type AnalyticsHourPoint struct {
	Hour  int   `json:"hour"`
	Count int64 `json:"count"`
}

type AnalyticsOverviewFilter struct {
	ErrorCode string
	InputID   string
}

type AnalyticsOverview struct {
	DAU                     int64                    `json:"dau"`
	WAU                     int64                    `json:"wau"`
	NewUsers                int64                    `json:"new_users"`
	TotalEvents24h          int64                    `json:"total_events_24h"`
	SessionsTotal           int64                    `json:"sessions_total"`
	ReturningUsers          int64                    `json:"returning_users"`
	AvgSessionsPerUser      float64                  `json:"avg_sessions_per_user"`
	VisitsByHour            []AnalyticsHourPoint     `json:"visits_by_hour"`
	VisitsByWeekday         []AnalyticsBucket        `json:"visits_by_weekday"`
	SessionsPerUserDay      []AnalyticsBucket        `json:"sessions_per_user_day"`
	SessionsByDay           []AnalyticsDailyPoint    `json:"sessions_by_day"`
	TopSources              []AnalyticsBucket        `json:"top_sources"`
	TopScreens              []AnalyticsBucket        `json:"top_screens"`
	TopActions              []AnalyticsBucket        `json:"top_actions"`
	TopFailures             []AnalyticsBucket        `json:"top_failures"`
	ModePopularity          []AnalyticsBucket        `json:"mode_popularity"`
	ScreenExitRates         []AnalyticsScreenMetric  `json:"screen_exit_rates"`
	ErrorsByScreen          []AnalyticsBucket        `json:"errors_by_screen"`
	AvgTimeOnScreen         []AnalyticsScreenMetric  `json:"avg_time_on_screen"`
	TopHesitations          []AnalyticsBucket        `json:"top_hesitations"`
	ExitPaths               []AnalyticsBucket        `json:"exit_paths"`
	EventsByDay             []AnalyticsDailyPoint    `json:"events_by_day"`
	SessionsEndedAfterError int64                    `json:"sessions_ended_after_error"`
	ErrorsBeforeExit        []AnalyticsBucket        `json:"errors_before_exit"`
	TopInputAbandons        []AnalyticsBucket        `json:"top_input_abandons"`
	FilteredCount           int64                    `json:"filtered_count,omitempty"`
	FilteredEvents          []AnalyticsTimelineEvent `json:"filtered_events,omitempty"`
	ActiveErrorCode         string                   `json:"active_error_code,omitempty"`
	ActiveInputID           string                   `json:"active_input_id,omitempty"`
	Funnels                 []AnalyticsFunnel        `json:"funnels"`
}

type AnalyticsUserSession struct {
	SessionID       string    `json:"session_id"`
	StartedAt       time.Time `json:"started_at"`
	EndedAt         time.Time `json:"ended_at"`
	EventCount      int64     `json:"event_count"`
	JourneyPath     string    `json:"journey_path,omitempty"`
	Screens         []string  `json:"screens"`
	LastErrorCode   string    `json:"last_error_code,omitempty"`
	EndedAfterError bool      `json:"ended_after_error"`
	InputAbandons   []string  `json:"input_abandons"`
}

type AnalyticsTimelineEvent struct {
	ID            uuid.UUID      `json:"id"`
	SessionID     string         `json:"session_id,omitempty"`
	EventName     string         `json:"event_name"`
	EventCategory string         `json:"event_category"`
	Source        string         `json:"source"`
	Path          string         `json:"path,omitempty"`
	Screen        string         `json:"screen,omitempty"`
	Status        string         `json:"status,omitempty"`
	ErrorCode     string         `json:"error_code,omitempty"`
	ErrorMessage  string         `json:"error_message,omitempty"`
	OccurredAt    time.Time      `json:"occurred_at"`
	Properties    datatypes.JSON `json:"properties,omitempty"`
}

type AnalyticsUserDrilldown struct {
	UserID                  uuid.UUID                `json:"user_id"`
	TelegramID              int64                    `json:"telegram_id"`
	Username                string                   `json:"username"`
	FirstName               string                   `json:"first_name"`
	CreatedAt               time.Time                `json:"created_at"`
	LastSeenAt              *time.Time               `json:"last_seen_at,omitempty"`
	ReferrerID              *uuid.UUID               `json:"referrer_id,omitempty"`
	AcquisitionSource       string                   `json:"acquisition_source"`
	AcquisitionLabel        string                   `json:"acquisition_label"`
	SessionsTotal           int64                    `json:"sessions_total"`
	SessionsToday           int64                    `json:"sessions_today"`
	Sessions7d              int64                    `json:"sessions_7d"`
	ActiveDays7d            int64                    `json:"active_days_7d"`
	AvgSessionsPerActiveDay float64                  `json:"avg_sessions_per_active_day"`
	VisitsByHour            []AnalyticsHourPoint     `json:"visits_by_hour"`
	TopActions              []AnalyticsBucket        `json:"top_actions"`
	FavoriteModes           []AnalyticsBucket        `json:"favorite_modes"`
	TopFailures             []AnalyticsBucket        `json:"top_failures"`
	Sessions                []AnalyticsUserSession   `json:"sessions"`
	ActiveSessionID         string                   `json:"active_session_id,omitempty"`
	Timeline                []AnalyticsTimelineEvent `json:"timeline"`
}

type AnalyticsEventCreate struct {
	UserID         *uuid.UUID
	ReferrerID     *uuid.UUID
	TelegramID     *int64
	AnonymousID    string
	SessionID      string
	RequestID      string
	Source         string
	EventName      string
	EventCategory  string
	Path           string
	Screen         string
	PreviousScreen string
	Method         string
	Status         string
	ErrorCode      string
	ErrorMessage   string
	StartParam     string
	StakingTier    string
	UserAgent      string
	IPAddress      string
	Properties     datatypes.JSON
	OccurredAt     time.Time
}

// AnalyticsStakingDropoffGift — snapshot of a profile gift valuation shown on the staking page.
type AnalyticsStakingDropoffGift struct {
	Slug              string `json:"slug"`
	Name              string `json:"name"`
	CollectionSlug    string `json:"collection_slug,omitempty"`
	PriceNanoton      int64  `json:"price_nanoton"`
	IsStaked          bool   `json:"is_staked"`
	DailyYieldNanoton int64  `json:"daily_yield_nanoton,omitempty"`
}

// AnalyticsStakingDropoffUser — visited staking, had profile gifts valued, never staked.
type AnalyticsStakingDropoffUser struct {
	UserID                       uuid.UUID                     `json:"user_id"`
	TelegramID                   int64                         `json:"telegram_id"`
	Username                     string                        `json:"username"`
	FirstName                    string                        `json:"first_name"`
	EnteredAt                    time.Time                     `json:"entered_at"`
	FirstStakingAt               *time.Time                    `json:"first_staking_at,omitempty"`
	LastStakingAt                *time.Time                    `json:"last_staking_at,omitempty"`
	ValuedAt                     time.Time                     `json:"valued_at"`
	ProfileGiftCount             int                           `json:"profile_gift_count"`
	UnstakedProfileCount         int                           `json:"unstaked_profile_count"`
	ProfileValuationNanoton      int64                         `json:"profile_valuation_nanoton"`
	UnstakedProfileValuationNano int64                         `json:"unstaked_profile_valuation_nanoton"`
	Gifts                        []AnalyticsStakingDropoffGift `json:"gifts"`
}

type AnalyticsStakingDropoff struct {
	ViewersWithProfileGifts      int64                          `json:"viewers_with_profile_gifts"`
	DropoffCount                 int64                          `json:"dropoff_count"`
	DropoffRatePct               float64                        `json:"dropoff_rate_pct"`
	TotalUnstakedValuationNanoton int64                         `json:"total_unstaked_valuation_nanoton"`
	Users                        []AnalyticsStakingDropoffUser  `json:"users"`
}
