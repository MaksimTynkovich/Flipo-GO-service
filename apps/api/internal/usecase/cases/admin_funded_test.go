package cases

import "testing"

func TestOrganicCaseBankCredit(t *testing.T) {
	cases := []struct {
		price, adminFunded, wantOrganic int64
	}{
		{5e9, 0, 5e9},
		{5e9, 5e9, 0},
		{5e9, 2e9, 3e9},
		{5e9, 7e9, 0}, // clamp nonsense funded > price
	}
	for _, tc := range cases {
		funded := tc.adminFunded
		if funded > tc.price {
			funded = tc.price
		}
		organic := tc.price - funded
		if organic != tc.wantOrganic {
			t.Fatalf("price=%d funded=%d organic=%d want %d", tc.price, tc.adminFunded, organic, tc.wantOrganic)
		}
	}
}

func TestSplitPrizeOrganicAdmin(t *testing.T) {
	price := int64(10)
	adminFunded := int64(4)
	prize := int64(8)
	organicSpent := price - adminFunded
	organicPrize := prize * organicSpent / price
	adminPrize := prize * adminFunded / price
	if organicPrize != 4 {
		t.Fatalf("organicPrize=%d", organicPrize)
	}
	if adminPrize != 3 { // 8*4/10 = 3 in integer math
		t.Fatalf("adminPrize=%d", adminPrize)
	}
}
