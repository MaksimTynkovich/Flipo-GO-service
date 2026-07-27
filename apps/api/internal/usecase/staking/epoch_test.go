package staking

import (
	"testing"
	"time"
)

func TestCurrentEpochBounds_DailyMSK(t *testing.T) {
	loc := MoscowLocation()
	// Tuesday 15:30 MSK
	now := time.Date(2026, 7, 28, 15, 30, 0, 0, loc)
	start, end := CurrentEpochBounds(now)

	wantStart := time.Date(2026, 7, 28, 0, 0, 0, 0, loc).UTC()
	wantEnd := time.Date(2026, 7, 29, 0, 0, 0, 0, loc).UTC()
	if !start.Equal(wantStart) {
		t.Fatalf("start: got %v want %v", start, wantStart)
	}
	if !end.Equal(wantEnd) {
		t.Fatalf("end: got %v want %v", end, wantEnd)
	}
	if end.Sub(start) != 24*time.Hour {
		t.Fatalf("duration: got %v want 24h", end.Sub(start))
	}
}

func TestCurrentEpochBounds_JustAfterMidnight(t *testing.T) {
	loc := MoscowLocation()
	now := time.Date(2026, 7, 28, 0, 1, 0, 0, loc)
	start, end := CurrentEpochBounds(now)
	wantStart := time.Date(2026, 7, 28, 0, 0, 0, 0, loc).UTC()
	wantEnd := time.Date(2026, 7, 29, 0, 0, 0, 0, loc).UTC()
	if !start.Equal(wantStart) || !end.Equal(wantEnd) {
		t.Fatalf("got [%v, %v) want [%v, %v)", start, end, wantStart, wantEnd)
	}
}

func TestIsLegacyEpoch(t *testing.T) {
	loc := MoscowLocation()
	dayStart := time.Date(2026, 7, 28, 0, 0, 0, 0, loc)
	dayEnd := dayStart.Add(24 * time.Hour)
	weekEnd := dayStart.Add(7 * 24 * time.Hour)

	if isLegacyEpoch(dayStart, dayEnd) {
		t.Fatal("daily epoch should not be legacy")
	}
	if !isLegacyEpoch(dayStart, weekEnd) {
		t.Fatal("weekly epoch should be legacy")
	}
}
