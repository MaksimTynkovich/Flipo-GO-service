package domain

import "testing"

func TestIsUserGiftDepositTxRef(t *testing.T) {
	cases := []struct {
		ref  string
		want bool
	}{
		{"deposit:msg:777", true},
		{"deposit:saved:42", true},
		{"deposit:msg:0", false},
		{"deposit:saved:-1", false},
		{"deposit:msg:", false},
		{"deposit:manual:20260812:minioscar-4788", false},
		{"deposit:MiniOscar-4788", false},
		{"profile:MiniOscar-4788", false},
		{"bot-market:msg:9", false},
		{"case:abc", false},
		{"", false},
	}
	for _, tc := range cases {
		if got := IsUserGiftDepositTxRef(tc.ref); got != tc.want {
			t.Errorf("IsUserGiftDepositTxRef(%q)=%v want %v", tc.ref, got, tc.want)
		}
	}
}

func TestCanMarketBuyback(t *testing.T) {
	cases := []struct {
		name string
		item InventoryItem
		want bool
	}{
		{
			name: "real deposit msg",
			item: InventoryItem{TelegramTxRef: "deposit:msg:777"},
			want: true,
		},
		{
			name: "bot market saved",
			item: InventoryItem{TelegramTxRef: "bot-market:saved:88"},
			want: true,
		},
		{
			name: "bot market relist suffix",
			item: InventoryItem{TelegramTxRef: "bot-market:msg:9:relist:1710000000"},
			want: true,
		},
		{
			name: "profile virtual",
			item: InventoryItem{TelegramTxRef: "profile:MiniOscar-4788"},
			want: false,
		},
		{
			name: "manual fake deposit",
			item: InventoryItem{TelegramTxRef: "deposit:manual:20260812:minioscar-4788"},
			want: false,
		},
		{
			name: "slug-only deposit",
			item: InventoryItem{TelegramTxRef: "deposit:MiniOscar-4788"},
			want: false,
		},
		{
			name: "case claim",
			item: InventoryItem{TelegramTxRef: "case:" + "11111111-1111-1111-1111-111111111111"},
			want: false,
		},
	}
	for _, tc := range cases {
		if got := CanMarketBuyback(tc.item); got != tc.want {
			t.Errorf("%s: CanMarketBuyback=%v want %v", tc.name, got, tc.want)
		}
	}
}
