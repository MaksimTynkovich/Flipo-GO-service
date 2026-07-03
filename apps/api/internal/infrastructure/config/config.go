package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port                    string
	Env                     string
	JWTSecret               string
	BotToken                string
	DatabaseURL             string
	RedisURL                string
	JWTExpiry               time.Duration
	RouletteBettingSeconds  int
	RouletteSpinSeconds     int
	CrashTickMs             int
	PlatformFeeBps          int
	BoostWagerThreshold     int64
	DebugAuthEnabled        bool
	DebugTelegramID         int64
	DebugUsername           string
	DebugInitialBalance     int64
}

func Load() *Config {
	return &Config{
		Port:                   getEnv("API_PORT", getEnv("PORT", "8080")),
		Env:                    getEnv("ENV", "development"),
		JWTSecret:              getEnv("JWT_SECRET", "dev-secret-change-me"),
		BotToken:               getEnv("BOT_TOKEN", ""),
		DatabaseURL:            getEnv("DATABASE_URL", "postgres://flipo:flipo@localhost:5432/flipo?sslmode=disable"),
		RedisURL:               getEnv("REDIS_URL", "redis://localhost:6379/0"),
		JWTExpiry:              15 * time.Minute,
		RouletteBettingSeconds: getEnvInt("ROULETTE_BETTING_SECONDS", 20),
		RouletteSpinSeconds:    getEnvInt("ROULETTE_SPIN_SECONDS", 12),
		CrashTickMs:            getEnvInt("CRASH_TICK_MS", 100),
		PlatformFeeBps:         getEnvInt("PLATFORM_FEE_BPS", 500),
		BoostWagerThreshold:    int64(getEnvInt("BOOST_WAGER_THRESHOLD_NANOTON", 5_000_000_000)),
		DebugAuthEnabled:       getEnvBool("DEBUG_AUTH_ENABLED", false),
		DebugTelegramID:        int64(getEnvInt("DEBUG_TELEGRAM_ID", 999000001)),
		DebugUsername:          getEnv("DEBUG_USERNAME", "debug_user"),
		DebugInitialBalance:    int64(getEnvInt("DEBUG_INITIAL_BALANCE_NANOTON", 10_000_000_000)),
	}
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
