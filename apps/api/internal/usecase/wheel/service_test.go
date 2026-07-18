package wheel

import (
	"testing"

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
