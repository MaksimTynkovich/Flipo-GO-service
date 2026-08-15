package staking

import (
	"errors"
	"testing"
)

func TestIsUniqueViolation(t *testing.T) {
	if isUniqueViolation(nil) {
		t.Fatal("nil")
	}
	if isUniqueViolation(errors.New("daily staking payout failed")) {
		t.Fatal("generic error")
	}
	if !isUniqueViolation(errors.New(`ERROR: duplicate key value violates unique constraint "idx_balance_ledgers_staking_daily_unique" (SQLSTATE 23505)`)) {
		t.Fatal("postgres unique")
	}
}
