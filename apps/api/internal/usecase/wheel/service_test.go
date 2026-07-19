package wheel

import (
	"testing"
	"time"

	"github.com/flipo/flipo/apps/api/internal/domain"
)

func TestPickSegment(t *testing.T) {
	segments := []domain.WheelSegment{
		{Label: "a", AmountNanoton: 1, Weight: 1},
		{Label: "b", AmountNanoton: 2, Weight: 1},
	}
	seg, roll, err := pickSegment(segments)
	if err != nil {
		t.Fatal(err)
	}
	if roll < 0 || roll > 1 {
		t.Fatalf("unexpected roll %d", roll)
	}
	if seg.Label != "a" && seg.Label != "b" {
		t.Fatalf("unexpected segment %s", seg.Label)
	}
}

func TestMSKCalendarDate(t *testing.T) {
	// 2026-07-19 22:30 UTC = 2026-07-20 01:30 MSK
	utc := time.Date(2026, 7, 19, 22, 30, 0, 0, time.UTC)
	got := mskCalendarDate(utc)
	want := time.Date(2026, 7, 20, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("mskCalendarDate = %v, want %v", got, want)
	}

	// Still same MSK day before midnight MSK
	utcSame := time.Date(2026, 7, 19, 20, 0, 0, 0, time.UTC) // 23:00 MSK
	gotSame := mskCalendarDate(utcSame)
	wantSame := time.Date(2026, 7, 19, 0, 0, 0, 0, time.UTC)
	if !gotSame.Equal(wantSame) {
		t.Fatalf("mskCalendarDate = %v, want %v", gotSame, wantSame)
	}
}

func TestMaxReferralBonusSpinsPerDay(t *testing.T) {
	if domain.MaxReferralBonusSpinsPerDay != 5 {
		t.Fatalf("MaxReferralBonusSpinsPerDay = %d, want 5", domain.MaxReferralBonusSpinsPerDay)
	}
}
