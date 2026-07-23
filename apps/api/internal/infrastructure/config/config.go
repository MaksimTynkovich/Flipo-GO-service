package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port                         string
	Env                          string
	JWTSecret                    string
	BotToken                     string
	BotUsername                  string
	WebAppShortName              string
	WebAppURL                    string
	ChannelURL                   string
	SupportURL                   string
	WelcomeText                  string
	TelegramWebhookURL           string
	TelegramWebhookSecret        string
	DatabaseURL                  string
	RedisURL                     string
	JWTExpiry                    time.Duration
	RouletteBettingSeconds       int
	RouletteSpinSeconds          int
	RouletteResultPauseSeconds   int
	RouletteResultDisplaySeconds int
	CrashTickMs                  int
	CrashBettingSeconds          int
	CrashGrowthPerMs             float64
	PlatformFeeBps               int
	BoostWagerThreshold          int64 // deprecated: use BoostReferralThreshold
	BoostReferralThreshold       int
	TonDepositAddress            string
	TonAPIBaseURL                string
	TonAPIKey                    string
	TonChainDevMode              bool
	TonLiteConfigURL             string
	TonHotWalletMnemonic         string
	TonHotWalletVersion          string
	TonMinDepositNanoton         int64
	TonMinWithdrawNanoton        int64
	TonWithdrawFeeNanoton        int64
	TonDepositTTLMinutes         int
	DebugAuthEnabled             bool
	DebugTelegramID              int64
	DebugUsername                string
	DebugInitialBalance          int64
	TelegramAPIID                int
	TelegramAPIHash              string
	TelegramSessionPath          string
	// TelegramMTProtoEnabled gates the userbot (gift scan/transfer, MRKT auth).
	// false keeps credentials in .env but never opens an MTProto session.
	TelegramMTProtoEnabled bool
	AdminTelegramIDs       []int64
	// AdminPanelPassword unlocks browser login at /admin (no Telegram initData).
	AdminPanelPassword string
	// AdminNotifyEnabled gates Bot API DM alerts to ADMIN_TELEGRAM_IDS.
	AdminNotifyEnabled bool
	PromoRequiredChannel         string
	BotsDataDir                  string
	BotsAssetsBaseURL            string
	GiftsCacheDir                string
	CasesUploadDir               string
	MRKTAPIToken                 string
	GiftAssetAPIKey              string
	GiftAssetBaseURL             string
	CORSOrigins                  []string
}

func Load() *Config {
	return &Config{
		Port:      getEnv("API_PORT", getEnv("PORT", "8080")),
		Env:       getEnv("ENV", "development"),
		JWTSecret: getEnv("JWT_SECRET", "dev-secret-change-me"),
		BotToken:  getEnv("BOT_TOKEN", ""),
		BotUsername: firstNonEmpty(
			getEnv("BOT_USERNAME", ""),
			getEnv("NEXT_PUBLIC_GIFT_TRANSFER_BOT_USERNAME", ""),
			getEnv("NEXT_PUBLIC_BOT_USERNAME", ""),
		),
		WebAppShortName:              firstNonEmpty(getEnv("WEBAPP_SHORT_NAME", ""), getEnv("NEXT_PUBLIC_WEBAPP_SHORT_NAME", "")),
		WebAppURL:                    firstNonEmpty(getEnv("TELEGRAM_WEBAPP_URL", ""), getEnv("WEBAPP_URL", "")),
		ChannelURL:                   getEnv("TELEGRAM_CHANNEL_URL", ""),
		SupportURL:                   getEnv("TELEGRAM_SUPPORT_URL", ""),
		WelcomeText:                  getEnv("TELEGRAM_WELCOME_TEXT", ""),
		TelegramWebhookURL:           getEnv("TELEGRAM_WEBHOOK_URL", ""),
		TelegramWebhookSecret:        getEnv("TELEGRAM_WEBHOOK_SECRET", ""),
		DatabaseURL:                  getEnv("DATABASE_URL", "postgres://flipo:flipo@localhost:5432/flipo?sslmode=disable"),
		RedisURL:                     getEnv("REDIS_URL", "redis://localhost:6379/0"),
		JWTExpiry:                    15 * time.Minute,
		RouletteBettingSeconds:       getEnvInt("ROULETTE_BETTING_SECONDS", 20),
		RouletteSpinSeconds:          getEnvInt("ROULETTE_SPIN_SECONDS", 12),
		RouletteResultPauseSeconds:   getEnvInt("ROULETTE_RESULT_PAUSE_SECONDS", 0),
		RouletteResultDisplaySeconds: getEnvInt("ROULETTE_RESULT_DISPLAY_SECONDS", 3),
		CrashTickMs:                  getEnvInt("CRASH_TICK_MS", 100),
		CrashBettingSeconds:          getEnvInt("CRASH_BETTING_SECONDS", 8),
		CrashGrowthPerMs:             getEnvFloat("CRASH_GROWTH_PER_MS", 0.00006),
		PlatformFeeBps:               getEnvInt("PLATFORM_FEE_BPS", 500),
		BoostWagerThreshold:          int64(getEnvInt("BOOST_WAGER_THRESHOLD_NANOTON", 5_000_000_000)),
		BoostReferralThreshold:       getEnvInt("BOOST_REFERRAL_THRESHOLD", 10),
		TonDepositAddress:            getEnv("TON_DEPOSIT_ADDRESS", ""),
		TonAPIBaseURL:                getEnv("TON_API_BASE_URL", "https://toncenter.com/api/v2"),
		TonAPIKey:                    getEnv("TON_API_KEY", ""),
		TonChainDevMode:              getEnvBool("TON_CHAIN_DEV_MODE", false),
		TonLiteConfigURL:             getEnv("TON_LITE_CONFIG_URL", "https://ton-blockchain.github.io/global.config.json"),
		TonHotWalletMnemonic:         getEnv("TON_HOT_WALLET_MNEMONIC", ""),
		TonHotWalletVersion:          getEnv("TON_HOT_WALLET_VERSION", "V3R2"),
		TonMinDepositNanoton:         int64(getEnvInt("TON_MIN_DEPOSIT_NANOTON", 100_000_000)),
		TonMinWithdrawNanoton:        int64(getEnvInt("TON_MIN_WITHDRAW_NANOTON", 100_000_000)),
		TonWithdrawFeeNanoton:        int64(getEnvInt("TON_WITHDRAW_FEE_NANOTON", 50_000_000)),
		TonDepositTTLMinutes:         getEnvInt("TON_DEPOSIT_TTL_MINUTES", 30),
		DebugAuthEnabled:             getEnvBool("DEBUG_AUTH_ENABLED", false),
		DebugTelegramID:              int64(getEnvInt("DEBUG_TELEGRAM_ID", 999000001)),
		DebugUsername:                getEnv("DEBUG_USERNAME", "debug_user"),
		DebugInitialBalance:          int64(getEnvInt("DEBUG_INITIAL_BALANCE_NANOTON", 10_000_000_000)),
		TelegramAPIID:                getEnvInt("TELEGRAM_API_ID", 0),
		TelegramAPIHash:              getEnv("TELEGRAM_API_HASH", ""),
		TelegramSessionPath:          getEnv("TELEGRAM_SESSION_PATH", "data/telegram/session.json"),
		TelegramMTProtoEnabled:       getEnvBool("TELEGRAM_MTPROTO_ENABLED", true),
		AdminTelegramIDs:             parseInt64List(getEnv("ADMIN_TELEGRAM_IDS", "")),
		AdminPanelPassword:           getEnv("ADMIN_PANEL_PASSWORD", ""),
		AdminNotifyEnabled:           getEnvBool("ADMIN_NOTIFY_ENABLED", true),
		PromoRequiredChannel:         firstNonEmpty(getEnv("PROMO_REQUIRED_CHANNEL", ""), getEnv("NEXT_PUBLIC_PROMO_REQUIRED_CHANNEL", "")),
		BotsDataDir:                  getEnv("BOTS_DATA_DIR", "assets/bots"),
		BotsAssetsBaseURL:            getEnv("BOTS_ASSETS_BASE_URL", "/static/bots"),
		GiftsCacheDir:                getEnv("GIFTS_CACHE_DIR", "data/gifts"),
		CasesUploadDir:               getEnv("CASES_UPLOAD_DIR", "data/cases"),
		MRKTAPIToken:                 getEnv("MRKT_API_TOKEN", ""),
		GiftAssetAPIKey:              getEnv("GIFTASSET_API_KEY", ""),
		GiftAssetBaseURL:             getEnv("GIFTASSET_BASE_URL", "https://giftasset.gifts"),
		CORSOrigins:                  parseCSV(getEnv("CORS_ORIGINS", "*")),
	}
}

func parseInt64List(raw string) []int64 {
	parts := parseCSV(raw)
	out := make([]int64, 0, len(parts))
	for _, part := range parts {
		if id, err := strconv.ParseInt(part, 10, 64); err == nil {
			out = append(out, id)
		}
	}
	return out
}

func parseCSV(raw string) []string {
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
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
