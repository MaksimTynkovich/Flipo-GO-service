package campaign

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

const (
	defaultCodeLen = 8
	codeAlphabet   = "abcdefghijklmnopqrstuvwxyz0123456789"
)

type CreateInput struct {
	Name    string
	Code    string
	Source  string
	Content string
	Landing string
}

type UpdateInput struct {
	Name    *string
	Source  *string
	Content *string
	Landing *string
	Status  *string
}

type Service struct {
	repo            domain.CampaignRepository
	botUsername     string
	webAppShortName string
}

func NewService(repo domain.CampaignRepository, botUsername, webAppShortName string) *Service {
	app := strings.Trim(strings.TrimSpace(webAppShortName), "/")
	if app == "" {
		app = "app"
	}
	return &Service{
		repo:            repo,
		botUsername:     strings.TrimPrefix(strings.TrimSpace(botUsername), "@"),
		webAppShortName: app,
	}
}

func (s *Service) Create(ctx context.Context, in CreateInput) (*domain.CampaignStats, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, domain.ErrInvalidCampaign
	}
	source, ok := normalizeSource(in.Source)
	if !ok {
		return nil, domain.ErrInvalidCampaign
	}
	landing, ok := normalizeLanding(in.Landing)
	if !ok {
		return nil, domain.ErrInvalidCampaign
	}
	code := NormalizeCode(in.Code)
	if code == "" {
		generated, err := generateCode(defaultCodeLen)
		if err != nil {
			return nil, err
		}
		code = generated
	}
	if !ValidCode(code) {
		return nil, domain.ErrInvalidCampaign
	}

	now := time.Now().UTC()
	row := &domain.Campaign{
		ID:        uuid.New(),
		Code:      code,
		Name:      name,
		Source:    source,
		Content:   strings.TrimSpace(in.Content),
		Landing:   landing,
		Status:    domain.CampaignStatusActive,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := s.repo.Create(ctx, row); err != nil {
		if isUniqueViolation(err) {
			if strings.TrimSpace(in.Code) != "" {
				return nil, domain.ErrCampaignCodeTaken
			}
			for i := 0; i < 4; i++ {
				next, genErr := generateCode(defaultCodeLen)
				if genErr != nil {
					return nil, genErr
				}
				row.ID = uuid.New()
				row.Code = next
				if err := s.repo.Create(ctx, row); err == nil {
					return s.withLinks(*row), nil
				} else if !isUniqueViolation(err) {
					return nil, err
				}
			}
			return nil, domain.ErrCampaignCodeTaken
		}
		return nil, err
	}
	return s.withLinks(*row), nil
}

func (s *Service) Update(ctx context.Context, id uuid.UUID, in UpdateInput) (*domain.CampaignStats, error) {
	row, err := s.repo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" {
			return nil, domain.ErrInvalidCampaign
		}
		row.Name = name
	}
	if in.Source != nil {
		source, ok := normalizeSource(*in.Source)
		if !ok {
			return nil, domain.ErrInvalidCampaign
		}
		row.Source = source
	}
	if in.Content != nil {
		row.Content = strings.TrimSpace(*in.Content)
	}
	if in.Landing != nil {
		landing, ok := normalizeLanding(*in.Landing)
		if !ok {
			return nil, domain.ErrInvalidCampaign
		}
		row.Landing = landing
	}
	if in.Status != nil {
		status := strings.ToLower(strings.TrimSpace(*in.Status))
		if status != domain.CampaignStatusActive && status != domain.CampaignStatusArchived {
			return nil, domain.ErrInvalidCampaign
		}
		row.Status = status
	}
	if err := s.repo.Update(ctx, row); err != nil {
		return nil, err
	}
	return s.withLinks(*row), nil
}

func (s *Service) FindByCode(ctx context.Context, code string) (*domain.Campaign, error) {
	code = NormalizeCode(code)
	if code == "" {
		return nil, nil
	}
	row, err := s.repo.FindByCode(ctx, code)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return row, nil
}

func (s *Service) List(ctx context.Context, filter domain.CampaignStatsFilter) ([]domain.CampaignStats, error) {
	filter.From, filter.To = normalizeRange(filter.From, filter.To)
	rows, err := s.repo.Stats(ctx, filter)
	if err != nil {
		return nil, err
	}
	out := make([]domain.CampaignStats, 0, len(rows))
	for _, row := range rows {
		out = append(out, s.decorate(row))
	}
	return out, nil
}

func (s *Service) Get(ctx context.Context, id uuid.UUID, from, to time.Time) (*domain.CampaignDetail, error) {
	from, to = normalizeRange(from, to)
	rows, err := s.repo.Stats(ctx, domain.CampaignStatsFilter{From: from, To: to})
	if err != nil {
		return nil, err
	}
	var found *domain.CampaignStats
	for i := range rows {
		if rows[i].ID == id {
			row := s.decorate(rows[i])
			found = &row
			break
		}
	}
	if found == nil {
		row, err := s.repo.FindByID(ctx, id)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, domain.ErrNotFound
			}
			return nil, err
		}
		found = s.withLinks(*row)
	}
	daily, err := s.repo.Daily(ctx, id, from, to)
	if err != nil {
		return nil, err
	}
	return &domain.CampaignDetail{CampaignStats: *found, Daily: daily}, nil
}

func (s *Service) withLinks(row domain.Campaign) *domain.CampaignStats {
	stats := domain.CampaignStats{Campaign: row}
	return ptr(s.decorate(stats))
}

func (s *Service) decorate(row domain.CampaignStats) domain.CampaignStats {
	row.StartParam = StartPayload(row.Code)
	row.MiniAppURL, row.BotStartURL = s.urls(row.Code)
	row.ClickToRegPct = rate(row.NewUsers, row.Clicks)
	row.RegToDepositPct = rate(row.Depositors, row.NewUsers)
	row.RegToBetPct = rate(row.Bettors, row.NewUsers)
	return row
}

func (s *Service) urls(code string) (miniApp, botStart string) {
	payload := StartPayload(code)
	if s.botUsername == "" || payload == "" {
		return "", ""
	}
	miniApp = fmt.Sprintf("https://t.me/%s/%s?startapp=%s", s.botUsername, s.webAppShortName, payload)
	botStart = fmt.Sprintf("https://t.me/%s?start=%s", s.botUsername, payload)
	return miniApp, botStart
}

func normalizeSource(raw string) (string, bool) {
	v := strings.ToLower(strings.TrimSpace(raw))
	if v == "" {
		v = domain.CampaignSourceOther
	}
	switch v {
	case domain.CampaignSourceTelegramAds, domain.CampaignSourceChannel, domain.CampaignSourceStories,
		domain.CampaignSourceInfluencer, domain.CampaignSourceOther:
		return v, true
	default:
		return "", false
	}
}

func normalizeLanding(raw string) (string, bool) {
	v := strings.ToLower(strings.TrimSpace(raw))
	switch v {
	case "", domain.CampaignLandingCases, domain.CampaignLandingGames, domain.CampaignLandingCrash:
		return v, true
	default:
		return "", false
	}
}

func normalizeRange(from, to time.Time) (time.Time, time.Time) {
	if to.IsZero() {
		to = time.Now().UTC()
	}
	if from.IsZero() {
		from = to.AddDate(0, 0, -30)
	}
	if !from.Before(to) {
		from = to.AddDate(0, 0, -1)
	}
	return from, to
}

func rate(num, den int64) float64 {
	if den <= 0 || num <= 0 {
		return 0
	}
	return float64(num) / float64(den) * 100
}

func generateCode(n int) (string, error) {
	if n <= 0 {
		n = defaultCodeLen
	}
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, n)
	for i := range buf {
		out[i] = codeAlphabet[int(buf[i])%len(codeAlphabet)]
	}
	return string(out), nil
}

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "duplicate key") || strings.Contains(msg, "unique constraint")
}

func ptr[T any](v T) *T { return &v }
