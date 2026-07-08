package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port                    string
	Env                     string
	JWTSecret               string
	BotToken                string
	BotUsername             string
	WebAppShortName         string
	WebAppURL               string
	TelegramWebhookURL      string
	TelegramWebhookSecret   string
	DatabaseURL             string
	RedisURL                string
	JWTExpiry               time.Duration
	RouletteBettingSeconds  int
	RouletteSpinSeconds     int
	RouletteResultPauseSeconds int
	RouletteResultDisplaySeconds int
	CrashTickMs             int
	CrashBettingSeconds     int
	CrashGrowthPerMs        float64
	PlatformFeeBps          int
	BoostWagerThreshold     int64
	TonDepositAddress       string
	TonAPIBaseURL           string
	TonAPIKey               string
	TonChainDevMode         bool
	TonLiteConfigURL        string
	TonHotWalletMnemonic    string
	TonHotWalletVersion     string
	TonMinDepositNanoton    int64
	TonMinWithdrawNanoton   int64
	TonWithdrawFeeNanoton   int64
	TonDepositTTLMinutes    int
	DebugAuthEnabled        bool
	DebugTelegramID         int64
	DebugUsername           string
	DebugInitialBalance     int64
	TelegramAPIID           int
	TelegramAPIHash         string
	TelegramSessionPath     string
	AdminTelegramIDs        []int64
}

func Load() *Config {
	return &Config{
		Port:                   getEnv("API_PORT", getEnv("PORT", "8080")),
		Env:                    getEnv("ENV", "development"),
		JWTSecret:              getEnv("JWT_SECRET", "dev-secret-change-me"),
		BotToken:               getEnv("BOT_TOKEN", ""),
		BotUsername:            firstNonEmpty(getEnv("BOT_USERNAME", ""), getEnv("NEXT_PUBLIC_BOT_USERNAME", "")),
		WebAppShortName:        firstNonEmpty(getEnv("WEBAPP_SHORT_NAME", ""), getEnv("NEXT_PUBLIC_WEBAPP_SHORT_NAME", "")),
		WebAppURL:              firstNonEmpty(getEnv("TELEGRAM_WEBAPP_URL", ""), getEnv("WEBAPP_URL", "")),
		TelegramWebhookURL:     getEnv("TELEGRAM_WEBHOOK_URL", ""),
		TelegramWebhookSecret:  getEnv("TELEGRAM_WEBHOOK_SECRET", ""),
		DatabaseURL:            getEnv("DATABASE_URL", "postgres://flipo:flipo@localhost:5432/flipo?sslmode=disable"),
		RedisURL:               getEnv("REDIS_URL", "redis://localhost:6379/0"),
		JWTExpiry:              15 * time.Minute,
		RouletteBettingSeconds:     getEnvInt("ROULETTE_BETTING_SECONDS", 20),
		RouletteSpinSeconds:        getEnvInt("ROULETTE_SPIN_SECONDS", 12),
		RouletteResultPauseSeconds:   getEnvInt("ROULETTE_RESULT_PAUSE_SECONDS", 0),
		RouletteResultDisplaySeconds: getEnvInt("ROULETTE_RESULT_DISPLAY_SECONDS", 1),
		CrashTickMs:            getEnvInt("CRASH_TICK_MS", 100),
		CrashBettingSeconds:    getEnvInt("CRASH_BETTING_SECONDS", 8),
		CrashGrowthPerMs:       getEnvFloat("CRASH_GROWTH_PER_MS", 0.00006),
		PlatformFeeBps:         getEnvInt("PLATFORM_FEE_BPS", 500),
		BoostWagerThreshold:    int64(getEnvInt("BOOST_WAGER_THRESHOLD_NANOTON", 5_000_000_000)),
		TonDepositAddress:      getEnv("TON_DEPOSIT_ADDRESS", ""),
		TonAPIBaseURL:          getEnv("TON_API_BASE_URL", "https://toncenter.com/api/v2"),
		TonAPIKey:              getEnv("TON_API_KEY", ""),
		TonChainDevMode:        getEnvBool("TON_CHAIN_DEV_MODE", false),
		TonLiteConfigURL:       getEnv("TON_LITE_CONFIG_URL", "https://ton-blockchain.github.io/global.config.json"),
		TonHotWalletMnemonic:   getEnv("TON_HOT_WALLET_MNEMONIC", ""),
		TonHotWalletVersion:    getEnv("TON_HOT_WALLET_VERSION", "V3R2"),
		TonMinDepositNanoton:   int64(getEnvInt("TON_MIN_DEPOSIT_NANOTON", 100_000_000)),
		TonMinWithdrawNanoton:  int64(getEnvInt("TON_MIN_WITHDRAW_NANOTON", 100_000_000)),
		TonWithdrawFeeNanoton:  int64(getEnvInt("TON_WITHDRAW_FEE_NANOTON", 50_000_000)),
		TonDepositTTLMinutes:   getEnvInt("TON_DEPOSIT_TTL_MINUTES", 30),
		DebugAuthEnabled:       getEnvBool("DEBUG_AUTH_ENABLED", false),
		DebugTelegramID:        int64(getEnvInt("DEBUG_TELEGRAM_ID", 999000001)),
		DebugUsername:          getEnv("DEBUG_USERNAME", "debug_user"),
		DebugInitialBalance:    int64(getEnvInt("DEBUG_INITIAL_BALANCE_NANOTON", 10_000_000_000)),
		TelegramAPIID:          getEnvInt("TELEGRAM_API_ID", 0),
		TelegramAPIHash:        getEnv("TELEGRAM_API_HASH", ""),
		TelegramSessionPath:    getEnv("TELEGRAM_SESSION_PATH", "data/telegram/session.json"),
		AdminTelegramIDs:       parseAdminTelegramIDs(getEnv("ADMIN_TELEGRAM_IDS", "")),
	}
}

func parseAdminTelegramIDs(raw string) []int64 {
	if raw == "" {
		if debugID := int64(getEnvInt("DEBUG_TELEGRAM_ID", 0)); debugID > 0 {
			return []int64{debugID}
		}
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]int64, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if id, err := strconv.ParseInt(part, 10, 64); err == nil {
			out = append(out, id)
		}
	}
	return out
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		b, err := strconv.ParseBool(v)
		if err == nil {
			return b
		}
	}
	return fallback
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

func getEnvFloat(key string, fallback float64) float64 {
	if v := os.Getenv(key); v != "" {
		f, err := strconv.ParseFloat(v, 64)
		if err == nil {
			return f
		}
	}
	return fallback
}
