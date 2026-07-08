package config

import (
	"path/filepath"
	"runtime"

	"github.com/joho/godotenv"
)

// LoadDotEnv loads the repository root .env regardless of current working directory.
func LoadDotEnv() {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		return
	}

	rootEnv := filepath.Join(filepath.Dir(file), "..", "..", "..", "..", "..", ".env")
	_ = godotenv.Overload(rootEnv)
}
